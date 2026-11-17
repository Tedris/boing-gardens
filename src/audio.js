// Synthesised sound: no audio files, so nothing is borrowed and it still works
// offline. Everything is short envelopes on oscillators plus filtered noise.
let ctx = null, master = null, noiseBuf = null, muted = false;
let fireSrc = null, fireGain = null;

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

  // looping fire bed, gated by gain
  fireSrc = ctx.createBufferSource();
  fireSrc.buffer = noiseBuf;
  fireSrc.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 780;
  bp.Q.value = 0.8;
  fireGain = ctx.createGain();
  fireGain.gain.value = 0;
  fireSrc.connect(bp).connect(fireGain).connect(master);
  fireSrc.start();
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
  pick() {
    if (!ctx || muted) return;
    tone(760, 0.14, { gain: 0.13, slide: 480 });
  },
  fail() {
    if (!ctx || muted) return;
    tone(320, 0.5, { gain: 0.2, type: 'sawtooth', slide: -250 });
    noise(0.4, 340, 0.5, 0.13, 'lowpass');
  },
  fire(level) {
    if (!ctx || muted || !fireGain) return;
    fireGain.gain.value = level * 0.05;
  },
};
