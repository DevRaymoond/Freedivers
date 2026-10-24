// Mais peças dos cenários: industriais, ruínas, vilarejo, selva, rochas e fortaleza (low-poly facetado). Coordenadas absolutas.
import * as THREE from 'three';
import { lerpHex } from './scn_util.js';

const Q = THREE.Quaternion, V3 = THREE.Vector3, TAU = Math.PI * 2;

// derrick / torre de perfuração em treliça com plataforma e topo
export function derrick(kit, glow, x, z, h, y = 0, col = 0x4a4038) {
  const b = h * 0.3, t = Math.max(0.15, h * 0.014), top = b * 0.2, P = (f, sx, sz) => { const w = (b * (1 - f) + top * f) * 0.5; return [x + sx * w, y + f * h, z + sz * w]; }, cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], sec = Math.max(3, Math.round(h / 6));
  for (let i = 0; i < 4; i++) { const a = P(0, ...cs[i]), c = P(1, ...cs[i]); kit.strut(a[0], a[1], a[2], c[0], c[1], c[2], t * 1.5, col); }
  for (let k = 0; k < sec; k++) { const f0 = k / sec, f1 = (k + 1) / sec; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, a0 = P(f0, ...cs[i]), a1 = P(f1, ...cs[i]), b1 = P(f1, ...cs[j]); kit.strut(a1[0], a1[1], a1[2], b1[0], b1[1], b1[2], t, col); kit.strut(a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], t * 0.8, col); } }
  kit.box(top * 2.6, h * 0.05, top * 2.6, 0x2a2d34, { x, y: y + h, z }); kit.box(top * 1.2, h * 0.1, top * 1.2, col, { x, y: y + h * 1.05, z });
  kit.box(b * 0.9, h * 0.025, b * 0.9, 0x3a3f48, { x, y: y + h * 0.5, z }); glow.box(h * 0.02, h * 0.02, h * 0.02, 0xffb347, { x: x + top, y: y + h * 1.17, z }, 1, 1, 0);
}
export function tank(kit, x, z, r, h, col = 0x8a8f98, y = 0) { kit.cyl(r, r, h, 10, col, { x, y, z }, 0.1); kit.cyl(r * 1.02, r * 0.5, h * 0.12, 10, 0x575b64, { x, y: y + h, z }, 0.08); }
export function smokestack(kit, glow, x, z, h, r, y = 0, col = 0x6a5a50) { kit.cyl(r, r * 0.62, h, 9, col, { x, y, z }, 0.15); kit.cyl(r * 0.66, r * 0.6, h * 0.04, 9, 0x2a2420, { x, y: y + h, z }); glow.box(r * 0.6, h * 0.02, r * 0.6, 0xff6a2a, { x, y: y + h * 1.0, z }, 1, 1, 0); }
// muro com ameias
export function wall(kit, x0, z0, x1, z1, h, thick, col, y = 0, crenel = true) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  kit.box(thick, h, len, col, { x: cx, y, z: cz, ry }, 1, 1, 0.12);
  if (crenel) { const n = Math.max(2, Math.round(len / (thick * 1.6))); for (let i = 0; i < n; i += 2) { const f = (i + 0.5) / n - 0.5; kit.box(thick * 1.1, thick * 0.7, len / n * 0.9, col, { x: cx + Math.sin(ry) * f * len, y: y + h, z: cz + Math.cos(ry) * f * len, ry }, 1, 1, 0.12); } }
}
export function conveyor(kit, x0, z0, y0, x1, z1, y1, w = 2.2, col = 0x3a3d44) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz), q = new Q().setFromUnitVectors(new V3(0, 0, 1), new V3(dx / len, dy / len, dz / len));
  kit.box(w, 0.5, len, col, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 0.2, z: (z0 + z1) / 2, q }); const n = Math.round(len / 7);
  for (let i = 0; i <= n; i++) { const f = i / n; kit.box(0.35, 3.2, 0.35, 0x2a2d34, { x: x0 + dx * f, y: y0 + dy * f - 3.2, z: z0 + dz * f }); }
}
// guindaste com lança e contrapeso
export function crane(kit, glow, x, z, h, y = 0, ry = 0, col = 0xc79a2b) {
  kit.box(h * 0.05, h, h * 0.05, col, { x, y, z }, 0.7, 0.7); kit.box(h * 0.5, h * 0.04, h * 0.05, col, { x: x - Math.sin(ry) * h * 0.1, y: y + h, z: z - Math.cos(ry) * h * 0.1, ry: ry + Math.PI / 2 });
  kit.strut(x, y + h, z, x + Math.sin(ry) * h * 0.5, y + h * 0.82, z + Math.cos(ry) * h * 0.5, h * 0.025, col); kit.box(h * 0.12, h * 0.1, h * 0.1, 0x3a3d44, { x: x - Math.sin(ry) * h * 0.12, y: y + h * 0.9, z: z - Math.cos(ry) * h * 0.12 });
  glow.box(0.6, 0.6, 0.6, 0xff3b2a, { x, y: y + h * 1.04, z }, 1, 1, 0);
}
export function houseWood(kit, glow, x, z, w, d, h, y = 0, ry = 0, wall = 0x8a6a42, roof = 0x5a4030) {
  kit.box(w, h, d, wall, { x, y, z, ry }, 1, 1, 0.14);
  const c = Math.cos(ry), s = Math.sin(ry), hw = w / 2 + 0.5;
  kit.prism([[-hw, -d / 2 - 0.5], [hw, -d / 2 - 0.5], [hw, d / 2 + 0.5], [-hw, d / 2 + 0.5]], h * 0.55, roof, { x, y: y + h, z, ry }, 0.0001, 0.16);
  glow.box(w * 0.18, h * 0.3, 0.12, 0xffc46a, { x: x + s * (d / 2 + 0.05), y: y + h * 0.35, z: z + c * (d / 2 + 0.05), ry }, 1, 1, 0);
}
export function windmill(kit, x, z, h, y = 0, ry = 0, spin = 0.3) {
  kit.cyl(h * 0.14, h * 0.07, h, 8, 0x7a5a38, { x, y, z }, 0.12); kit.box(h * 0.16, h * 0.12, h * 0.2, 0x4a3a2a, { x, y: y + h, z, ry });
  const hx = x + Math.sin(ry) * h * 0.14, hz = z + Math.cos(ry) * h * 0.14;
  for (let i = 0; i < 12; i++) { const a = spin + i / 12 * TAU, L = h * 0.5; kit.box(h * 0.04, L, h * 0.012, i % 3 ? 0x6a4a30 : 0xc9c2b0, { x: hx, y: y + h * 1.06, z: hz, q: new Q().setFromEuler(new THREE.Euler(0, ry, a, 'YXZ')) }, 0.6, 1); }
}
export function fence(kit, x0, z0, x1, z1, y = 0, col = 0x6a4a2a, h = 1.3) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 2.2)), ry = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) kit.box(0.18, h, 0.18, col, { x: x0 + (x1 - x0) * i / n, y, z: z0 + (z1 - z0) * i / n });
  for (const hh of [h * 0.45, h * 0.85]) kit.box(0.1, 0.12, len, col, { x: (x0 + x1) / 2, y: y + hh, z: (z0 + z1) / 2, ry });
}
// arco de pedra em ruínas (dois pilares + lintel em segmentos)
export function arch(kit, x, z, w, h, thick, col, y = 0, ry = 0, moss = null) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz = 0) => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const sx of [-1, 1]) { const [px, pz] = at(sx * w / 2); kit.box(thick, h, thick * 1.1, col, { x: px, y, z: pz, ry }, 0.96, 0.96, 0.14); if (moss) kit.box(thick * 1.05, h * 0.25, thick * 1.15, moss, { x: px, y: y + h * 0.75, z: pz, ry }, 0.9, 0.9, 0.2); }
  const seg = 7; for (let i = 0; i < seg; i++) { const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg), am = (a0 + a1) / 2, rr = w / 2, [qx, qz] = at(-Math.cos(am) * rr), qy = y + h + Math.sin(am) * rr * 0.55; kit.box(thick * 0.9, thick * 1.2, thick * 1.1, col, { x: qx, y: qy - thick * 0.6, z: qz, ry, rz: Math.cos(am) * 0.9 }, 1, 1, 0.14); }
}
// torre/ruína de pedra com topo quebrado
export function ruinTower(kit, x, z, w, h, col, y = 0, moss = 0x4a6a30) {
  kit.box(w, h, w, col, { x, y, z, ry: 0.2 }, 0.92, 0.92, 0.16); kit.box(w * 1.1, h * 0.06, w * 1.1, col, { x, y: y + h * 0.45, z, ry: 0.2 }); kit.box(w * 0.93, h * 0.2, w * 0.93, moss, { x, y: y + h * 0.78, z, ry: 0.2 }, 0.8, 0.8, 0.2);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.2; kit.box(w * 0.22, w * 0.5, w * 0.1, 0x1f241c, { x: x + Math.sin(a) * w * 0.47, y: y + h * 0.55, z: z + Math.cos(a) * w * 0.47, ry: a }); }
  for (let i = 0; i < 5; i++) { const a = i * 1.3; kit.box(w * 0.22, w * 0.3 + (i % 2) * w * 0.2, w * 0.22, col, { x: x + Math.cos(a) * w * 0.33, y: y + h, z: z + Math.sin(a) * w * 0.33 }, 0.8, 0.8, 0.2); }
}
// árvore de selva gigante: tronco com raízes, copa de blobs e cipós
export function jungleTree(kit, x, z, h, y = 0, leaf = 0x2f6a2a, trunk = 0x5a4430) {
  const rnd = kit.rnd; kit.cyl(h * 0.075, h * 0.05, h * 0.7, 8, trunk, { x, y, z }, 0.2);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rnd(); kit.box(h * 0.04, h * 0.22, h * 0.16, trunk, { x: x + Math.cos(a) * h * 0.05, y, z: z + Math.sin(a) * h * 0.05, ry: -a + Math.PI / 2, rz: 0.4 }, 0.3, 0.6, 0.2); }
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = h * (0.1 + rnd() * 0.26); kit.rock(h * (0.2 + rnd() * 0.12), lerpHex(leaf, 0x0c2a0c, rnd() * 0.35), { x: x + Math.cos(a) * d, y: y + h * (0.66 + rnd() * 0.22), z: z + Math.sin(a) * d, sy: 0.65 }, 0, 0.2, 0.22); }
  for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = h * (0.15 + rnd() * 0.2), len = h * (0.18 + rnd() * 0.3); kit.box(h * 0.012, len, h * 0.012, lerpHex(leaf, 0x1a4a14, 0.3), { x: x + Math.cos(a) * d, y: y + h * 0.72 - len, z: z + Math.sin(a) * d }, 1, 1, 0.2); }
}
export function palm(kit, x, z, h, y = 0, leaf = 0x3f8a32) {
  const rnd = kit.rnd, lean = (rnd() - 0.5) * 0.4; kit.cyl(h * 0.03, h * 0.02, h, 6, 0x6a5238, { x, y, z, rz: lean, rx: lean * 0.5 }, 0.15);
  const tx = x - Math.sin(lean) * h, tz = z + Math.sin(lean * 0.5) * h; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; kit.box(h * 0.04, h * 0.34, h * 0.012, lerpHex(leaf, 0x1a4a1a, rnd() * 0.3), { x: tx, y: y + h * 0.97, z: tz, ry: a, rx: 1.0 }, 0.4, 0.8, 0.2); }
}
export function fern(kit, x, z, s, y = 0, leaf = 0x3f8a32) { const rnd = kit.rnd; for (let i = 0; i < 6; i++) kit.box(s * 0.05, s * 0.9, s * 0.012, lerpHex(leaf, 0x1a4a1a, rnd() * 0.4), { x, y, z, ry: i / 6 * TAU, rx: 0.9 }, 0.3, 0.8, 0.2); }
// mesa/torre de rocha com estratos e topo plano (cânions, penhascos de selva)
export function mesa(kit, x, z, w, h, col, y = 0, topCol = null, sides = 8) {
  const rnd = kit.rnd, layers = Math.max(3, Math.round(h / 7)); let r = w;
  for (let i = 0; i < layers; i++) { const lh = h / layers, rr = r * (0.9 + rnd() * 0.2), poly = []; for (let k = 0; k < sides; k++) { const a = k / sides * TAU, j = 0.78 + rnd() * 0.44; poly.push([Math.cos(a) * rr * j, Math.sin(a) * rr * j]); } kit.prism(poly, lh * 1.02, lerpHex(col, i % 2 ? 0x2a1410 : 0xf0b080, 0.12 + rnd() * 0.12), { x, y: y + i * lh, z }, 0.98, 0.1); r *= 0.96; }
  if (topCol) kit.box(r * 1.5, h * 0.02, r * 1.5, topCol, { x, y: y + h, z }, 0.9, 0.9, 0.1);
}
export function banner(kit, x, z, h, w, col = 0xb52a22, y = 0, ry = 0) { kit.box(0.25, h, 0.25, 0x2a2d34, { x, y, z }); kit.box(w, h * 0.55, 0.12, col, { x: x + Math.cos(ry) * w * 0.5, y: y + h * 0.4, z: z - Math.sin(ry) * w * 0.5, ry }, 1, 1, 0.1); }
export function brazier(kit, glow, x, z, y = 0, s = 1) { kit.cyl(0.5 * s, 0.35 * s, 1.1 * s, 6, 0x2a2420, { x, y, z }); glow.cyl(0.42 * s, 0.1 * s, 0.7 * s, 6, 0xff8a2a, { x, y: y + 1.0 * s, z }, 0.15, false); }

