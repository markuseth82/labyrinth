// Labyrinth: walled city in an endless maze, with a hunter. See tasks/001-labyrinth-world.md.
// THREE is the global from vendor/three.min.js (r160), so the page runs from file:// with no build step.
(function () {
'use strict';

const QS = new URLSearchParams(location.search);
const MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent);
const LOW = QS.get('q') === 'low' || (MOBILE && QS.get('q') !== 'high');

// ---------------------------------------------------------------- constants
const C = 26;                 // maze cell pitch (m)
const T = 5;                  // maze wall thickness
const N = LOW ? 241 : 401;    // cells per side (odd: centre cell sits on the origin)
const HALF = (N - 1) / 2;
const NN = N * N;
const W = N * C / 2;          // half extent of the built maze
const RIN = 700, ROUT = 740;  // city wall radii
const WALLH = 120;
const RVOID = 785;            // maze cells start beyond this radius
const GW = 16;                // gate half width
const EYE = 1.7;
const FOG = 0xb4b5b3;

// ---------------------------------------------------------------- random
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261110);
const rr = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const canvasEl = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG, LOW ? 0.00036 : 0.00023);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 22000);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xe3e6ea, 0x4c4741, 2.3);
scene.add(hemi);
const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.36).normalize();
const sun = new THREE.DirectionalLight(0xfff0de, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
sun.shadow.camera.near = 100; sun.shadow.camera.far = 6000;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
let shadowSize = 0;
function aimSun(fx, fz, size) {
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx + SUN_DIR.x * 3000, SUN_DIR.y * 3000, fz + SUN_DIR.z * 3000);
  if (Math.abs(size - shadowSize) > shadowSize * 0.1) {
    shadowSize = size;
    const sc = sun.shadow.camera;
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.updateProjectionMatrix();
    sun.shadow.normalBias = size / 350;
  }
}

