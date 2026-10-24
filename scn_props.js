// Peças reutilizáveis dos cenários (low-poly facetado). Cada função desenha direto num Kit (ver scenery.js); coordenadas absolutas no mundo.
import { lerpHex, smooth } from './scn_util.js';

const TAU = Math.PI * 2;
export const C = {
  snow: 0xf3f7fc, snowShade: 0xc9d9ec, rockDark: 0x3b3e48, rockMid: 0x585c68, rockLight: 0x7a7f8c, ice: 0xa9e3f2, iceDeep: 0x5fb7d8, pine: 0x1d3a2b, pineLight: 0x2c5239, wood: 0x5a3f28,
  steel: 0x4a4f59, steelDark: 0x2a2d34, concrete: 0x6e727a, concreteLight: 0x9097a0, yellow: 0xe2a72b, orange: 0xd6761f, rust: 0xa24b2a, red: 0xc23a2e, green: 0x4a7a35,
};

// pico irregular de montanha: anéis com jitter; faces claras/escuras conforme a luz e manchas de neve que crescem com a altura (snowAmt 0..1)
export function peak(kit, x, z, b, h, rock, snow, snowAmt = 0.6, /* fração de cima coberta de neve */ sides = 9, lean = 0, y0 = 0) {
  const rnd = kit.rnd, ring = [], prof = [[0, 1], [0.16, 0.8], [0.34, 0.6], [0.52, 0.42], [0.7, 0.27], [0.86, 0.13], [1, 0]];
  const rot = rnd() * TAU, skew = (rnd() - 0.5) * b * 0.3;
  for (const [fy, fr] of prof) { const r = []; for (let i = 0; i < sides; i++) { const a = rot + i / sides * TAU, j = fr === 0 ? 0 : 1 + (rnd() - 0.5) * 0.55, rr = b * fr * j; r.push([x + Math.cos(a) * rr + skew * fy + lean * fy * b, y0 + h * fy * (1 + (rnd() - 0.5) * 0.06), z + Math.sin(a) * rr]); } ring.push(r); }
  const V = p => ({ x: p[0], y: p[1], z: p[2] });
  for (let l = 0; l < prof.length - 1; l++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = ring[l][i], bb = ring[l][j], c = ring[l + 1][j], d = ring[l + 1][i], midY = (prof[l][0] + prof[l + 1][0]) / 2;
    const lit = Math.cos(rot + (i + 0.5) / sides * TAU - 0.9) * 0.5 + 0.5, strat = 0.5 + 0.5 * Math.sin(midY * 17 + i * 1.7);
    const base = lerpHex(lerpHex(rock, 0x2b3547, (1 - lit) * 0.42), lerpHex(rock, 0xcbd3e0, 0.4), lit * 0.4 * strat);
    const isSnow = midY > 1 - snowAmt ? rnd() < 0.9 : rnd() < 0.1;
    const col = isSnow ? lerpHex(snow, 0xa6bfe6, (1 - lit) * 0.5) : base;
    if (l === prof.length - 2) kit.tri(V(a), V(c), V(bb), col, 0.1); else kit.quad(V(a), V(d), V(c), V(bb), col, 0.1);
  }
}
// pinheiro com neve opcional
export function pine(kit, x, z, h, snow = true, y = 0) {
  const w = h * 0.34, trunk = h * 0.18; kit.cyl(h * 0.035, h * 0.045, trunk, 5, C.wood, { x, y, z }, 0.2);
  for (let i = 0; i < 4; i++) { const f = i / 4, r = w * (1 - f * 0.62), yy = y + trunk * 0.7 + f * h * 0.62; kit.cyl(r, r * 0.12, h * 0.34, 7, i % 2 ? C.pine : C.pineLight, { x, y: yy, z, ry: i }, 0.25, false); if (snow) kit.cyl(r * 0.72, r * 0.1, h * 0.17, 7, C.snow, { x, y: yy + h * 0.17, z, ry: i }, 0.12, false); }
}
// árvore genérica (copa de blocos)
export function tree(kit, x, z, h, leaf, trunk = 0x5a4430, y = 0, blobs = 4) {
  const rnd = kit.rnd; kit.cyl(h * 0.05, h * 0.07, h * 0.62, 6, trunk, { x, y, z }, 0.2);
  for (let i = 0; i < blobs; i++) { const a = rnd() * TAU, d = i ? h * 0.18 : 0; kit.rock(h * (0.2 + rnd() * 0.08), lerpHex(leaf, 0x0c200a, rnd() * 0.25), { x: x + Math.cos(a) * d, y: y + h * (0.62 + rnd() * 0.22), z: z + Math.sin(a) * d, sy: 0.8 }, 0, 0.2, 0.2); }
}
// torre de rádio em treliça com luz vermelha (glow) e antenas
export function radioTower(kit, glow, x, z, h, y = 0, col = C.steel) {
  const b = h * 0.14, top = b * 0.12, t = Math.max(0.12, h * 0.012), sec = Math.max(3, Math.round(h / 8)), P = (f, sx, sz) => { const w = (b * (1 - f) + top * f) * 0.5; return [x + sx * w, y + f * h, z + sz * w]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) { const a = P(0, ...corners[i]), c = P(1, ...corners[i]); kit.strut(a[0], a[1], a[2], c[0], c[1], c[2], t * 1.4, col); }
  for (let k = 0; k < sec; k++) { const f0 = k / sec, f1 = (k + 1) / sec;
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, a0 = P(f0, ...corners[i]), b0 = P(f0, ...corners[j]), a1 = P(f1, ...corners[i]), b1 = P(f1, ...corners[j]);
      kit.strut(a1[0], a1[1], a1[2], b1[0], b1[1], b1[2], t, col); kit.strut(a0[0], a0[1], a0[2], b1[0], b1[1], b1[2], t * 0.8, col); } }
  kit.box(top * 3, h * 0.02, top * 3, C.steelDark, { x, y: y + h * 0.97, z });
  kit.box(h * 0.008, h * 0.14, h * 0.008, col, { x, y: y + h, z });
  for (let i = 0; i < 3; i++) kit.box(h * 0.05, h * 0.006, h * 0.006, col, { x, y: y + h * (0.9 + i * 0.03), z, ry: i * 1.1 });
  glow.box(h * 0.016, h * 0.016, h * 0.016, 0xff3b2a, { x, y: y + h * 1.12, z }, 1, 1, 0); glow.box(h * 0.014, h * 0.014, h * 0.014, 0xff3b2a, { x: x + top, y: y + h * 0.6, z: z + top }, 1, 1, 0);
}
// antena parabólica
export function dish(kit, x, z, y, r, ry = 0, tilt = -0.6) {
  kit.cyl(r * 0.12, r * 0.18, r * 0.9, 6, C.steelDark, { x, y, z }); kit.cyl(r, r * 0.12, r * 0.28, 12, 0xdfe3e8, { x, y: y + r * 0.9, z, ry, rx: tilt }, 0.06, true); kit.box(r * 0.06, r * 0.55, r * 0.06, C.steelDark, { x, y: y + r * 1.0, z, ry, rx: tilt });
}
// prédio com janelas acesas (glow) e faixas coloridas
export function building(kit, glow, x, z, w, d, h, o = {}) {
  const { y = 0, ry = 0, wall = C.concrete, trim = C.yellow, roof = 0x8a8f98, win = 0xffc86a, floors = Math.max(1, Math.round(h / 4.2)), glowWin = true, taper = 1 } = o;
  kit.box(w, h, d, wall, { x, y, z, ry }, taper, taper, 0.1);
  kit.box(w * 1.04, h * 0.05, d * 1.04, roof, { x, y: y + h, z, ry }); kit.box(w * 1.02, h * 0.035, d * 1.02, trim, { x, y: y + h * 0.82, z, ry });
  if (glowWin) for (let f = 0; f < floors; f++) { const n = Math.max(2, Math.round(w / 5)); for (let i = 0; i < n; i++) { if (kit.rnd() < 0.45) continue; const lx = (i + 0.5) / n * w - w / 2, ly = (f + 0.55) / floors * h * 0.8; const c = Math.cos(ry), s = Math.sin(ry); glow.box(w / n * 0.4, h / floors * 0.28, 0.12, win, { x: x + lx * c + (d / 2 + 0.05) * s, y: y + ly, z: z - lx * s + (d / 2 + 0.05) * c, ry }, 1, 1, 0); } }
}
export function container(kit, x, z, col, ry = 0, y = 0, w = 6, h = 2.6, d = 2.4) { kit.box(w, h, d, col, { x, y, z, ry }, 1, 1, 0.12); kit.box(w * 1.01, h * 0.06, d * 1.01, 0x2a2d34, { x, y: y + h * 0.5, z, ry }); }
// ponte reta de a→b com pilares até y0
export function bridge(kit, ax, az, bx, bz, y, width = 6, o = {}) {
  const { deck = C.steel, rail = C.yellow, y0 = -30, pillars = 3, thick = 1.2 } = o, len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2 + Math.PI / 2, cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const R = Math.atan2(bx - ax, bz - az); // direção do eixo da ponte
  kit.box(width, thick, len, deck, { x: cx, y: y - thick, z: cz, ry: R }, 1, 1, 0.1);
  for (const s of [-1, 1]) { kit.box(0.25, 1.1, len, rail, { x: cx + Math.cos(R) * s * width / 2, y, z: cz - Math.sin(R) * s * width / 2, ry: R }, 1, 1, 0.08); }
  for (let i = 0; i < len / 4; i++) { const f = (i + 0.5) / (len / 4) - 0.5; kit.box(width, 0.25, 0.25, C.steelDark, { x: cx + Math.sin(R) * f * len, y: y - thick - 0.5, z: cz + Math.cos(R) * f * len, ry: R }); }
  for (let i = 0; i < pillars; i++) { const f = (i + 0.5) / pillars - 0.5, px = cx + Math.sin(R) * f * len, pz = cz + Math.cos(R) * f * len; kit.box(width * 0.7, y - thick - y0, width * 0.7, C.concrete, { x: px, y: y0, z: pz, ry: R }, 0.8, 0.8, 0.1); }
}
export function lamp(kit, glow, x, z, h = 6, y = 0, col = 0xffe3a0) { kit.cyl(0.12, 0.16, h, 5, C.steelDark, { x, y, z }); kit.box(1.2, 0.2, 0.5, C.steelDark, { x, y: y + h, z }); glow.box(0.9, 0.18, 0.4, col, { x, y: y + h - 0.2, z }, 1, 1, 0); }
// sobe uma faixa de cachoeira congelada (colunas azuis) numa parede em (x,z) olhando para (dx,dz)
export function iceFall(kit, x, z, y0, y1, w, dx, dz) {
  const ry = Math.atan2(dx, dz), n = Math.max(4, Math.round(w / 1.6)), rnd = kit.rnd, c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < n; i++) { const o = (i / n - 0.5) * w, hh = (y1 - y0) * (0.55 + rnd() * 0.45), top = lerpHex(0xe8fbff, 0x9fe0f2, rnd()), bot = lerpHex(0x58b8dc, 0x2c8fc0, rnd()); kit.box(w / n * 1.05, hh, 1.6 + rnd() * 1.4, lerpHex(top, bot, 0.55), { x: x + o * c, y: y1 - hh, z: z - o * s, ry }, 0.55, 0.8, 0.2); kit.box(w / n * 0.9, hh * 0.22, 2.2 + rnd(), top, { x: x + o * c, y: y1 - hh * 0.22, z: z - o * s, ry }, 0.9, 0.9, 0.12); }
}
export const TAU2 = TAU;
