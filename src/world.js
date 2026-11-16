// A PS1 stage, not a park: one dark floor, a horizon silhouette that swaps as
// she climbs, flat cloud shelves recycled past the camera, and boxes for stars
// once the air thins. Everything scenery is behind the jumper: the camera looks
// straight down -Z, so anything at positive z would sit between it and her.
import * as THREE from '../vendor/three.module.js';
import { C, mat, part } from './toon.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Altitude bands, in metres of camera height. Tier i is what shows between
// BANDS[i-1] and BANDS[i]: the stage, the rooftops, the cloud deck, thin air.
// The boundaries are set against game.js's `space` ramp (60..260 m) so the
// skyline goes over exactly when the light does.
const BANDS = [12, 60, 150];
const CLOUD_TOP = BANDS[2];        // stars only make sense above the cloud deck

// Horizon silhouettes, one tier per band: slabs { x, w, h } at z = -8, depth
// 1.4, each clear of the jumper's lane (|x| - w/2 >= 6) so nothing ever reads
// as an obstacle. Built once; update() only flips .visible.
const TIERS = [
  [ // the stage: two low blocks and one stacked-box tree, all but empty
    { x: -13.5, w: 3.0, h: 1.6 }, { x: 9.5, w: 2.2, h: 1.1 }, { x: 14.0, w: 3.4, h: 2.2 },
    { x: -8.6, w: 0.5, h: 0.8, y: 0.4 }, { x: -8.6, w: 1.6, h: 0.9, y: 1.25 },
  ],
  [ // rooftops: a denser, taller skyline
    { x: -15.0, w: 2.6, h: 3.6 }, { x: -11.0, w: 1.8, h: 5.0 }, { x: -7.6, w: 1.4, h: 2.6 },
    { x: 7.8, w: 1.6, h: 4.2 }, { x: 11.0, w: 2.4, h: 5.8 }, { x: 14.8, w: 1.8, h: 3.2 },
  ],
  [ // the cloud deck: three wide, low hangars
    { x: -11.0, w: 4.6, h: 1.4 }, { x: 9.0, w: 4.0, h: 1.8 }, { x: 14.0, w: 2.0, h: 2.6 },
  ],
  [ // thin air: sparse spires
    { x: -12.5, w: 1.4, h: 5.6 }, { x: 10.5, w: 1.2, h: 4.2 }, { x: 15.5, w: 2.4, h: 1.2 },
  ],
];

