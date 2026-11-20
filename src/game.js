// Run state, one-button physics, camera and HUD. The rope sweep is the clock:
// press too early and you land on it, too late and it catches your feet.
import * as THREE from '../vendor/three.module.js';
import { createWorld } from './world.js';
import { createCharacter } from './character.js';
import { createRopes } from './rope.js';
import { CARDS, drawCards, CRIT_BASE } from './cards.js';
import { ROSTER, byId } from './roster.js';
import { sfx } from './audio.js';
import { addRun, board } from './records.js';
import { C, createPost } from './toon.js';

// The key that takes each card on screen: the number row, then 0, then the key after it. Drawn
// onto the cards and listened for in main.js from the same list, so a card can never claim a key
// that does nothing. No card is capped, so a run stacked with Four-Leaf Sneaker can be handed the
// whole deck at once and all eleven need a key.
export const SLOT = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7',
  'Digit8', 'Digit9', 'Digit0', 'Minus'];
const KEY_LABEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

const G = 23.5;              // gravity, m/s^2
const VY_MAX = 26;           // ascent stops paying for itself here. Nothing in ordinary play comes
                             // close - a tap leaves the ground at 3.8 - but the braid's ceiling is
                             // HOVER_K * jumpV, and a Higher Soles stack raises that ceiling until
                             // this clamp is the one holding the climb down (game.js:hoverA). A
                             // climb that outran it left the atmosphere and took minutes of nothing
                             // happening to come back down.
const ASCEND_DRAG = 20;      // how hard that ceiling is enforced: lift past VY_MAX is handed straight
                             // back, which is what air does
const HOVER_K = 2.2;         // the braid's ceiling, in multiples of the launch speed. Past it the
                             // propeller pays only what gravity costs, so it holds her up rather
                             // than throwing her upward: four copies stop inverting gravity and
                             // become a long hover at a speed the jump sets, which is what lets a
                             // Higher Soles stack raise the climb with the arc instead of the braid
                             // replacing it. Below VY_MAX until the jump itself is stacked deep,
                             // where that clamp takes over as the hard stop.
const FALL_DRAG_MIN = 0.35;  // the floor on Puffy Overalls' fall drag. Drag is reduced gravity on
                             // the way down, and gravity is what makes the descent arrive: below a
                             // third of it a hop hangs for seconds, she is still in the air when the
                             // rope comes round, and the beat the whole game is solved against stops
                             // being the thing she has to answer

/** The ascent ceiling, stated once so the integrator and the camera's arc prediction cannot
    disagree about it (game.js:arcY). Zero for anything a run reaches by skipping. */
const ascendA = (v) => -ASCEND_DRAG * Math.max(0, v - VY_MAX);

/** What the braid pays at a given climb speed: its whole thrust at the bottom of the arc, and down
    to exactly the cost of gravity at the hover ceiling - so the ceiling is the speed she climbs at,
    not a speed the lift merely stops adding to. A braid that cannot beat gravity has nothing to
    taper and stays the lift assist it always was; on the way down it pays in full, because the
    braid fights a fall rather than amplifying one. Stated once so the integrator and the camera's
    arc prediction cannot disagree about it, for the same reason as ascendA (game.js:arcY). */
const hoverA = (v, u) => {
  const net = u.thrust - G;                     // what the braid keeps after gravity
  if (net <= 0) return u.thrust;
  return u.thrust - net * Math.max(0, Math.min(1, v / (HOVER_K * u.jumpV)));
};

const JUMP_V = 3.8;          // a tap: ~0.31m apex, ~0.32s off the ground - over the sweep with a
                             // little headroom, and back down with the revolution still running
const HOLD_LIFT = 13.2;      // extra upward accel while holding, which is what turns that tap
                             // into the ~0.70m hop a single press used to give on its own
const HOLD_MAX = 0.40;       // seconds of hold assist: the held apex arrives as it runs out
const ROPE_A = 1.18;         // rope length: hand anchor height plus enough slack that the
                             // sweep reads as a loop around her rather than a band on the body
