// Cenários do jogo: 5 regiões × 3 variantes (ver README → Cenários). Tudo é gerado por código, em low-poly facetado, sem texturas pesadas:
//  • Kit: monta geometrias de vértices coloridos (um desenho só por tipo de material, poucos draw calls);
//  • anel de terreno (montanhas, cânions, crateras, lagos) ao redor da arena jogável;
//  • céu com gradiente, sol e nuvens em shader; chão procedural por região; obstáculos (rochas) por variante.
import * as THREE from 'three';
import { mergeGeometries } from './lib/jsm/utils/BufferGeometryUtils.js';
import { rng, hash2 } from './worldlogic.mjs';
import { lerpHex, smooth } from './scn_util.js';
import { scatterClutter } from './scn_props2.js';
import { NORTE } from './scn_norte.js';
import { OESTE } from './scn_oeste.js';
import { SUDESTE } from './scn_sudeste.js';
import { LESTE } from './scn_leste.js';
import { CENTRAL } from './scn_central.js';

export const REGIONS = { norte: NORTE, oeste: OESTE, sudeste: SUDESTE, leste: LESTE, central: CENTRAL };
export const REGION_OF_BIOME = { ice: 'norte', toxic: 'oeste', desert: 'sudeste', volcanic: 'leste', plains: 'central' };
export const REGION_NAME = { norte: 'Região Norte', oeste: 'Região Oeste', sudeste: 'Região Sudeste', leste: 'Região Leste', central: 'Região Central' };

// ───────────── utilidades ─────────────
const hex = c => new THREE.Color(c);
const tmpC = new THREE.Color();
export { lerpHex, smooth };

export function makeNoise(seed) {
  const h = (ix, iz) => hash2(ix + seed * 131, iz + seed * 717) / 4294967296;
  const n2 = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * n2(x * f, z * f); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); };         // 0..1 (média ~0,5)
  const ridge = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(2 * n2(x * f, z * f) - 1); s += a * v * v; f *= 2.1; a *= 0.5; } return s; };
  return { n2, fbm, ridge };
}

