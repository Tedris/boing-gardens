// The look: a PS1-era picture, not a cartoon.
//
// Three things make it, and all three live here so the rest of the codebase can
// stay ordinary three.js:
//
//   1. flat-shaded Lambert under exactly one light - no ramp, no gradient map,
//      so a face is one flat value and a box corner snaps between two;
//   2. a screen-space vertex snap, which drags every vertex onto a coarse grid
//      so edges crawl as she moves instead of sliding sub-pixel smooth;
//   3. one post pass: the scene renders into a 240-row buffer, and the upscale
//      sRGB-encodes, dithers with a Bayer 4x4 matrix and quantises to 31 levels,
//      which is where the banding and the sparkle on gradients come from.
//
// There are no ink outlines: at 240 rows the pixel grid is the silhouette, and a
// hull outline just makes everything fatter than it is.
import * as THREE from '../vendor/three.module.js';

export const PIXEL_H = 240;   // internal rows; the width follows the aspect
export const SNAP = 2;        // vertex-snap block, in internal pixels

// palette - original, muted and cold: one lit figure on a dark stage. The key
// names are the ones roster.js tints against, so renaming one is a roster bug.
export const C = {
  ink:     0x0b0f16,   // the void: eyes, and anything meant to read as a hole
  prop:    0x161d28,   // props and silhouettes, one step up from a hole
  skin:    0xd9a878,
  skinDk:  0xb08358,
  hair:    0x1f5a66,   // teal bob, kept: it is the one thing that is unmistakably hers
  hairLt:  0x2c7280,
  top:     0xc94f6d,   // rose: the figure has to pop against a slate stage
  topDk:   0x9c3a53,
  shorts:  0x465075,
  shortsDk:0x333c5c,
  shoe:    0xa83f4e,
  sock:    0xd8d2bc,
  shoeSo:  0x12161f,
  eye:     0xe8e6dd,
  pupil:   0x121722,
  mouth:   0x6d2a3c,
  blush:   0xb4526a,
  grassDk: 0x2a3632,
  leafLt:  0x3b5d47,
  brick:   0x5a3f3a,
  stone:   0x4b5259,
  flower:  0xb9b39c,
  cloud:   0x3c4654,
  ropeA:   0xf2ecd2,   // cream: unlit and fog-exempt so the sweep stays the brightest thing on screen
  hedge:   0x27402f,
  star:    0xcfd6e0,
  fire:    0xd8823a,
  rocket:  0x7b86c4,
  sky:     0x232c38,   // fog colour, so the horizon dissolves instead of ending
  skyHi:   0x121822,   // the same sky after most of the air has gone
  floor:   0x35433d,
};

/** Shared snap grid. createPost().resize() writes it; materials read it live, so
 *  a window resize changes the crawl without recompiling a single shader. */
const uSnapGrid = { value: new THREE.Vector2(160, PIXEL_H / (2 * SNAP)) };

