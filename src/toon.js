// Cel-shading kit: a hard-stepped ramp so lit 3D reads as flat 2D ink art,
// plus inverted-hull outlines so every silhouette gets a pen line.
import * as THREE from '../vendor/three.module.js';

// palette - original, chosen to sit apart from any existing jump-rope game
export const C = {
  ink:     0x241a30,
  skin:    0xf7c193,
  skinDk:  0xe0a374,
  hair:    0x2f7f8f,   // teal bob
  hairLt:  0x46a2b3,
  top:     0xffc93c,   // crop top
  topDk:   0xe8a91f,
  shorts:  0x7b4bd0,
  shortsDk:0x6134ae,
  shoe:    0xef4444,
  sock:    0xfff3e2,
  shoeSo:  0x2c2438,
  eye:     0xffffff,
  pupil:   0x2a1f3d,
  mouth:   0x8a2b46,
  blush:   0xff8f9e,
  grass:   0x74c44e,
  grassDk: 0x5aa53c,
  dirt:    0xe8ce9c,
  trunk:   0x8a5a3c,
  leaf:    0x4fb862,
  leafLt:  0x76d47f,
  brick:   0xb9563f,
  stone:   0xbfc6c2,
  flower:  0xfff6e8,
  cloud:   0xffffff,
  ropeA:   0xf2f2f2,
  hedge:   0x3f8f45,
  star:    0xfff4c8,
  fire:    0xffb020,
  rocket:  0x9aa7ff,
};

const rampCache = new Map();

/** Hard-banded 1D ramp (cel shading). Nearest filtering = crisp shadow edge. */
export function ramp(steps = 3) {
  let t = rampCache.get(steps);
  if (t) return t;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    const v = Math.round(146 + (109 * i) / Math.max(1, steps - 1));
    data[i] = Math.min(255, v);
  }
  t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  rampCache.set(steps, t);
  return t;
}

const matCache = new Map();

/** Toon material, cached per option key. */
export function toon(color, o = {}) {
  const steps = o.steps ?? 3;
  const key = `${color}|${steps}|${o.emissive ?? 0}|${o.flat ?? false}|${o.opaque ?? 1}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({
    color,
    gradientMap: ramp(steps),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    flatShading: !!o.flat,
    transparent: (o.opaque ?? 1) < 1,
    opacity: o.opaque ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  matCache.set(key, m);
  return m;
}

const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
const inkSoft = new THREE.MeshBasicMaterial({ color: 0x3b2a52, side: THREE.BackSide });

/** Inverted-hull outline: a slightly fattened copy drawn from the inside. */
export function ink(mesh, grow = 0.028, soft = false) {
  const shell = new THREE.Mesh(mesh.geometry, soft ? inkSoft : inkMat);
  shell.scale.setScalar(1 + grow);
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.renderOrder = -1;
  mesh.add(shell);
  return shell;
}

/** Mesh factory: geometry + toon skin + optional outline, in one call. */
export function part(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, toon(color, o));
  m.castShadow = o.shadow !== false;
  m.receiveShadow = !!o.receive;
  if (o.ink !== 0) ink(m, o.ink ?? 0.028);
  return m;
}

/** Draw a CanvasTexture once, at load time - no per-frame canvas work. */
export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const springState = () => ({ p: 0, v: 0 });

/** Critically-tunable spring toward 0. Used for squash, sway, jiggle axes. */
export function spring(s, target, k, d, dt) {
  const a = (target - s.p) * k - s.v * d;
  s.v += a * dt;
  s.p += s.v * dt;
  return s.p;
}

/** Spring toward an explicit target with an injected acceleration kick. */
export function springKick(s, target, accel, k, d, dt) {
  const a = (target - s.p) * k - s.v * d + accel;
  s.v += a * dt;
  s.v = THREE.MathUtils.clamp(s.v, -40, 40);
  s.p += s.v * dt;
  return s.p;
}

export { springState };