const ROPE_W = 0.38;         // radians around bottom that count as "rope at the feet". A rope
                             // this long touches dirt out to acos((P.handY - 0.05) / ROPE_A) =
                             // 0.64 rad, so the rule is deliberately narrower than the picture
                             // by 0.25 rad either side - 40 ms where the rope grazes the floor
                             // and does nothing. Widening it to match the geometry exactly
                             // would eat the opening hop's margin over the first pass on the
                             // short-airtime jumpers (game.js:launchT), which is an invariant
                             // with a commit behind it; being forgiving at the edges is the
                             // better side to be wrong on.
// A press that misses is held this long, so the frame she lands on is still the jump she asked
// for. A pass is a 117 ms window and a press a few frames early used to be read as no press at
// all, which ends a run for timing that was early rather than wrong. It cannot buy her a rope:
// the press only replays on the dirt, and she still had to be off the floor when the sweep came
// round (game.js:step).
const BUFFER = 0.05;
// The braid's beat. One press per revolution counts, and it counts only inside this much of a rope
// at her feet - half the danger window below, and in the whip's fastest part, so the tighter ask
// of the two - and buys this many seconds of burn against a tank that is draining all the way up.
// A revolution costs 1.33 s of burn and a clean press pays 1.0 of it, so leaning on the key still
// runs the tank dry: the way to the top is to keep time with the rope.
const IGNITE = 1.0;
const IGN_W = ROPE_W * 0.5;
const BASE_SPEED = (Math.PI * 2) * 0.75;  // three revolutions every four seconds: faster and the
                                           // base hop lands on the sweep, slower and the rope
                                           // stops driving - and at this rate the hop and the
                                           // beat are far enough apart that she has time to see
                                           // the next one coming
const LEVEL_TIME = 16;     // seconds of skipping one level is solved for. More ropes, or a
                           // faster sweep, makes more skips in the same second, and the XP
                           // threshold scales with that rate so the wait between picks holds
                           // still as the build changes underneath it.
const XP_WINDOW = 3;       // the XP bar is drawn across this many levels: the one she is in and
                           // the two it runs into, so the ladder ahead is on the gauge rather than
                           // a bar that empties every level. Later gaps are assumed to repeat the
                           // current one, which is a forecast and not a promise - a rope or a
                           // faster sweep re-solves the next threshold when it is reached.
// The run's one goal, and the only height the game cares about. `space` in step() is fully
// arrived at here (world.js:BANDS stops at 150 m and the stars tier in above that), so by the
// time she reaches it the stage has nothing left to show her: the win is the place the scenery
// was already built to stop, not a number invented for a trophy. Crossing it ends the run
// (game.js:winRun). Held through one press eight braids fall 92 m short of it; pressed so the
// braid refuels on the beat, six get there in 26 s, so this is a build rather than a reflex.
const WIN_H = 260;         // metres