const snapPatch = (shader) => {
  shader.uniforms.uSnapGrid = uSnapGrid;
  shader.vertexShader = 'uniform vec2 uSnapGrid;\n' + shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
    {
      vec4 ndc = gl_Position / gl_Position.w;
      ndc.xy = floor( ndc.xy * uSnapGrid + 0.5 ) / uSnapGrid;
      gl_Position.xy = ndc.xy * gl_Position.w;   // w preserved: no second divide
    }`,
  );
};

/**
 * The only world material. Cached per option key, so a hundred boxes share nine
 * programs. `snap: false` opts out for anything that must stay register-stable
 * (the shadow disc, screen-space quads); `fog: false` is for the rope, which is
 * the one object allowed to be brighter than its surroundings at any height.
 */
const matCache = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.snap === false ? 0 : 1}|${o.fog === false ? 0 : 1}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    fog: o.fog !== false,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.snap !== false) {
    m.onBeforeCompile = snapPatch;
    m.customProgramCacheKey = () => 'ps1-snap';   // keeps snapped/unsnapped variants apart
  }
  matCache.set(key, m);
  return m;
}

/** Mesh factory: geometry + flat skin, in one call. `basic` is for unlit things
 *  (the rope, anything that should ignore the stage's single lamp). Nothing casts
 *  or receives a shadow: one light, no shadow maps, the ground blob is a disc. */
export function part(geo, color, o = {}) {
  const m = o.basic
    ? new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, fog: o.fog !== false, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    }))
    : new THREE.Mesh(geo, mat(color, o));
  m.userData.col = color;      // the roster recolours by base palette value
  return m;
}

const BAYER_FRAG = `
  uniform sampler2D tDiffuse;
  uniform vec2 uInternalRes;
  uniform vec2 uShake;
  varying vec2 vUv;

  vec3 toSRGB( vec3 c ) {
    return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
  }
  float bayer4( vec2 p ) {
    const mat4 m = mat4( vec4( 0.0, 12.0, 3.0, 15.0 ), vec4( 8.0, 4.0, 11.0, 7.0 ),
                         vec4( 2.0, 14.0, 1.0, 13.0 ), vec4( 10.0, 6.0, 9.0, 5.0 ) );
    int x = int( mod( p.x, 4.0 ) ); int y = int( mod( p.y, 4.0 ) );
    return m[y][x] / 16.0;
  }
  void main() {
    vec3 c = toSRGB( texture2D( tDiffuse, vUv + uShake ).rgb );
    // the pattern is indexed in buffer pixels, never in output pixels: shaking
    // the picture must not swim the dither cell under the grid it belongs to
    vec2 cell = floor( vUv * uInternalRes );
    vec3 q = floor( c * 31.0 + bayer4( cell ) ) / 31.0;
    gl_FragColor = vec4( q, 1.0 );
  }`;

/**
 * The buffer and the one pass that leaves it. Everything else in the codebase
 * keeps calling `look.render(scene, camera)` and forgets the trick exists.
 */
export function createPost(renderer, w, h) {
  let internalW = Math.max(2, Math.round(PIXEL_H * w / h));
  const rt = new THREE.WebGLRenderTarget(internalW, PIXEL_H, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,   // the pass encodes, so the buffer must not
    depthBuffer: true,
  });

  const uniforms = {
    tDiffuse: { value: rt.texture },
    uInternalRes: { value: new THREE.Vector2(internalW, PIXEL_H) },
    uShake: { value: new THREE.Vector2(0, 0) },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: BAYER_FRAG,
      depthTest: false,
      depthWrite: false,
    }),
  );
  quad.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(quad);
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    /** Shake in output pixels: divided back down to buffer pixels so one jolt is
     *  one jolt at any resolution. */
    render(scene, camera, shakePx = 0) {
      uniforms.uShake.value.set(shakePx / w, shakePx / h);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(passScene, passCamera);
    },
    resize(width, height) {
      w = width; h = height;
      internalW = Math.max(2, Math.round(PIXEL_H * w / h));
      rt.setSize(internalW, PIXEL_H);
      uniforms.uInternalRes.value.set(internalW, PIXEL_H);
      uSnapGrid.value.set(internalW / (2 * SNAP), PIXEL_H / (2 * SNAP));
    },
    get internalWidth() { return internalW; },
  };
}

const springState = () => ({ p: 0, v: 0 });

/** Critically-tunable spring toward 0. Used for squash, sway, hair axes. */
export function spring(s, target, k, d, dt) {
  s.v += (target - s.p) * k * dt;
  s.v -= s.v * d * dt;
  s.p += s.v * dt;
  return s.p;
}

/** Spring toward an explicit target with an injected acceleration kick. */
export function springKick(s, target, accel, k, d, dt) {
  s.v += accel * dt + (target - s.p) * k * dt;
  s.v -= s.v * d * dt;
  s.p += s.v * dt;
  return s.p;
}

export { springState };
