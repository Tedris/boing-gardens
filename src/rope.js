// Jump ropes in blocks. Each rope is a real arc sweeping around the hand axis, so
// the timing window is geometry, not a scripted animation; extra ropes are the same
// circle with a phase offset and a slightly longer radius.
//
// At 240 rows a rope is three pixels of cream across at best, so it is drawn as
// unlit segments that ignore the fog - the sweep has to stay the brightest thing on
// screen at every altitude, or the one thing you must read becomes a smudge. The
// old look needed an inverted-hull outline to keep that arc legible; here the pixel
// grid does it, and the outline would just be a second, darker rope.
import * as THREE from '../vendor/three.module.js';
import { C } from './toon.js';

const K = 26;            // segments per rope: few enough that the arc reads as steps
const R = 0.08;         // rope thickness: at 240 rows this is a four-pixel band, which is
                        // what survives the upscale; thinner reads as a hairline
const BOW = 1.35;       // extra lateral spread aloft, added at the mid-rope. It bulges the
                        // quarter-points of the loop out past the handle line; most of the
                        // loop's width is the hand spread itself (character.js handX), since
                        // the ends of the arc are pinned to the handles.
const GAP_MIN = 1 / 60;    // never squeeze two ropes into the same frame: once the bundle's own
                           // spacing would land two of them on one instant, the group spreads
                           // wider instead of merging back into the one wide rope this file exists
                           // to avoid
const WHIP = 0.42;       // how far the sweep hangs overhead and then snaps through the bottom. The
                         // rope's geometric angle is the hand clock warped by WHIP*sin(clock): it
                         // dwells at the top where it can be read, arrives fast, and spends less
                         // *time* at her feet than a uniform sweep of the same cadence. The beat is
                         // untouched - a pass still lands on exactly the instant it used to - and
                         // the hands keep the unwrapped clock, which is what makes the whip read as
                         // the rope's own inertia instead of a stutter.
const JOIN_SETTLE = 1.0;   // turns a rope that has just joined cannot end a run. A rope picked
                           // up mid-sweep arrives inside a rhythm that is already working, and
                           // its first pass is the one that ends the run most often; a turn to
                           // hear where it falls is the whole fix. Not `grace`, which game.js
                           // already uses for the width of the danger window (Sticky Soles).
const BACK_SETTLE = 0.5;   // turns the survivors get to settle when a rope is lost under them:
                           // that stumble re-spaces the sweep, and a rhythm nobody asked to
                           // change should not cost a second rope either.
const BUNDLE = 0.23;     // seconds of real time the whole group of ropes is spread across. A tap
                         // is 0.32 s off the ground and the danger window at the fast end of WHIP
                         // is about 0.085 s of it, so the passes have to arrive inside what is
                         // left - otherwise an added rope asks for a hop held longer than the short
                         // hop that pays the crit. It is a span of time and not of the sweep
                         // because the hop is a fall: it does not get longer when the cadence does.
const AT_START = Math.PI * 1.25;  // where the sweep waits between runs: a quarter turn past the
                                  // top. The first press of a run both starts the rope and launches
                                  // her (game.js), and that arc is off the ground for 0.65 s, so a
                                  // rope parked at the top itself puts the first pass 0.667 s in -
                                  // after she is standing again. Parked here it lands under the
                                  // arc, and nothing jumps at the press because that is where the
                                  // rope was already hanging.
const UP = new THREE.Vector3(0, 1, 0);

// geometric angle from the clock angle. Monotone (1 + WHIP*cos >= 1 - WHIP > 0) and exactly
// periodic (warp(p + 2PI) = warp(p) + 2PI), so every offset and crossing test keeps working in
// clock terms while the geometry and the danger window read the warped angle.
const warp = (p) => p + WHIP * Math.sin(p);
const GQ = new THREE.Quaternion();

// cream with one contrasting stripe per rope: the stripe is what makes the sweep
// readable in motion, and it is the only place a second colour appears on her
const PAIRS = [
  [C.ropeA, 0xd0576f],
  [C.ropeA, 0x5f7fa8],
  [C.ropeA, 0x6f9a6a],
  [C.ropeA, 0xd8a13c],
  [C.ropeA, 0x8d6fb0],
  [C.ropeA, 0xd0576f],
];

