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
const BOW = 1.0;        // extra lateral spread aloft, added at the mid-rope
const MAXR = 6;          // rope ceiling
const LAG = Math.PI * 0.5; // preferred phase step between ropes: a quarter turn, 0.25 s a part
const UP = new THREE.Vector3(0, 1, 0);
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
  const burning = new THREE.MeshBasicMaterial({ color: C.fire, fog: false });

  const ropes = [];
  const dummy = new THREE.Object3D();
  const dir = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i <= K; i++) pts.push(new THREE.Vector3());

  for (let i = 0; i < MAXR; i++) {
    const segs = new THREE.InstancedMesh(segGeo, plain, K);
    segs.frustumCulled = false;
    const [a, b] = PAIRS[i % PAIRS.length];
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let k = 0; k < K; k++) segs.setColorAt(k, k % 2 ? ca : cb);
    if (segs.instanceColor) segs.instanceColor.needsUpdate = true;

    group.add(segs);
    ropes.push({
      theta: Math.PI, prevAbs: Math.PI, beads: segs, active: i === 0,
      radius: 0, offset: 0, crossed: false,
    });
  }

  // embers shed by burning ropes: ordinary squares, no additive blending, because
  // additive light washes out the dither pattern it would be sitting on
  const NE = 140;
  const ePos = new Float32Array(NE * 3);
  const eVel = new Float32Array(NE * 3);
  const eLife = new Float32Array(NE);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    color: C.fire, size: 0.055, transparent: true, opacity: 0.9,
    depthWrite: false, fog: false, toneMapped: false,
  }));
  embers.frustumCulled = false;
  embers.visible = false;
  group.add(embers);
  let eNext = 0;

  /** Keep n ropes live; spread their phases so each one asks for its own jump. */
  function setCount(n) {
    // A quarter turn between ropes: 0.25 s at the base cadence, which sits inside one hop, so
    // an added rope means more skips per jump instead of one thicker rope. Past three ropes a
    // quarter turn would start wrapping the fourth and fifth onto the first one's beat, so the
    // step tightens to what actually fits on the shaft - never two ropes on one instant.
    const step = Math.min(LAG, (Math.PI * 2) / (n + 1));
    for (let i = 0; i < MAXR; i++) {
      const r = ropes[i];
      const was = r.active;
      r.active = i < n;
      r.beads.visible = r.active;
      r.radius = i * 0.055;
      r.offset = i * step;
      // A rope that has been sitting inactive does not advance, so its own angle is from
      // the last reset and says nothing about where the sweep is now. Park a rope joining
      // mid-run behind the one it joins, measured off that rope's live angle - otherwise it
      // appears at the top of the arc whenever the card happened to be picked, which is
      // either a free skip or an instant trip.
      if (r.active && !was && i > 0) {
        const abs = ropes[i - 1].theta + ropes[i - 1].offset - step;
        r.theta = abs - r.offset;
        r.prevAbs = abs;
        r.crossed = false;
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
     * s = { hands:[Vector3,Vector3], speed, fire, ground, time,
     *       length }  length = hand-to-ground reach + slack
     * Returns the lowest point any rope reaches this frame.
     */
    update(dt, s) {
      const { hands, speed, length, ground } = s;
      let lowest = Infinity;
      let anyFire = false;

      for (const r of ropes) {
        if (!r.active) continue;
        r.prevAbs = r.theta + r.offset;
        r.theta += speed * dt;
        const theta = r.theta + r.offset;
        const bottom = build(r, theta, hands, length, ground);
        lowest = Math.min(lowest, bottom);

        // wrapped past the bottom of the sweep? offsets must count, or a rope
        // would report its crossing a different instant than its geometry crosses
        r.crossed = Math.floor(theta / (Math.PI * 2)) > Math.floor(r.prevAbs / (Math.PI * 2));

        const lit = !!s.fire;
        r.beads.material = lit ? burning : plain;
        if (lit) {
          anyFire = true;
          // shed embers from the low front of the arc
          if (Math.random() < 0.35) {
            const p = pts[(K * 0.25 + Math.random() * K * 0.5) | 0];
            const i3 = eNext++ % NE;
            ePos[i3 * 3] = p.x; ePos[i3 * 3 + 1] = p.y; ePos[i3 * 3 + 2] = p.z * 0.6;
            eVel[i3 * 3] = (Math.random() - 0.5) * 0.5;
            eVel[i3 * 3 + 1] = 0.6 + Math.random() * 1.1;
            eVel[i3 * 3 + 2] = (Math.random() - 0.5) * 0.5;
            eLife[i3] = 1;
          }
        }
      }

      embers.visible = anyFire;
      if (anyFire) {
        for (let i = 0; i < NE; i++) {
          if (eLife[i] <= 0) {
            ePos[i * 3 + 1] = -999;
            continue;
          }
          eLife[i] -= dt * 1.5;
          eVel[i * 3 + 1] -= dt * 1.4;
          ePos[i * 3] += eVel[i * 3] * dt;
          ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt;
          ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
        }
        eGeo.attributes.position.needsUpdate = true;
      }
      return lowest;
    },
    /**
     * Restart the sweep: the first rope at the top of the arc, so the pass that decides the
     * next jump is half a revolution away. The rest keep their quarter-turn lag rather than
     * being collapsed onto it - collapsed is what a restart after losing a rope would give,
     * and surviving ropes all arriving in the same instant is one wide rope, not a fair sweep.
     */
    reset() {
      for (const r of ropes) {
        r.theta = Math.PI - 2 * r.offset;   // abs = theta + offset = PI - offset
        r.prevAbs = Math.PI - r.offset;
        r.crossed = false;
      }
    },
  };
}
