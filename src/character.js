// The jumper. No animation clips anywhere: every pose is solved each frame from
// gameplay state (velocity, acceleration, rope phase, fuel), which is what keeps
// the movement reactive at any height or rope count. Jiggle/hair/squash are
// damped springs; clothed, comedic, adult-proportioned.
import * as THREE from '../vendor/three.module.js';
import { C, toon, part, canvasTex, spring, springKick, springState } from './toon.js';

// proportions, in metres
const P = {
  hipY: 0.88, knee: -0.37, ankle: -0.37,
  waistY: 0.99, chestY: 1.17, shoulderY: 1.30, neckY: 1.42, headY: 1.53,
  bustR: 0.118, bustX: 0.095, bustZ: 0.055,
  shoulderX: 0.185, armUp: 0.20, armFore: 0.18, hipX: 0.095,
};

// jiggle feel: k = stiffness, d = damping, g = how hard gravity/accel pulls
const J = {
  bust: { k: 145, d: 11.5, g: 0.0045, max: 0.026 },
  butt: { k: 175, d: 13.0, g: 0.0035, max: 0.022 },
  hair: { k: 95, d: 9.0, max: 0.3 },
  body: { k: 60, d: 9.5, g: 0.011, max: 0.06 },
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

const MOUTHS = 8;
function mouthTex() {
  return canvasTex(64 * MOUTHS, 64, (g, w, h) => {
    const cw = w / MOUTHS;
    const cell = (i, draw) => {
      g.save();
      g.translate(i * cw, 0);
      g.beginPath();
      g.rect(0, 0, cw, h);
      g.clip();
      g.translate(cw / 2, h / 2);
      draw();
      g.restore();
    };
    const ink = '#241a30', dark = '#8a2b46', tooth = '#fffaf2';
    const stroke = (wd = 5) => { g.lineWidth = wd; g.strokeStyle = ink; g.lineCap = 'round'; };

    // 0 - relaxed smile
    cell(0, () => {
      stroke(6);
      g.beginPath(); g.arc(0, -4, 15, 0.25, Math.PI - 0.25); g.stroke();
    });
    // 1 - open happy grin
    cell(1, () => {
      g.fillStyle = dark;
      g.beginPath(); g.arc(0, -3, 16, 0.05, Math.PI - 0.05); g.closePath(); g.fill();
      stroke(5); g.stroke();
      g.fillStyle = tooth;
      g.fillRect(-13, -4, 26, 5);
      g.fillStyle = '#ef7d92';
      g.beginPath(); g.ellipse(0, 8, 9, 5, 0, 0, 6.3); g.fill();
    });
    // 2 - gritted effort
    cell(2, () => {
      g.fillStyle = tooth;
      g.beginPath(); g.roundRect(-17, -9, 34, 19, 8); g.fill();
      stroke(5); g.stroke();
      g.strokeStyle = 'rgba(36,26,48,.55)'; g.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 7, -9); g.lineTo(i * 7, 10); g.stroke();
      }
      g.beginPath(); g.moveTo(-17, 0); g.lineTo(17, 0); g.stroke();
    });
    // 3 - small focused "o"
    cell(3, () => {
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(0, 0, 8, 10, 0, 0, 6.3); g.fill();
      stroke(5); g.stroke();
    });
    // 4 - wide panic
    cell(4, () => {
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(0, 1, 15, 17, 0, 0, 6.3); g.fill();
      stroke(5); g.stroke();
      g.fillStyle = '#ef7d92';
      g.beginPath(); g.ellipse(0, 11, 9, 7, 0, 0, 6.3); g.fill();
    });
    // 5 - dizzy (wavy)
    cell(5, () => {
      stroke(6);
      g.beginPath();
      for (let x = -18; x <= 18; x += 2) {
        const y = Math.sin(x * 0.42) * 7;
        if (x === -18) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    });
    // 6 - tongue out (tired)
    cell(6, () => {
      stroke(6);
      g.beginPath(); g.arc(0, -6, 15, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#ef7d92';
      g.beginPath(); g.ellipse(3, 8, 8, 11, 0.1, 0, 6.3); g.fill();
      stroke(4); g.stroke();
    });
    // 7 - flat unimpressed line
    cell(7, () => {
      stroke(6);
      g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 1); g.stroke();
    });
  });
}

function flameTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.75, w * 0.55);
    r.addColorStop(0, 'rgba(255,255,240,1)');
    r.addColorStop(0.3, 'rgba(255,200,70,0.95)');
    r.addColorStop(0.7, 'rgba(255,110,30,0.45)');
    r.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

const FLAME_TEX = /* lazy */ { t: null };
function flameTexture() {
  if (!FLAME_TEX.t) FLAME_TEX.t = flameTex();
  return FLAME_TEX.t;
}

export function createCharacter() {
  const group = new THREE.Group();
  const rig = {};

  // Same rig, different body: three scalars and a colour map, applied by setLook.
  // Kept in one object so update() reads it in the same places every frame.
  let look = { w: 1, h: 1, squash: 1, jig: 1 };

  const body = new THREE.Group();
  group.add(body);
  rig.body = body;

  // ---------------- legs ----------------
  const hips = new THREE.Group();
  hips.position.y = P.hipY;
  body.add(hips);
  rig.hips = hips;

  const pelvis = part(new THREE.SphereGeometry(0.185, 16, 12), C.shorts);
  // shorts sit on the hips, not up in the ribs: the tee hem below overlaps this
  pelvis.position.y = -0.02;
  pelvis.scale.set(0.94, 0.62, 0.82);
  hips.add(pelvis);

  // butt springs ride the pelvis: clothed, purely comedic weight
  const butt = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.085, 0.015, -0.075);
    hips.add(g);
    const m = part(new THREE.SphereGeometry(0.115, 14, 10), C.shortsDk);
    m.scale.set(0.95, 0.9, 0.9);
    g.add(m);
    butt.push({ g, up: springState(), base: g.position.clone(), gain: sx > 0 ? 1 : 0.86 });
  }
  rig.butt = butt;

  const leg = [];
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Group();
    thigh.position.set(sx * P.hipX, -0.02, 0);
    hips.add(thigh);
    const tm = part(new THREE.CapsuleGeometry(0.075, 0.24, 4, 10), C.skin);
    tm.position.y = -0.15;
    thigh.add(tm);

    const knee = new THREE.Group();
    knee.position.y = P.knee;
    thigh.add(knee);
    const km = part(new THREE.SphereGeometry(0.068, 10, 8), C.skin);
    knee.add(km);
    const sm = part(new THREE.CapsuleGeometry(0.062, 0.26, 4, 10), C.skin);
    sm.position.y = -0.16;
    knee.add(sm);

    const ankle = new THREE.Group();
    ankle.position.y = P.ankle;
    knee.add(ankle);
    const sock = part(new THREE.CylinderGeometry(0.058, 0.052, 0.13, 10), C.sock);
    sock.position.y = 0.02;
    ankle.add(sock);
    const shoe = part(new THREE.BoxGeometry(0.115, 0.085, 0.235), C.shoe, { ink: 0.04 });
    shoe.position.set(0, -0.055, 0.035);
    ankle.add(shoe);
    const sole = part(new THREE.BoxGeometry(0.12, 0.05, 0.25), C.shoeSo, { ink: 0.02 });
    sole.position.set(0, -0.105, 0.035);
    ankle.add(sole);
    const lace = part(new THREE.BoxGeometry(0.085, 0.02, 0.06), C.sock, { ink: 0.02 });
    lace.position.set(0, -0.015, 0.10);
    ankle.add(lace);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.5, 10, 1, true),
      new THREE.MeshBasicMaterial({
        map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }),
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -0.28;
    flame.visible = false;
    ankle.add(flame);

    leg.push({ thigh, knee, ankle, flame });
  }
  rig.leg = leg;

  // ---------------- torso ----------------
  const torso = new THREE.Group();
  torso.position.y = 0;
  body.add(torso);
  rig.torso = torso;

  const waist = part(new THREE.CapsuleGeometry(0.115, 0.10, 4, 12), C.skin);
  waist.position.y = P.waistY;
  torso.add(waist);

  const chest = new THREE.Group();
  chest.position.y = 0;
  torso.add(chest);
  rig.chest = chest;

  const top = part(new THREE.CapsuleGeometry(0.168, 0.20, 5, 14), C.top);
  top.position.y = P.chestY;
  top.scale.set(1, 1, 0.9);
  chest.add(top);
  const hem = part(new THREE.CylinderGeometry(0.172, 0.19, 0.14, 14), C.topDk);
  hem.position.y = 0.99;
  chest.add(hem);
  const collar = part(new THREE.TorusGeometry(0.088, 0.028, 6, 14), C.topDk);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.335;
  chest.add(collar);

  // bust: pivot at the chest wall so the mass swings, mesh hangs below it
  const bust = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * P.bustX, P.chestY + 0.005, P.bustZ);
    chest.add(g);
    const m = part(new THREE.SphereGeometry(P.bustR, 16, 12), C.top);
    m.scale.set(0.98, 0.94, 0.92);
    m.position.set(0, -0.028, 0.022);
    g.add(m);
    bust.push({
      g, m, base: g.position.clone(),
      up: springState(), side: springState(), spin: springState(),
      gain: sx > 0 ? 1 : 0.88,
    });
  }
  rig.bust = bust;

  // ---------------- arms ----------------
  const arm = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * P.shoulderX, P.shoulderY, 0);
    chest.add(shoulder);
    const um = part(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), C.skin);
    um.position.y = -0.10;
    shoulder.add(um);
    const cap = part(new THREE.SphereGeometry(0.072, 12, 10), C.top);
    shoulder.add(cap);

    const elbow = new THREE.Group();
    elbow.position.y = -P.armUp;
    shoulder.add(elbow);
    const eb = part(new THREE.SphereGeometry(0.05, 10, 8), C.skin);
    elbow.add(eb);
    const fm = part(new THREE.CapsuleGeometry(0.047, 0.14, 4, 10), C.skin);
    fm.position.y = -0.09;
    elbow.add(fm);

    const wrist = new THREE.Group();
    wrist.position.y = -P.armFore;
    elbow.add(wrist);
    const band = part(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 10), C.shoe, { ink: 0.02 });
    wrist.add(band);
    const hand = part(new THREE.SphereGeometry(0.055, 12, 10), C.skin, { ink: 0.03 });
    hand.position.y = -0.045;
    hand.scale.set(0.9, 1.05, 0.75);
    wrist.add(hand);
    // the handle the rope hangs from
    const grip = part(new THREE.CylinderGeometry(0.026, 0.03, 0.13, 8), 0x3c3f52, { ink: 0.02 });
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, -0.02, 0.05);
    wrist.add(grip);

    arm.push({ shoulder, elbow, wrist, sx });
  }
  rig.arm = arm;

  // ---------------- head ----------------
  const neck = part(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 10), C.skin);
  neck.position.y = P.neckY;
  chest.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.y = P.headY;
  chest.add(headPivot);
  rig.headPivot = headPivot;

  const head = new THREE.Group();
  headPivot.add(head);
  rig.head = head;

  const skull = part(new THREE.SphereGeometry(0.2, 20, 16), C.skin);
  skull.scale.set(1, 1.04, 0.96);
  head.add(skull);
  const chin = part(new THREE.SphereGeometry(0.115, 12, 10), C.skin, { ink: 0 });
  chin.position.set(0, -0.09, 0.075);
  chin.scale.set(1, 0.8, 0.9);
  head.add(chin);
  const nose = part(new THREE.SphereGeometry(0.026, 8, 6), C.skinDk, { ink: 0.012 });
  nose.position.set(0, -0.02, 0.195);
  head.add(nose);
  const earL = part(new THREE.SphereGeometry(0.045, 10, 8), C.skinDk, { ink: 0.018 });
  earL.position.set(-0.195, -0.01, -0.01);
  head.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.195;
  head.add(earR);

  // hair shell sits just behind the face: the head pokes through the front, so
  // the shell reads as a bob that frames the face without needing a cutout
  const hairBack = part(new THREE.SphereGeometry(0.216, 20, 16), C.hair);
  hairBack.position.set(0, 0.008, -0.05);
  hairBack.scale.set(1.0, 1.0, 0.88);
  head.add(hairBack);
  rig.hairBack = hairBack;
  const bangs = part(new THREE.SphereGeometry(0.205, 16, 12), C.hairLt, { ink: 0.022 });
  bangs.position.set(0, 0.105, 0.085);
  bangs.scale.set(0.98, 0.42, 0.6);
  bangs.rotation.x = -0.28;
  head.add(bangs);
  const clip = part(new THREE.BoxGeometry(0.075, 0.022, 0.03), C.fire, { ink: 0.02 });
  clip.position.set(0.14, 0.115, 0.12);
  clip.rotation.z = -0.45;
  head.add(clip);

  // bob strands: short nested chains, each its own spring so they fan out
  const strands = [];
  const anchors = [
    [-0.95, 0.02, -0.10], [-0.72, 0.10, -0.55], [-0.35, 0.14, -0.85],
    [0, 0.12, -0.95], [0.35, 0.14, -0.85], [0.72, 0.10, -0.55], [0.95, 0.02, -0.10],
    [-0.92, -0.06, 0.22], [0.92, -0.06, 0.22],
  ];
  const segGeo = new THREE.BoxGeometry(0.072, 0.09, 0.045);
  const tipGeo = new THREE.BoxGeometry(0.066, 0.075, 0.04);
  anchors.forEach((a, i) => {
    const rootG = new THREE.Group();
    rootG.position.set(a[0] * 0.185, 0.03 + a[1] * 0.19, a[2] * 0.175);
    head.add(rootG);
    const segs = [];
    let parent = rootG;
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Group();
      g.position.y = k === 0 ? -0.05 : -0.082;
      const m = new THREE.Mesh(k ? tipGeo : segGeo, toon(k % 2 ? C.hairLt : C.hair, { steps: 2 }));
      m.position.y = -0.045;
      m.castShadow = false;
      g.add(m);
      parent.add(g);
      segs.push(g);
      parent = g;
    }
    strands.push({ root: rootG, segs, pitch: springState(), roll: springState(), phase: i * 0.7 });
  });
  rig.strands = strands;

  // ---------------- face ----------------
  const eyes = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.082, 0.028, 0.166);
    head.add(g);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), toon(C.eye, { steps: 1 }));
    sclera.scale.set(1, 1.08, 0.5);
    g.add(sclera);
    const pupilG = new THREE.Group();
    pupilG.position.z = 0.032;
    g.add(pupilG);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), toon(C.pupil, { steps: 1 }));
    pupil.scale.set(1, 1.12, 0.5);
    pupilG.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), toon(0xffffff, { steps: 1 }));
    shine.position.set(-0.014, 0.016, 0.02);
    pupilG.add(shine);
    const lash = part(new THREE.BoxGeometry(0.062, 0.013, 0.024), C.ink, { ink: 0 });
    lash.position.set(0, 0.052, 0.012);
    lash.rotation.z = sx * -0.12;
    g.add(lash);
    eyes.push({ g, pupilG, base: g.position.clone() });
  }
  rig.eyes = eyes;

  const brows = [];
  for (const sx of [-1, 1]) {
    const b = part(new THREE.BoxGeometry(0.062, 0.015, 0.022), C.hair, { ink: 0.008 });
    b.position.set(sx * 0.084, 0.098, 0.176);
    head.add(b);
    brows.push({ m: b, sx });
  }
  rig.brows = brows;

  const mouthMat = new THREE.MeshBasicMaterial({
    map: mouthTex(), transparent: true, alphaTest: 0.35, toneMapped: false,
  });
  mouthMat.map.wrapS = THREE.ClampToEdgeWrapping;
  mouthMat.map.repeat.set(1 / MOUTHS, 1);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.065), mouthMat);
  mouth.position.set(0, -0.072, 0.192);
  mouth.name = 'mouth';
  head.add(mouth);
  rig.mouth = mouth;
  rig.mouthMat = mouthMat;

  for (const sx of [-1, 1]) {
    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.036, 12),
      new THREE.MeshBasicMaterial({ color: C.blush, transparent: true, opacity: 0.5 }),
    );
    blush.position.set(sx * 0.135, -0.028, 0.166);
    blush.rotation.y = sx * 0.35;
    head.add(blush);
  }

  // dust puff pool for landings
  const puffs = [];
  const puffMat = new THREE.SpriteMaterial({
    map: canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
      // soft smoke, not a jet: a 0.9-alpha core between her knees reads as fire
      r.addColorStop(0, 'rgba(255,248,230,0.42)');
      r.addColorStop(0.45, 'rgba(255,248,230,0.2)');
      // hit zero before the texture edge or the sprite's square seam shows
      r.addColorStop(0.8, 'rgba(255,248,230,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    }),
    transparent: true, depthWrite: false,
  });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(puffMat);
    s.visible = false;
    group.add(s);
    puffs.push({ s, life: 0, vx: 0, vy: 0, size: 1 });
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
  let blink = 2.2, blinkT = 0, mouthI = 0, mouthHold = 0, prevVy = 0, tumble = 0, tumbleV = 0;

  const hands = [];
  for (const a of rig.arm) {
    const h = new THREE.Object3D();
    h.position.set(0, 0, 0);
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

  /** Kick the soft bodies. Called by the game on takeoff, landing, skip, hit. */
  function bump(vy, vx = 0, spin = 0) {
    for (const b of bust) {
      b.up.v += vy * b.gain;
      b.side.v += vx * b.gain;
      b.spin.v += spin * b.gain;
    }
    for (const b of butt) b.up.v += vy * 0.7 * b.gain;
    jig.v += vy * 0.5;
  }

  function puff(x, y, z, spread = 0.5) {
    const p = puffs[puffNext++ % puffs.length];
    p.life = 1;
    p.size = 0.2 + Math.random() * 0.28;
    p.vx = (Math.random() - 0.5) * spread;
    p.vy = 0.35 + Math.random() * 0.5;
    // sprites live in her group, so remember the world height: dust belongs to
    // the dirt, and must not ride up with her on the next jump
    p.wy = group.position.y + y;
    p.s.position.set(x, y, z);
    p.s.visible = true;
  }

  function setMouth(i, hold = 0) {
    if (mouthI !== i) {
      mouthI = i;
      mouthMat.map.offset.x = i / MOUTHS;
    }
    mouthHold = Math.max(mouthHold, hold);
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

    // ---- squash & stretch: stretch while moving fast, squash on impact ----
    const stretch = clamp(vy * 0.016, -0.2, 0.26) + jig.p;
    const crouch = spring(sCrouch, s.grounded ? Math.max(0, 0.05 - Math.abs(vy) * 0.01) : 0, 120, 14, dt);
    const sq = clamp((stretch - crouch * 1.6) * look.squash, -0.34 * look.squash, 0.4);
    body.scale.set((1 - sq * 0.5) * look.w, (1 + sq) * look.h, (1 - sq * 0.5) * look.w);

    // ---- whole-body lean from vertical motion / thrust ----
    const leanTarget = clamp(vy * 0.017, -0.24, 0.3) + (s.thrust ? 0.42 : 0) + (s.dead ? 0.2 : 0);
    const lean = springKick(sLean, leanTarget, -ay * J.body.g, J.body.k, J.body.d, dt);
    body.rotation.x = clamp(lean, -0.7, 0.9);
    body.rotation.z = springKick(sRoll, Math.sin(t * 1.4) * 0.02, -ay * 0.0018, 42, 8.5, dt);
    body.position.y = clamp(springKick(sBody, 0, -ay * J.body.g, J.body.k, J.body.d, dt), -0.13, 0.13)
      + crouch * 0.55;

    // ---- tumble on death, so the fall reads as a gag not a simulation ----
    if (s.dead) {
      tumbleV += dt * 5.5;
      tumble = Math.min(tumble + tumbleV * dt, 2.3);
      tumble = Math.min(tumble, 2.3);
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
      L.thigh.rotation.z = lerp(L.thigh.rotation.z, (i ? -1 : 1) * (0.06 + tuck * 0.12 + rag * 0.5), 0.2);
      L.knee.rotation.x = lerp(L.knee.rotation.x, 0.95 * tuck - crouch * 1.5 + (s.thrust ? -0.35 : 0), 0.22);
      L.ankle.rotation.x = lerp(L.ankle.rotation.x, -0.35 * tuck + crouch * 0.9, 0.2);
      L.flame.visible = !!s.thrust;
      if (s.thrust) {
        const f = 0.8 + Math.sin(t * 34 + i * 2) * 0.22;
        L.flame.scale.set(1, f * (0.7 + s.fuel * 0.6), 1);
        if (Math.random() < 0.35) puff(0, s.y + 0.1, 0, 0.9);
      }
    });

    // ---- arms: the hands anchor to a small circle the rope hangs from, so the
    // arm pose is a consequence of the rope rather than a guess that must match ----
    const ph = s.phase;
    for (const a of arm) {
      if (s.dead) {
        a.shoulder.rotation.set(-1.2 + Math.sin(t * 9 + a.sx) * 0.5, 0, a.sx * 2.1);
        a.elbow.rotation.set(0.7, 0, 0);
        a.wrist.rotation.set(0, 0, 0);
        continue;
      }
      a.wrist.rotation.x = 0.2 * Math.sin(ph);
      reach(a, a.sx * 0.3, 1.05 - 0.05 * Math.cos(ph), 0.05 - 0.1 * Math.sin(ph));
    }

    // ---- head keeps its own balance so the face stays readable ----
    headPivot.rotation.x = clamp(springKick(sNod, -lean * 0.55, -ay * 0.006, 90, 11, dt), -0.6, 0.6);
    headPivot.rotation.z = -body.rotation.z * 0.7 + Math.sin(t * 1.7) * 0.02;
    headPivot.rotation.y = Math.sin(ph) * 0.09 + (s.dead ? Math.sin(t * 3) * 0.1 : 0);
    // breath
    chest.scale.setScalar(1 + Math.sin(t * 2.4) * 0.008);

    // one shared kick: vertical acceleration sets how far everything hangs
    const gKick = -ay;
    bust.forEach((b, i) => {
      const gy = gKick * J.bust.g * b.gain * look.jig;
      const up = clamp(springKick(b.up, 0, gy - 0.6 * look.jig * Math.sin(t * 2.2 + i), J.bust.k, J.bust.d, dt), -J.bust.max, J.bust.max);
      const side = clamp(springKick(b.side, 0, Math.sin(t * 1.6 + i * 1.7) * 0.25 * look.jig, 62, 9.5, dt), -0.03, 0.03);
      const spin = clamp(springKick(b.spin, 0, -lean * 2.2, 70, 9, dt), -0.3, 0.3);
      b.g.position.set(b.base.x + side, b.base.y + up - 0.006, b.base.z + (up < 0 ? up * 0.3 : 0));
      b.g.rotation.set(spin * 0.4, 0, side * 2.2);
    });
    butt.forEach((b, i) => {
      const up = clamp(springKick(b.up, 0, gKick * J.butt.g * b.gain * look.jig, J.butt.k, J.butt.d, dt), -J.butt.max, J.butt.max);
      b.g.position.set(b.base.x, b.base.y + up * 0.6, b.base.z + up * 0.5);
    });

    // ---- hair: gravity + acceleration set each segment's target angle ----
    const hang = clamp(0.5 + ay * 0.014, -1.2, 2.0);
    strands.forEach((st, i) => {
      const front = st.root.position.z > 0.02 ? 0.4 : 1;
      st.pitch.v += ((-lean * 0.7 * front - hang * 0.28 * front) - st.pitch.p) * J.hair.k * dt;
      st.pitch.v -= st.pitch.v * J.hair.d * dt;
      st.pitch.p += st.pitch.v * dt;
      st.pitch.p = clamp(st.pitch.p, -J.hair.max, J.hair.max);
      st.roll.v += ((-body.rotation.z * 1.6 + Math.sin(t * 2.6 + st.phase) * 0.05) - st.roll.p) * 70 * dt;
      st.roll.v -= st.roll.v * 8.5 * dt;
      st.roll.p += st.roll.v * dt;
      st.root.rotation.set(st.pitch.p, 0, st.roll.p);
      st.segs.forEach((g, k) => {
        g.rotation.x = st.pitch.p * (0.35 + k * 0.22) * 0.6;
        g.rotation.y = Math.sin(t * 3.1 + st.phase + k) * 0.06;
      });
    });

    // ---- dust ----
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.7;
      p.s.position.x += p.vx * dt;
      p.wy += p.vy * dt;
      p.s.position.y = p.wy - group.position.y;
      p.s.scale.setScalar(p.size * (1.6 - p.life));
      p.s.material = puffMat;
      if (p.life <= 0) p.s.visible = false;
    }

    // ---------------- face ----------------
    blink -= dt;
    if (blink < 0) { blink = 1.9 + Math.random() * 3.4; blinkT = 0.11; }
    blinkT = Math.max(0, blinkT - dt);
    const open = blinkT > 0 ? 0.08 : 1;
    const fear = smoothstep(Math.abs(vy), 6, 16);
    const eyeOpen = s.dead ? 1.25 : open * (1 + fear * 0.35);
    eyes.forEach((e, i) => {
      e.g.scale.y = lerp(e.g.scale.y, eyeOpen, 0.45);
      // pupils track the rope, and go wide on the way down
      const lookY = s.dead ? 0 : Math.cos(ph) * 0.012;
      const lookX = s.dead ? 0 : Math.sin(ph) * 0.01 * (i ? 1 : 1);
      e.pupilG.position.set(lookX + (s.dead ? Math.sin(t * 7) * 0.02 : 0), lookY, 0.032 - fear * 0.006);
      e.pupilG.scale.setScalar(1 + fear * 0.25 + (s.dead ? 0.2 : 0));
    });
    const browLift = fear * 0.3 + (s.dead ? 0.4 : 0) - (s.nearMiss ? 0.25 : 0);
    brows.forEach((b) => {
      b.m.rotation.z = lerp(b.m.rotation.z, b.sx * (0.12 + browLift * b.sx * 0.6) - b.sx * browLift * 0.5, 0.2);
      b.m.position.y = lerp(b.m.position.y, 0.098 + browLift * 0.02, 0.2);
    });

    mouthHold = Math.max(0, mouthHold - dt);
    if (s.dead) setMouth(5);
    else if (s.thrust) setMouth(4, 0.1);
    else if (s.nearMiss) setMouth(2, 0.2);
    else if (mouthHold > 0) setMouth(mouthI, 0);
    else if (Math.abs(vy) > 9) setMouth(4, 0.1);
    else if (s.alt > 90) setMouth(3, 0.1);
    else if (s.ropeSpeed > 2.5 || s.ropes > 3) setMouth(6, 0.2);
    else if (!s.grounded) setMouth(0, 0.05);
    else setMouth(0, 0.05);
    mouth.scale.set(1 + (mouthI === 4 ? 0.25 : 0), 1 + (mouthI === 1 ? 0.15 : 0), 1);

  }

  /** Re-skin and re-proportion without rebuilding anything: colours are remapped
      from the base palette value each part recorded, so switching back and forth
      is exact, and the shape is three scalars the animator already multiplies. */
  function setLook(l = {}) {
    look = { w: 1, h: 1, squash: 1, jig: 1, ...l };
    const tint = l.tint || {};
    group.traverse((m) => {
      if (!m.isMesh || m.userData.col === undefined) return;
      m.material.color.set(tint[m.userData.col] ?? m.userData.col);
    });
  }

  return {
    group,
    rig,
    hands,
    update,
    setLook,
    bump,
    puff,
    /** hand world positions, for the rope to hang from */
    handPositions(out) {
      for (let i = 0; i < hands.length; i++) out[i] = hands[i].getWorldPosition(out[i] || new THREE.Vector3());
      return out;
    },
  };
}
