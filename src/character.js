// The jumper, in blocks.
//
// She is about 55 pixels tall on the 240-row buffer, which decides everything
// about how she has to be built and moved: no surface detail survives that, so
// the acting is silhouette - squash, tuck, lean, hair - and the parts are boxes,
// because a box keeps a hard edge through the pixel pass while a capsule turns
// into a smudge. No animation clips either: every pose is solved each frame from
// gameplay state, which is what keeps her reactive at any height or rope count.
//
// Springs are clamped to whole numbers of snap blocks (SNAP in toon.js is 2
// internal pixels, about 0.05 m at her plane). A wobble that travels less than
// one block is invisible, and one that travels a fraction of a block flickers
// between two pixels instead of moving - so the amplitudes below are multiples.
import * as THREE from '../vendor/three.module.js';
import { C, part, spring, springKick, springState } from './toon.js';

// proportions, in metres, feet at 0
const P = {
  hipY: 0.62, hipX: 0.14, knee: -0.24, ankle: -0.20,
  torsoY: 0.96, shoulderY: 1.08, shoulderX: 0.19,
  armUp: 0.15, armFore: 0.14, headY: 1.17, headR: 0.42,
  handY: 1.00, handX: 0.42,      // where the rope hangs from: see ROPE_A in game.js. Wide -
                                 // the loop is as wide as the hands are apart, so this, not
                                 // any flare in rope.js, is what stands the rope off her body
};

// snap-block quantum at her plane, used to keep spring travel visible
const BLOCK = 0.05;