// ---------------------------------------------------------------- textures
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function addNoise(ctx, w, h, amp) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function toTex(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function makeConcrete(size, rgb, o = {}) {
  const { px = 4, py = 6, streaks = 140, rust = 30, cracks = 14, seams = 0.45 } = o;
  const cv = mkCanvas(size, size), g = cv.getContext('2d');
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = Math.random() < 0.6 ? '0,0,0' : '255,250,240';
    gr.addColorStop(0, `rgba(${c},${0.05 + Math.random() * 0.09})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const streak = (col, n) => {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * size, y = Math.random() * size, len = 50 + Math.random() * 380, w = 2 + Math.random() * 9;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(${col},${0.12 + Math.random() * 0.2})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x, y, w, len);
    }
  };
  streak('18,14,10', streaks); streak('112,62,30', rust);
  if (seams > 0) {
    const sx = size / px, sy = size / py;
    for (let i = 0; i < px; i++) {
      g.fillStyle = `rgba(0,0,0,${seams})`; g.fillRect(i * sx, 0, 3, size);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(i * sx + 3, 0, 2, size);
    }
    for (let j = 0; j < py; j++) {
      g.fillStyle = `rgba(0,0,0,${seams})`; g.fillRect(0, j * sy, size, 3);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, j * sy + 3, size, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < px; i++) for (let j = 0; j < py; j++) {
      for (const [ox, oy] of [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]]) {
        g.beginPath(); g.arc((i + ox) * sx, (j + oy) * sy, 2.5, 0, 6.3); g.fill();
      }
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < cracks; i++) {
    let x = Math.random() * size, y = Math.random() * size, a = Math.random() * 6.3;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 40; k++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); }
    g.stroke();
  }
  addNoise(g, size, size, 26);
  return cv;
}
// Facade: 1024 px = 32 m, 8 windows x 8 floors (4 m pitch). Window rows start 1 m below each floor line.
function makeFacade(rgb, slit) {
  const cv = makeConcrete(1024, rgb, { px: 8, py: 8, streaks: 90, rust: 16, cracks: 6, seams: 0.2 });
  const g = cv.getContext('2d'), P = 128;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const x0 = i * P + (slit ? 50 : 32), ww = slit ? 28 : 64, y0 = j * P + 32, hh = 58;
    const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
    const d = 14 + Math.random() * 16;
    gr.addColorStop(0, `rgb(${d},${d + 2},${d + 5})`); gr.addColorStop(1, `rgb(${d + 14},${d + 16},${d + 19})`);
    g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
    g.strokeStyle = '#0b0b0b'; g.lineWidth = 3; g.strokeRect(x0, y0, ww, hh);
    if (!slit) { g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + ww / 2, y0); g.lineTo(x0 + ww / 2, y0 + hh); g.moveTo(x0, y0 + hh * 0.4); g.lineTo(x0 + ww, y0 + hh * 0.4); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x0 - 5, y0 + hh + 1, ww + 10, 4);
    const sg = g.createLinearGradient(0, y0 + hh + 5, 0, y0 + hh + 36);
    sg.addColorStop(0, 'rgba(15,10,6,0.35)'); sg.addColorStop(1, 'rgba(15,10,6,0)');
    g.fillStyle = sg; g.fillRect(x0 + Math.random() * ww * 0.6, y0 + hh + 5, 6 + Math.random() * 14, 31);
  }
  for (let j = 0; j < 8; j++) { g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, j * P + 122, 1024, 6); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, j * P + 119, 1024, 3); }
  return cv;
}
// Emissive: 512 px = 128 m, 32 x 32 windows; a few lit. Lit area sits inside both window shapes.
function makeEmis() {
  const cv = mkCanvas(512, 512), g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    if (Math.random() > 0.07) continue;
    const b = 0.5 + Math.random() * 0.5;
    g.fillStyle = `rgb(${255 * b | 0},${(170 + Math.random() * 40) * b | 0},${(80 + Math.random() * 50) * b | 0})`;
    g.fillRect(i * 16 + 6.5, j * 16 + 4.5, 3.4, 6.4);
  }
  return cv;
}
function makeMetal() {
  const cv = makeConcrete(512, [46, 43, 40], { px: 8, py: 4, streaks: 60, rust: 90, cracks: 0, seams: 0.6 });
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(150,140,125,0.55)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) { g.beginPath(); g.arc(i * 64 + 10, j * 32 + 16, 3, 0, 6.3); g.fill(); g.beginPath(); g.arc(i * 64 + 54, j * 32 + 16, 3, 0, 6.3); g.fill(); }
  return cv;
}
function makeFar() {
  const cv = mkCanvas(1024, 1024), g = cv.getContext('2d'), P = 1024 / 48;
  g.fillStyle = 'rgb(47,45,42)'; g.fillRect(0, 0, 1024, 1024);
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
    const v = 96 + Math.random() * 34; g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
    if (Math.random() < 0.5) g.fillRect((i + 1) * P - 2.5, j * P - 2.5, 5, P + 5);
    if (Math.random() < 0.5) g.fillRect(i * P - 2.5, (j + 1) * P - 2.5, P + 5, 5);
  }
  addNoise(g, 1024, 1024, 14);
  return cv;
}
function makeSky() {
  const cv = mkCanvas(1024, 512), g = cv.getContext('2d');
  const fog = '#' + FOG.toString(16);
  g.fillStyle = '#a9acb0'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 1024, y = Math.random() * 250, r = 30 + Math.random() * 130;
    const c = Math.random() < 0.5 ? '236,237,238' : '112,116,122';
    for (const ox of [-1024, 0, 1024]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, `rgba(${c},0.1)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  const gr = g.createLinearGradient(0, 130, 0, 250);
  gr.addColorStop(0, 'rgba(180,181,179,0)'); gr.addColorStop(1, fog);
  g.fillStyle = gr; g.fillRect(0, 130, 1024, 126);
  g.fillStyle = fog; g.fillRect(0, 250, 1024, 262);
  // canvas gradients are dithered per texel, which shows as a lattice on a flat sky: average it away
  const small = mkCanvas(256, 128); small.getContext('2d').drawImage(cv, 0, 0, 256, 128);
  return small;
}

const texWall = toTex(makeConcrete(1024, [96, 93, 88]));
const texWallTop = toTex(makeConcrete(512, [112, 109, 103], { px: 2, py: 2, streaks: 20, rust: 4, cracks: 10, seams: 0.25 }));
const texStone = toTex(makeConcrete(1024, [104, 99, 91], { px: 4, py: 8, streaks: 200, rust: 60 }));
const texSlate = toTex(makeConcrete(512, [52, 52, 56], { px: 8, py: 16, streaks: 40, rust: 6, cracks: 0, seams: 0.5 }));
const texRoof = toTex(makeConcrete(512, [58, 56, 53], { px: 2, py: 2, streaks: 0, rust: 8, cracks: 6, seams: 0.3 }));
const texFacA = toTex(makeFacade([118, 112, 103], false));
const texFacB = toTex(makeFacade([92, 90, 88], true));
const texEmis = toTex(makeEmis());
const texGround = toTex(makeConcrete(1024, [74, 70, 64], { px: 4, py: 4, streaks: 0, rust: 20, cracks: 30, seams: 0.3 }));
const texMetal = toTex(makeMetal());
const texFar = toTex(makeFar());
const texBlack = toTex(mkCanvas(2, 2));

// Standard material textured by position instead of UVs, so instanced boxes of any size keep a
// constant texel density. local=true projects in the box's own frame (for rotated city pieces);
// local=false projects in world space (maze walls: overlapping runs then match exactly).
function triMat({ side, top = side, emis = texBlack, scale, local = false, ao = 14, aoMin = 0.5, emisStrength = 0, color = 0xffffff, rough = 0.95, metal = 0 }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tSide: { value: side }, tTop: { value: top }, tEmis: { value: emis },
      uScale: { value: scale }, uAO: { value: ao }, uAOMin: { value: aoMin }, uEmis: { value: emisStrength },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vTP; varying vec3 vTN; varying float vWY; varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
mat4 tm = modelMatrix * instanceMatrix;
#else
mat4 tm = modelMatrix;
#endif
vec4 twp = tm * vec4(position, 1.0);
vWY = twp.y;
${local ? `vec3 tsc = vec3(length(tm[0].xyz), length(tm[1].xyz), length(tm[2].xyz));
vTP = position * tsc; vTN = normal;
vSeed = fract(sin(dot(tm[3].xz, vec2(12.9898, 78.233))) * 43758.5453);`
    : `vTP = twp.xyz; vTN = normalize(mat3(tm) * normal); vSeed = 0.0;`}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tSide; uniform sampler2D tTop; uniform sampler2D tEmis;
uniform float uScale; uniform float uAO; uniform float uAOMin; uniform float uEmis;
varying vec3 vTP; varying vec3 vTN; varying float vWY; varying float vSeed;`)
      .replace('#include <map_fragment>', `vec3 tan3 = abs(vTN);
bool isTop = tan3.y > 0.7;
vec2 tuv;
if (isTop) tuv = vTP.xz; else if (tan3.x > tan3.z) tuv = vec2(vTP.z, vWY); else tuv = vec2(vTP.x, vWY);
tuv.x += floor(vSeed * 32.0) * 4.0;
vec4 tcolS = texture2D(tSide, tuv * uScale);
vec4 tcolT = texture2D(tTop, tuv * uScale);
diffuseColor *= isTop ? tcolT : tcolS;
diffuseColor.rgb *= mix(uAOMin, 1.0, smoothstep(0.0, uAO, vWY));`)
      .replace('#include <emissivemap_fragment>', `vec3 temis = texture2D(tEmis, tuv / 128.0).rgb;
if (!isTop) totalEmissiveRadiance += temis * uEmis;`);
  };
  m.customProgramCacheKey = () => 'tri' + (local ? 'L' : 'W');
  return m;
}

const matMaze = triMat({ side: texWall, top: texWallTop, scale: 1 / 24, ao: 16, aoMin: 0.42 });
const matStone = triMat({ side: texStone, top: texWallTop, scale: 1 / 28, local: true, ao: 30, aoMin: 0.55 });
const matFacA = triMat({ side: texFacA, top: texRoof, emis: texEmis, scale: 1 / 32, local: true, ao: 24, aoMin: 0.5, emisStrength: 5 });
const matFacB = triMat({ side: texFacB, top: texRoof, emis: texEmis, scale: 1 / 32, local: true, ao: 24, aoMin: 0.5, emisStrength: 5 });
const matSlate = triMat({ side: texSlate, top: texSlate, scale: 1 / 12, local: true, ao: 1, aoMin: 1 });
const matRoofBits = triMat({ side: texRoof, top: texRoof, scale: 1 / 10, local: true, ao: 1, aoMin: 1 });
const matMetal = triMat({ side: texMetal, top: texMetal, scale: 1 / 16, local: true, ao: 20, aoMin: 0.6, rough: 0.7, metal: 0.5 });
const matLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.55) });

// ---------------------------------------------------------------- instancing
class Batch {
  constructor() { this.a = []; }
  add(x, y, z, sx, sy, sz, rot = 0, tint = 1) { this.a.push(x, y, z, sx, sy, sz, rot, tint); }
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const pyrGeo = (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).toNonIndexed(); g.rotateY(Math.PI / 4); g.computeVertexNormals(); return g; })();
const tmpCol = new THREE.Color();
let instanceTotal = 0;
function build(batch, geo, mat, { chunk = 0, cast = true, tinted = false } = {}) {
  const a = batch.a, n = a.length / 8;
  const groups = new Map();
  for (let k = 0; k < n; k++) {
    const key = chunk ? Math.floor(a[k * 8] / chunk) * 1000 + Math.floor(a[k * 8 + 2] / chunk) : 0;
    let g = groups.get(key); if (!g) { g = []; groups.set(key, g); }
    g.push(k);
  }
  for (const g of groups.values()) {
    const im = new THREE.InstancedMesh(geo, mat, g.length), m = im.instanceMatrix.array;
    for (let q = 0; q < g.length; q++) {
      const o = g[q] * 8, c = Math.cos(a[o + 6]), s = Math.sin(a[o + 6]), p = q * 16;
      m[p] = c * a[o + 3]; m[p + 1] = 0; m[p + 2] = -s * a[o + 3]; m[p + 3] = 0;
      m[p + 4] = 0; m[p + 5] = a[o + 4]; m[p + 6] = 0; m[p + 7] = 0;
      m[p + 8] = s * a[o + 5]; m[p + 9] = 0; m[p + 10] = c * a[o + 5]; m[p + 11] = 0;
      m[p + 12] = a[o]; m[p + 13] = a[o + 1]; m[p + 14] = a[o + 2]; m[p + 15] = 1;
      if (tinted) { const t = a[o + 7], w = Math.random() - 0.5; im.setColorAt(q, tmpCol.setRGB(t * (1 + 0.1 * w), t, t * (1 - 0.14 * w))); }
    }
    im.castShadow = cast; im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    instanceTotal += g.length;
  }
}

// ---------------------------------------------------------------- collision store (city + gates)
const obbs = [];              // [cx, cz, hx, hz, cos, sin]; local x axis = (cos, sin)
const obbHash = new Map(), HS = 64;
function addObb(x, z, hx, hz, a) {
  const id = obbs.length; obbs.push([x, z, hx, hz, Math.cos(a), Math.sin(a)]);
  const r = Math.hypot(hx, hz);
  for (let gx = Math.floor((x - r) / HS); gx <= Math.floor((x + r) / HS); gx++)
    for (let gz = Math.floor((z - r) / HS); gz <= Math.floor((z + r) / HS); gz++) {
      const key = (gx + 2048) * 4096 + gz + 2048;
      let l = obbHash.get(key); if (!l) { l = []; obbHash.set(key, l); }
      l.push(id);
    }
}
// Box placed in polar coordinates: a = angle, r = radial distance, t = tangential offset.
// sr = size along the radial direction, st = size along the tangent.
function pbox(batch, a, r, t, y0, y1, sr, st, tint = 1, solid = false) {
  const x = r * Math.cos(a) - t * Math.sin(a), z = r * Math.sin(a) + t * Math.cos(a);
  batch.add(x, (y0 + y1) / 2, z, sr, y1 - y0, st, -a, tint);
  if (solid) addObb(x, z, sr / 2, st / 2, a);
  return [x, z];
}

// ---------------------------------------------------------------- maze
const mz = new Uint8Array(NN), wallE = new Uint8Array(NN), wallS = new Uint8Array(NN), towerV = new Uint8Array(NN);
const cc = (i) => (i - HALF) * C;       // cell index -> centre coordinate
const gateCells = [];
function generateMaze() {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cc(i), z = cc(j);
    mz[j * N + i] = x * x + z * z >= RVOID * RVOID ? 1 : 0;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = j * N + i;
    wallE[c] = i < N - 1 ? (mz[c] | mz[c + 1]) : mz[c];
    wallS[c] = j < N - 1 ? (mz[c] | mz[c + N]) : mz[c];
  }
  // gates on +x, +z, -x, -z: open the edge between the first maze cell and the moat
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    let i = HALF, j = HALF;
    while (!mz[j * N + i]) { i += dx; j += dz; }
    const c = j * N + i; gateCells.push(c);
    if (dx === 1) wallE[c - 1] = 0; else if (dx === -1) wallE[c] = 0; else if (dz === 1) wallS[c - N] = 0; else wallS[c] = 0;
  }
  // growing-tree carve: mostly newest cell (long corridors), sometimes a random one (branching)
  const vis = new Uint8Array(NN), stack = new Int32Array(NN), cand = new Int32Array(4);
  let sp = 0; vis[gateCells[0]] = 1; stack[sp++] = gateCells[0];
  while (sp) {
    const pick = rnd() < 0.72 ? sp - 1 : (rnd() * sp) | 0, c = stack[pick], i = c % N;
    let cnt = 0;
    if (i > 0 && mz[c - 1] && !vis[c - 1]) cand[cnt++] = c - 1;
    if (i < N - 1 && mz[c + 1] && !vis[c + 1]) cand[cnt++] = c + 1;
    if (c >= N && mz[c - N] && !vis[c - N]) cand[cnt++] = c - N;
    if (c + N < NN && mz[c + N] && !vis[c + N]) cand[cnt++] = c + N;
    if (!cnt) { stack[pick] = stack[--sp]; continue; }
    const n = cand[(rnd() * cnt) | 0];
    if (n === c + 1) wallE[c] = 0; else if (n === c - 1) wallE[n] = 0; else if (n === c + N) wallS[c] = 0; else wallS[n] = 0;
    vis[n] = 1; stack[sp++] = n;
  }
  // extra openings so there are loops to run around
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const c = j * N + i; if (!mz[c]) continue;
    if (mz[c + 1] && wallE[c] && rnd() < 0.05) wallE[c] = 0;
    if (mz[c + N] && wallS[c] && rnd() < 0.05) wallS[c] = 0;
  }
}
const wallHeightAt = (x, z) => 15 + 30 * vnoise(x / 520 + 71, z / 520 + 13);
function buildMaze() {
  const walls = new Batch(), lamps = new Batch(), caps = new Batch(), roofs = new Batch();
  const runHeight = (x, z) => {
    let h = wallHeightAt(x, z) * (0.8 + rnd() * 0.5);
    if (rnd() < 0.035) h += 28 + rnd() * 34;
    return h;
  };
  for (let j = 0; j < N; j++) {
    let i = 0;
    while (i < N) {
      if (!wallS[j * N + i]) { i++; continue; }
      const s = i, len = 2 + ((rnd() * 6) | 0);
      while (i < N && wallS[j * N + i] && i - s < len) i++;
      const x0 = cc(s) - C / 2 - T / 2, x1 = cc(i - 1) + C / 2 + T / 2, z = cc(j) + C / 2, mx = (x0 + x1) / 2;
      const h = runHeight(mx, z);
      walls.add(mx, h / 2, z, x1 - x0, h, T);
      if (rnd() < 0.09) lamps.add(mx + rr(-8, 8), rr(5, 9), z + (rnd() < 0.5 ? 1 : -1) * (T / 2 + 0.25), 0.9, 1.3, 0.5);
    }
  }
  for (let i = 0; i < N; i++) {
    let j = 0;
    while (j < N) {
      if (!wallE[j * N + i]) { j++; continue; }
      const s = j, len = 2 + ((rnd() * 6) | 0);
      while (j < N && wallE[j * N + i] && j - s < len) j++;
      const z0 = cc(s) - C / 2 - T / 2, z1 = cc(j - 1) + C / 2 + T / 2, x = cc(i) + C / 2, mzc = (z0 + z1) / 2;
      const h = runHeight(x, mzc);
      walls.add(x, h / 2, mzc, T, h, z1 - z0);
      if (rnd() < 0.09) lamps.add(x + (rnd() < 0.5 ? 1 : -1) * (T / 2 + 0.25), rr(5, 9), mzc + rr(-8, 8), 0.5, 1.3, 0.9);
    }
  }
  // towers on wall junctions (vertex at the south-east corner of cell c)
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const c = j * N + i;
    if (!(wallS[c] && wallE[c]) || rnd() > 0.02) continue;
    const x = cc(i) + C / 2, z = cc(j) + C / 2, h = wallHeightAt(x, z) + 22 + rnd() * 30;
    towerV[c] = 1;
    walls.add(x, h / 2, z, 8, h, 8);
    caps.add(x, h + 1, z, 10, 2, 10);
    if (rnd() < 0.5) roofs.add(x, h + 2 + 5, z, 9, 10, 9);
    lamps.add(x + (rnd() < 0.5 ? 4.2 : -4.2), h - 4, z, 0.5, 1.6, 1.2);
  }
  build(walls, boxGeo, matMaze, { chunk: 1040 });
  build(caps, boxGeo, matMaze, { chunk: 2080 });
  build(roofs, pyrGeo, matSlate, { chunk: 2080 });
  build(lamps, boxGeo, matLamp, { chunk: 2080, cast: false });
}

// ---------------------------------------------------------------- city
function buildCity() {
  const bA = new Batch(), bB = new Batch(), stone = new Batch(), spires = new Batch(), bits = new Batch(), metal = new Batch(), lamps = new Batch();
  const round4 = (h) => Math.max(8, Math.round(h / 4) * 4);
  const roofBits = (a, r, w, d, top) => {
    const n = 1 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) pbox(bits, a, r + rr(-0.3, 0.3) * d, rr(-0.3, 0.3) * w, top, top + rr(1.5, 5), rr(2, 6), rr(2, 6));
    if (rnd() < 0.2) pbox(bits, a, r + rr(-0.3, 0.3) * d, rr(-0.3, 0.3) * w, top, top + rr(8, 22), 0.5, 0.5);
  };
  for (let r = 150; r < RIN - 28; r += 36) {
    const n = Math.floor(2 * Math.PI * r / rr(30, 38)), off = rnd() * 6.283, d = 29, w = 2 * Math.PI * r / n - 6;
    const f = 1 - (r - 130) / (RIN - 130);
    for (let k = 0; k < n; k++) {
      const a = off + k / n * 2 * Math.PI;
      let skip = false;
      for (let g = 0; g < 4; g++) { const da = a - g * Math.PI / 2; if (Math.cos(da) > 0 && Math.abs(r * Math.sin(da)) < w / 2 + 7) skip = true; }
      if (skip) continue;
      const B = rnd() < 0.55 ? bA : bB, tint = 0.6 + rnd() * 0.42;
      const h = round4(14 + 300 * Math.pow(f, 2.2) * (0.5 + rnd()) + rnd() * 22);
      addObb(r * Math.cos(a), r * Math.sin(a), d / 2, w / 2, a);
      if (h < 60 && rnd() < 0.5) {
        for (const dr of [-1, 1]) for (const dt of [-1, 1]) {
          const hh = round4(h * (0.4 + rnd() * 0.8));
          pbox(rnd() < 0.5 ? bA : bB, a, r + dr * d / 4, dt * w / 4, 0, hh, d / 2 - 0.5, w / 2 - 0.5, tint * (0.85 + rnd() * 0.3));
          if (rnd() < 0.5) roofBits(a, r + dr * d / 4, w / 2, d / 2, hh);
        }
        continue;
      }
      const h1 = h > 50 && rnd() < 0.7 ? round4(h * (0.5 + rnd() * 0.3)) : h;
      pbox(B, a, r, 0, 0, h1, d, w, tint);
      let tw = w, td = d, top = h1;
      if (h1 < h) {
        tw = w * 0.72; td = d * 0.72; top = h;
        pbox(B, a, r, 0, h1, h, td, tw, tint);
        if (h > 150 && rnd() < 0.5) { tw *= 0.6; td *= 0.6; top = round4(h * 1.22); pbox(B, a, r, 0, h, top, td, tw, tint); }
      }
      if (rnd() < (f > 0.55 ? 0.5 : 0.1)) {
        const s = Math.min(tw, td) * 0.85, sh = s * rr(1.5, 3.5);
        const [x, z] = [r * Math.cos(a), r * Math.sin(a)];
        spires.add(x, top + sh / 2, z, s, sh, s, -a);
      } else roofBits(a, r, tw, td, top);
    }
  }
  // citadel
  const tower = (a, r, w, H, tiers) => {
    let y = 0, tw = w;
    for (let t = 0; t < tiers; t++) {
      const y1 = H * (0.5 + 0.5 * t / (tiers - 1));
      pbox(t % 2 ? bB : bA, a, r, 0, y, y1, tw, tw, 0.55 + 0.06 * t, t === 0);
      if (t < tiers - 1) for (const s of [-1, 1]) {      // corner pinnacles on each setback
        for (const q of [-1, 1]) { const [x, z] = pbox(stone, a, r + s * tw * 0.44, q * tw * 0.44, y1, y1 + 14, tw * 0.1, tw * 0.1); spires.add(x, y1 + 14 + tw * 0.15, z, tw * 0.12, tw * 0.3, tw * 0.12, -a); }
      }
      y = y1; tw *= 0.76;
    }
    const x = r * Math.cos(a), z = r * Math.sin(a), s = tw / 0.76 * 0.9;
    spires.add(x, H + H * 0.11, z, s, H * 0.22, s, -a);
    bits.add(x, H + H * 0.22 + 20, z, 0.8, 40, 0.8);
    for (const s2 of [-1, 1]) {                           // ribs up the first tier
      pbox(stone, a, r + s2 * (w / 2 + 1.5), 0, 0, H * 0.5 + 18, 4, w * 0.22);
      pbox(stone, a, r, s2 * (w / 2 + 1.5), 0, H * 0.5 + 18, w * 0.22, 4);
    }
  };
  tower(0, 0, 96, 620, 5);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + Math.PI / 6, H = round4(rr(300, 460));
    tower(a, 100, 44, H, 3);
    const by = rr(130, 250);
    pbox(stone, a, 63, 0, by, by + 9, 34, 9);             // bridge to the keep
    pbox(stone, a, 63, 0, by - 26, by, 3, 9);
  }
  // wall ring (4 arcs between the gates) with proper UVs
  {
    const pos = [], nor = [], uv = [], idx = [], S = 56, dlt = Math.asin(GW / RIN), TS = 32;
    for (let g = 0; g < 4; g++) {
      const a0 = g * Math.PI / 2 + dlt, a1 = (g + 1) * Math.PI / 2 - dlt, base = pos.length / 3;
      for (let s = 0; s <= S; s++) {
        const a = a0 + (a1 - a0) * s / S, c = Math.cos(a), sn = Math.sin(a);
        pos.push(ROUT * c, 0, ROUT * sn, ROUT * c, WALLH, ROUT * sn, RIN * c, 0, RIN * sn, RIN * c, WALLH, RIN * sn, RIN * c, WALLH, RIN * sn, ROUT * c, WALLH, ROUT * sn);
        nor.push(c, 0, sn, c, 0, sn, -c, 0, -sn, -c, 0, -sn, 0, 1, 0, 0, 1, 0);
        uv.push(a * ROUT / TS, 0, a * ROUT / TS, WALLH / TS, a * RIN / TS, 0, a * RIN / TS, WALLH / TS, a * 720 / TS, 0, a * 720 / TS, (ROUT - RIN) / TS);
        if (s < S) { const o = base + s * 6; idx.push(o, o + 1, o + 6, o + 1, o + 7, o + 6); for (const k of [2, 4]) idx.push(o + k, o + k + 6, o + k + 1, o + k + 1, o + k + 6, o + k + 7); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.95, side: THREE.DoubleSide }));
    ring.castShadow = ring.receiveShadow = true;
    scene.add(ring);
  }
  const nearGate = (a, r, lim) => { for (let g = 0; g < 4; g++) { const da = a - g * Math.PI / 2; if (Math.cos(da) > 0 && Math.abs(r * Math.sin(da)) < lim) return true; } return false; };
  for (let k = 0; k < 144; k++) {                         // buttresses
    const a = k / 144 * 2 * Math.PI + 0.01;
    if (!nearGate(a, ROUT, 60)) { pbox(stone, a, ROUT + 3, 0, 0, WALLH * 0.86, 8, 10); pbox(stone, a, ROUT + 7.5, 0, 0, WALLH * 0.45, 5, 12); }
  }
  for (let k = 0; k < 420; k++) {                         // merlons, both edges
    const a = k / 420 * 2 * Math.PI;
    if (nearGate(a, ROUT, GW)) continue;
    pbox(stone, a, ROUT - 1.5, 0, WALLH, WALLH + 3.5, 3, 6);
    if (k % 2) pbox(stone, a, RIN + 1, 0, WALLH, WALLH + 1.6, 2, 12);
  }
  for (let k = 0; k < 16; k++) {                          // guard towers
    const a = (k + 0.5) * Math.PI / 8;
    pbox(stone, a, ROUT + 8, 0, 0, WALLH + 38, 32, 34, 1, true);
    pbox(stone, a, ROUT + 8, 0, WALLH + 38, WALLH + 42, 36, 38);
    const [x, z] = pbox(bits, a, ROUT + 8, 0, WALLH + 42, WALLH + 44, 20, 20);
    spires.add(x, WALLH + 44 + 11, z, 22, 22, 22, -a);
    pbox(lamps, a, ROUT + 24.3, 0, WALLH + 20, WALLH + 24, 0.5, 3);
  }
  for (let g = 0; g < 4; g++) {                           // gates
    const a = g * Math.PI / 2;
    for (const s of [-1, 1]) {
      pbox(stone, a, 720, s * 30, 0, WALLH, 64, 28, 1, true);
      pbox(stone, a, ROUT + 3, s * 30, WALLH, WALLH + 45, 22, 24);
      const [x, z] = pbox(stone, a, ROUT + 3, s * 30, WALLH + 45, WALLH + 48, 26, 28);
      spires.add(x, WALLH + 48 + 13, z, 24, 26, 24, -a);
      pbox(metal, a, 760, s * (GW - 1.2), 0, 70, 16, 2.4, 1, true);    // doors standing open
      pbox(lamps, a, 752.4, s * 20, 14, 17, 0.5, 2);
      pbox(lamps, a, 687.6, s * 20, 14, 17, 0.5, 2);
    }
    pbox(stone, a, 720, 0, 70, WALLH, 60, GW * 2);
    pbox(metal, a, 720, 0, 62, 70, 6, GW * 2);                          // raised portcullis edge
  }
  build(bA, boxGeo, matFacA, { tinted: true });
  build(bB, boxGeo, matFacB, { tinted: true });
  build(stone, boxGeo, matStone);
  build(spires, pyrGeo, matSlate);
  build(bits, boxGeo, matRoofBits, { cast: false });
  build(metal, boxGeo, matMetal);
  build(lamps, boxGeo, matLamp, { cast: false });
}

// ---------------------------------------------------------------- ground + sky
function groundRect(x0, z0, x1, z1, mat, tile) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / tile, z0 / tile, x1 / tile, z0 / tile, x0 / tile, z1 / tile, x1 / tile, z1 / tile], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
}
let skyDome;
function buildGround() {
  groundRect(-W, -W, W, W, new THREE.MeshStandardMaterial({ map: texGround, roughness: 1 }), 40);
  const far = new THREE.MeshStandardMaterial({ map: texFar, roughness: 1 }), L = 30000, tile = 48 * C;
  groundRect(-L, -L, L, -W, far, tile); groundRect(-L, W, L, L, far, tile);
  groundRect(-L, -W, -W, W, far, tile); groundRect(W, -W, L, W, far, tile);
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(18000, 32, 16), new THREE.MeshBasicMaterial({ map: toTex(makeSky()), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  skyDome.renderOrder = -1; scene.add(skyDome);
}

// ---------------------------------------------------------------- collision
function pushBox(p, r, cx, cz, hx, hz, ca, sa) {
  const dx = p.x - cx, dz = p.z - cz;
  const lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca;
  const ex = lx - clamp(lx, -hx, hx), ez = lz - clamp(lz, -hz, hz), d2 = ex * ex + ez * ez;
  if (d2 >= r * r) return;
  let nx, nz, pen;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
  else {
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; pen = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = pz + r; }
  }
  p.x += (nx * ca - nz * sa) * pen; p.z += (nx * sa + nz * ca) * pen;
}
function collide(p, r) {
  for (let it = 0; it < 2; it++) {
    const ci = Math.round(p.x / C) + HALF, cj = Math.round(p.z / C) + HALF;
    for (let jj = cj - 1; jj <= cj + 1; jj++) for (let ii = ci - 1; ii <= ci + 1; ii++) {
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const c = jj * N + ii;
      if (wallE[c]) pushBox(p, r, cc(ii) + C / 2, cc(jj), T / 2, C / 2 + T / 2, 1, 0);
      if (wallS[c]) pushBox(p, r, cc(ii), cc(jj) + C / 2, C / 2 + T / 2, T / 2, 1, 0);
      if (towerV[c]) pushBox(p, r, cc(ii) + C / 2, cc(jj) + C / 2, 4, 4, 1, 0);
    }
    const l = obbHash.get((Math.floor(p.x / HS) + 2048) * 4096 + Math.floor(p.z / HS) + 2048);
    if (l) for (const id of l) { const o = obbs[id]; pushBox(p, r, o[0], o[1], o[2], o[3], o[4], o[5]); }
    // ring wall, except inside a gate passage (the gate towers bound that)
    const d = Math.hypot(p.x, p.z);
    if (d > RIN - r && d < ROUT + r) {
      const inGate = Math.min(Math.abs(p.x), Math.abs(p.z)) < GW;
      if (!inGate) { const t = (d < (RIN + ROUT) / 2 ? RIN - r : ROUT + r) / d; p.x *= t; p.z *= t; }
    }
    p.x = clamp(p.x, -W + 4, W - 4); p.z = clamp(p.z, -W + 4, W - 4);
  }
}

// ---------------------------------------------------------------- hunter
const dist = new Int32Array(NN), queue = new Int32Array(NN);
let floodTarget = -1, floodCount = 0;
function flood(t) {
  dist.fill(-1);
  let qh = 0, qt = 0; dist[t] = 0; queue[qt++] = t;
  while (qh < qt) {
    const c = queue[qh++], d = dist[c] + 1, i = c % N;
    if (i < N - 1 && !wallE[c] && mz[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d; queue[qt++] = c + 1; }
    if (i > 0 && !wallE[c - 1] && mz[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d; queue[qt++] = c - 1; }
    if (c + N < NN && !wallS[c] && mz[c + N] && dist[c + N] < 0) { dist[c + N] = d; queue[qt++] = c + N; }
    if (c >= N && !wallS[c - N] && mz[c - N] && dist[c - N] < 0) { dist[c - N] = d; queue[qt++] = c - N; }
  }
  floodTarget = t; floodCount = qt;
}
const hunter = { x: 0, z: 0, cur: -1, next: -1, viaCentre: false, active: false, sees: false, t: 0, group: null, arms: [], light: null };
function buildHunter() {
  const g = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 1.25, 5.2, 12), black); body.position.y = 3.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), black); head.scale.set(0.9, 1.4, 1); head.position.y = 6.3;
  g.add(body, head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.7, 0.3), fog: false });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), eyeMat); e.position.set(s * 0.2, 6.4, 0.47); g.add(e);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.7, 6), black); horn.position.set(s * 0.35, 7.5, -0.1); horn.rotation.z = -s * 0.35; g.add(horn);
    const pivot = new THREE.Group(); pivot.position.set(s * 0.55, 5.4, 0);
    const armGeo = new THREE.CylinderGeometry(0.1, 0.04, 4.6, 6); armGeo.translate(0, -2.3, 0);
    const arm = new THREE.Mesh(armGeo, black); pivot.rotation.z = s * 0.16; pivot.add(arm); g.add(pivot); hunter.arms.push(pivot);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  hunter.light = new THREE.PointLight(0xff2a14, 0, 60, 1.8); hunter.light.position.y = 5; g.add(hunter.light);
  g.scale.setScalar(1.45); g.visible = false;
  scene.add(g); hunter.group = g;
}
function spawnHunter(fromCell, minCells) {
  flood(fromCell);
  let cell = queue[floodCount - 1];
  for (let k = 0; k < floodCount; k++) if (dist[queue[k]] >= minCells) { cell = queue[k]; break; }
  hunter.cur = cell; hunter.next = -1; hunter.viaCentre = false; hunter.x = cc(cell % N); hunter.z = cc((cell / N) | 0);
  hunter.active = true; hunter.sees = false; hunter.group.visible = true;
}
function lineOfSight(a, b) {
  const ai = a % N, aj = (a / N) | 0, bi = b % N, bj = (b / N) | 0;
  if (ai === bi && Math.abs(aj - bj) <= 12) {
    for (let j = Math.min(aj, bj); j < Math.max(aj, bj); j++) if (wallS[j * N + ai]) return false;
    return true;
  }
  if (aj === bj && Math.abs(ai - bi) <= 12) {
    for (let i = Math.min(ai, bi); i < Math.max(ai, bi); i++) if (wallE[aj * N + i]) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- player + modes
const player = { x: 0, z: 0, yaw: 0, pitch: 0, stamina: 1, onWall: false, flyY: 300 };
const state = { mode: 'overview', hunted: false, survive: 0, caught: 0, caughtTimer: 0, orbit: 2.2, orbitR: 1750, orbitH: 720, bob: 0, fear: 0 };
const keys = new Set();
const touch = { move: null, look: null, mx: 0, my: 0, sprint: false };
const $ = (id) => document.getElementById(id);

function playerCell() {
  if (state.mode !== 'walk' || player.onWall) return -1;
  const i = Math.round(player.x / C) + HALF, j = Math.round(player.z / C) + HALF;
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  const c = j * N + i; return mz[c] ? c : -1;
}
function nearestGate() {
  let best = gateCells[0], bd = 1e18;
  for (const c of gateCells) { const dx = cc(c % N) - player.x, dz = cc((c / N) | 0) - player.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = c; } }
  return best;
}
function go(where) {
  const wasOnWall = player.onWall;
  player.onWall = false; player.pitch = 0;
  if (where === 'overview') state.mode = 'overview';
  else if (where === 'fly') {
    if (state.mode === 'overview') { player.x = camera.position.x; player.z = camera.position.z; player.flyY = camera.position.y; player.yaw = camera.rotation.y; player.pitch = camera.rotation.x; }
    else if (state.mode === 'walk') player.flyY = (wasOnWall ? WALLH : 0) + 60;
    state.mode = 'fly';
  } else {
    state.mode = 'walk';
    if (where === 'maze') {
      const g = gateCells[(Math.random() * 4) | 0], gi = g % N, gj = (g / N) | 0;
      const ox = Math.sign(gi - HALF), oz = Math.sign(gj - HALF);
      let c = g; for (let k = 0; k < 6; k++) { const n = c + ox + oz * N; if (!mz[n]) break; c = n; }
      player.x = cc(c % N); player.z = cc((c / N) | 0);
      player.yaw = Math.atan2(player.x, player.z);        // face the city
      spawnHunter(c, 55);
      if (!state.hunted) { state.hunted = true; state.survive = 0; }
    } else if (where === 'city') { player.x = 0; player.z = RIN - 70; player.yaw = 0; }
    else if (where === 'wall') { const a = Math.PI / 4; player.x = 716 * Math.cos(a); player.z = 716 * Math.sin(a); player.yaw = -3 * Math.PI / 4; player.onWall = true; }
  }
  document.querySelectorAll('#bar button[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === where));
}

function updatePlayer(dt) {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  f += -touch.my; s += touch.mx;
  const mag = Math.hypot(f, s); if (mag > 1) { f /= mag; s /= mag; }
  const wantSprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  if (state.mode === 'fly') {
    const sp = (wantSprint ? 420 : 90) * dt, cp = Math.cos(player.pitch);
    player.x += (-sy * cp * f + cy * s) * sp; player.z += (-cy * cp * f - sy * s) * sp;
    player.flyY = clamp(player.flyY + Math.sin(player.pitch) * f * sp + ((keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0)) * sp, 2.5, 6000);
    camera.position.set(player.x, player.flyY, player.z);
  } else {
    const sprinting = wantSprint && player.stamina > 0.02 && mag > 0.1;
    player.stamina = clamp(player.stamina + (sprinting ? -dt / 7 : dt / 14), 0, 1);
    const sp = (sprinting ? 11.5 : 6.5) * dt;
    player.x += (-sy * f + cy * s) * sp; player.z += (-cy * f - sy * s) * sp;
    if (player.onWall) {
      const d = Math.hypot(player.x, player.z), t = clamp(d, RIN + 3, ROUT - 11) / d;
      player.x *= t; player.z *= t;
    } else collide(player, 1.1);
    state.bob += mag * sp;
    camera.position.set(player.x, (player.onWall ? WALLH : 0) + EYE + Math.sin(state.bob * 1.9) * 0.06 * Math.min(1, mag), player.z);
  }
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function updateHunter(dt) {
  if (!hunter.active || state.mode === 'overview' || state.mode === 'fly') return;
  const pc = playerCell(), target = pc >= 0 ? pc : nearestGate();
  if (target !== floodTarget) flood(target);
  if (dist[hunter.cur] < 0) { spawnHunter(target, 40); return; }
  const pd = dist[hunter.cur];
  const sees = pc >= 0 && lineOfSight(hunter.cur, pc);
  if (sees && !hunter.sees) screech();
  hunter.sees = sees;
  let speed = pd > 40 ? 24 : pd > 14 ? 13 : 7.4;
  if (sees) speed = Math.max(speed, 10.2);
  let tx, tz;
  if (hunter.cur === target) {
    hunter.next = -1; hunter.viaCentre = true;      // free movement inside the cell: re-centre before leaving it
    if (pc >= 0) { tx = player.x; tz = player.z; } else { tx = cc(target % N); tz = cc((target / N) | 0); }
  } else if (hunter.viaCentre && hunter.next < 0) {
    tx = cc(hunter.cur % N); tz = cc((hunter.cur / N) | 0);
    if (Math.hypot(tx - hunter.x, tz - hunter.z) < 0.3) hunter.viaCentre = false;
  } else {
    if (hunter.next < 0) {
      const c = hunter.cur, i = c % N, want = pd - 1;
      if (i < N - 1 && !wallE[c] && dist[c + 1] === want) hunter.next = c + 1;
      else if (i > 0 && !wallE[c - 1] && dist[c - 1] === want) hunter.next = c - 1;
      else if (c + N < NN && !wallS[c] && dist[c + N] === want) hunter.next = c + N;
      else if (c >= N && !wallS[c - N] && dist[c - N] === want) hunter.next = c - N;
      else return;
    }
    tx = cc(hunter.next % N); tz = cc((hunter.next / N) | 0);
  }
  const dx = tx - hunter.x, dz = tz - hunter.z, d = Math.hypot(dx, dz), step = speed * dt;
  if (d <= step || d < 0.3) { hunter.x = tx; hunter.z = tz; if (hunter.next >= 0) { hunter.cur = hunter.next; hunter.next = -1; } }
  else { hunter.x += dx / d * step; hunter.z += dz / d * step; hunter.group.rotation.y = Math.atan2(dx, dz); }
  hunter.t += dt * (0.6 + speed * 0.12);
  const g = hunter.group;
  g.position.set(hunter.x, 0.5 + Math.sin(hunter.t * 2) * 0.25, hunter.z);
  g.rotation.z = Math.sin(hunter.t * 1.3) * 0.05;
  hunter.arms[0].rotation.x = Math.sin(hunter.t * 2) * 0.5; hunter.arms[1].rotation.x = -Math.sin(hunter.t * 2) * 0.5;
  const e = Math.hypot(player.x - hunter.x, player.z - hunter.z);
  state.fear = pc >= 0 ? clamp(1 - e / 240, 0, 1) : clamp(1 - e / 120, 0, 0.5);
  hunter.light.intensity = 90 + 50 * Math.sin(hunter.t * 5);
  if (pc >= 0 && e < 3.4 && state.caughtTimer <= 0) {
    state.caught++; state.caughtTimer = 2.6;
    $('flashsub').textContent = `You lasted ${fmt(state.survive)}. It has found you ${state.caught} time${state.caught > 1 ? 's' : ''}.`;
    $('flash').style.display = 'flex'; screech();
  }
}
const fmt = (s) => `${String((s / 60) | 0).padStart(2, '0')}:${String((s % 60) | 0).padStart(2, '0')}`;

// ---------------------------------------------------------------- audio
let actx = null, master, droneGain, muted = false, beatT = 0;
function initAudio() {
  if (actx) { actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    droneGain = actx.createGain(); droneGain.gain.value = 0; lp.connect(droneGain); droneGain.connect(master);
    for (const fq of [41, 43.4, 61.7]) { const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq; o.connect(lp); o.start(); }
    const buf = actx.createBuffer(1, actx.sampleRate * 3, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const wind = actx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.6;
    const wg = actx.createGain(); wg.gain.value = 0.05; wind.connect(bp); bp.connect(wg); wg.connect(master); wind.start();
  } catch (e) { actx = null; }
}
function thump(v) {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.14);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.22);
}
function screech() {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.25); o.frequency.exponentialRampToValueAtTime(140, t + 1.1);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.25);
}
function updateAudio(dt) {
  if (!actx) return;
  master.gain.value = muted ? 0 : 0.6;
  const fear = state.mode === 'walk' ? state.fear : 0;
  droneGain.gain.value += (fear * 0.5 - droneGain.gain.value) * Math.min(1, dt * 2);
  if (fear > 0.02) { beatT -= dt; if (beatT <= 0) { thump(0.25 + fear * 0.6); setTimeout(() => thump(0.15 + fear * 0.4), 130); beatT = 1.3 - fear * 0.95; } }
}

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyF') go(state.mode === 'fly' ? 'overview' : 'fly');
  if (e.code === 'Digit1') go('maze'); if (e.code === 'Digit2') go('city'); if (e.code === 'Digit3') go('wall'); if (e.code === 'Digit4') go('overview');
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let mouseDown = false;
canvasEl.addEventListener('pointerdown', (e) => {
  initAudio();
  if (e.pointerType === 'touch') {
    if (e.clientX < innerWidth / 2 && !touch.move) touch.move = { id: e.pointerId, x: e.clientX, y: e.clientY };
    else if (!touch.look) touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    return;
  }
  mouseDown = true;
  if (state.mode !== 'overview' && canvasEl.requestPointerLock) { try { const p = canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag-look still works */ } }
});
addEventListener('pointerup', (e) => {
  mouseDown = false;
  if (touch.move && touch.move.id === e.pointerId) { touch.move = null; touch.mx = touch.my = 0; }
  if (touch.look && touch.look.id === e.pointerId) touch.look = null;
});
addEventListener('pointercancel', () => { touch.move = touch.look = null; touch.mx = touch.my = 0; mouseDown = false; });
function look(dx, dy, k) {
  if (state.mode === 'overview') { state.orbit += dx * k * 0.6; state.orbitH = clamp(state.orbitH + dy * k * 500, 150, 4000); return; }
  player.yaw -= dx * k; player.pitch = clamp(player.pitch - dy * k, -1.5, 1.5);
}
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    if (touch.move && touch.move.id === e.pointerId) { touch.mx = clamp((e.clientX - touch.move.x) / 55, -1, 1); touch.my = clamp((e.clientY - touch.move.y) / 55, -1, 1); }
    else if (touch.look && touch.look.id === e.pointerId) { look(e.clientX - touch.look.x, e.clientY - touch.look.y, 0.005); touch.look.x = e.clientX; touch.look.y = e.clientY; }
    return;
  }
  if (document.pointerLockElement === canvasEl || mouseDown) look(e.movementX, e.movementY, 0.0023);
});
addEventListener('wheel', (e) => { if (state.mode === 'overview') state.orbitR = clamp(state.orbitR * (1 + Math.sign(e.deltaY) * 0.08), 900, 6000); }, { passive: true });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
function toggleMute() { muted = !muted; $('mute').textContent = muted ? 'Sound off' : 'Sound on'; }
document.querySelectorAll('#bar button[data-go]').forEach((b) => b.addEventListener('click', () => { initAudio(); go(b.dataset.go); b.blur(); }));
$('mute').addEventListener('click', toggleMute);
const sprintBtn = $('sprint');
sprintBtn.addEventListener('pointerdown', () => { touch.sprint = !touch.sprint; sprintBtn.classList.toggle('on', touch.sprint); });
$('enter').addEventListener('click', () => { initAudio(); $('title').style.display = 'none'; go('maze'); });
$('look').addEventListener('click', () => { initAudio(); $('title').style.display = 'none'; });

// ---------------------------------------------------------------- hud + loop
function updateHud() {
  let h = '';
  if (state.mode === 'overview') h = '<b>OVERVIEW</b><br>Drag to orbit, wheel to zoom.';
  else if (state.mode === 'fly') h = '<b>FLYING</b><br>The hunter waits while you are in the air. Shift to go fast, Space / C up and down.';
  else {
    const pc = playerCell();
    if (player.onWall) h = '<b>ON THE WALL</b><br>';
    else if (pc < 0) h = '<b>INSIDE THE WALLS</b><br>';
    else h = '<b>IN THE MAZE</b><br>';
    if (hunter.active) {
      if (pc >= 0) {
        h += hunter.sees ? '<span style="color:#f55">IT SEES YOU.</span><br>' : '';
        h += `It is ${Math.max(0, dist[hunter.cur]) * C} m of corridor behind you.<br>Survived ${fmt(state.survive)} &middot; found ${state.caught}&times;`;
      } else h += 'It will not leave the maze. It is waiting for you at a gate.';
    }
    h += `<div id="stam"><i style="width:${(player.stamina * 100) | 0}%"></i></div>`;
  }
  $('hud').innerHTML = h;
  $('vig').style.opacity = state.mode === 'walk' ? Math.pow(state.fear, 1.5) * 0.9 : 0;
}

const clock = new THREE.Clock();
let hudT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.caughtTimer > 0) {
    state.caughtTimer -= dt;
    if (state.caughtTimer <= 0) { $('flash').style.display = 'none'; state.survive = 0; go('maze'); }
  } else if (state.mode === 'overview') {
    state.orbit += dt * 0.02;
    camera.position.set(Math.cos(state.orbit) * state.orbitR, state.orbitH, Math.sin(state.orbit) * state.orbitR);
    camera.lookAt(0, 140, 0);
    aimSun(0, 0, 1700);
  } else {
    updatePlayer(dt);
    updateHunter(dt);
    if (state.mode === 'walk' && hunter.active && playerCell() >= 0) state.survive += dt;
    aimSun(camera.position.x, camera.position.z, clamp(camera.position.y * 2.2, 260, 1700));
  }
  if (state.mode !== 'walk') state.fear = 0;
  updateAudio(dt);
  skyDome.position.copy(camera.position);
  hudT -= dt; if (hudT <= 0) { hudT = 0.15; updateHud(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

generateMaze();
buildMaze();
buildCity();
buildGround();
buildHunter();
go('overview');
$('load').style.display = 'none';
// test hooks: ?go=maze|city|wall|fly|overview, ?shot=1 hides the UI, ?cam=x,y,z,yawDeg,pitchDeg (fly), ?hunter=metres ahead
if (QS.get('shot')) { for (const id of ['title', 'bar']) $(id).style.display = 'none'; }
if (QS.get('go')) { $('title').style.display = 'none'; go(QS.get('go')); }
if (QS.get('cam')) {
  const v = QS.get('cam').split(',').map(Number);
  go('fly'); player.x = v[0]; player.flyY = v[1]; player.z = v[2]; player.yaw = (v[3] || 0) * Math.PI / 180; player.pitch = (v[4] || 0) * Math.PI / 180;
}
if (QS.get('hunter') && hunter.active) {
  const m = +QS.get('hunter');
  hunter.x = player.x - Math.sin(player.yaw) * m; hunter.z = player.z - Math.cos(player.yaw) * m;
  hunter.group.position.set(hunter.x, 0.5, hunter.z); hunter.group.rotation.y = player.yaw; hunter.light.intensity = 110;
  hunter.active = false;
}
// ?test=1: logic self-test, result goes to the console as "SELFTEST {...}"
if (QS.get('test')) {
  const out = {};
  let mazeCells = 0; for (let c = 0; c < NN; c++) mazeCells += mz[c];
  flood(gateCells[0]); out.mazeCells = mazeCells; out.allReachable = floodCount === mazeCells;
  go('maze'); out.startCells = dist[hunter.cur];
  let steps = 0; while (state.caught === 0 && steps < 400000) { updateHunter(0.05); steps++; }
  out.caughtWhenStandingStill = state.caught === 1; out.secondsToCatch = steps * 0.05;
  const cellOf = (p) => (Math.round(p.z / C) + HALF) * N + Math.round(p.x / C) + HALF;
  const inWall = (p) => {
    const ci = Math.round(p.x / C) + HALF, cj = Math.round(p.z / C) + HALF;
    for (let jj = cj - 1; jj <= cj + 1; jj++) for (let ii = ci - 1; ii <= ci + 1; ii++) {
      const c = jj * N + ii;
      if (wallE[c] && Math.abs(p.x - cc(ii) - C / 2) < T / 2 && Math.abs(p.z - cc(jj)) < C / 2 + T / 2) return true;
      if (wallS[c] && Math.abs(p.z - cc(jj) - C / 2) < T / 2 && Math.abs(p.x - cc(ii)) < C / 2 + T / 2) return true;
    }
    return false;
  };
  let inside = 0, illegal = 0, moved = 0;
  for (let d = 0; d < 16; d++) {
    const p = { x: player.x, z: player.z }, a = d * Math.PI / 8 + 0.1;
    let prev = cellOf(p);
    for (let k = 0; k < 6000; k++) {
      p.x += Math.cos(a + Math.sin(k / 300)) * 0.57; p.z += Math.sin(a + Math.sin(k / 300)) * 0.57; collide(p, 1.1);
      if (inWall(p)) inside++;
      const c = cellOf(p);
      if (c !== prev) {
        moved++;
        const lo = Math.min(c, prev), df = Math.abs(c - prev);
        if ((df === 1 && wallE[lo]) || (df === N && wallS[lo])) illegal++;
        prev = c;
      }
    }
  }
  out.wallPenetrations = inside; out.illegalCrossings = illegal; out.cellChanges = moved;
  // moving player: wander the maze along open edges; the hunter must never cross a wall
  state.caughtTimer = 0; state.caught = 0; go('maze');
  let hunterIllegal = 0, hunterOff = 0, hp = hunter.cur, pcell = cellOf(player), tgt = pcell, catches = 0;
  for (let k = 0; k < 60000; k++) {
    const tx = cc(tgt % N), tz = cc((tgt / N) | 0), dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz);
    if (d < 0.4) {
      const opts = []; const i = tgt % N;
      if (i < N - 1 && !wallE[tgt] && mz[tgt + 1]) opts.push(tgt + 1);
      if (i > 0 && !wallE[tgt - 1] && mz[tgt - 1]) opts.push(tgt - 1);
      if (tgt + N < NN && !wallS[tgt] && mz[tgt + N]) opts.push(tgt + N);
      if (tgt >= N && !wallS[tgt - N] && mz[tgt - N]) opts.push(tgt - N);
      tgt = opts[(rnd() * opts.length) | 0];
    } else { const st = (k % 900 < 300 ? 11.5 : 4) * 0.05; player.x += dx / d * Math.min(st, d); player.z += dz / d * Math.min(st, d); }
    state.caughtTimer = 0; const before = state.caught;
    updateHunter(0.05);
    if (state.caught > before) { catches++; go('maze'); tgt = cellOf(player); hp = hunter.cur; continue; }
    if (hunter.cur !== hp) { const lo = Math.min(hunter.cur, hp), df = Math.abs(hunter.cur - hp); if (!((df === 1 && !wallE[lo]) || (df === N && !wallS[lo]))) hunterIllegal++; hp = hunter.cur; }
    if (inWall(hunter)) hunterOff++;
  }
  out.hunterIllegalCrossings = hunterIllegal; out.hunterInsideWall = hunterOff; out.catchesWhileMoving = catches;
  state.caughtTimer = 0; go('city'); state.caught = 0;
  for (let k = 0; k < 40000; k++) updateHunter(0.05);
  out.safeInCity = state.caught === 0; out.hunterWaitsAtGate = gateCells.includes(hunter.cur);
  out.instances = instanceTotal;
  console.log('SELFTEST ' + JSON.stringify(out));
  go('overview');
}
window.G = { go, player, hunter, state, camera, renderer, flood, dist, info: () => ({ instances: instanceTotal, cells: NN, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) };
if (QS.get('fps')) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  let n = 0; const t0 = performance.now(); const tick = () => { n++; requestAnimationFrame(tick); }; tick();
  setTimeout(() => console.log('FPS ' + (n / ((performance.now() - t0) / 1000)).toFixed(1) + ' mode=' + state.mode + ' gpu=' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?') + ' ' + JSON.stringify(window.G.info())), 6000);
}
frame();
})();
