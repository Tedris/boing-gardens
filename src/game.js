// Run state, one-button physics, camera and HUD. The rope sweep is the clock:
// press too early and you land on it, too late and it catches your feet.
import * as THREE from '../vendor/three.module.js';
import { createWorld } from './world.js';
import { createCharacter } from './character.js';
import { createRopes } from './rope.js';
import { CARDS, drawCards } from './cards.js';
import { sfx } from './audio.js';
import { canvasTex, spring, springState } from './toon.js';

const G = 23.5;              // gravity, m/s^2
const JUMP_V = 5.75;         // base takeoff speed -> ~0.7m apex, ~0.49s airtime
const HOLD_LIFT = 9.5;       // extra upward accel while holding on the way up
const HOLD_MAX = 0.40;       // seconds of hold assist
const ROPE_A = 1.05;         // rope length: hand anchor height + a little slack
const ROPE_W = 0.38;         // radians around bottom that count as "rope at the feet"
const BASE_SPEED = (Math.PI * 2) / 1.05;
const BEST_KEY = 'boing-gardens-best';

const V3 = () => new THREE.Vector3();

export function createGame(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // low fov + dead-on axis is what makes the 3D read as a flat illustration
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 1200);
  camera.position.set(0, 0.88, 7.8);

  // One light. The directional pair had no effect at any intensity, and point
  // lights parked far off had none either (the fire rope's light, a metre from
  // her hands, does work). The cel read comes from two-tone part colours plus
  // ink outlines, so this fill only has to stop her going flat - and it does,
  // at every altitude.
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x8fbf72, 1.15);
  scene.add(hemi);
  // ground bounce: grass at park level, cold sky once the air thins out
  const groundNear = new THREE.Color(0x8fbf72), groundSpace = new THREE.Color(0x6f89ad);

  // Contact shadow: one soft blob on the dirt that spreads and fades with height.
  // Cheaper and far more readable at this scale than a shadow map that would have
  // to chase her into the stratosphere.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 24),
    new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, (g, w) => {
        const r = g.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
        r.addColorStop(0, 'rgba(22,38,16,0.8)');
        r.addColorStop(0.5, 'rgba(22,38,16,0.4)');
        r.addColorStop(1, 'rgba(22,38,16,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, w, w);
      }),
      transparent: true, depthWrite: false, opacity: 0.5,
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
  };

  // ---------------- run state ----------------
  const u = {};
  function freshRun() {
    Object.assign(u, {
      jumpV: JUMP_V, ropeSpeed: BASE_SPEED, ropes: 1, thrust: 0,
      fuel: 0, fuelMax: 0, fire: 0, offer: 3, fallDrag: 1, landEase: 1,
      grace: 0, airJumps: 0, combo: 0, mult: 1,
      levels: {}, skips: 0, score: 0, level: 1, xpNeed: 12, xpBase: 0,
      alt: 0, altMax: 0, sinceSkip: 0, time: 0,
    });
    y = 0; vy = 0; grounded = true; holdT = 0; holding = false;
    airLeft = 0; thrusting = false; dead = false; deadT = 0;
    shake = 0; flash = 0; nearMiss = 0; lastSkipT = -9;
    ropes.setCount(1);
    ropes.reset();
    renderOwned();
  }

  let state = 'title';         // title | ready | run | draft | over
  let y = 0, vy = 0, grounded = true, holdT = 0, holding = false;
  let airLeft = 0, thrusting = false, dead = false, deadT = 0;
  let shake = 0, flash = 0, nearMiss = 0, lastSkipT = -9;
  let pressEdge = false, down = false;
  let camY = 0.88, camZ = 7.8, time = 0, ropeBottom = 0.014, camDip = 0;
  const sDip = springState();
  const hands = [V3(), V3()];
  let offerCards = [];

  freshRun();

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
    el.go.textContent = 'PRESS SPACE';
    el.stats.style.display = 'none';
    camY = 0.9;
  }

  function startRun() {
    // A new run has to start clean. Without this the last run's stats, pose, limp
    // flag and wipeout panel carried over - trip() refuses to end a run already
    // marked dead, and the panel kept reporting the previous run's score.
    freshRun();
    resetScreen();
    el.screen.classList.add('off');
    state = 'ready';
    hint('press to start the rope');
  }

  function trip() {
    if (dead) return;
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
    el.go.textContent = 'PRESS SPACE TO GO AGAIN';
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
    if (state === 'title' || state === 'over') { startRun(); return; }
    if (state === 'draft') return;
    down = true;
    pressEdge = true;
  }
  function release() { down = false; }

  function pick(i) {
    if (state === 'draft') takeCard(i);
  }

  // ---------------- step ----------------
  const camPos = new THREE.Vector3();

  function step(dt) {
    time += dt;
    const live = state === 'run' || state === 'ready' || state === 'over';

    if (state === 'ready') {
      // idle while the player gets the feel of the button
      grounded = true;
      if (pressEdge) {
        state = 'run';
        hint('');
        ropes.reset();
        sfx.whoosh();
      }
    } else if (state === 'run') {
      u.time += dt;
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

      holding = down && vy > 0 && holdT < HOLD_MAX;
      thrusting = !grounded && down && u.thrust > 0 && u.fuel > 0;
      if (holding) holdT += dt;
      if (thrusting) u.fuel = Math.max(0, u.fuel - dt / Math.max(0.2, u.fuelMax));

      let a = -G * (vy < 0 ? u.fallDrag : 1);
      if (holding) a += HOLD_LIFT;
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
      const speed = state === 'run' ? u.ropeSpeed * (1 + Math.min(0.35, u.time * 0.004)) : 0;
      ropeBottom = ropes.update(state === 'run' ? dt : 0, {
        hands, speed, length: ROPE_A, ground: 0, fire: u.fire > 0, time,
        camQuat: camera.quaternion,
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
    // Track her height near-rigidly: the park falling away below is the point, and
    // a laggy follow lets a rocket climb walk her straight out of frame. The dip
    // spring keeps a little weight in ascents and landings.
    camDip = spring(sDip, THREE.MathUtils.clamp(-vy * 0.012, -0.32, 0.22), 55, 11, dt);
    camY = Math.max(0, y) + 0.88 + camDip;
    // ease back a little with height, then stop: she has to stay readable at 2 km
    camZ += (7.8 + THREE.MathUtils.smoothstep(y, 12, 140) * 3.2 - camZ) * Math.min(1, dt * 2.2);
    shake = Math.max(0, shake - dt * 2.4);
    flash = Math.max(0, flash - dt * 2.2);
    camPos.set(
      Math.sin(time * 47) * shake * 0.13,
      camY + Math.sin(time * 61) * shake * 0.11,
      camZ,
    );
    camera.position.copy(camPos);
    camera.quaternion.identity();

    // nothing here needs to follow her: a hemisphere fill is the same anywhere
    const spread = 1 + Math.min(2.4, Math.max(0, y) * 0.09);
    blob.scale.set(spread, spread, 1);
    blob.material.opacity = Math.max(0, 0.5 - Math.max(0, y) * 0.035);
    blob.visible = blob.material.opacity > 0.01;
    // thin air: the grass stops bouncing off her underside, which is the entire
    // difference between the park look and the space look. Left green, she bakes.
    const space = THREE.MathUtils.smoothstep(y, 60, 260);
    hemi.intensity = 1.15 - space * 0.1;
    hemi.groundColor.lerpColors(groundNear, groundSpace, space);

    world.update(dt, time, camPos.y, u.fire > 0 ? 1 : 0);
    el.flash.style.opacity = flash * 0.55;
    paintHud();
    pressEdge = false;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    renderer, scene, camera, step, resize, press, release, pick,
    get state() { return state; },
    get rig() { return char.rig; },
    get debug() {
      return {
        y, vy, grounded, skips: u.skips, ropes: u.ropes, alt: u.altMax,
        speed: u.ropeSpeed, fuel: u.fuel, state, handY: hands[0].y, ropeBottom,
        holding, thrusting, down,
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
    },
  };
}