export function createRopes() {
  const group = new THREE.Group();

  // a box, not a cylinder: a seven-sided tube shades into a gradient, a box has
  // two faces and therefore two values, which is what the whole look is
  const segGeo = new THREE.BoxGeometry(1, 1, 1);
  const plain = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const energised = new THREE.MeshBasicMaterial({ color: C.spark, fog: false });
  // a rope that is still finding its place in the sweep, drawn faint so it is obvious which
  // one you are being let off
  const warming = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.45 });

  const ropes = [];
  const dummy = new THREE.Object3D();
  const dir = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i <= K; i++) pts.push(new THREE.Vector3());

  /** One rope's worth of geometry, allocated the first time a run asks for that many. There is no
      ceiling to build up to: the pool grows with the run, and a rope nobody has bought is never
      constructed. */
  function add() {
    const i = ropes.length;
    const segs = new THREE.InstancedMesh(segGeo, plain, K);
    segs.frustumCulled = false;
    const [a, b] = PAIRS[i % PAIRS.length];
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let k = 0; k < K; k++) segs.setColorAt(k, k % 2 ? ca : cb);
    if (segs.instanceColor) segs.instanceColor.needsUpdate = true;
    group.add(segs);
    ropes.push({
      theta: Math.PI, abs: Math.PI, prevAbs: Math.PI, beads: segs, active: false,
      radius: 0, offset: 0, crossed: false, settle: 0,
    });
  }
  add();
  ropes[0].active = true;

  // sparks thrown by a live rope: ordinary squares, no additive blending, because additive
  // light washes out the dither pattern they would be sitting on. They are the only thing that
  // says "electric" on the rope itself, so they leave along the arc instead of drifting up the
  // way a fire's embers would, and they die in a fraction of the time.
  const NE = 140;
  const ePos = new Float32Array(NE * 3);
  const eVel = new Float32Array(NE * 3);
  const eLife = new Float32Array(NE);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const sparks = new THREE.Points(eGeo, new THREE.PointsMaterial({
    color: C.spark, size: 0.045, transparent: true, opacity: 0.95,
    depthWrite: false, fog: false, toneMapped: false,
  }));
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);
  let eNext = 0;
  // One clock for the whole group: the ropes differ only by their offset off it. Keeping the
  // relationship in the offsets rather than in per-rope angles is what makes the bundle exact -
  // with their own angles, a rope that joined earlier kept the lag it was parked with, the
  // offsets shrank under it as ropes were added, and the group drifted further apart in time
  // than BUNDLE promises, which is the one thing this file exists to get right.
  let clock = AT_START;
  let turn = 1;          // seconds per turn, read off the speed the sweep runs at: this is what
                         // converts the bundle's seconds into radians

  /** Keep n ropes running, building any the pool has not needed before, and bundle their offsets
      so the group is one hop's worth of passes. */
  function setCount(n) {
    while (ropes.length < n) add();
    // One bundle rather than a queue: every rope in the group passes inside a single tap, so a
    // rope picked up is more skips per hop instead of a second rhythm to survive. The gap between
    // neighbours holds the span at BUNDLE as the group grows, down to the point where two of them
    // would land on the same frame; past that the bundle widens rather than merging into one
    // instant, because a hop that has to be held is a fair price and an unreadable rope is not.
    const gap = Math.max(BUNDLE / Math.max(1, n - 1), GAP_MIN);
    const step = (Math.PI * 2) * gap / turn;
    // The fan of radii keeps its width rather than its spacing, so twenty ropes are a tight braid
    // instead of a balloon. Up to seven the step is what it has always been.
    const fan = Math.min(0.055, 0.33 / Math.max(1, n - 1));
    for (let i = 0; i < ropes.length; i++) {
      const r = ropes[i];
      const was = r.active;
      r.active = i < n;
      r.beads.visible = r.active;
      r.radius = i * fan;
      r.offset = i * step;
      r.theta = clock;
      r.abs = warp(clock + r.offset);
      // A rope that has not been running arrives inside a rhythm that is already working. It
      // needs no parking - the offset puts it one step behind its neighbour on the shared clock -
      // but it has not been heard yet, so it cannot end a run for a turn.
      if (r.active && !was && i > 0) {
        r.prevAbs = r.abs;
        r.crossed = false;
        r.settle = JOIN_SETTLE;
      }
    }
  }

  function build(rope, theta, hands, A, ground) {
    const hx0 = hands[0].x, hx1 = hands[1].x;
    const hy = (hands[0].y + hands[1].y) * 0.5;
    const hz = (hands[0].z + hands[1].z) * 0.5;
    const rad = A + rope.radius;
    const cx = (hx0 + hx1) * 0.5;
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      const prof = Math.pow(Math.sin(Math.PI * t), 0.72);
      // the arc bows outward as it rises: a straight line between the hands is a narrow
      // hoop that reads as a hula hoop, while a rope turning on a hands axis swings wide
      // aloft and converges at the handles. The bow is lateral only - height, and so the
      // timing window, is untouched.
      const bow = 1 + BOW * prof;
      pts[i].set(
        cx + (hx0 + (hx1 - hx0) * t - cx) * bow,
        Math.max(hy - rad * prof * ct, ground + 0.014),
        // minus: a rope comes down in front, passes under the feet and rises
        // behind her, so the arc travels toward her back just after the bottom
        hz - rad * prof * st + prof * prof * 0.05,
      );
    }
    for (let i = 0; i < K; i++) {
      const a = pts[i], b = pts[i + 1];
      dir.subVectors(b, a);
      const len = Math.max(dir.length(), 1e-5);
      GQ.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
      dummy.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
      dummy.quaternion.copy(GQ);
      dummy.scale.set(R, len * 1.06, R);
      dummy.updateMatrix();
      rope.beads.setMatrixAt(i, dummy.matrix);
    }
    rope.beads.instanceMatrix.needsUpdate = true;
    // clamp to the floor: a real rope lies down rather than passing through it
    return Math.max(hy - rad, ground + 0.014);
  }

  return {
    group,
    ropes,
    setCount,
    /**
     * s = { hands:[Vector3,Vector3], speed, live, ground, time,
     *       length }  length = hand-to-ground reach + slack
     * Returns the lowest point any rope reaches this frame.
     */
    update(dt, s) {
      const { hands, speed, length, ground } = s;
      let lowest = Infinity;
      let sparking = false;
      const live = !!s.live;

      if (speed > 0) {                          // one clock, no exceptions
        clock += speed * dt;
        turn = (Math.PI * 2) / speed;           // the cadence the bundle is spaced against
      }
      for (const r of ropes) {
        if (!r.active) continue;
        r.prevAbs = r.abs;
        r.theta = clock;
        r.abs = warp(clock + r.offset);
        const bottom = build(r, r.abs, hands, length, ground);
        lowest = Math.min(lowest, bottom);

        // wrapped past the bottom of the sweep? offsets must count, or a rope
        // would report its crossing a different instant than its geometry crosses
        r.crossed = Math.floor(r.abs / (Math.PI * 2)) > Math.floor(r.prevAbs / (Math.PI * 2));

        // settling is counted in turns, not seconds: a fast sweep and a slow one offer the
        // same number of passes to learn where the rope falls
        if (r.settle > 0) r.settle -= (speed * dt) / (Math.PI * 2);
        r.beads.material = live ? energised : (r.settle > 0 ? warming : plain);
        if (live && speed > 0) {
          sparking = true;
          // throw sparks off the fast part of the arc, along its own direction of travel
          if (Math.random() < 0.5) {
            const k = (K * 0.15 + Math.random() * K * 0.6) | 0;
            const p = pts[k], q = pts[Math.min(K, k + 1)];
            const i3 = eNext++ % NE;
            ePos[i3 * 3] = p.x; ePos[i3 * 3 + 1] = p.y; ePos[i3 * 3 + 2] = p.z;
            eVel[i3 * 3] = (p.x - q.x) * 9 + (Math.random() - 0.5) * 1.6;
            eVel[i3 * 3 + 1] = (p.y - q.y) * 9 + 0.4 + Math.random() * 0.8;
            eVel[i3 * 3 + 2] = (p.z - q.z) * 9 + (Math.random() - 0.5) * 1.6;
            eLife[i3] = 1;
          }
        }
      }

      sparks.visible = sparking;
      if (sparking) {
        for (let i = 0; i < NE; i++) {
          if (eLife[i] <= 0) {
            ePos[i * 3 + 1] = -999;
            continue;
          }
          eLife[i] -= dt * 4.5;
          eVel[i * 3 + 1] -= dt * 5.5;
          ePos[i * 3] += eVel[i * 3] * dt;
          ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt;
          ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
        }
        eGeo.attributes.position.needsUpdate = true;
      }
      return lowest;
    },
    /**
     * Restart the sweep. A fresh run parks it at AT_START, a quarter turn past the top, which is
     * where it was already hanging; a restart under a live run - losing a rope - parks it at the
     * top itself, half a revolution from the next jump. Either way the rest follow on their offsets
     * rather than being collapsed onto it: collapsed is what a restart after losing a rope would
     * give, and ropes all arriving in the same instant is one wide rope, not a bundle you can
     * read. `recovering` is that restart, and it gives the survivors BACK_SETTLE, because the
     * bundle they re-spaced into is not the rhythm they were being swept in.
     */
    reset(recovering) {
      clock = recovering ? Math.PI : AT_START;   // one clock: angle = this plus each offset
      for (const r of ropes) {
        r.theta = clock;
        r.abs = r.prevAbs = warp(clock + r.offset);
        r.crossed = false;
        r.settle = recovering ? BACK_SETTLE : 0;
      }
    },
  };
}
