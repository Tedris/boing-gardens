// Park at ground level, sky that gives way to space as you climb.
// Everything scenery is placed behind the jumper: the camera looks straight
// down -Z, so anything at positive z would sit between it and her.
import * as THREE from '../vendor/three.module.js';
import { C, toon, canvasTex } from './toon.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function createWorld() {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  // ---------- sky dome ----------
  const skyUniforms = {
    uLow: { value: new THREE.Color(0xd8f0ff) },
    uHigh: { value: new THREE.Color(0x51b4f5) },
    uSpace: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 uLow; uniform vec3 uHigh; uniform float uSpace;
        varying vec3 vDir;
        void main(){
          float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 air = mix(uLow, uHigh, pow(t, 0.7));
          vec3 void_ = mix(vec3(0.035,0.045,0.11), vec3(0.004,0.006,0.03), pow(t,0.6));
          gl_FragColor = vec4(mix(air, void_, uSpace), 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  group.add(sky);

  // sun disc, parked far behind the park
  const sunTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,252,225,1)');
    r.addColorStop(0.35, 'rgba(255,236,170,0.8)');
    r.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
  const sunMat = new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), sunMat);
  sun.position.set(-150, 150, -360);
  group.add(sun);

  // ---------- ground ----------
  const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48), toon(C.grass, { steps: 2 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);

  const meadow = new THREE.Mesh(new THREE.RingGeometry(60, 200, 40), toon(C.grassDk, { steps: 2 }));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.01;
  meadow.receiveShadow = true;
  group.add(meadow);

  // the worn dirt circle the jumper owns
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), toon(C.dirt, { steps: 2 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.005;
  dirt.receiveShadow = true;
  group.add(dirt);

  // ---------- trees: a band behind her, plus a few far off to the sides ----------
  const spots = [];
  for (let i = 0; i < 22; i++) {
    const a = Math.PI + (i / 22) * Math.PI + rand(-0.08, 0.08);
    const r = rand(13, 46);
    spots.push({ x: Math.cos(a) * r * 1.7, z: Math.sin(a) * r * 0.55 - 7, s: rand(0.68, 1.0) });
  }
  for (let i = 0; i < 6; i++) {
    // side trees only where they fall outside the frame at this fov
    const sx = i % 2 ? 1 : -1;
    spots.push({ x: sx * rand(7.5, 16), z: rand(-8, 2), s: rand(0.7, 0.95) });
  }
  const n = spots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 3.6, 7);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const hullScale = new THREE.Vector3(1.06, 1.06, 1.06);
  const hull = new THREE.Matrix4();
  const inkOf = () => new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(C.trunk, { steps: 2 }), n);
  const trunksInk = new THREE.InstancedMesh(trunkGeo, inkOf(), n);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(C.leaf, { steps: 2, flat: true }), n * 3);
  const leavesInk = new THREE.InstancedMesh(leafGeo, inkOf(), n * 3);
  trunks.castShadow = leaves.castShadow = true;
  let li = 0;
  spots.forEach((p, i) => {
    dummy.position.set(p.x, 1.8 * p.s, p.z);
    dummy.rotation.set(0, rand(0, 3.14), rand(-0.03, 0.03));
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    trunksInk.setMatrixAt(i, hull.copy(dummy.matrix).scale(hullScale));
    for (let k = 0; k < 3; k++) {
      dummy.position.set(
        p.x + rand(-1.2, 1.2) * p.s,
        (3.5 + k * 0.95 + rand(-0.2, 0.2)) * p.s,
        p.z + rand(-1.1, 1.1) * p.s,
      );
      dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      const s = p.s * (1.15 - k * 0.2);
      dummy.scale.set(s, s * 0.82, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(li, dummy.matrix);
      leavesInk.setMatrixAt(li, hull.copy(dummy.matrix).scale(hullScale));
      li++;
    }
  });
  group.add(trunks, trunksInk, leaves, leavesInk);

  // ---------- flowers, none of them under the camera ----------
  const petalGeo = new THREE.SphereGeometry(0.08, 6, 5);
  const stemGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.24, 4);
  const NF = 240;
  const petals = new THREE.InstancedMesh(petalGeo, toon(C.flower, { steps: 2 }), NF);
  const stems = new THREE.InstancedMesh(stemGeo, toon(0x4f9c3c, { steps: 2 }), NF);
  for (let i = 0; i < NF; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = rand(0, 6.283), r = Math.sqrt(Math.random()) * 34;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (z < 0.5 || Math.abs(x) > 3.4) break;
    }
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, 0.28, z);
    dummy.scale.setScalar(rand(0.85, 1.4));
    dummy.updateMatrix();
    petals.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.12, z);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
  }
  group.add(petals, stems);

  // ---------- backdrop: one low building and a hedge line ----------
  const wall = new THREE.Mesh(new THREE.BoxGeometry(74, 13, 9), toon(C.brick, { steps: 2 }));
  wall.position.set(6, 6.5, -74);
  group.add(wall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(76, 1.2, 10.5), toon(0x94482f, { steps: 2 }));
  roof.position.set(6, 13.5, -74);
  group.add(roof);
  const winGeo = new THREE.BoxGeometry(1.1, 1.9, 0.3);
  const wins = new THREE.InstancedMesh(winGeo, toon(0xaee2f0, { steps: 2 }), 16);
  for (let i = 0; i < 16; i++) {
    dummy.position.set(-19 + (i % 8) * 5.4, 5 + Math.floor(i / 8) * 4.4, -69.2);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    wins.setMatrixAt(i, dummy.matrix);
  }
  group.add(wins);

  const hedge = new THREE.Mesh(new THREE.BoxGeometry(72, 0.75, 0.9), toon(C.hedge, { steps: 2, flat: true }));
  hedge.position.set(0, 0.37, -24);
  group.add(hedge);

  // ---------- clouds: a recycled band that follows the camera ----------
  // three overlapping puffs each, or a recycled band of icosahedrons just looks
  // like floating white cookies
  const PUFFS = 3;
  const NCLOUD = 30;
  const NC = NCLOUD * PUFFS;
  const SPAN = 230;
  const OFF = [[-0.55, -0.12, -0.2], [0.5, 0.08, 0.25], [0.05, 0.3, -0.5]];
  const cbase = new Float32Array(NCLOUD * 3);
  const cscale = new Float32Array(NCLOUD);
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  // slight self-light: an unlit underside would pick up green from the grass
  const clouds = new THREE.InstancedMesh(puffGeo, toon(C.cloud, { steps: 2, flat: true, emissive: 0xdfe9ff, emissiveIntensity: 0.32 }), NC);
  const cloudInk = new THREE.InstancedMesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x5b7fa6, side: THREE.BackSide }), NC);
  for (let c = 0; c < NCLOUD; c++) {
    cbase[c * 3] = rand(-85, 85);
    cbase[c * 3 + 1] = rand(6, SPAN);
    cbase[c * 3 + 2] = rand(-125, 10);
    cscale[c] = rand(1.5, 3.6);
  }
  group.add(clouds, cloudInk);

  // ---------- stars ----------
  const starPos = new Float32Array(800 * 3);
  for (let i = 0; i < 800; i++) {
    const a = rand(0, 6.283), b = Math.acos(rand(-1, 1)), r = 300;
    starPos[i * 3] = Math.sin(b) * Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.abs(Math.cos(b)) * r * 0.9;
    starPos[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: C.star, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
  }));
  group.add(stars);

  // ---------- birds: they hop about behind her while she is on the grass ----------
  const birds = new THREE.Group();
  const flock = [];
  const birdBody = new THREE.SphereGeometry(0.11, 8, 6);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(birdBody, toon(i % 2 ? 0x64768e : 0x8a6450, { steps: 2 }));
    body.castShadow = true;
    b.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.072, 7, 5), toon(0xe4edf6, { steps: 2 }));
    belly.position.set(0, -0.035, 0.045);
    b.add(belly);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), toon(0xffb020, { steps: 2 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.01, 0.13);
    b.add(beak);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), toon(0x1b1226, { steps: 1 }));
      eye.position.set(sx * 0.06, 0.045, 0.088);
      b.add(eye);
    }
    b.position.set(rand(-2.4, 2.4), 0.11, rand(-2.6, -0.4));
    b.userData = { t: rand(0, 6), base: b.position.clone(), hop: rand(0, 6.28) };
    flock.push(b);
    birds.add(b);
  }
  group.add(birds);

  // fire ropes throw warm light onto the jumper
  const fireLight = new THREE.PointLight(0xffa028, 0, 9, 2);
  fireLight.position.set(0, 1, 1.1);
  group.add(fireLight);

  const skyCol = new THREE.Color();

  return {
    group,
    fireLight,
    /** camY = camera height; time = seconds; fire = fire-rope strength */
    update(dt, time, camY, fire) {
      sky.position.y = camY;
      stars.position.y = camY;
      skyUniforms.uSpace.value = THREE.MathUtils.smoothstep(camY - 1, 45, 280);
      skyCol.setHSL(0.56, 0.85 - skyUniforms.uSpace.value * 0.5, 0.74 - skyUniforms.uSpace.value * 0.58);
      skyUniforms.uHigh.value.copy(skyCol);
      stars.material.opacity = Math.min(1, Math.max(0, (camY - 70) / 180));
      sunMat.opacity = 1 - skyUniforms.uSpace.value * 0.8;
      sun.visible = skyUniforms.uSpace.value < 0.99;

      for (let c = 0; c < NCLOUD; c++) {
        let y = cbase[c * 3 + 1];
        while (y < camY - 90) y += SPAN;
        while (y > camY + 170) y -= SPAN;
        cbase[c * 3 + 1] = y;
        const s = cscale[c];
        const drift = Math.sin(time * 0.06 + c) * 1.8;
        for (let k = 0; k < PUFFS; k++) {
          const i = c * PUFFS + k;
          const sc = s * (k === 2 ? 0.72 : 1);
          dummy.position.set(
            cbase[c * 3] + OFF[k][0] * s + drift,
            y + OFF[k][1] * s,
            cbase[c * 3 + 2] + OFF[k][2] * s,
          );
          dummy.rotation.set(c * 0.7 + k * 1.9, c * 1.7, k * 1.3);
          dummy.scale.set(sc, sc * 0.66, sc * 0.9);
          dummy.updateMatrix();
          clouds.setMatrixAt(i, dummy.matrix);
          cloudInk.setMatrixAt(i, hull.copy(dummy.matrix).scale(hullScale));
        }
      }
      clouds.instanceMatrix.needsUpdate = true;
      cloudInk.instanceMatrix.needsUpdate = true;

      const near = camY < 9;
      birds.visible = near;
      if (near) {
        for (const b of flock) {
          const u = b.userData;
          u.t += dt;
          const hop = Math.abs(Math.sin(u.t * 2.2 + u.hop));
          b.position.y = u.base.y + hop * 0.14;
          b.position.x = u.base.x + Math.sin(u.t * 0.45 + u.hop) * 0.8;
          b.rotation.y = Math.sin(u.t * 0.45 + u.hop) * 0.8;
          b.rotation.x = -hop * 0.22;
        }
      }

      if (fire > 0) {
        const f = 0.75 + Math.sin(time * 26) * 0.14 + Math.sin(time * 41.3) * 0.08;
        fireLight.intensity = fire * 5.5 * f;
        fireLight.position.set(0, 0.95 + Math.sin(time * 7) * 0.12, 1.15);
      } else {
        fireLight.intensity = 0;
      }
    },
  };
}