// jiggle feel: k = stiffness, d = damping, g = how hard acceleration pulls,
// max = travel, in snap blocks. Hair is the only soft part left: she is a block
// of rose and slate now, and blocks do not jiggle.
const J = {
  hair: { k: 95, d: 9.0, max: 0.30 },
  body: { k: 60, d: 9.5, g: 0.011, max: 0.10 },   // 2 blocks of bob
  sway: { k: 42, d: 8.5, max: 0.10 },
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

/** Mouth states are three stacked boxes rather than a texture atlas: at four
 *  pixels wide an drawn mouth is a smear, a hole with a tooth in it is not. */
const FACE = {
  calm: { hole: [1.00, 0.35], teeth: 0, tongue: 0 },
  grin: { hole: [1.30, 1.00], teeth: 0, tongue: 0 },
  grit: { hole: [1.25, 0.75], teeth: 1, tongue: 0 },
  o: { hole: [0.55, 0.90], teeth: 0, tongue: 0 },
  panic: { hole: [1.15, 1.35], teeth: 0, tongue: 0 },
  dizzy: { hole: [1.10, 0.30], teeth: 0, tongue: 0 },
  tired: { hole: [1.00, 0.40], teeth: 0, tongue: 1 },
  flat: { hole: [1.10, 0.22], teeth: 0, tongue: 0 },
};

export function createCharacter() {
  const group = new THREE.Group();
  const rig = {};

  // Same rig, different body: three scalars and a colour map, applied by setLook.
  let look = { w: 1, h: 1, squash: 1, jig: 1 };

  const body = new THREE.Group();
  group.add(body);
  rig.body = body;

  // ---------------- legs ----------------
  const hips = new THREE.Group();
  hips.position.y = P.hipY;
  body.add(hips);
  rig.hips = hips;

  const pelvis = part(box(0.34, 0.20, 0.26), C.shorts);
  pelvis.position.y = 0.02;
  hips.add(pelvis);

  // A stance, not a parade: hipX is set so the legs hang outside the pelvis box instead of
  // touching each other under it, which is what a jumper standing ready looks like, and what
  // gives the knees somewhere to travel on a landing.
  const leg = [];
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(sx * P.hipX, -0.02, 0);
    hips.add(thigh);
    const thighM = part(box(0.13, 0.24, 0.14), C.limb, { key: 'limb' });
    thighM.position.y = -0.12;
    thigh.add(thighM);

    const knee = new THREE.Group();
    knee.position.y = P.knee;
    thigh.add(knee);
    const shinM = part(box(0.115, 0.21, 0.125), C.limb, { key: 'limb' });
    shinM.position.y = -0.105;
    knee.add(shinM);
    const sockM = part(box(0.125, 0.075, 0.135), C.sock);
    sockM.position.y = -0.185;
    knee.add(sockM);

    const ankle = new THREE.Group();
    ankle.position.y = P.ankle;
    knee.add(ankle);
    const shoe = part(box(0.135, 0.09, 0.27), C.shoe);
    shoe.position.set(0, -0.045, 0.045);
    ankle.add(shoe);
    const sole = part(box(0.14, 0.045, 0.28), C.shoeSo);
    sole.position.set(0, -0.09, 0.045);
    ankle.add(sole);
    const lace = part(box(0.10, 0.025, 0.055), C.sock);
    lace.position.set(0, -0.005, 0.115);
    ankle.add(lace);

    // rocket boots: three flat slabs, not a flame texture - fire at 240 rows is
    // a stack of bright pixels, and additive blending would wash the grid out
    const flame = new THREE.Group();
    flame.position.y = -0.14;
    flame.visible = false;
    ankle.add(flame);
    const flames = [];
    [[C.fire, 0.15, 0], [C.fire, 0.11, -0.13], [C.rocket, 0.075, -0.26]].forEach(([col, w, y]) => {
      const f = part(box(w, 0.12, w), col, { basic: true, fog: false, snap: false });
      f.position.y = y;
      flame.add(f);
      flames.push(f);
    });

    leg.push({ thigh, knee, ankle, flame, flames });
  }
  rig.leg = leg;

  // ---------------- torso ----------------
  const torso = new THREE.Group();
  body.add(torso);
  rig.torso = torso;

  const chest = new THREE.Group();
  chest.position.y = P.torsoY;
  torso.add(chest);
  rig.chest = chest;

  const trunk = part(box(0.36, 0.34, 0.25), C.top);
  chest.add(trunk);
  const hem = part(box(0.375, 0.075, 0.265), C.topDk);
  hem.position.y = -0.155;
  chest.add(hem);
  const collar = part(box(0.19, 0.045, 0.16), C.topDk);
  collar.position.y = 0.175;
  chest.add(collar);
  const sternum = part(box(0.055, 0.20, 0.02), C.topDk);
  sternum.position.set(0, 0.01, 0.128);
  chest.add(sternum);

  const neck = part(box(0.11, 0.07, 0.11), C.skin);
  neck.position.y = 0.205;
  chest.add(neck);

  // ---------------- arms ----------------
  const arm = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * P.shoulderX, P.shoulderY, 0);
    torso.add(shoulder);
    const cap = part(box(0.135, 0.115, 0.135), C.top);
    shoulder.add(cap);
    const upper = part(box(0.105, 0.18, 0.105), C.limb, { key: 'limb' });
    upper.position.y = -0.09;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -P.armUp;
    shoulder.add(elbow);
    const fore = part(box(0.095, 0.16, 0.095), C.limb, { key: 'limb' });
    fore.position.y = -0.08;
    elbow.add(fore);
    const band = part(box(0.105, 0.045, 0.105), C.shoe);
    band.position.y = -0.145;
    elbow.add(band);

    const wrist = new THREE.Group();
    wrist.position.y = -P.armFore;
    elbow.add(wrist);
    const hand = part(box(0.105, 0.10, 0.09), C.limb, { key: 'limb' });
    wrist.add(hand);
    // the handle the rope hangs from
    const grip = part(box(0.045, 0.05, 0.14), C.prop);
    grip.position.set(0, -0.02, 0.06);
    wrist.add(grip);

    arm.push({ shoulder, elbow, wrist, sx, hand, grip });
  }
  rig.arm = arm;

  // ---------------- head ----------------
  const headPivot = new THREE.Group();
  headPivot.position.y = P.headY;
  torso.add(headPivot);
  rig.headPivot = headPivot;

  const head = new THREE.Group();
  headPivot.add(head);
  rig.head = head;

  const skull = part(box(P.headR, P.headR * 0.95, P.headR * 0.9), C.skin);
  skull.position.y = 0.20;
  head.add(skull);
  const jaw = part(box(0.29, 0.075, 0.29), C.skin);
  jaw.position.set(0, 0.03, 0.015);
  head.add(jaw);
  // no nose: at three pixels wide a nose is a shadow, and between two blush
  // squares it read as a muzzle. The face is eyes and mouth, or it is nothing.

  // the bob: a slab over the crown, a slab behind, one on each side. Four boxes read as
  // a bob at this size; a sculpted shell reads as a helmet. Nothing sits deeper behind
  // her than the skull: at a three-quarter angle back-overhang draws as a black fin off
  // the silhouette, which dead-on was hidden behind the head.
  // The bob, in one group: a character who has no hair switches the whole of it off
  // at once rather than hiding five boxes and forgetting a sixth.
  const hair = new THREE.Group();
  head.add(hair);
  rig.hair = hair;
  const crown = part(box(0.50, 0.13, 0.42), C.hair);
  crown.position.y = 0.40;
  hair.add(crown);
  const bangs = part(box(0.47, 0.085, 0.085), C.hairLt);
  bangs.position.set(0, 0.30, 0.19);
  hair.add(bangs);
  const hairBack = part(box(0.50, 0.36, 0.13), C.hair);
  hairBack.position.set(0, 0.19, -0.135);
  hair.add(hairBack);
  rig.hairBack = hairBack;
  const sides = [];
  for (const sx of [-1, 1]) {
    const s = part(box(0.09, 0.34, 0.36), C.hair);
    s.position.set(sx * 0.215, 0.175, -0.01);
    hair.add(s);
    sides.push(s);
  }
  const clip = part(box(0.075, 0.03, 0.035), C.fire);
  clip.position.set(0.16, 0.335, 0.16);
  clip.rotation.z = -0.4;
  hair.add(clip);

  // bob strands: three roots, two segments each, so the tail has a lag of its
  // own instead of swinging as one rigid slab
  const strands = [];
  for (const [ax, az] of [[-0.16, -0.21], [0, -0.25], [0.16, -0.21]]) {
    const root = new THREE.Group();
    root.position.set(ax, 0.29, az);
    hair.add(root);
    const segs = [];
    let parent = root;
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      g.position.y = k === 0 ? -0.06 : -0.11;
      const m = part(box(0.085 - k * 0.015, 0.115, 0.055), k ? C.hairLt : C.hair);
      m.position.y = -0.055;
      g.add(m);
      parent.add(g);
      segs.push(g);
      parent = g;
    }
    strands.push({ root, segs, pitch: springState(), roll: springState(), phase: ax * 9 });
  }
  rig.strands = strands;

  // ---------------- the other look ----------------
  // One row of the roster has no hair at all: she is the jumper from the first web
  // build, and what made her silhouette was a flat cap and a three-block scarf that
  // trailed a beat behind her head. Both live here and stay hidden until a look asks
  // for them, so it is still one rig - setLook switches them with `hair`.
  const peak = new THREE.Group();
  peak.visible = false;
  head.add(peak);
  const peakTop = part(box(0.50, 0.115, 0.44), C.prop);
  peakTop.position.y = 0.42;
  peak.add(peakTop);
  const peakBrim = part(box(0.44, 0.045, 0.19), C.prop);
  peakBrim.position.set(0, 0.375, 0.28);
  peak.add(peakBrim);
  rig.peak = peak;

  // The scarf is parented end to end like the bob strands, so its tip lags the neck
  // instead of swinging with the head. It trails back *and out*: hanging straight down
  // the spine, or straight back, kept the whole thing inside her own torso silhouette at
  // this camera angle, which leaves a jumper with no bob and no hair with no silhouette
  // at all. Fanned out, the tip breaks the outline and the lag has somewhere to show.
  const scarf = { root: new THREE.Group(), segs: [], pitch: springState(), roll: springState() };
  scarf.root.position.set(0.07, 0.24, -0.16);
  scarf.root.visible = false;
  head.add(scarf.root);
  let scarfParent = scarf.root;
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    g.position.set(k ? 0.06 : 0, k ? -0.05 : -0.03, k ? -0.085 : -0.02);
    const m = part(box(0.22 - k * 0.05, 0.09, 0.05), C.top);
    m.position.y = -0.05;
    g.add(m);
    scarfParent.add(g);
    scarf.segs.push(g);
    scarfParent = g;
  }
  rig.scarf = scarf.root;

  // ---------------- face ----------------
  const eyes = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.09, 0.205, 0.181);
    head.add(g);
    const pupil = part(box(0.062, 0.075, 0.03), C.ink, { basic: true, fog: false });
    g.add(pupil);
    const shine = part(box(0.025, 0.025, 0.02), C.eye, { basic: true, fog: false });
    shine.position.set(-0.018, 0.02, 0.02);
    g.add(shine);
    const lash = part(box(0.07, 0.02, 0.02), C.ink);
    lash.position.set(0, 0.052, 0.005);
    lash.rotation.z = sx * -0.14;
    g.add(lash);
    eyes.push({ g, pupil, shine, lash, base: g.position.clone() });
  }
  rig.eyes = eyes;

  const brows = [];
  for (const sx of [-1, 1]) {
    const m = part(box(0.075, 0.024, 0.03), C.hair);
    m.position.set(sx * 0.09, 0.265, 0.178);
    head.add(m);
    brows.push({ m, sx });
  }
  rig.brows = brows;

  const mouth = new THREE.Group();
  mouth.position.set(0, 0.075, 0.155);
  head.add(mouth);
  rig.mouth = mouth;
  const hole = part(box(0.075, 0.04, 0.025), C.mouth, { basic: true, fog: false });
  mouth.add(hole);
  const teeth = part(box(0.07, 0.016, 0.028), C.eye, { basic: true, fog: false });
  teeth.visible = false;
  mouth.add(teeth);
  const tongue = part(box(0.04, 0.045, 0.03), C.blush, { basic: true, fog: false });
  tongue.visible = false;
  mouth.add(tongue);

  // ---------------- landing dust ----------------
  const puffGeo = box(0.12, 0.12, 0.12);
  const puffs = [];
  for (let i = 0; i < 12; i++) {
    // one material per puff, because each fades on its own clock: the kit caches
    // by colour, and a shared material would blink the whole pool in lockstep
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: C.cloud, transparent: true, opacity: 0.55, fog: false, depthWrite: false,
    }));
    m.visible = false;
    group.add(m);
    puffs.push({ m, mat: m.material, life: 0, vx: 0, vy: 0, size: 1 });
  }
  let puffNext = 0;

  // ---------------- state holders ----------------
  const sBody = springState();
  const sLean = springState();
  const sNod = springState();
  const sRoll = springState();
  const sCrouch = springState();
  const sTuck = springState();
  const jig = springState();
  let blink = 2.2, blinkT = 0, prevVy = 0, tumble = 0, tumbleV = 0;

  const hands = [];
  for (const a of rig.arm) {
    const h = new THREE.Object3D();
    a.wrist.add(h);
    hands.push(h);
  }

  // ---- two-bone arm IK: shoulder -> elbow -> wrist, in body space ----
  const B1 = P.armUp, B2 = P.armFore;
  const iS = new THREE.Vector3(), iT = new THREE.Vector3(), iD = new THREE.Vector3();
  const iP = new THREE.Vector3(), iE = new THREE.Vector3(), iN = new THREE.Vector3();
  const qB = new THREE.Quaternion();
  const DOWNV = new THREE.Vector3(0, -1, 0);

  /** Aim one arm at a point, elbow biased back and out so it never inverts. */
  function reach(a, tx, ty, tz) {
    iS.copy(a.shoulder.position);
    iT.set(tx, ty, tz);
    iD.subVectors(iT, iS);
    const d = clamp(iD.length(), Math.abs(B1 - B2) + 0.02, B1 + B2 - 0.01);
    iD.divideScalar(Math.max(d, 1e-6));
    const cosA = clamp((B1 * B1 + d * d - B2 * B2) / (2 * B1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    iP.set(a.sx * 0.55, -0.05, -0.83).addScaledVector(iD, -iP.dot(iD));
    if (iP.lengthSq() < 1e-6) iP.set(a.sx, 0, -1);
    iP.normalize();
    iE.copy(iD).multiplyScalar(B1 * cosA).addScaledVector(iP, B1 * sinA);
    a.shoulder.quaternion.setFromUnitVectors(DOWNV, iN.copy(iE).normalize());
    iN.subVectors(iT, iS).sub(iE).normalize();
    qB.setFromUnitVectors(DOWNV, iN);
    a.elbow.quaternion.copy(a.shoulder.quaternion).invert().multiply(qB);
  }

  /** Kick the springs. Called by the game on takeoff, landing, skip, hit. */
  function bump(vy) {
    jig.v += vy * 0.5;
    for (const st of strands) st.pitch.v += vy * 0.55;
  }

  function puff(x, y, z, spread = 0.5) {
    const p = puffs[puffNext++ % puffs.length];
    p.life = 1;
    p.size = 0.2 + Math.random() * 0.3;
    p.vx = (Math.random() - 0.5) * spread;
    p.vy = 0.35 + Math.random() * 0.5;
    // puffs live in her group, so remember the world height: dust belongs to the
    // dirt and must not ride up with her on the next jump
    p.wy = group.position.y + y;
    p.m.position.set(x, y, z);
    p.m.visible = true;
  }

  function setFace(name) {
    const f = FACE[name];
    hole.scale.set(f.hole[0], f.hole[1], 1);
    teeth.visible = !!f.teeth;
    teeth.position.y = f.teeth ? 0.012 : 0;
    tongue.visible = !!f.tongue;
    tongue.position.set(0.02, -0.02, 0.005);
  }

  /**
   * s = { time, y, vy, ay, grounded, phase, holding, thrust, dead, fire,
   *       alt, ropeSpeed, ropes, fuel, nearMiss, skipped }
   */
  function update(dt, s) {
    const t = s.time;
    const vy = s.vy;
    const ay = (vy - prevVy) / Math.max(dt, 1e-4);
    prevVy = vy;

    group.position.y = s.y;

    // ---- squash & stretch: long on the way up, pancaked on impact ----
    const stretch = clamp(vy * 0.016, -0.2, 0.26) + jig.p;
    const crouch = spring(sCrouch, s.grounded ? Math.max(0, 0.05 - Math.abs(vy) * 0.01) : 0, 120, 14, dt);
    const sq = clamp((stretch - crouch * 1.6) * look.squash, -0.34 * look.squash, 0.4);
    body.scale.set((1 - sq * 0.5) * look.w, (1 + sq) * look.h, (1 - sq * 0.5) * look.w);

    // ---- lean from vertical motion and thrust ----
    const leanTarget = clamp(vy * 0.017, -0.24, 0.3) + (s.thrust ? 0.42 : 0) + (s.dead ? 0.2 : 0);
    const lean = springKick(sLean, leanTarget, -ay * J.body.g, J.body.k, J.body.d, dt);
    body.rotation.x = clamp(lean, -0.7, 0.9);
    body.rotation.z = springKick(sRoll, Math.sin(t * 1.4) * 0.02, -ay * 0.0018, 42, 8.5, dt);
    // two snap blocks of bob, no more: past that the whole body hops a pixel and
    // back, which reads as jitter, not as weight
    body.position.y = clamp(springKick(sBody, 0, -ay * J.body.g, J.body.k, J.body.d, dt), -BLOCK * 2, BLOCK * 2)
      + crouch * 0.55;

    // ---- death: a ragdoll gag, not a simulation ----
    if (s.dead) {
      tumbleV += dt * 5.5;
      tumble = Math.min(tumble + tumbleV * dt, 2.3);
    } else {
      tumble = 0;
      tumbleV = 0;
    }
    rig.hips.rotation.x = lerp(rig.hips.rotation.x, s.dead ? 0.4 : -crouch * 0.9, 0.25);

    // ---- tuck: knees up in the air, planted on the ground ----
    const tuck = spring(sTuck, s.grounded && !s.dead ? 0 : 1, 70, 12, dt);
    const rag = s.dead ? 1 : 0;
    leg.forEach((L, i) => {
      const wob = Math.sin(t * 2.1 + i * 2.2) * 0.03;
      L.thigh.rotation.x = lerp(L.thigh.rotation.x, -0.62 * tuck + (s.thrust ? 1.15 : 0) + crouch * 0.7 + wob, 0.22);
      // on the ground the legs stand slightly open, so the feet sit under the hips instead of
      // knocking inward at the knee; the tuck reverses it in the air, where knees together is
      // the shape you want.
      L.thigh.rotation.z = lerp(L.thigh.rotation.z, (i ? -1 : 1) * (tuck * 0.14 - 0.045 + rag * 0.5), 0.2);
      L.knee.rotation.x = lerp(L.knee.rotation.x, 0.95 * tuck - crouch * 1.5 + (s.thrust ? -0.35 : 0), 0.22);
      L.ankle.rotation.x = lerp(L.ankle.rotation.x, -0.35 * tuck + crouch * 0.9, 0.2);
      L.flame.visible = !!s.thrust;
      if (s.thrust) {
        const f = 0.8 + Math.sin(t * 34 + i * 2) * 0.22;
        L.flames.forEach((m, k) => {
          m.scale.set(1, f * (0.7 + s.fuel * 0.6) * (1 - k * 0.18), 1);
          m.visible = k === 0 || s.fuel > 0.25 * k;
        });
        if (Math.random() < 0.3) puff(0, -0.1, 0, 0.9);
      }
    });

    // ---- arms: the hands anchor to the swing the rope hangs from, so the arm
    // pose is a consequence of the rope rather than a guess that must match it ----
    const ph = s.phase;
    for (const a of arm) {
      if (s.dead) {
        a.shoulder.rotation.set(-1.2 + Math.sin(t * 9 + a.sx) * 0.5, 0, a.sx * 2.1);
        a.elbow.rotation.set(0.7, 0, 0);
        continue;
      }
      a.wrist.rotation.x = 0.2 * Math.sin(ph);
      reach(a, a.sx * P.handX, P.handY - 0.05 * Math.cos(ph), 0.06 - 0.1 * Math.sin(ph));
    }

    // ---- head keeps its own balance so the face stays readable ----
    headPivot.rotation.x = clamp(springKick(sNod, -lean * 0.55, -ay * 0.006, 90, 11, dt), -0.6, 0.6);
    headPivot.rotation.z = -body.rotation.z * 0.7 + Math.sin(t * 1.7) * 0.02;
    headPivot.rotation.y = Math.sin(ph) * 0.09 + (s.dead ? Math.sin(t * 3) * 0.1 : 0);
    chest.scale.setScalar(1 + Math.sin(t * 2.4) * 0.01);

    // ---- hair: gravity and acceleration set each root's target angle ----
    const hang = clamp(0.5 + ay * 0.014, -1.2, 2.0);
    strands.forEach((st) => {
      st.pitch.v += ((-lean * 0.7 - hang * 0.28) - st.pitch.p) * J.hair.k * dt;
      st.pitch.v -= st.pitch.v * J.hair.d * dt;
      st.pitch.p = clamp(st.pitch.p + st.pitch.v * dt, -J.hair.max, J.hair.max);
      st.roll.v += ((-body.rotation.z * 1.6 + Math.sin(t * 2.6 + st.phase) * 0.05) - st.roll.p) * 70 * dt;
      st.roll.v -= st.roll.v * 8.5 * dt;
      st.roll.p += st.roll.v * dt;
      st.root.rotation.set(st.pitch.p * look.jig, 0, st.roll.p);
      st.segs.forEach((g, k) => {
        g.rotation.x = st.pitch.p * (0.35 + k * 0.22) * 0.6 * look.jig;
        g.rotation.y = Math.sin(t * 3.1 + st.phase + k) * 0.06;
      });
    });

    // ---- scarf: the hair's spring on a single chain, so the tip arrives a beat after
    // the head rather than with it, which is the whole trick behind her silhouette ----
    if (scarf.root.visible) {
      scarf.pitch.v += ((-lean * 0.7 - hang * 0.4) - scarf.pitch.p) * J.hair.k * dt;
      scarf.pitch.v -= scarf.pitch.v * J.hair.d * dt;
      scarf.pitch.p = clamp(scarf.pitch.p + scarf.pitch.v * dt, -J.hair.max * 1.5, J.hair.max * 1.5);
      scarf.roll.v += ((-body.rotation.z * 1.4 + Math.sin(t * 2.1) * 0.04) - scarf.roll.p) * 60 * dt;
      scarf.roll.v -= scarf.roll.v * 8.5 * dt;
      scarf.roll.p += scarf.roll.v * dt;
      // a fixed outward yaw plus a slow wobble: square to the spine the fan closes up
      // and reads as one box again
      scarf.root.rotation.set(scarf.pitch.p * look.jig, 0.22 + Math.sin(t * 2.1) * 0.05, scarf.roll.p);
      scarf.segs.forEach((g, k) => {
        g.rotation.x = scarf.pitch.p * (0.45 + k * 0.3) * look.jig;
        g.rotation.y = Math.sin(t * 2.7 + k * 1.1) * 0.07;
      });
    }

    // ---- dust ----
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.7;
      p.m.position.x += p.vx * dt;
      p.wy += p.vy * dt;
      p.m.position.y = p.wy - group.position.y;
      // one snap block per step: a dust mote that grows smoothly is a blur
      const sc = Math.round(p.size * (1.6 - p.life) / 0.12) * 0.12;
      p.m.scale.setScalar(Math.max(0.06, sc));
      p.mat.opacity = 0.55 * Math.max(0, p.life);
      if (p.life <= 0) p.m.visible = false;
    }

    // ---------------- face ----------------
    blink -= dt;
    if (blink < 0) { blink = 1.9 + Math.random() * 3.4; blinkT = 0.11; }
    blinkT = Math.max(0, blinkT - dt);
    const fear = smoothstep(Math.abs(vy), 6, 16);
    const open = blinkT > 0 ? 0.12 : 1;
    eyes.forEach((e) => {
      e.pupil.scale.y = lerp(e.pupil.scale.y, open * (s.dead ? 0.4 : 1 + fear * 0.35), 0.45);
      e.pupil.scale.x = lerp(e.pupil.scale.x, s.dead ? 0.5 : 1 + fear * 0.25, 0.45);
      e.pupil.position.set(Math.sin(ph) * 0.012, Math.cos(ph) * 0.012, 0);
      e.shine.visible = !s.dead && blinkT <= 0;
      e.lash.visible = blinkT <= 0;
    });
    const browLift = fear * 0.3 + (s.dead ? 0.4 : 0) - (s.nearMiss ? 0.25 : 0);
    brows.forEach((b) => {
      b.m.rotation.z = lerp(b.m.rotation.z, b.sx * (0.12 + browLift * 0.6) - b.sx * browLift * 0.5, 0.2);
      b.m.position.y = lerp(b.m.position.y, 0.325 + browLift * 0.02, 0.2);
    });

    if (s.dead) setFace('dizzy');
    else if (s.thrust) setFace('panic');
    else if (s.nearMiss) setFace('grit');
    else if (Math.abs(vy) > 9) setFace('panic');
    else if (s.alt > 90) setFace('o');
    else if (s.ropeSpeed > 2.5 || s.ropes > 3) setFace('tired');
    else if (!s.grounded) setFace('grin');
    else setFace('calm');
  }

  /** Re-skin and re-proportion without rebuilding anything: colours are remapped
   *  by the value each mesh was built with, which is exact, and the shape is
   *  three scalars update() already multiplies. `hair: false` picks the other
   *  silhouette: the bob off, the cap and scarf on. */
  function setLook(l = {}) {
    look = { w: 1, h: 1, squash: 1, jig: 1, hair: true, ...l };
    const tint = l.tint || {};
    group.traverse((o) => {
      if (!o.isMesh || o.userData.col === undefined) return;
      // A named part wins only when the row actually names it; otherwise it takes the
      // colour its palette value maps to, which is how every row worked before keys.
      const k = o.userData.key;
      const to = k !== undefined && tint[k] !== undefined ? tint[k] : tint[o.userData.col];
      o.material.color.setHex(to === undefined ? o.userData.col : to);
    });
    hair.visible = look.hair;
    peak.visible = scarf.root.visible = !look.hair;
  }

  return {
    group,
    rig,
    hands,
    update,
    setLook,
    bump,
    puff,
    setFace,
  };
}