// anel contínuo de colunas de rocha (paredões de falésia): cada coluna é uma pilha de prismas irregulares com estratos e, opcionalmente, capa de neve/musgo.
// o = { r0, r1, hmin, hmax, wmin, wmax, cols: [escuro, claro], cap, capH, sides, noise, hfn, y0, skip(a) }
export function cliffRing(ctx, o) {
  const { rnd, solid, noise } = ctx, rr = o.r0, arc = (o.wmin + o.wmax) / 2 * 0.62; let a = rnd() * 0.2;
  const n = Math.round(Math.PI * 2 * (o.r0 + o.r1) / 2 / arc);
  for (let i = 0; i < n; i++) {
    a = i / n * TAU + (rnd() - 0.5) * 0.02; if (o.skip && o.skip(a)) continue;
    const r = o.r0 + rnd() * (o.r1 - o.r0), x = Math.cos(a) * r, z = Math.sin(a) * r, w = o.wmin + rnd() * (o.wmax - o.wmin);
    const prof = noise ? noise.fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3) : rnd(), h = o.hmin + (o.hmax - o.hmin) * Math.min(1, prof * 1.25 + (rnd() - 0.5) * 0.35);
    const y = (o.hfn ? o.hfn(x, z, r) : 0) + (o.y0 ?? -2);
    const layers = Math.max(3, Math.round(h / 9)); let rad = w;
    for (let L = 0; L < layers; L++) {
      const lh = h / layers, poly = [], sides = o.sides || 6, rrr = rad * (0.88 + rnd() * 0.26);
      for (let k = 0; k < sides; k++) { const aa = k / sides * TAU + rnd() * 0.3, j = 0.72 + rnd() * 0.5; poly.push([Math.cos(aa) * rrr * j, Math.sin(aa) * rrr * j]); }
      kit_prism(solid, poly, lh * 1.03, lerpHex(lerpHex(o.cols[0], o.cols[1], rnd() * 0.5 + (L % 2) * 0.25), 0x14161c, 0.1 + rnd() * 0.18), x, y + L * lh, z);
      rad *= 0.985;
    }
    if (o.cap != null) { const poly = []; for (let k = 0; k < 7; k++) { const aa = k / 7 * TAU, j = 0.8 + rnd() * 0.35; poly.push([Math.cos(aa) * rad * j * 1.04, Math.sin(aa) * rad * j * 1.04]); } kit_prism(solid, poly, o.capH ?? 2.2, lerpHex(o.cap, 0xffffff, rnd() * 0.3), x, y + h - 0.3, z, 0.9); }
  }
}
function kit_prism(kit, poly, h, col, x, y, z, taper = 0.97) { kit.prism(poly, h, col, { x, y, z }, taper, 0.12); }

// rampa/ponte inclinada de (x0,y0,z0) a (x1,y1,z1) com trilhos e apoios
export function ramp(kit, x0, y0, z0, x1, y1, z1, w = 6, col = 0x3a3d44, rail = 0xe2a72b, legs = true) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz), dir = new V3(dx / len, dy / len, dz / len), q = new Q().setFromUnitVectors(new V3(0, 0, 1), dir);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2, side = new V3(0, 1, 0).cross(dir).normalize().multiplyScalar(w / 2);
  kit.box(w, 0.9, len, col, { x: mx, y: my - 0.45, z: mz, q }, 1, 1, 0.1);
  for (const s of [-1, 1]) kit.box(0.22, 1.1, len, rail, { x: mx + side.x * s, y: my + 0.45, z: mz + side.z * s, q }, 1, 1, 0.1);
  if (legs) { const n = Math.max(2, Math.round(len / 9)); for (let i = 0; i <= n; i++) { const f = i / n, x = x0 + dx * f, y = y0 + dy * f, z = z0 + dz * f; kit.box(1.0, Math.max(1, y + 12), 1.0, 0x575b64, { x, y: -12, z }, 0.8, 0.8, 0.1); } }
}
