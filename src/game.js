// Run state, one-button physics, camera and HUD. The rope sweep is the clock:
// press too early and you land on it, too late and it catches your feet.
import * as THREE from '../vendor/three.module.js';
import { createWorld } from './world.js';
import { createCharacter } from './character.js';
import { createRopes } from './rope.js';
import { CARDS, drawCards } from './cards.js';
import { ROSTER, byId } from './roster.js';
import { sfx } from './audio.js';
import { C, createPost } from './toon.js';

const G = 23.5;              // gravity, m/s^2
const JUMP_V = 3.8;          // a tap: ~0.31m apex, ~0.32s off the ground - over the sweep with a
                             // little headroom, and back down with the revolution still running
const HOLD_LIFT = 13.2;      // extra upward accel while holding, which is what turns that tap
                             // into the ~0.70m hop a single press used to give on its own
const HOLD_MAX = 0.40;       // seconds of hold assist: the held apex arrives as it runs out
const ROPE_A = 1.05;         // rope length: hand anchor height + a little slack
const ROPE_W = 0.38;         // radians around bottom that count as "rope at the feet"
const BASE_SPEED = (Math.PI * 2) / 1.0;  // one revolution a second: faster and the base hop
                                         // lands on the sweep, slower and the rope stops driving

const BEST_KEY = 'boing-gardens-best';

// Framing: a slight three-quarter view, not a flat lay. Dead-on, every box collapses to
// its front face and the rope sweep stops reading as depth; ~16 degrees of yaw keeps her
// face legible, shows one side facet of everything, and foreshortens the arc as it turns.
const CAM_YAW = 0.294;     // radians. Offsets derive from camZ so the angle - not just
const CAM_LIFT = 1.10;     // the pose - holds as the camera eases back with height. camZ is
                           // the depth axis, so her distance is camZ / cos(yaw) = 8.98 m, and
                           // lift plus the 0.1 aim offset over that span is the 7.6 degrees
                           // of downcast the frame is built around.

// A hop should not move the picture. The frame is parked over a height and only slides
// when the predicted end of her arc leaves the band she needs: CLEAR above her feet for
// body, bob and the rope hump, DROP below for shoes and ground. LOOK_AHEAD caps how far
// ahead the prediction looks, CAM_CHASE how fast the parked frame travels once it moves.
const CLEAR = 2.3;
const DROP = 0.45;
const LOOK_AHEAD = 1.4;
const CAM_CHASE = 6;      // a rise takes about 0.35 s; this arrives with her, not after

const V3 = () => new THREE.Vector3();