const FALLS = ['crumple', 'topple', 'sit'];  // the shapes a wipeout can land in, picked at
                                             // random so no two runs end the same way

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
    crit: document.getElementById('crit'),
    mult: document.getElementById('mult'),
    pillNum: document.querySelector('#pill .num'),
    fill: document.querySelector('#pill .fill'),
    cap: document.getElementById('pillcap'),
    xp: document.getElementById('xp'),
    xpFill: document.querySelector('#xp .fill'),
    xpLvl: document.querySelector('#xp .lvl'),
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
    sScore: document.getElementById('s-score'),
    boards: document.getElementById('boards'),
    bScore: document.getElementById('b-score'),
    bHeight: document.getElementById('b-height'),
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
  const goAgainText = () => (touchUI ? 'TAP FOR THE ROSTER' : 'PRESS SPACE FOR THE ROSTER');
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
      jumpV: JUMP_V, ropeSpeed: BASE_SPEED, ropes: 1, ropesMax: 1, thrust: 0,
      fuel: 0, fuelMax: 0, live: 0, offer: 3, fallDrag: 1, landEase: 1,
      grace: 0, airJumps: 0, combo: 0, mult: 1, holdLift: HOLD_LIFT, holdMax: HOLD_MAX,
      levels: {}, skips: 0, score: 0, level: 1, xp: 0, xpNeed: 0, critChance: CRIT_BASE,
      alt: 0, altMax: 0, sinceSkip: 0, streak: 0, fall: '',
    });
    // the numbers are the same for every jumper; only the cards ever move them
    u.xpNeed = levelGap();   // the first threshold, off the sweep rate
    y = 0; vy = 0; grounded = true; holdT = 0; holding = false; launchT = 0;
    camAnchor = 0; camY = 1.05;   // a new run frames the ground, not the last run's ceiling
    airLeft = 0; thrusting = false; dead = false; deadT = 0; won = false;
    shake = 0; flash = 0; nearMiss = 0; lastSkipT = -9;
    bufferT = 0; armed = true; lastBeat = 0;
    stumbled = false; hintT = 0; lostHint = false;
    paused = false; el.paused.classList.remove('on');
    ropes.setCount(1);
    ropes.reset();
    renderOwned();
  }

  let state = 'title';         // title | ready | run | draft | over
  let y = 0, vy = 0, grounded = true, holdT = 0, holding = false, launchT = 0;
  let airLeft = 0, thrusting = false, dead = false, deadT = 0, won = false;
  let shake = 0, flash = 0, nearMiss = 0, lastSkipT = -9;
  let pressEdge = false, down = false;
  let bufferT = 0;           // a press waiting for the landing it was meant for (BUFFER)
  let armed = true, lastBeat = 0;   // one braid ignition per revolution of the sweep
  let stumbled = false;        // a trip costs at most one rope per frame
  let hintT = 0, lostHint = false;   // the "ropes left" hint times itself out
  let xpShown = -1;             // the LVL readout is written when it changes, not every frame
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

  /** The two boards a run is remembered by, straight off the saved rows. Both live on the panel
   *  rather than behind a menu, because the question they answer - was that a good run? - is
   *  asked while the panel is up and again before the next one starts. `mine` marks the row this
   *  run wrote, so the answer does not mean searching five rows twice. */
  function paintBoards(mine) {
    const draw = (node, kind, value, marks) => {
      node.innerHTML = '';
      for (const r of board(kind)) {
        const li = document.createElement('li');
        li.innerHTML = `<b>${value(r)}</b>` + (marks && r.won ? '<i>SPACE</i>' : '') +
          (r.id === mine ? '<em>NEW</em>' : '') + `<span>${r.jumper}</span>`;
        if (r.id === mine) li.className = 'mine';
        node.appendChild(li);
      }
    };
    // The height board needs no win mark: a height at or past WIN_H *is* a win, since crossing
    // it is what ended the run. On the score board the same fact is not visible in the number.
    draw(el.bScore, 'score', (r) => r.score, true);
    draw(el.bHeight, 'height', (r) => `${r.height} m`, false);
    el.boards.style.display = board('score').length ? 'flex' : 'none';
  }

  /**
   * The next XP threshold, solved for a flat wait instead of counting up. One skip per rope per
   * revolution, so a build with more ropes or a faster sweep earns the same threshold out of
   * more skips and the time between picks is what stays put. Counting up by a level-sized step
   * is what this replaces: picks drifted from half a minute apart to over a minute by the
   * sixth, which is a long time to be offered nothing.
   */
  function levelGap() {
    return Math.max(4, Math.round(LEVEL_TIME * u.ropes * u.ropeSpeed / (Math.PI * 2)));
  }

  /** The multiplier is a streak, not an odometer: the ladder is skips since the last rope she
      lost, so the cushion and the score are the same number spent two ways. Losing a rope used to
      cost one rope and nothing else, which made a safe run win by lasting. */
  function multiplier() {
    return u.mult * (1 + u.combo * Math.min(3, u.streak / 45));
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
    el.alt.textContent = `${Math.floor(Math.max(0, y))} m`;
    // the ropes turning, and when the run has lost one the number it could be back at: a lost
    // rope has to be visible without a toast going past to say it
    el.pillNum.textContent = u.ropes < u.ropesMax ? `${u.ropes}/${u.ropesMax}` : u.ropes;
    el.cap.textContent = u.thrust > 0 ? 'SPIN' : 'ROPES';
    // The right-edge bar is the braid's fuel and nothing else. It used to carry XP when there
    // was no braid, which made one gauge mean two different things depending on the last card
    // taken - and fuel draining upward next to the rope count is its own instrument.
    el.fill.style.height = `${(u.thrust > 0 ? Math.max(0, Math.min(1, u.fuel / Math.max(0.001, u.fuelMax))) : 0) * 100}%`;
    // XP is cumulative, so the bar can show the levels ahead instead of restarting: the span is
    // the next three thresholds, and the two ticks on it are where they fall.
    const gap = Math.max(1, levelGap());
    const from = u.xpNeed - gap;
    el.xpFill.style.width = `${Math.max(0, Math.min(1, (u.xp - from) / (gap * XP_WINDOW))) * 100}%`;
    if (xpShown !== u.level) {
      xpShown = u.level;
      el.xpLvl.innerHTML = `LVL<b>${u.level}</b>`;
    }
    // a run instrument: the roster, the card screen and the hint line all use this strip of the
    // screen, so the ladder is only on the air while she is actually jumping
    el.xp.classList.toggle('live', state === 'run' || state === 'ready');
  }

  /** A lucky skip: the label flies off the counter and a ping sits over the skip tone. Any skip
      that counts can roll one, so this flash is the only tell that luck just landed. */
  function critFlash() {
    sfx.crit();
    el.crit.textContent = 'CRIT \u00D72';
    el.crit.classList.remove('on');
    void el.crit.offsetWidth;   // restart the flight when crits come in a row
    el.crit.classList.add('on');
  }

  function hint(txt) {
    el.hint.textContent = txt;
    el.hint.classList.toggle('off', !txt);
  }

  // ---------------- flow ----------------
  /** trip() and winRun() write the ending panel and its copy, and nothing else puts them away,
      so every entry point shares this: pose, title copy, stats panel, the saved-run boards, and
      the camera back down to the ground. */
  function resetScreen() {
    char.rig.hips.rotation.set(0, 0, 0);
    char.group.rotation.set(0, 0, 0);
    char.group.position.set(0, 0, 0);
    el.title.innerHTML = 'BOING<span>GARDENS</span>';
    el.tag.textContent = 'One button. One rope. All the way to space.';
    el.go.textContent = goText();
    el.stats.style.display = 'none';
    paintBoards();   // the boards are the last thing a finished run leaves on screen
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
    u.streak = 0;      // this is the only thing that breaks the multiplier, on purpose
    ropes.setCount(u.ropes);
    ropes.reset(true);      // recovering: the survivors are re-spaced, so they get a half turn
    vy = STUMBLE_VY; grounded = false; holdT = 0; thrusting = false;
    shake = 0.8; flash = 0.35;
    char.bump(-1.4, 0.5);
    // not sfx.fail(): that is the death sound, and this run is still going
    sfx.whoosh(); sfx.land(9);
    hint(u.ropes === 1 ? 'last rope' : `${u.ropes} ropes left`);
    hintT = 1.6; lostHint = true;
  }

  /** One path for both endings: bank the run, fill the panel with what it got, and put the two
   *  boards underneath so the run can be read against the ones before it. `deadT` restarts here
   *  because step()'s `over` branch counts it to know when the ending has finished playing, and
   *  the panel goes up the moment it has. */
  function endRun(win) {
    deadT = 0;
    state = 'over';
    const row = addRun({
      score: u.score, height: Math.floor(u.altMax), skips: u.skips,
      level: u.level, won: win, jumper: who().name,
    });
    el.sSkips.textContent = u.skips;
    el.sAlt.textContent = `${Math.floor(u.altMax)}m`;
    el.sScore.textContent = u.score;
    el.stats.style.display = 'flex';
    paintBoards(row.id);
    el.go.textContent = goAgainText();
    el.screen.classList.add('off');
  }

  function trip() {
    // stumbled: a cluster of ropes can cross in the same frame, and one missed
    // jump has to cost one rope, not the whole bundle
    if (dead || stumbled) return;
    stumbled = true;
    if (u.ropes > 1) { loseRope(); return; }
    dead = true;
    shake = 1;
    vy = 3.4;
    // A live rope always ends it the same way; otherwise which fall she gets is drawn on the
    // spot, once, so the same mistake does not look the same twice.
    const fall = u.live > 0 ? 'shock' : FALLS[(Math.random() * FALLS.length) | 0];
    char.fall(fall);
    u.fall = fall;
    if (fall === 'shock') sfx.zap();
    char.bump(-1.2, 0.6);
    sfx.fail();
    endRun(false);
    el.title.innerHTML = 'WIPE<span>OUT</span>';
    el.tag.textContent = `The rope won that one. ${u.score} points.`;
    hint('');
  }

  /** The other way a run stops, and the only one that is not a fall: see WIN_H. Nothing here
   *  drops her or lets go of the rope - `dead` stays false, so the character keeps the pose the
   *  climb left her in and step()'s `over` branch brings her down. That descent is the ending:
   *  the stage she just climbed goes by in the wrong order, and the panel waits for the landing. */
  function winRun() {
    won = true;
    thrusting = false;    // the braid stops: there is nothing above here to climb to
    shake = 0.7;
    flash = 0.9;
    sfx.win();
    char.bump(0.7, 0.3);
    endRun(true);
    el.title.innerHTML = 'SPACE<span>REACHED</span>';
    el.tag.textContent = `Out of the atmosphere at ${WIN_H} m. ${u.score} points.`;
    hint('coming down');
    hintT = 4.6; lostHint = true;   // the timer that hides the rope-loss hint covers this too
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
        `<div class="lv">${c.level(n + 1, u)}</div>` +
        `<div class="key">PRESS ${KEY_LABEL[i] ?? i + 1}</div>`;
      d.onclick = () => takeCard(i);
      el.row.appendChild(d);
    });
    // Past a handful the row wraps, and the blurbs are what would push the last row off the
    // screen; the name, the number and the key are the parts that decide the pick.
    el.row.classList.toggle('busy', offerCards.length > 5);
    el.draft.classList.add('on');
    el.skips.classList.add('hide');
    hint('');
  }

  /** One place where a card mutates the run, so a pick and a test drive agree. */
  function applyCard(c) {
    u.levels[c.id] = (u.levels[c.id] ?? 0) + 1;
    c.apply(u);
    // every pick tops up the braid, which is the loop that keeps a run airborne - and so does
    // touching the ground, see the landing below
    if (u.thrust > 0) u.fuel = u.fuelMax;
    if (u.ropes > u.ropesMax) u.ropesMax = u.ropes;   // the high-water mark of the run
    ropes.setCount(u.ropes);
  }

  function takeCard(i) {
    if (state !== 'draft') return;
    const c = offerCards[i];
    if (!c) return;
    applyCard(c);
    u.level++;
    // XP is not reset: the threshold moves up to meet it, so an over-eager skip at the top of a
    // level is not thrown away and the bar can show what the next levels will cost.
    u.xpNeed += levelGap();
    el.xp.classList.remove('up');
    void el.xp.offsetWidth;     // one bump per level, even when two land in the same second
    el.xp.classList.add('up');
    setTimeout(() => el.xp.classList.remove('up'), 620);   // the bump is a moment, not a state
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
  // The look is the same rig recoloured and rescaled (character.js setLook), and it is all
  // the row carries: five jumpers, one set of numbers, so picking a face is a decision about
  // who you want to watch and not about how the run goes. The pick is not remembered: every
  // load starts on the roster's first row, and pressing a number changes the run in front of
  // you - which is also why a run ends by handing you the roster back.
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
        `<div class="key">PRESS ${KEY_LABEL[i] ?? i + 1}</div>`;
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
    freshRun();       // the numbers have to change now, not on the run after this one
    // Picking out of a wipeout has to put the last run away as well as start the next one:
    // freshRun clears the dead flag, and this is what stands her back up, hides the stats and
    // brings the frame down from wherever the fall left it.
    resetScreen();
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
    // A run ends by returning to the roster rather than dropping straight back in: the face
    // you died with is a decision worth making again, and the panel has just told you it lost.
    if (state === 'over') { showSelect(); return; }
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
      down = false; pressEdge = false; bufferT = 0;
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
    // The burn's own lift falls away as the arc approaches the hover ceiling, so the prediction
    // reads it at the speed she has now - which overestimates the climb, the safe direction for a
    // frame that would rather arrive before she does than after.
    const lift = (holding ? u.holdLift : 0) + (thrusting ? hoverA(vy, u) : 0);
    const owed = Math.min(LOOK_AHEAD, Math.max(
      holding ? Math.max(0, u.holdMax - holdT) : 0,
      thrusting ? u.fuel : 0));
    const g = -G * (vy < 0 ? Math.max(FALL_DRAG_MIN, u.fallDrag) : 1);
    const a1 = g + lift + ascendA(vy);
    if (t <= owed) return y + vy * t + 0.5 * a1 * t * t;
    const v = vy + a1 * owed;
    const h = y + vy * owed + 0.5 * a1 * owed * owed;
    const a2 = g + ascendA(v);
    return h + v * (t - owed) + 0.5 * a2 * (t - owed) * (t - owed);
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
        // the beat. The sweep is parked a quarter turn past the top for exactly this
        // (rope.js:AT_START), so the first pass lands under this arc instead of just after it, and
        // the arc gets the hold assist whether or not the key is still down - the height of any
        // held press - because it is the one arc in a run that has to be airborne at a fixed time.
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
      // A press a few frames before the landing is the jump she meant, so it is replayed here,
      // on the frame she is back on the dirt. It cannot buy her a rope: she still had to be off the
      // floor when the sweep came round, and all the buffer fixes is reading early timing as no
      // timing at all.
      if (bufferT > 0) {
        if (grounded) { bufferT = 0; pressEdge = true; }
        else bufferT = Math.max(0, bufferT - dt);
      }
      if (pressEdge) {
        if (grounded) {
          vy = u.jumpV;
          grounded = false;
          holdT = 0;
          airLeft = u.airJumps;
          sfx.boing(1);
          char.bump(0.9);
          char.puff(0, 0.05, 0.1, 0.7);
        } else if (airLeft > 0 && vy < u.jumpV * 0.8) {
          // A hop is a hop: it replaces the fall instead of adding to the hop before it. Summed,
          // twenty copies of Second Wind and a mashing thumb made an ascent no descent can come
          // back down from - tens of thousands of metres, and a fall that outlasts the run. A
          // press while she is still rising from the last one takes nothing, so it spends nothing.
          airLeft--;
          vy = u.jumpV * 0.8;
          sfx.whoosh();
          char.bump(0.7);
        } else bufferT = BUFFER;
        // The braid drinks the beat, and only the beat: one press a revolution, and only as a rope
        // passes under her feet. Holding the key through a climb therefore pays a fraction of what
        // the burn costs, so 260 m is a passage she keeps time with instead of a key she leans on.
        // No sound here on purpose - the whup is the braid's own voice, and the tank it is drawn
        // from just went up.
        if (!grounded && u.thrust > 0 && armed) {
          armed = false;
          if (ropes.ropes.some((r) => r.active && Math.cos(r.abs) > Math.cos(IGN_W))) {
            u.fuel = Math.min(u.fuelMax, u.fuel + IGNITE);
            char.bump(0.3, 0.2);
          }
        }
      }

      holding = down && vy > 0 && holdT < u.holdMax;
      thrusting = !grounded && down && u.thrust > 0 && u.fuel > 0;
      if (holding) holdT += dt;
      if (thrusting) u.fuel = Math.max(0, u.fuel - dt);   // the tank is in seconds now

      let a = -G * (vy < 0 ? Math.max(FALL_DRAG_MIN, u.fallDrag) : 1);
      // The opening hop spends its assist here, so a held press and the press that started the
      // run get one assist window each, never two stacked on the same arc.
      if (launchT > 0 && !grounded) { a += u.holdLift; launchT = Math.max(0, launchT - dt) }
      else if (holding) a += u.holdLift;
      if (thrusting) a += hoverA(vy, u);   // tapering to the hover ceiling, not a flat climb
      a += ascendA(vy);
      vy += a * dt;
      y += vy * dt;

      if (y <= 0) {
        const impact = Math.min(16, -vy);
        y = 0;
        if (!grounded) {
          grounded = true;
          // The braid spins back up on the dirt. That is what makes the climb worth buying:
          // fuel that only a card refill brought would last well under a second per pick, so
          // the choice became "spend the upgrade", and now it is "spend the height you gained"
          // - landing is the one moment the rope can take a rope off her, so the climb pays
          // for itself by putting the danger where the game already keeps it.
          if (u.thrust > 0) u.fuel = u.fuelMax;
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
      if (y >= WIN_H) winRun();   // the only way a run ends on its own terms
    } else if (state === 'over') {
      deadT += dt;
      if (!grounded || y > 0) {
        const before = vy;
        vy -= G * dt;
        y = Math.max(0, y + vy * dt);
        if (y <= 0) {
          // The landing is the full stop at the end of the win's descent. A wipeout is already
          // lying where it fell under its own sound, so the thud belongs to the win alone.
          if (won && before < -6) {
            sfx.land(Math.min(16, -before));
            char.bump(-1.1, 0.18);
            char.puff(0, 0.06, 0.15, 1.2);
            shake = 0.5;
          }
          y = 0; vy = 0; grounded = true;
        }
      }
      // A wipeout is covered as soon as its tumble lands. A win is covered when she is back on
      // the dirt, because the fall from WIN_H is the ending rather than a gap in it; the deadT
      // ceiling is for a run that wins with Puffy Overalls aboard, where the drag floor stretches
      // 260 m into eight seconds, which is too long a thing to make anyone watch.
      if (won ? (grounded && deadT > 0.3) || deadT > 4.6 : deadT > 1.15) el.screen.classList.remove('off');
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
      // A wipeout means she let go, and the handles come down to the dirt over the same half
      // second as the fall. Held in her hands the rope does not lie down: a topple leaves her
      // arms flung up, and the arc hangs from them as a hoop framing the body it just tripped.
      if (dead) {
        const letGo = Math.min(1, deadT / 0.4);
        hands[0].y += (0.07 - hands[0].y) * letGo;
        hands[1].y += (0.07 - hands[1].y) * letGo;
      }
      // Three revolutions every four seconds, and that rate is the whole story: nothing here speeds
      // the sweep up because the run got long. Rope speed is a card, so it changes when one says so.
      const speed = state === 'run' ? u.ropeSpeed : 0;
      ropeBottom = ropes.update(state === 'run' || state === 'over' ? dt : 0, {
        hands, speed, length: ROPE_A, ground: 0, live: u.live, time,
      });
      // The braid's charge is refilled once a revolution, and at the TOP of the sweep - half a
      // turn before any rope reaches her feet (game.js:IGNITE). Refreshing it at the bottom would
      // put the charge and the window in the same frame, which hands the fuel to anyone mashing
      // the key; arming it here means a press on the way round spends the charge whether or not it
      // was aimed. A rope stack makes the window easier to find without paying more per second
      // than a single rope does, which is the trade for its trip risk.
      const beat = Math.floor((ropes.ropes[0].theta + Math.PI) / (Math.PI * 2));
      if (beat !== lastBeat) { lastBeat = beat; armed = true; }

      if (state === 'run') {
        const w = Math.max(0.14, ROPE_W - u.grace);
        for (const r of ropes.ropes) {
          if (!r.active) continue;
          const abs = r.abs;   // where the rope is, not the clock driving it: the danger window
          const c = Math.cos(abs);   // has to be the geometry on screen, or the whip is invisible
          // The rope rides her hands, so its geometric bottom climbs with the
          // jump stretch and the arm swing - reading the pass/fail plane off it
          // made a skip depend on her pose and on last frame's matrices. The
          // player sees the rope sweep past her feet, so the plane follows her
          // feet: off the floor when it passes is a skip, a foot down is a trip.
          const clear = y > 0.03;
          // A rope still settling into the sweep cannot end the run. It is the one the player
          // has not heard yet, and before this it arrived, tripped her out of a rhythm that
          // was working, and was gone inside a second of being picked up.
          const safe = r.settle > 0;
          if (r.crossed) {
            if (clear) {
              u.skips++;
              u.streak++;
              u.score = Math.round(u.score + multiplier());
              lastSkipT = time;
              // the rope rides her hands, so its gap to her feet is a constant;
              // what actually reads as "close" is how little dirt she cleared
              if (y < 0.12) nearMiss = 0.25;
              // A crit rolls on the skip itself, not on the shape of the hop: any skip that
              // counts can double, so luck lands anywhere in a run and buying the chance reads as
              // fortune rather than as a different way to jump.
              const crit = Math.random() < u.critChance;
              u.xp += crit ? 2 : 1;
              if (crit) critFlash();
              sfx.skip(u.skips);
              char.bump(0.4, 0.25);
              el.skips.classList.add('pop');
              setTimeout(() => el.skips.classList.remove('pop'), 90);
              if (u.xp >= u.xpNeed) { levelUp(); break; }
            } else if (!safe) {
              trip();
            }
          } else if (!safe && c > Math.cos(w) && y < 0.03 && vy <= 0.2) {
            // inside the danger window with a foot in the rope's path
            trip();
          }
        }
        nearMiss = Math.max(0, nearMiss - dt);
      }
    }

    // ---------------- character ----------------
    char.update(dt, {
      time, y, vy,
      // Limp on a wipeout only: a win leaves her upright and still holding the rope, and the way
      // down to the panel is a fall she is riding rather than one she has collapsed in.
      grounded: dead ? false : grounded,
      phase: ropes.ropes[0].theta + ropes.ropes[0].offset,   // the clock, not the warped angle:
                                                             // the hands keep the beat, the rope
                                                             // whips through it
      holding, spin: thrusting, dead,
      alt: y, ropeSpeed: u.ropeSpeed / BASE_SPEED, ropes: u.ropes,
      fuel: u.fuelMax ? u.fuel / u.fuelMax : 0,
      nearMiss: nearMiss > 0, skipped: time - lastSkipT < 0.12,
    });
    // The rope's hum and the braid's whup are loops with a gate, not one-shots, so they are
    // told the truth every frame whether or not the run is still running. Both used to be
    // updated from inside the run branch, which meant a wipeout left the rope humming under
    // the game-over panel until the next run started.
    sfx.live(state === 'run' ? u.live : 0);
    sfx.whup(state === 'run' && thrusting ? Math.max(0.25, u.fuel / Math.max(0.001, u.fuelMax)) : 0);

    // ---------------- camera ----------------
    // Parked, not tracking: her height alone never moves the picture. The frame slides
    // only when where the arc is *going* - this jump, the hold on top of it, the braid's
    // climb, one chained air jump - would push her out of the band the body and the rope
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
    // is itself more than the band - a stacked-braid run leaving the ground at a kilometre a
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

    world.update(dt, time, camPos.y, u.live > 0 ? 1 : 0);
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
        phase: ropes.ropes[0].abs,
        // every live rope's geometric angle, not just the first one's and not the clock: a bot
        // times the rope it can see, and the warp (rope.js:warp) sets when each one is at her feet
        phases: ropes.ropes.filter((r) => r.active).map((r) => r.abs),
        // which wipeout she is in, and where the body ended up: a fall that keeps travelling
        // is the bug this is here to catch
        fall: u.fall,
        pose: [Math.round(char.group.position.x * 1000) / 1000,
          Math.round(char.group.rotation.z * 100) / 100, Math.round(char.group.rotation.x * 100) / 100],
        settle: ropes.ropes.filter((r) => r.active).map((r) => Math.round(r.settle * 100) / 100),
        xp: Math.round(u.xp * 10) / 10, xpNeed: u.xpNeed, crit: u.critChance, ropesMax: u.ropesMax,
        score: u.score, won,
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
