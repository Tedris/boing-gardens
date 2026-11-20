// Synthesised sound: no audio files, so nothing is borrowed and it still works
// offline. Everything is short envelopes on oscillators plus filtered noise.
let ctx = null, master = null, noiseBuf = null, muted = false;
let liveSrc = null, liveGain = null, whupSrc = null, whupGain = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const len = ctx.sampleRate * 1.2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // live-wire bed: a mains-like hum plus a crackle, made once and gated
  // by gain, same shape the rotor bed below uses.
  liveGain = ctx.createGain();
  liveGain.gain.value = 0;
  liveGain.connect(master);

  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 52;
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 340;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.45;
  hum.connect(humLp).connect(humGain).connect(liveGain);
  hum.start();

  // the crackle is looping noise squeezed through a gate a square LFO
  // opens a few times a second; the slow sine on the LFO's pitch wobbles
  // that rate so it crackles instead of ticking like a metronome.
  liveSrc = ctx.createBufferSource();
  liveSrc.buffer = noiseBuf;
  liveSrc.loop = true;
  const crk = ctx.createBiquadFilter();
  crk.type = 'bandpass';
  crk.frequency.value = 3100;
  crk.Q.value = 0.9;
  const crkGate = ctx.createGain();
  crkGate.gain.value = 0.5;
  const crkLfo = ctx.createOscillator();
  crkLfo.type = 'square';
  crkLfo.frequency.value = 6;
  const crkDepth = ctx.createGain();
  crkDepth.gain.value = 0.5;
  const rateLfo = ctx.createOscillator();
  rateLfo.frequency.value = 0.7;
  const rateDepth = ctx.createGain();
  rateDepth.gain.value = 2.5;
  rateLfo.connect(rateDepth).connect(crkLfo.frequency);
  crkLfo.connect(crkDepth).connect(crkGate.gain);
  liveSrc.connect(crk).connect(crkGate).connect(liveGain);
  rateLfo.start();
  crkLfo.start();
  liveSrc.start();

  // rotor whup for the propeller braid: a sawtooth below hearing range is
  // nothing but a pulse train, and its period is the blade pass; the
  // lowpass softens it into a whup instead of a buzz.
  whupSrc = ctx.createOscillator();
  whupSrc.type = 'sawtooth';
  whupSrc.frequency.value = 10.5;
  const whupLp = ctx.createBiquadFilter();
  whupLp.type = 'lowpass';
  whupLp.frequency.value = 300;
  whupLp.Q.value = 0.7;
  whupGain = ctx.createGain();
  whupGain.gain.value = 0;
  whupSrc.connect(whupLp).connect(whupGain).connect(master);
  whupSrc.start();
  return ctx;
}

function noise(dur, freq, q, gain, type = 'bandpass') {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

function tone(freq, dur, { type = 'triangle', gain = 0.2, slide = 0, delay = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  mute(v) { muted = v; if (master) master.gain.value = v ? 0 : 0.5; },
  boing(power = 1) {
    if (!ensure() || muted) return;
    tone(190 + power * 60, 0.2, { slide: 300, gain: 0.16, type: 'triangle' });
    noise(0.09, 2200, 1.2, 0.05, 'highpass');
  },
  skip(n = 1) {
    if (!ctx || muted) return;
    tone(880 + Math.min(n, 24) * 22, 0.06, { gain: 0.07, type: 'square' });
  },
  crit() {
    if (!ctx || muted) return;
    tone(1568, 0.09, { gain: 0.08, type: 'square' });
    tone(2093, 0.11, { gain: 0.05, type: 'square', delay: 0.045 });
  },
  land(impact = 1) {
    if (!ctx || muted) return;
    tone(78, 0.14, { gain: Math.min(0.24, 0.09 + impact * 0.02), type: 'sine', slide: -26 });
    noise(0.12, 620, 0.7, Math.min(0.1, 0.03 + impact * 0.008), 'lowpass');
  },
  whoosh() {
    if (!ctx || muted) return;
    noise(0.26, 1500, 0.6, 0.06, 'bandpass');
  },
  level() {
    if (!ctx || muted) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.24, { gain: 0.14, delay: i * 0.075 }));
  },
  // The ending that is not a fall. level() opens a pick, so this takes the same notes an octave
  // apart and slower, to close a run, with a low swell under them for the descent the panel
  // waits out (game.js:winRun).
  win() {
    if (!ensure() || muted) return;
    [392, 523, 659, 784, 1046, 1568].forEach((f, i) => tone(f, 0.55, { gain: 0.12, delay: i * 0.13 }));
    tone(66, 2.2, { gain: 0.09, type: 'sine', slide: 40 });
  },
  pick() {
    if (!ctx || muted) return;
    tone(760, 0.14, { gain: 0.13, slide: 480 });
  },
  fail() {
    if (!ctx || muted) return;
    tone(320, 0.5, { gain: 0.2, type: 'sawtooth', slide: -250 });
    noise(0.4, 340, 0.5, 0.13, 'lowpass');
  },
  live(level) {
    if (!ctx || muted || !liveGain) return;
    liveGain.gain.value = [0, 0.03, 0.05, 0.07][Math.max(0, Math.min(3, level | 0))];
  },
  whup(level) {
    if (!ctx || muted || !whupGain) return;
    whupGain.gain.value = Math.max(0, Math.min(1, level)) * 0.05;
  },
  zap() {
    if (!ctx || muted) return;
    // a shock, not a sparkler: brighter than the skip tone, all its
    // energy on the way down, and short enough to sit inside the fail
    // thud it plays under.
    tone(3600, 0.14, { gain: 0.11, type: 'square', slide: -3200 });
    noise(0.09, 3000, 0.7, 0.07, 'highpass');
    noise(0.16, 5200, 0.6, 0.05, 'highpass');
  },
};