export function createGame(stage) {
  // No antialiasing and no devicePixelRatio scaling: the picture is assembled at
  // 240 rows and upscaled by hand, so any smoothing here undoes the look.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  stage.appendChild(renderer.domElement);
  const look = createPost(renderer, innerWidth, innerHeight);

  const scene = new THREE.Scene();
  // One light and one fog, both part of the look: flat Lambert facets need a
  // single direction to decide which faces are lit, and the fog is the same
  // colour as the sky so the horizon dissolves instead of ending in an edge.
  // The near edge is set every frame to land just behind her: fog depth is
  // measured from the eye, and the camera sits 8.6-11.2 m back, so a fixed near
  // edge of 7 puts the jumper inside the haze - invisible above 300 m.
  scene.fog = new THREE.Fog(C.sky, 9.8, 22.8);
  scene.background = new THREE.Color(C.sky);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
  camera.position.set(8.6 * Math.tan(CAM_YAW), 1.05 + CAM_LIFT, 8.6);
  camera.lookAt(0, 0.95, 0);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-0.6, 1.0, 0.7);     // front-upper-left: near face lit, side facet dark
  scene.add(sun);

  // Contact shadow: a flat disc, black and hard-edged, that spreads and fades as
  // she climbs. Cheaper and more readable at this scale than a shadow map that
  // would have to chase her into the stratosphere - and it stays snap-exempt, so
  // the one thing that tells you your height never crawls out of register.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 10),
    new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, fog: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  scene.add(blob);

  const world = createWorld();
  scene.add(world.group);
  const char = createCharacter();
  scene.add(char.group);
  const ropes = createRopes();
  scene.add(ropes.group);

  // ---------------- HUD ----------------
  const el = {
    skips: document.getElementById('skips'),
    skipnum: document.getElementById('skipnum'),
    mult: document.getElementById('mult'),
    pillNum: document.querySelector('#pill .num'),
    fill: document.querySelector('#pill .fill'),
    cap: document.getElementById('pillcap'),
    owned: document.getElementById('owned'),
    alt: document.querySelector('#alt b'),
    hint: document.getElementById('hint'),
    draft: document.getElementById('draft'),
    row: document.querySelector('#draft .row'),
    screen: document.getElementById('screen'),
    title: document.querySelector('#screen h1'),
    tag: document.querySelector('#screen .tag'),
    go: document.getElementById('go'),
    stats: document.getElementById('stats'),
    sSkips: document.getElementById('s-skips'),
    sAlt: document.getElementById('s-alt'),
    sBest: document.getElementById('s-best'),
    flash: document.getElementById('flash'),
    paused: document.getElementById('paused'),
    pick: document.getElementById('pick'),
    pickRow: document.querySelector('#pick .row'),
    pickName: document.getElementById('pick-name'),
  };

  // ---------------- input mode ----------------
  // A phone has no keyboard, so the one button becomes a tap and the copy has to
  // say so. index.html settles the mode before any module runs, from a coarse
  // pointer, a touch capability and a mobile browser's own UA: it has to be that
  // early because the copy is also what tells a reader whose boot died that the
  // page is a phone page, rather than looking like a phone whose taps are being
  // ignored. This reads that back; main.js flips it on the first real finger,
  // for machines that own both kinds of input.
  let touchUI = document.documentElement.dataset.touch === '1';
  const goText = () => (touchUI ? 'TAP ANYWHERE' : 'PRESS SPACE');
  const goAgainText = () => (touchUI ? 'TAP TO GO AGAIN' : 'PRESS SPACE TO GO AGAIN');
  function setTouchUI(on) {
    if (typeof on !== 'boolean' || on === touchUI) return;
    touchUI = on;
    document.documentElement.dataset.touch = on ? '1' : '0';
    el.go.textContent = state === 'over' ? goAgainText() : goText();
  }

  // ---------------- run state ----------------
  const u = {};
  function freshRun() {
    Object.assign(u, {
      jumpV: JUMP_V, ropeSpeed: BASE_SPEED, ropes: 1, thrust: 0,
      fuel: 0, fuelMax: 0, fire: 0, offer: 3, fallDrag: 1, landEase: 1,
      grace: 0, airJumps: 0, combo: 0, mult: 1, holdLift: HOLD_LIFT, holdMax: HOLD_MAX,
      levels: {}, skips: 0, score: 0, level: 1, xpNeed: 12, xpBase: 0,
      alt: 0, altMax: 0, sinceSkip: 0,
    });
    // who is jumping decides the starting numbers; cards stack on top of that
    who().apply(u);
    y = 0; vy = 0; grounded = true; holdT = 0; holding = false; launchT = 0;
    camAnchor = 0; camY = 1.05;   // a new run frames the ground, not the last run's ceiling
    airLeft = 0; thrusting = false; dead = false; deadT = 0;
    shake = 0; flash = 0; nearMiss = 0; lastSkipT = -9;
    stumbled = false; hintT = 0; lostHint = false;
    paused = false; el.paused.classList.remove('on');
    ropes.setCount(1);
    ropes.reset();
    renderOwned();
  }

  let state = 'title';         // title | ready | run | draft | over
  let y = 0, vy = 0, grounded = true, holdT = 0, holding = false, launchT = 0;
  let airLeft = 0, thrusting = false, dead = false, deadT = 0;
  let shake = 0, flash = 0, nearMiss = 0, lastSkipT = -9;
  let pressEdge = false, down = false;
  let stumbled = false;        // a trip costs at most one rope per frame
  let hintT = 0, lostHint = false;   // the "ropes left" hint times itself out
  let paused = false;        // freezes step() wholesale; see setPause
  let camY = 1.05, camZ = 8.8, time = 0, ropeBottom = 0.014, camAnchor = 0;
  // the camera's own live numbers, next to the physics ones: what the park window is,
  // what the arc is predicted to reach, and whether it had to follow instead of lead
  const camDbg = { lo: 0, hi: 0, up: 0, down: 0, follow: 0, a: 0 };
  const hands = [V3(), V3()];
  let offerCards = [];

  // ---------------- HUD paint ----------------
  function renderOwned() {
    el.owned.innerHTML = '';
    for (const c of CARDS) {
      const n = u.levels[c.id] ?? 0;
      if (!n) continue;
      const d = document.createElement('div');
      d.className = 'chip';
      d.innerHTML = `<span class="ic">${c.icon}</span><span>${c.name}</span><span class="lvl">${n}</span>`;
      el.owned.appendChild(d);
    }
  }

  function bumpChip(id) {
    const c = CARDS.find((x) => x.id === id);
    const i = CARDS.filter((x) => (u.levels[x.id] ?? 0) > 0).indexOf(c);
    renderOwned();
    const chip = el.owned.children[i];
    if (chip) chip.classList.add('bump');
  }

  function multiplier() {
    return u.mult * (1 + u.combo * Math.min(3, u.skips / 45));
  }

  function paintHud() {
    el.skipnum.textContent = u.skips;
    const m = multiplier();
    if (m > 1.01) {
      el.mult.textContent = `\u00D7${m.toFixed(m < 10 ? 1 : 0)}`;
      el.mult.classList.add('on');
    } else {
      el.mult.classList.remove('on');
    }
    el.pillNum.textContent = u.ropes;
    el.cap.textContent = u.thrust > 0 ? 'FUEL' : 'ROPES';
    const prog = (u.skips - u.xpBase) / Math.max(1, u.xpNeed - u.xpBase);
    el.fill.style.height = `${Math.max(0, Math.min(1, u.thrust > 0 ? u.fuel / u.fuelMax : prog)) * 100}%`;
    el.alt.textContent = `${Math.floor(Math.max(0, y))} m`;
  }

  function hint(txt) {
    el.hint.textContent = txt;
    el.hint.classList.toggle('off', !txt);
  }

  // ---------------- flow ----------------
  /** trip() writes the wipeout panel and copy, and nothing else puts them away,
      so both entry points share this: pose, title copy, stats panel, camera. */
  function resetScreen() {
    char.rig.hips.rotation.set(0, 0, 0);
    char.group.rotation.set(0, 0, 0);
    char.group.position.set(0, 0, 0);
    el.title.innerHTML = 'BOING<span>GARDENS</span>';
    el.tag.textContent = 'One button. One rope. Endless altitude.';
    el.go.textContent = goText();
    el.stats.style.display = 'none';
    camY = 1.05;
  }

  function startRun() {
    // A new run has to start clean. Without this the last run's stats, pose, limp
    // flag and wipeout panel carried over - trip() refuses to end a run already
    // marked dead, and the panel kept reporting the previous run's score.
    freshRun();
    resetScreen();
    el.screen.classList.add('off');
    state = 'ready';
    hint(touchUI ? 'tap to start the rope' : 'press to start the rope');
  }

  const STUMBLE_VY = JUMP_V * 0.75;   // lands a beat before the sweep comes round

  /** A trip with more than one rope in hand costs a rope, not the run. The sweep
      restarts at the top so the next jump is a fair one, she takes a stumble hop
      instead of falling, and the last rope is the one that ends it - which makes
      rope count the only cushion in the game, and Another Rope the way to buy it. */
  function loseRope() {
    u.ropes--;
    ropes.setCount(u.ropes);
    ropes.reset();
    vy = STUMBLE_VY; grounded = false; holdT = 0; thrusting = false;
    shake = 0.8; flash = 0.35;
    char.bump(-1.4, 0.5);
    // not sfx.fail(): that is the death sound, and this run is still going
    sfx.whoosh(); sfx.land(9);
    hint(u.ropes === 1 ? 'last rope' : `${u.ropes} ropes left`);
    hintT = 1.6; lostHint = true;
  }

  function trip() {
    // stumbled: a cluster of ropes can cross in the same frame, and one missed
    // jump has to cost one rope, not the whole bundle
    if (dead || stumbled) return;
    stumbled = true;
    if (u.ropes > 1) { loseRope(); return; }
    dead = true;
    deadT = 0;
    state = 'over';
    shake = 1;
    vy = 3.4;
    char.bump(-1.2, 0.6);
    sfx.fail();
    sfx.fire(0);
    const best = Math.max(+(localStorage.getItem(BEST_KEY) || 0), u.skips);
    localStorage.setItem(BEST_KEY, String(best));
    el.title.innerHTML = 'WIPE<span>OUT</span>';
    el.tag.textContent = `The rope won that one. ${u.score} points.`;
    el.go.textContent = goAgainText();
    el.sSkips.textContent = u.skips;
    el.sAlt.textContent = `${Math.floor(u.altMax)}m`;
    el.sBest.textContent = best;
    el.stats.style.display = 'flex';
    el.screen.classList.add('off');
    hint('');
  }

  function levelUp() {
    state = 'draft';
    sfx.level();
    offerCards = drawCards(u, u.offer);
    el.row.innerHTML = '';
    offerCards.forEach((c, i) => {
      const n = (u.levels[c.id] ?? 0);
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML =
        `<div class="ic">${c.icon}</div><div class="nm">${c.name}</div>` +
        `<div class="ds">${c.blurb}</div>` +
        `<div class="lv">${c.level(n + 1)}</div>` +
        `<div class="key">PRESS ${i + 1}</div>`;
      d.onclick = () => takeCard(i);
      el.row.appendChild(d);
    });
    el.draft.classList.add('on');
    el.skips.classList.add('hide');
    hint('');
  }

  /** One place where a card mutates the run, so a pick and a test drive agree. */
  function applyCard(c) {
    u.levels[c.id] = (u.levels[c.id] ?? 0) + 1;
    c.apply(u);
    // every pick tops up rocket fuel - the loop that keeps a run airborne
    if (u.thrust > 0) u.fuel = u.fuelMax;
    ropes.setCount(u.ropes);
  }

  function takeCard(i) {
    if (state !== 'draft') return;
    const c = offerCards[i];
    if (!c) return;
    applyCard(c);
    u.level++;
    u.xpNeed += 10 + u.level * 5;
    u.xpBase = u.skips;
    bumpChip(c.id);
    sfx.pick();
    el.draft.classList.remove('on');
    el.skips.classList.remove('hide');
    state = 'run';
    hint('');
    flash = 0.7;
    char.bump(0.8, 0.3);
  }

  // ---------------- who is jumping ----------------
  // The look is the same rig recoloured and rescaled (character.js setLook); the physics is
  // a patch over a fresh run, so a jumper and an upgrade deck compose instead of fighting.
  // The pick is not remembered: every load starts on the roster's first row, and pressing a
  // number changes the run you are in.
  let charId = ROSTER[0].id;
  const who = () => byId(charId);

  function setCharacter(id) {
    const c = byId(id);
    charId = c.id;
    char.setLook(c.look);
    el.pickName.textContent = c.name;
    [...el.pickRow.children].forEach((d, i) => d.classList.toggle('sel', ROSTER[i].id === charId));
  }

  /** The roster row is the draft's panel with different cards in it, because it is
      the same decision: take one of these, with a number under it. */
  function showSelect() {
    state = 'select';
    el.pickRow.innerHTML = '';
    ROSTER.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'card' + (c.id === charId ? ' sel' : '');
      d.innerHTML =
        `<div class="ic">${c.icon}</div><div class="nm">${c.name}</div>` +
        `<div class="ds">${c.blurb}</div>` +
        `<div class="key">PRESS ${i + 1}</div>`;
      d.onclick = () => pickChar(i);
      el.pickRow.appendChild(d);
    });
    el.pickName.textContent = who().name;   // the cards carry the .sel mark already
    el.screen.classList.add('off');          // the roster replaces the title, it does not sit on it
    el.pick.classList.add('on');
    el.skips.classList.add('hide');
    hint('');
  }

  function pickChar(i) {
    if (state !== 'select') return;
    const c = ROSTER[i];
    if (!c) return;
    setCharacter(c.id);
    freshRun();     // the numbers have to change now, not on the run after this one
    el.pick.classList.remove('on');
    el.skips.classList.remove('hide');
    state = 'ready';
    sfx.pick();
    hint(touchUI ? 'tap to start the rope' : 'press to start the rope');
  }

  /** C or the swap button steps through the roster, but only while nothing is in
      motion: changing legs mid-run would be a different run, not a shortcut. */
  function cycleCharacter() {
    if (paused || state === 'run' || state === 'draft' || state === 'select') return;
    const i = ROSTER.findIndex((c) => c.id === charId);
    setCharacter(ROSTER[(i + 1) % ROSTER.length].id);
    freshRun();     // same reason as in pickChar
  }

  // boot: the look and the label; resetRun() below seeds the run numbers, once
  // charId exists for freshRun to ask who is jumping
  setCharacter(charId);

  function resetRun() {
    freshRun();
    resetScreen();
    el.screen.classList.remove('off');
    state = 'title';
    hint('');
  }

  resetRun();

  // ---------------- input ----------------
  function press() {
    sfx.resume();
    // The press that lifts a pause is not also a jump: the sweep freezes wherever
    // it happened to be, so resuming has to be a beat to itself before the next
    // one is due, rather than a hop at a rope position nobody chose.
    if (paused) { setPause(false); return; }
    if (state === 'title') { showSelect(); return; }   // one look at the roster first
    if (state === 'over') { startRun(); return; }
    if (state === 'draft' || state === 'select') return;
    down = true;
    pressEdge = true;
  }
  function release() { down = false; }

  /** One early return in step() stops the physics, the sweep and every timer, so
      a pause of any length resumes without a catch-up burst. Only a live run can
      be paused - the title, the draft and the wipeout panel are already stopped. */
  function setPause(on) {
    if (paused === on) return;
    if (!on) {
      paused = false;
      down = false; pressEdge = false;
      el.paused.classList.remove('on');
      return;
    }
    if (state !== 'run' && state !== 'ready') return;
    paused = true;
    el.paused.classList.add('on');
  }
  const togglePause = () => setPause(!paused);

  function pick(i) {
    if (state === 'draft') takeCard(i);
    else if (state === 'select') pickChar(i);
  }

  // ---------------- step ----------------
  const camPos = new THREE.Vector3();

  // Where the arc tops out and bottoms out over the next LOOK_AHEAD seconds. The window is
  // the whole point: a bound that reaches further than the frame can travel is worse than
  // none, since the frame ends up parked somewhere she is not - which is what pre-parking
  // on a landing point a hundred metres down did. Two-segment closed form, sampled: gravity
  // plus whatever hold assist or burn is still owed, for exactly as long as it is owed.
  function arcY(t) {
    const lift = (holding ? u.holdLift : 0) + (thrusting ? u.thrust : 0);
    const owed = Math.min(LOOK_AHEAD, Math.max(
      holding ? Math.max(0, u.holdMax - holdT) : 0,
      thrusting ? u.fuel * Math.max(0.2, u.fuelMax) : 0));
    const g = -G * (vy < 0 ? u.fallDrag : 1);
    if (t <= owed) return y + vy * t + 0.5 * (g + lift) * t * t;
    const v = vy + (g + lift) * owed;
    const h = y + vy * owed + 0.5 * (g + lift) * owed * owed;
    return h + v * (t - owed) + 0.5 * g * (t - owed) * (t - owed);
  }

  const SPAN = [0.2, 0.45, 0.75, 1.1, 1.5, 2];      // fractions of LOOK_AHEAD, sampled

  function predictTop() {
    if (grounded) return y;
    let best = y;
    for (const f of SPAN) best = Math.max(best, arcY(f * LOOK_AHEAD));
    // one chained air jump: the ceiling she reaches if she presses again mid-arc
    if (airLeft > 0) best += (u.jumpV * 0.8) * (u.jumpV * 0.8) / (2 * G);
    return best;
  }

  function predictFloor() {
    if (vy >= 0) return y;
    let low = y;
    for (const f of SPAN) low = Math.min(low, arcY(f * LOOK_AHEAD));
    return Math.max(0, low);
  }

  function step(dt) {
    if (paused) return;      // frozen: no physics, no sweep, no timers
    time += dt;
    stumbled = false;
    if (hintT > 0) {
      hintT -= dt;
      if (hintT <= 0) { hintT = 0; if (lostHint) { hint(''); lostHint = false } }
    }
    const live = state === 'run' || state === 'ready' || state === 'over';

    if (state === 'ready') {
      // idle while the player gets the feel of the button
      grounded = true;
      if (pressEdge) {
        state = 'run';
        hint('');
        ropes.reset();
        sfx.whoosh();
        // Starting the rope and leaving her standing makes the player tap again half a second
        // later, mid-launch, so one press starts the sweep and takes off and the run begins on
        // the beat. The rope needs half a revolution to come down to her feet, so this arc is
        // given the hold assist whether or not the key is still down: the height of any held
        // press, which is off the ground for longer than that.
        vy = u.jumpV;
        launchT = u.holdMax;
        grounded = false;
        holdT = 0;
        airLeft = u.airJumps;
        sfx.boing(1);
        char.bump(1);
        char.puff(0, 0.05, 0.1, 0.9);
      }
    } else if (state === 'run') {
      if (pressEdge) {
        if (grounded) {
          vy = u.jumpV;
          grounded = false;
          holdT = 0;
          airLeft = u.airJumps;
          sfx.boing(1);
          char.bump(0.9);
          char.puff(0, 0.05, 0.1, 0.7);
        } else if (airLeft > 0) {
          airLeft--;
          vy = Math.max(vy, 0) + u.jumpV * 0.8;
          sfx.whoosh();
          char.bump(0.7);
        }
      }

      holding = down && vy > 0 && holdT < u.holdMax;
      thrusting = !grounded && down && u.thrust > 0 && u.fuel > 0;
      if (holding) holdT += dt;
      if (thrusting) u.fuel = Math.max(0, u.fuel - dt / Math.max(0.2, u.fuelMax));

      let a = -G * (vy < 0 ? u.fallDrag : 1);
      // The opening hop spends its assist here, so a held press and the press that started the
      // run get one assist window each, never two stacked on the same arc.
      if (launchT > 0 && !grounded) { a += u.holdLift; launchT = Math.max(0, launchT - dt) }
      else if (holding) a += u.holdLift;
      if (thrusting) a += u.thrust;
      vy += a * dt;
      y += vy * dt;

      if (y <= 0) {
        const impact = Math.min(16, -vy);
        y = 0;
        if (!grounded) {
          grounded = true;
          sfx.land(impact * u.landEase);
          char.bump(-impact * 0.075, 0.12);
          char.puff(0.0, 0.06, 0.15, 1.1);
          shake = Math.min(0.5, impact * 0.03);
        }
        vy = 0;
        holdT = 0;
        thrusting = false;
        airLeft = u.airJumps;
      }
      u.alt = y;
      u.altMax = Math.max(u.altMax, y);
      u.sinceSkip = y;
    } else if (state === 'over') {
      deadT += dt;
      if (!grounded || y > 0) {
        vy -= G * dt;
        y = Math.max(0, y + vy * dt);
        if (y <= 0) { y = 0; vy = 0; grounded = true; }
      }
      // let the tumble land before the panel covers it
      if (deadT > 1.15) el.screen.classList.remove('off');
    }

    // ---------------- rope sweep + scoring ----------------
    if (state !== 'draft') {
      // Matrices are only refreshed at draw time, so the hands are read from
      // where she was last frame - nearly two metres down at 100+ m/s. Nudge
      // them by the height gained since; cheaper and safer than forcing a
      // matrix update halfway through the frame.
      char.hands[0].getWorldPosition(hands[0]);
      char.hands[1].getWorldPosition(hands[1]);
      const dy = y - char.group.position.y;
      hands[0].y += dy;
      hands[1].y += dy;
      // One revolution a second, and that rate is the whole story: nothing here speeds the
      // sweep up because the run got long. Rope speed is a card, so it changes when one says so.
      const speed = state === 'run' ? u.ropeSpeed : 0;
      ropeBottom = ropes.update(state === 'run' ? dt : 0, {
        hands, speed, length: ROPE_A, ground: 0, fire: u.fire > 0, time,
      });

      if (state === 'run') {
        const w = Math.max(0.14, ROPE_W - u.grace);
        for (const r of ropes.ropes) {
          if (!r.active) continue;
          const abs = r.theta + r.offset;
          const c = Math.cos(abs);
          // The rope rides her hands, so its geometric bottom climbs with the
          // jump stretch and the arm swing - reading the pass/fail plane off it
          // made a skip depend on her pose and on last frame's matrices. The
          // player sees the rope sweep past her feet, so the plane follows her
          // feet: off the floor when it passes is a skip, a foot down is a trip.
          const clear = y > 0.03;
          if (r.crossed) {
            if (clear) {
              u.skips++;
              u.score = Math.round(u.score + multiplier());
              lastSkipT = time;
              // the rope rides her hands, so its gap to her feet is a constant;
              // what actually reads as "close" is how little dirt she cleared
              if (y < 0.12) nearMiss = 0.25;
              sfx.skip(u.skips);
              char.bump(0.4, 0.25);
              el.skips.classList.add('pop');
              setTimeout(() => el.skips.classList.remove('pop'), 90);
              if (u.skips >= u.xpNeed) { levelUp(); break; }
            } else {
              trip();
            }
          } else if (c > Math.cos(w) && y < 0.03 && vy <= 0.2) {
            // inside the danger window with a foot in the rope's path
            trip();
          }
        }
        nearMiss = Math.max(0, nearMiss - dt);
        sfx.fire(u.fire);
      }
    }

    // ---------------- character ----------------
    char.update(dt, {
      time, y, vy,
      grounded: state === 'over' ? false : grounded,
      phase: ropes.ropes[0].theta + ropes.ropes[0].offset,
      holding, thrusting, dead, fire: u.fire,
      alt: y, ropeSpeed: u.ropeSpeed / BASE_SPEED, ropes: u.ropes,
      fuel: u.fuelMax ? u.fuel / u.fuelMax : 0,
      nearMiss: nearMiss > 0, skipped: time - lastSkipT < 0.12,
    });
    if (state === 'over') {
      char.group.rotation.x = -Math.min(1.3, deadT * 2.1);
      char.group.rotation.z = Math.min(0.5, deadT * 0.8);
      char.group.position.x = Math.sin(deadT * 4) * deadT * 0.5;
    } else {
      char.group.rotation.set(0, 0, 0);
      char.group.position.x = 0;
    }

    // ---------------- camera ----------------
    // Parked, not tracking: her height alone never moves the picture. The frame slides
    // only when where the arc is *going* - this jump, the hold on top of it, the rocket
    // burn, one chained air jump - would push her out of the band the body and the rope
    // need. Aiming at the predicted apex makes the move arrive before she does, so the
    // camera never chases her from behind. Everything the stage derives from height (sky,
    // fog, tiers, pullback) reads camY, so the world cannot disagree with the frame.
    const eye = camZ / Math.cos(CAM_YAW);
    const half = Math.tan(camera.fov * Math.PI / 360) * eye;    // frame half-height at her plane
    const midOff = 1.05 - 0.1;                  // frame centre above the parked height
    const upY = predictTop(), downY = predictFloor();
    // Two windows on the park height, both measured in the same band: where she is now, and
    // where the arc says she is going. topRoom/botRoom are how far above and below the park
    // she may be before she is out of the picture - the frame's half-height less what her body
    // and the rope hump need, so they travel with the pullback instead of drifting from it.
    const topRoom = midOff + half - CLEAR;
    const botRoom = half - DROP - midOff;
    const nowLo = y - topRoom, nowHi = y + botRoom;
    const arcLo = Math.max(upY, y) - topRoom, arcHi = Math.min(downY, y) + botRoom;
    const parkFrom = camAnchor;
    // The arc window is a licence to get there first; the present window is the rule that
    // cannot break. Where they overlap the frame moves only if it has to leave the overlap,
    // which is why an ordinary hop costs nothing on screen. An arc longer than the band leaves
    // the licence void, and then the frame keeps up with her instead of getting ahead of her -
    // which is what a long fall is. Tested as two clamps in sequence, the second undid the
    // first and framed a fall where she had not got to yet.
    const lo = Math.max(arcLo, nowLo), hi = Math.min(arcHi, nowHi);
    camAnchor = lo <= hi
      ? Math.min(Math.max(camAnchor, lo), hi)
      : Math.min(Math.max(camAnchor, nowLo), nowHi);
    // Feet down is its own case: the park then means the framing she stands in, so whatever
    // height a climb or a fall left it at is given back while her feet are on the ground.
    // Without this the frame keeps the last arc's height and she stands at the bottom of the
    // shot for the rest of the run.
    if (grounded) camAnchor += (y - camAnchor) * Math.min(1, dt * CAM_CHASE);
    camDbg.lo = lo; camDbg.hi = hi; camDbg.up = upY; camDbg.down = downY;
    camDbg.a = camAnchor;
    const gap = camAnchor + 1.05 - camY;
    // The park's own motion is applied outright and only the step it had to take is eased:
    // chasing instead of following trails a fast rise by its speed over the ease rate, which
    // is enough to clip her head at the top of the frame. And when what is left of that ease
    // is itself more than the band - a stacked-rocket run leaving the ground at a kilometre a
    // second - the frame is put where the park says it belongs, because being late is the same
    // as being wrong.
    camY += Math.abs(gap) > topRoom ? gap
      : gap * Math.min(1, dt * CAM_CHASE) + (camAnchor - parkFrom);
    // ease back a little with height, then stop: she has to stay readable at 2 km,
    // and at this fov she is already only a fifth of the frame on the ground
    camZ += (8.6 + THREE.MathUtils.smoothstep(camY, 12, 140) * 2.6 - camZ) * Math.min(1, dt * 2.2);
    shake = Math.max(0, shake - dt * 2.4);
    flash = Math.max(0, flash - dt * 2.2);
    // The camera itself only twitches a little; the rest of the impact goes to the
    // post pass, where a shake moves whole pixels instead of sliding the view.
    camPos.set(
      camZ * Math.tan(CAM_YAW) + Math.sin(time * 47) * shake * 0.05,
      camY + CAM_LIFT + Math.sin(time * 61) * shake * 0.04,
      camZ,
    );
    camera.position.copy(camPos);
    // Aimed, not aligned to the axes: yaw and tilt come from one look, so easing back
    // with height keeps the same three-quarter framing instead of drifting flat-on.
    camera.lookAt(0, camY - 0.1, 0);

    const spread = 1 + Math.min(2.4, Math.max(0, y) * 0.09);
    blob.scale.set(spread, spread, 1);
    blob.material.opacity = Math.max(0, 0.45 - Math.max(0, y) * 0.03);
    blob.visible = blob.material.opacity > 0.01;
    // Thin air: the stage goes darker and the fog pulls in as the world below
    // stops reflecting anything. The sky colour comes from the world, which owns
    // the altitude bands, so the two can never disagree about what height this is.
    const space = THREE.MathUtils.smoothstep(camY, 60, 260);
    if (world.skyColor) {
      scene.background.copy(world.skyColor);
      scene.fog.color.copy(world.skyColor);
    }
    // Haze is eye-measured, so the clear zone travels with the real distance to her,
    // which the yaw makes longer than camZ. She stays readable at any height; the world
    // keeps dissolving behind her. `eye` is the one the framing measured above.
    scene.fog.near = eye + 1;
    scene.fog.far = eye + 14 - space * 5;

    world.update(dt, time, camPos.y, u.fire > 0 ? 1 : 0);
    el.flash.style.opacity = flash * 0.55;
    paintHud();
    pressEdge = false;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    look.resize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** The only draw path: scene into the 240-row buffer, buffer to the canvas. */
  function render() {
    look.render(scene, camera, shake * 2.2);
  }

  return {
    renderer, scene, camera, step, render, resize, press, release, pick, setTouchUI,
    setPause, togglePause, setCharacter, cycleCharacter, showSelect,
    get state() { return state; },
    get rig() { return char.rig; },
    get debug() {
      return {
        y, vy, grounded, skips: u.skips, ropes: u.ropes, alt: u.altMax,
        speed: u.ropeSpeed, fuel: u.fuel, state, handY: hands[0].y, ropeBottom,
        holding, thrusting, down, paused, char: charId, cam: camDbg,
        phase: ropes.ropes[0].theta + ropes.ropes[0].offset,
      };
    },
    /** drive the game from a script (used for automated checks) */
    script: {
      set(name, v) { u[name] = v; },
      give(id) {
        const c = CARDS.find((x) => x.id === id);
        if (c) applyCard(c);
      },
      get: () => u,
      /** teleport: the sky bands and the star tier have to be checkable without
       *  climbing 300 m first. Height only; the parked frame goes with her, or the
       *  picture would stay framed on the ground she left. */
      fly(m) {
        y = Math.max(0, m); vy = 0; grounded = false;
        camAnchor = y; camY = y + 1.05;
      },
    },
  };
}