// ───────────── Kit: geometria colorida sem normais (o material usa flatShading) ─────────────
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export class Kit {
  constructor(rnd) { this.p = []; this.c = []; this.rnd = rnd || Math.random; this.lod = 1; }   // lod < 1 (celular): peças pulam detalhes miúdos
  get tris() { return this.p.length / 9; }
  _col(col, jit) { tmpC.set(col); if (jit) { const k = 1 + (this.rnd() - 0.5) * jit; tmpC.multiplyScalar(k); } return [tmpC.r, tmpC.g, tmpC.b]; }
  // transformação: o = { x, y, z, ry, rx, rz, s, sx, sy, sz }
  _mat(o) { if (o.q) _q.copy(o.q); else { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); } _s.set((o.sx ?? o.s ?? 1), (o.sy ?? o.s ?? 1), (o.sz ?? o.s ?? 1)); _p.set(o.x || 0, o.y || 0, o.z || 0); return _m.compose(_p, _q, _s); }
  tri(a, b, c, col, jit = 0.12) { const k = this._col(col, jit); for (const v of [a, b, c]) { this.p.push(v.x, v.y, v.z); this.c.push(k[0], k[1], k[2]); } }
  quad(a, b, c, d, col, jit) { this.tri(a, b, c, col, jit); this.tri(a, c, d, col, jit); }
  _emit(verts, faces, col, o = {}, jit = 0.12) {
    const M = this._mat(o), w = verts.map(v => new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(M));
    for (const f of faces) { const cc = Array.isArray(col) ? col[(f.length > 3 ? 0 : 0)] : col; if (f.length === 3) this.tri(w[f[0]], w[f[1]], w[f[2]], cc, jit); else this.quad(w[f[0]], w[f[1]], w[f[2]], w[f[3]], cc, jit); }
  }
  // caixa com a base em y=0; tx/tz afunilam o topo (1 = reto)
  box(w, h, d, col, o = {}, tx = 1, tz = 1, jit) {
    const x = w / 2, z = d / 2, X = x * tx, Z = z * tz;
    const v = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-X, h, -Z], [X, h, -Z], [X, h, Z], [-X, h, Z]];
    this._emit(v, [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]], col, o, jit);
  }
  // tronco/cone com a base em y=0 (r1 = 0 vira cone)
  cyl(r0, r1, h, seg, col, o = {}, jit, cap = true) {
    const v = [], f = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * r0, 0, Math.sin(a) * r0]); }
    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; v.push([Math.cos(a) * r1, h, Math.sin(a) * r1]); }
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.push(r1 > 0.0001 ? [i, seg + i, seg + j, j] : [i, seg + i, j]); }
    if (cap && r1 > 0.0001) { const top = []; for (let i = seg - 1; i >= 0; i--) top.push(seg + i); for (let i = 1; i < seg - 1; i++) f.push([top[0], top[i], top[i + 1]]); }
    this._emit(v, f, col, o, jit);
  }
  // rocha irregular (icosaedro deformado); sq achata, sy estica
  rock(r, col, o = {}, detail = 0, jit = 0.18, rough = 0.28) {
    const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed(), pos = g.attributes.position, cache = new Map();
    const disp = (x, y, z) => { const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`; let d = cache.get(k); if (d === undefined) { d = 1 + (this.rnd() - 0.5) * rough * 2; cache.set(k, d); } return d; };
    const M = this._mat({ ...o, s: undefined, sx: (o.sx ?? o.s ?? 1) * r, sy: (o.sy ?? o.s ?? 1) * r, sz: (o.sz ?? o.s ?? 1) * r });
    for (let i = 0; i < pos.count; i += 3) {
      const t = [0, 1, 2].map(k => { const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k), d = disp(x, y, z); return new THREE.Vector3(x * d, Math.max(y * d, -0.35), z * d).applyMatrix4(M); });
      this.tri(t[0], t[1], t[2], col, jit);
    }
  }
  // prisma: polígono [x,z] extrudado em altura h (base em y=0); tx/tz afunilam
  prism(poly, h, col, o = {}, tx = 1, jit) {
    const n = poly.length, cx = poly.reduce((a, p) => a + p[0], 0) / n, cz = poly.reduce((a, p) => a + p[1], 0) / n, v = [], f = [];
    for (const p of poly) v.push([p[0], 0, p[1]]);
    for (const p of poly) v.push([cx + (p[0] - cx) * tx, h, cz + (p[1] - cz) * tx]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, n + i, n + j, j]); }
    for (let i = 1; i < n - 1; i++) f.push([n, n + i + 1, n + i]);
    this._emit(v, f, col, o, jit);
  }
  // barra fina entre dois pontos (treliças, cabos, escoras)
  strut(x0, y0, z0, x1, y1, z1, t, col, jit = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz); if (len < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    this.box(t, len, t, col, { x: x0, y: y0, z: z0, q }, 1, 1, jit);
  }
  geometry() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
}

// ───────────── anel de terreno ao redor da arena ─────────────
// height(x, z, r, t) devolve a altura; color(x, y, z, slope, r) devolve a cor. A região interna (r < R0) é a própria arena (plana).
export function terrainRing({ R0, R1, nr = 46, nt = 140, height, color, power = 1.7, y0 = -0.05 }) {
  const rows = nr + 1, cols = nt, pos = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3), idx = [];
  const H = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const r = R0 + (R1 - R0) * Math.pow(i / nr, power), t = j / cols * Math.PI * 2, x = Math.cos(t) * r, z = Math.sin(t) * r;
    const y = i === 0 ? y0 : height(x, z, r, t); H[i * cols + j] = y; const k = (i * cols + j) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
  }
  const rr = i => R0 + (R1 - R0) * Math.pow(i / nr, power);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const k = (i * cols + j) * 3, jn = (j + 1) % cols, jp = (j + cols - 1) % cols, ip = Math.max(0, i - 1), inx = Math.min(rows - 1, i + 1);
    const arc = Math.max(0.5, rr(i) * 2 * (Math.PI * 2 / cols)), rd = Math.max(0.5, rr(inx) - rr(ip));
    const grad = Math.hypot((H[i * cols + jn] - H[i * cols + jp]) / arc, (H[inx * cols + j] - H[ip * cols + j]) / rd);      // inclinação real (tan do ângulo)
    const c = color(pos[k], pos[k + 1], pos[k + 2], grad, Math.hypot(pos[k], pos[k + 2])); tmpC.set(c); col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
  }
  for (let i = 0; i < nr; i++) for (let j = 0; j < cols; j++) { const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + j, d = (i + 1) * cols + (j + 1) % cols; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ───────────── céu (gradiente + sol + nuvens) ─────────────
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const SKY_FS = `varying vec3 vDir; uniform vec3 top, horizon, sunDir, sunCol, cloudCol, cloudShade; uniform float cover, haze, time, sunSize;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.07; a*=0.5; } return s; }
void main(){ vec3 d = normalize(vDir); float t = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, top, pow(t, 0.55));
  float s = max(dot(d, sunDir), 0.0); col += sunCol * (pow(s, sunSize) * 2.5 + pow(s, 6.0) * 0.22);
  if (d.y > 0.0) { vec2 uv = d.xz / (d.y + 0.22) * 1.35 + vec2(time * 0.006, 0.0); float n = fbm(uv * 1.15), n2 = fbm(uv * 3.1 + 7.0);
    float c = smoothstep(1.0 - cover, 1.0 - cover + 0.22, n * 0.78 + n2 * 0.34); c *= smoothstep(0.0, 0.16, d.y);
    vec3 cc = mix(cloudShade, cloudCol, smoothstep(0.35, 0.8, n2 + s * 0.35)); col = mix(col, cc, c * 0.94); }
  col = mix(col, horizon, haze * (1.0 - smoothstep(0.0, 0.22, d.y)));
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0)); }`;
export function makeSky(cfg) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      top: { value: hex(cfg.top) }, horizon: { value: hex(cfg.horizon) }, sunDir: { value: new THREE.Vector3(...cfg.sunDir).normalize() }, sunCol: { value: hex(cfg.sunCol ?? 0xfff2d0) },
      cloudCol: { value: hex(cfg.cloudCol ?? 0xffffff) }, cloudShade: { value: hex(cfg.cloudShade ?? 0xb8c4d8) }, cover: { value: cfg.cover ?? 0.45 }, haze: { value: cfg.haze ?? 0.5 }, time: { value: 0 }, sunSize: { value: cfg.sunSize ?? 900 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), m); mesh.renderOrder = -100; mesh.frustumCulled = false;
  return mesh;
}

// ───────────── chão procedural ─────────────
export function groundTexture(kind, seed = 1) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), R = rng(seed), px = (n, f) => { for (let i = 0; i < n; i++) f(R() * S, R() * S, R()); };
  const wrap = (x, y, w, h, style) => { g.fillStyle = style; for (const dx of [0, -S]) for (const dy of [0, -S]) g.fillRect(x + dx, y + dy, w, h); };
  const F = {
    snow: ['#f1f6fb', n => { px(900, (x, y, r) => wrap(x, y, 2 + r * 6, 1.5 + r * 3, `rgba(${190 + r * 40},${210 + r * 30},255,0.22)`)); px(160, (x, y, r) => wrap(x, y, 1.5, 1.5, 'rgba(255,255,255,0.9)')); px(90, (x, y, r) => wrap(x, y, 8 + r * 14, 2, 'rgba(150,180,215,0.16)')); }],
    ice: ['#cfe8f3', n => { px(500, (x, y, r) => wrap(x, y, 6 + r * 22, 4 + r * 14, `rgba(${150 + r * 60},${205 + r * 30},${235 + r * 20},0.28)`)); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; for (let i = 0; i < 26; i++) { g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 60; y += (R() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } }],
    forest: ['#3f5a2a', n => { px(1500, (x, y, r) => wrap(x, y, 2 + r * 6, 2 + r * 6, `rgba(${40 + r * 50},${80 + r * 60},${25 + r * 30},0.4)`)); px(260, (x, y, r) => wrap(x, y, 3 + r * 4, 2, `rgba(${90 + r * 50},${70 + r * 30},${35},0.5)`)); px(60, (x, y, r) => wrap(x, y, 2, 2, 'rgba(210,60,50,0.8)')); }],
    mud: ['#4b4a2c', n => { px(1200, (x, y, r) => wrap(x, y, 3 + r * 8, 3 + r * 6, `rgba(${55 + r * 40},${60 + r * 45},${30 + r * 20},0.4)`)); px(40, (x, y, r) => wrap(x, y, 14 + r * 10, 9 + r * 6, 'rgba(70,110,110,0.35)')); }],
    stone: ['#6e6c5e', n => { px(900, (x, y, r) => wrap(x, y, 3 + r * 7, 3 + r * 7, `rgba(${86 + r * 40},${84 + r * 40},${72 + r * 34},0.35)`)); g.strokeStyle = 'rgba(28,30,22,0.55)'; g.lineWidth = 1.6; for (let gx = 0; gx <= S; gx += 64) for (let gy = 0; gy <= S; gy += 64) { g.strokeRect(gx + (R() - 0.5) * 3, gy + (R() - 0.5) * 3, 64, 64); } px(220, (x, y, r) => wrap(x, y, 3 + r * 6, 3 + r * 4, `rgba(${50 + r * 30},${96 + r * 50},${34 + r * 20},0.5)`)); }],
    sand: ['#d98a4e', n => { px(1500, (x, y, r) => wrap(x, y, 6 + r * 16, 1 + r * 1.5, `rgba(${210 + r * 40},${120 + r * 50},${60 + r * 30},0.3)`)); px(400, (x, y, r) => wrap(x, y, 3, 3, `rgba(${140 + r * 40},${70 + r * 30},${40},0.35)`)); g.strokeStyle = 'rgba(255,200,140,0.2)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, R() * S); g.bezierCurveTo(S * 0.3, R() * S, S * 0.6, R() * S, S, R() * S); g.stroke(); } }],
    rock: ['#7a5a46', n => { px(1500, (x, y, r) => wrap(x, y, 3 + r * 8, 3 + r * 8, `rgba(${100 + r * 50},${70 + r * 35},${50 + r * 25},0.35)`)); px(120, (x, y, r) => wrap(x, y, 2 + r * 3, 2 + r * 3, 'rgba(240,200,150,0.4)')); }],
    basalt: ['#3a2c28', n => { px(1500, (x, y, r) => wrap(x, y, 3 + r * 8, 3 + r * 8, `rgba(${60 + r * 40},${46 + r * 30},${40 + r * 24},0.5)`)); g.lineWidth = 1.5; for (let i = 0; i < 16; i++) { g.strokeStyle = `rgba(255,${90 + R() * 80 | 0},20,${0.45 + R() * 0.4})`; g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } }],
    grass: ['#6f8f35', n => { px(2200, (x, y, r) => wrap(x, y, 1.5, 2 + r * 4, `rgba(${80 + r * 70},${120 + r * 60},${30 + r * 25},0.45)`)); px(500, (x, y, r) => wrap(x, y, 2 + r * 2, 2, `rgba(${210},${180 + r * 40},${60},0.6)`)); px(70, (x, y, r) => wrap(x, y, 2, 2, r > 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(240,200,60,0.9)')); }],
    dirt: ['#8c6a40', n => { px(1500, (x, y, r) => wrap(x, y, 3 + r * 7, 2 + r * 4, `rgba(${110 + r * 50},${80 + r * 40},${50 + r * 25},0.35)`)); }],
  };
  const [base, paint] = F[kind] || F.dirt; g.fillStyle = base; g.fillRect(0, 0, S, S); paint();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

let mistTex = null;
function mistTexture() {
  if (mistTex) return mistTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  mistTex = new THREE.CanvasTexture(c); mistTex.colorSpace = THREE.SRGBColorSpace; return mistTex;
}
const GROUND_AVG = { snow: 0xe9f0f8, ice: 0xbfe0ee, forest: 0x3f5a2a, stone: 0x6e6c5e, mud: 0x4b4a2c, sand: 0xdb8d52, rock: 0x7a5a46, basalt: 0x3a2c28, grass: 0x6f8f35, dirt: 0x8c6a40 };
let lavaTex = null;
function lavaTexture() {
  if (lavaTex) return lavaTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#c42a06'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const x = R() * S, y = R() * S, r = 10 + R() * 30; for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, 'rgba(255,190,40,0.9)'); gr.addColorStop(0.5, 'rgba(255,110,10,0.55)'); gr.addColorStop(1, 'rgba(200,40,0,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); } }
  g.strokeStyle = 'rgba(70,10,0,0.75)'; g.lineWidth = 2.5; for (let i = 0; i < 24; i++) { g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 70; y += (R() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
  lavaTex = new THREE.CanvasTexture(c); lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.colorSpace = THREE.SRGBColorSpace; return lavaTex;
}
// ───────────── montagem ─────────────
const MATS = {};
const solidMat = () => MATS.solid || (MATS.solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.02 }));
export const solidMaterial = solidMat;
const glowMat = () => MATS.glow || (MATS.glow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));

// Cria o cenário de uma variante. opts: { region, variant, R, seed, touch }. Devolve { group, env, obstacle(i, r), update(dt, cam), dispose() }.
export function buildScenery(opts) {
  const { region, variant = 0, R, seed = 1, touch = false } = opts;
  const reg = REGIONS[region] || REGIONS.sudeste, def = reg.variants[((variant % reg.variants.length) + reg.variants.length) % reg.variants.length];
  const rnd = rng(seed * 7919 + 17), noise = makeNoise(seed % 997 + 3), group = new THREE.Group(); group.name = 'scenery';
  const solid = new Kit(rnd), glow = new Kit(rnd), extra = [];
  const updaters = [];
  if (touch) { solid.lod = 0.5; glow.lod = 0.5; }
  const ctx = { THREE, R, rnd, noise, touch, solid, glow, group, seed, Kit, terrainRing, lerpHex, smooth, add: m => { group.add(m); extra.push(m); return m; },
    ring: cfg => { const gk = def.ground || {}, avg = new THREE.Color(GROUND_AVG[gk.kind] ?? 0x888888).multiply(new THREE.Color(gk.tint ?? 0xffffff)).getHex(), c0 = cfg.color; cfg = { ...cfg, color: (x, y, z, g, r) => lerpHex(c0(x, y, z, g, r), avg, (1 - smooth(R + 2, R + 30, r)) * 0.85) }; if (touch) { cfg = { ...cfg, nt: Math.round((cfg.nt || 140) * 0.62), nr: Math.round((cfg.nr || 46) * 0.75) }; } const m = new THREE.Mesh(terrainRing({ R0: R + 2, ...cfg }), solidMat()); m.receiveShadow = true; group.add(m); extra.push(m); return m; },
    water: (y, color, opacity = 0.82, rough = 0.18, rad = 520) => { const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.25, transparent: opacity < 1, opacity })); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); extra.push(m); return m; },
    // faixas de névoa/poeira/fumaça rente ao chão (planos suaves translúcidos)
    mist: (n, r0, r1, y0, y1, size, color, opacity = 0.35) => {
      const tex = mistTexture(), mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, fog: true });
      const cnt = Math.round(n * (touch ? 0.5 : 1));
      for (let i = 0; i < cnt; i++) { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), s = size * (0.6 + rnd() * 0.9), m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * (0.35 + rnd() * 0.3)), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rnd() * 6.28; m.position.set(Math.cos(a) * r, y0 + rnd() * (y1 - y0), Math.sin(a) * r); m.renderOrder = 5; group.add(m); extra.push(m); }
    },
    lava: (y, rad = 620) => { const t = lavaTexture(); t.repeat.set(rad / 14, rad / 14); const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshBasicMaterial({ map: t, color: 0xffffff, fog: true })); m.rotation.x = -Math.PI / 2; m.position.y = y; group.add(m); extra.push(m); updaters.push((dt, t0) => { t.offset.set(t0 * 0.004, t0 * 0.002); }); return m; },
    onUpdate: fn => updaters.push(fn),
    pick: (a, b) => a + rnd() * (b - a), ang: () => rnd() * Math.PI * 2 };
  const built = def.build(ctx) || {};
  if (def.clutter) scatterClutter(ctx, def.clutter);
  const sg = solid.tris ? solid.geometry() : null, gg = glow.tris ? glow.geometry() : null;
  if (sg) { const m = new THREE.Mesh(sg, solidMat()); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; group.add(m); extra.push(m); }
  if (gg) { const m = new THREE.Mesh(gg, glowMat()); m.frustumCulled = false; group.add(m); extra.push(m); }
  const sky = makeSky(def.sky); group.add(sky);
  const obstacleKit = def.obstacle || (() => null);
  const cache = [];
  return {
    group, env: def.env, def, name: def.name, region, sky, tris: (sg ? solid.tris : 0) + (gg ? glow.tris : 0), ground: def.ground, collide: built.collide || [],
    // geometria de um obstáculo (rocha/bloco) com raio r; i escolhe o formato
    obstacle(i, r) { const k = i % 6; if (!cache[k]) { const kit = new Kit(rng(seed * 31 + k)); obstacleKit(kit, 1, k, ctx); cache[k] = kit.tris ? kit.geometry() : null; } return cache[k]; },
    update(dt, cam, t) { sky.position.copy(cam.position); sky.scale.setScalar(cam.far * 0.9); sky.material.uniforms.time.value = t; for (const f of updaters) f(dt, t); if (built.update) built.update(dt, t); },
    dispose() { extra.forEach(m => { m.geometry && m.geometry.dispose(); if (m.material && m.material !== MATS.solid && m.material !== MATS.glow) m.material.dispose(); }); cache.forEach(g => g && g.dispose()); sky.geometry.dispose(); sky.material.dispose(); group.removeFromParent(); },
  };
}
export const variantCount = region => (REGIONS[region] || REGIONS.sudeste).variants.length;