export function createWorld() {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  // One unit box for every box in the module - slabs, clouds, stars, rims -
  // scaled per mesh, so the whole stage is two geometries and a cached material
  // per colour. The ground is one quad on purpose: a dense floor grid would make
  // the vertex snap crawl in a hundred places at once.
  const box = new THREE.BoxGeometry(1, 1, 1);

  // ---------- floor ----------
  const floor = part(new THREE.PlaneGeometry(200, 200), C.floor);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // two marks on the floor, both flush: a worn patch and a stone strip off to one side.
  // Both are *lighter* than the ground: at a three-quarter angle a darker mark stops
  // reading as a scuff and reads as a hole cut in the stage. Raise either by a centimetre
  // and it stops being a mark and becomes a slab lying on the stage.
  const pad = part(box, C.stone);
  pad.scale.set(2.2, 0.02, 2.2);
  pad.position.set(0, -0.009, -0.4);
  const strip = part(box, C.stone);
  strip.scale.set(5.5, 0.02, 0.6);
  strip.position.set(7.5, -0.0095, -4.5);
  group.add(pad, strip);

  // ---------- horizon: one tier visible at a time, riding her eye line ----------
  // The group tracks camY, so a tier always sits on the horizon instead of
  // sinking out of frame behind the fog as she climbs.
  const horizon = new THREE.Group();
  group.add(horizon);

  const slabs = TIERS.map((row, t) => row.map((s) => {
    const m = part(box, C.prop);
    m.scale.set(s.w, s.h, 1.4);
    m.position.set(s.x, s.y ?? s.h / 2, -8);
    m.visible = t === 0;
    horizon.add(m);
    return m;
  }));

  // ---------- clouds: flat shelves, recycled past the camera ----------
  const NCLOUD = 16;
  const SPAN = 120;                        // vertical wrap distance
  const cbase = new Float32Array(NCLOUD * 3);
  const csize = new Float32Array(NCLOUD * 3);
  for (let i = 0; i < NCLOUD; i++) {
    cbase[i * 3] = rand(-46, 46);
    cbase[i * 3 + 1] = rand(-10, SPAN - 12);   // absolute y; wrapped past the camera
    cbase[i * 3 + 2] = rand(-46, -16);         // never positive z
    csize[i * 3] = rand(6, 15);
    csize[i * 3 + 1] = rand(0.35, 0.8);
    csize[i * 3 + 2] = rand(2.5, 6);
  }
  const clouds = new THREE.InstancedMesh(box, mat(C.cloud), NCLOUD);
  // Instances recycle across a 120 m column, which outruns the bounding sphere
  // three caches off the first frame's matrices - the stage is cheap, cull it off.
  clouds.frustumCulled = false;
  group.add(clouds);

  // ---------- stars: fog-exempt boxes, parked on a shell that follows her ----------
  const NSTAR = 300;
  const starMat = new THREE.MeshBasicMaterial({
    color: C.star, fog: false, transparent: true, opacity: 0, depthWrite: false,
  });
  const stars = new THREE.InstancedMesh(box, starMat, NSTAR);
  for (let i = 0; i < NSTAR; i++) {
    const a = rand(0, 6.283), b = Math.acos(rand(-1, 1)), r = 300;
    const s = rand(0.9, 1.7);              // ~1 internal pixel at 300 m
    dummy.position.set(Math.sin(b) * Math.cos(a) * r, Math.abs(Math.cos(b)) * r * 0.9, Math.sin(b) * Math.sin(a) * r);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
  }
  stars.instanceMatrix.needsUpdate = true;
  group.add(stars);

  const skyLow = new THREE.Color(C.sky);
  const skyHigh = new THREE.Color(C.skyHi);
  /** Fog/background colour, ground air to thin air; game.js feeds this to scene.fog. */
  const skyColor = new THREE.Color(C.sky);

  let tier = 0;

  return {
    group,
    skyColor,
    /** camY = camera height; time = seconds. `fire` is unused on purpose: a burning
     *  rope shows on the rope and its embers, and the world itself never glows for it. */
    update(dt, time, camY, fire) {
      // sky: the same colour the fog dissolves the horizon into
      skyColor.lerpColors(skyLow, skyHigh, THREE.MathUtils.smoothstep(camY, 40, 240));

      // horizon: the tier for this band, sitting on her eye line
      let t = 0;
      while (t < BANDS.length && camY >= BANDS[t]) t++;
      if (t !== tier) {
        tier = t;
        for (let i = 0; i < slabs.length; i++) {
          for (const s of slabs[i]) s.visible = i === t;
        }
      }
      horizon.position.y = camY - 0.9;

      // clouds: wrap the band around the camera so the deck is always around her
      for (let i = 0; i < NCLOUD; i++) {
        let y = cbase[i * 3 + 1];
        while (y < camY - 12) y += SPAN;           // fell below her: recycle on top
        while (y > camY + SPAN - 12) y -= SPAN;
        cbase[i * 3 + 1] = y;
        dummy.position.set(
          cbase[i * 3] + Math.sin(time * 0.06 + i) * 1.8,
          y,
          cbase[i * 3 + 2],
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(csize[i * 3], csize[i * 3 + 1], csize[i * 3 + 2]);
        dummy.updateMatrix();
        clouds.setMatrixAt(i, dummy.matrix);
      }
      clouds.instanceMatrix.needsUpdate = true;

      // stars: they only exist once she is above the cloud deck
      stars.position.y = camY;
      starMat.opacity = THREE.MathUtils.smoothstep(camY, CLOUD_TOP, CLOUD_TOP + 70);
      stars.visible = starMat.opacity > 0.001;

    },
  };
}
