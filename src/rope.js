// Beaded jump ropes. Each rope is a real arc sweeping around the hand axis, so
// the timing window is geometry, not a scripted animation. Extra ropes are the
// same circle with a phase offset and a slightly longer radius.
import * as THREE from '../vendor/three.module.js';
import { C, toon, canvasTex } from './toon.js';

const K = 46;            // beads per rope
const R = 0.03;          // rope thickness
const MAXR = 6;          // rope ceiling
const UP = new THREE.Vector3(0, 1, 0);
const GQ = new THREE.Quaternion();

const PAIRS = [
  [0xf2f2f2, 0xef4b3c],
  [0xf2f2f2, 0x38a3ff],
  [0xfff0c8, 0x37c96f],
  [0x2b2440, 0xffd23a],
  [0xf2f2f2, 0xc05bff],
  [0xffd9e6, 0xff5d8f],
];

function glowTex() {
  return canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,246,214,1)');
    r.addColorStop(0.28, 'rgba(255,178,44,0.9)');
    r.addColorStop(0.62, 'rgba(255,96,20,0.35)');
    r.addColorStop(1, 'rgba(255,70,10,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}

export function createRopes() {
  const group = new THREE.Group();

  const beadGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false);
  const plain = toon(0xffffff, { steps: 3 });
  const burning = new THREE.MeshToonMaterial({
    color: 0xffffff, gradientMap: toon(0xffffff, { steps: 3 }).gradientMap,
    emissive: 0xff7a12, emissiveIntensity: 0.85,
  });
  const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });

  const ropes = [];
  const dummy = new THREE.Object3D();
  const dir = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i <= K; i++) pts.push(new THREE.Vector3());

  for (let i = 0; i < MAXR; i++) {
    const beads = new THREE.InstancedMesh(beadGeo, plain, K);
    const hull = new THREE.InstancedMesh(beadGeo, inkMat, K);
    beads.frustumCulled = hull.frustumCulled = false;
    beads.castShadow = true;
    const [a, b] = PAIRS[i % PAIRS.length];
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let k = 0; k < K; k++) beads.setColorAt(k, k % 2 ? ca : cb);
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true;

    // flame halos ride every third bead
    const glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      }),
      Math.ceil(K / 3),
    );
    glow.frustumCulled = false;
    glow.visible = false;

    group.add(hull, beads, glow);
    ropes.push({
      theta: Math.PI, prevAbs: Math.PI, beads, hull, glow, active: i === 0,
      radius: 0, offset: 0, crossed: false,
    });
  }

  // embers shed by burning ropes
  const NE = 140;
  const ePos = new Float32Array(NE * 3);
  const eVel = new Float32Array(NE * 3);
  const eLife = new Float32Array(NE);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
    color: 0xffb43c, size: 0.07, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  embers.frustumCulled = false;
  embers.visible = false;
  group.add(embers);
  let eNext = 0;

  /** Keep n ropes live; spread their phases so each one asks for its own jump. */
  function setCount(n) {
    for (let i = 0; i < MAXR; i++) {
      const r = ropes[i];
      r.active = i < n;
      r.beads.visible = r.hull.visible = r.active;
      r.radius = i * 0.055;
      // clustered phases: one well-timed jump clears every rope and each sweep
      // scores, so an extra rope reads as more skips, not a wider death window
      r.offset = i * 0.3;
    }
  }

  function build(rope, theta, hands, A, ground) {
    const hx0 = hands[0].x, hx1 = hands[1].x;
    const hy = (hands[0].y + hands[1].y) * 0.5;
    const hz = (hands[0].z + hands[1].z) * 0.5;
    const rad = A + rope.radius;
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (let i = 0; i <= K; i++) {
      const t = i / K;
      const prof = Math.pow(Math.sin(Math.PI * t), 0.72);
      pts[i].set(
        hx0 + (hx1 - hx0) * t,
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
      dummy.scale.set(R, len * 1.02, R);
      dummy.updateMatrix();
      rope.beads.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(R * 1.55, len * 1.06, R * 1.55);
      dummy.updateMatrix();
      rope.hull.setMatrixAt(i, dummy.matrix);
    }
    rope.beads.instanceMatrix.needsUpdate = true;
    rope.hull.instanceMatrix.needsUpdate = true;
    // clamp to the floor: a real rope lies down rather than passing through it
    return Math.max(hy - rad, ground + 0.014);
  }

  let glowQuat = new THREE.Quaternion();

  return {
    group,
    ropes,
    setCount,
    /**
     * s = { hands:[Vector3,Vector3], speed, fire, ground, time, camQuat,
     *       length }  length = hand-to-ground reach + slack
     * Returns the lowest point any rope reaches this frame.
     */
    update(dt, s) {
      const { hands, speed, length, ground } = s;
      glowQuat = s.camQuat || glowQuat;
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
        r.glow.visible = lit;
        if (lit) {
          anyFire = true;
          const flick = 1 + Math.sin(s.time * 27 + r.radius * 40) * 0.22;
          for (let i = 0, g = 0; i < K; i += 3, g++) {
            dummy.position.copy(pts[i]);
            dummy.quaternion.copy(glowQuat);
            const sc = (0.26 + 0.07 * Math.sin(i + s.time * 19)) * flick;
            dummy.scale.set(sc, sc, sc);
            dummy.updateMatrix();
            r.glow.setMatrixAt(g, dummy.matrix);
          }
          r.glow.instanceMatrix.needsUpdate = true;
          // shed embers from the low front of the arc
          if (Math.random() < 0.35) {
            const p = pts[(K * 0.25 + Math.floor(Math.random() * K * 0.5)) | 0];
            const i3 = eNext++ % NE;
            ePos[i3 * 3] = p.x; ePos[i3 * 3 + 1] = p.y; ePos[i3 * 3 + 2] = p.z;
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
    /** reset all sweeps to the top of the arc */
    reset() {
      for (const r of ropes) { r.theta = Math.PI - r.offset; r.prevAbs = Math.PI; r.crossed = false; }
    },
  };
}

