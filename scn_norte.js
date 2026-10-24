// Região Norte: montanhas nevadas, posto avançado e vale congelado.
import * as THREE from 'three';
import { lerpHex, smooth } from './scn_util.js';
import { C, peak, pine, radioTower, dish, building, container, bridge, lamp, iceFall } from './scn_props.js';
import { cliffRing, ramp, derrick, tank, banner, fence } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x2a74d0, horizon: 0xcfe3f6, sunDir: [0.55, 0.5, 0.45], sunCol: 0xfff4dc, cover: 0.5, haze: 0.28, cloudShade: 0x9fb6d6 };
const ENV = { fogColor: 0xb2cbe6, near: 260, far: 950, camFar: 1000, hemi: [0xcfe2fa, 0x8aa0c0, 0.95], sun: [0xfff0d6, 1.55, [60, 80, 40]] };

// terreno de montanhas com terraços (falésias); pads = [{x,z,r,h}] achatam plataformas para construções
function mountainHeight(ctx, o = {}) {
  const { R, noise } = ctx, amp = o.amp ?? 230, pads = o.pads || [], base = o.base || (() => 0);
  return (x, z, r) => {
    const wx = x + 90 * noise.fbm(x * 0.004 + 40, z * 0.004, 3), wz = z + 90 * noise.fbm(x * 0.004, z * 0.004 + 40, 3);       // deforma o domínio: cristas tortas e recortadas
    const far = smooth(R + 60, R + 340, r), mid = smooth(R + 28, R + 80, r) * (1 - smooth(R + 200, R + 300, r)), u = smooth(R + 4, R + 70, r);
    const m1 = Math.pow(noise.ridge(wx * 0.0058 + 11, wz * 0.0058 + 7, 5), 1.7), m2 = Math.pow(noise.ridge(wx * 0.016 + 3, wz * 0.016 + 19, 4), 2.2);
    let h = u * 8 * noise.fbm(x * 0.03, z * 0.03, 3) + far * (m1 * amp + m2 * amp * 0.28);
    h += mid * (noise.fbm(x * 0.017 + 5, z * 0.017, 3) * (o.midAmp ?? 70) + 8);
    const st = o.step ?? 13, f = h / st, terr = (Math.floor(f) + smooth(0.8, 0.93, f - Math.floor(f))) * st;
    h = lerp(h, terr, mid * (o.terrace ?? 0.92)) + base(x, z, r);
    for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z), k = 1 - smooth(p.r, p.r + (p.fall ?? 26), d); if (k > 0) h = lerp(h, p.h, k); }
    return h;
  };
}
const snowColor = (x, y, z, g, r, ctx) => {
  const nz = ctx.noise.fbm(x * 0.05, z * 0.05, 2), strat = 0.5 + 0.5 * Math.sin(y * 0.5 + nz * 5);
  const rock = lerpHex(lerpHex(0x454b59, 0x6a7283, strat), 0x2b3140, 0.3 * nz * 2);
  const sh = lerpHex(C.snow, C.snowShade, 0.3 * ctx.noise.fbm(x * 0.04 + 9, z * 0.04, 3) * smooth(ctx.R + 10, ctx.R + 80, r));
  const alt = smooth(25, 120, y + (nz - 0.5) * 50);                    // neve cobre mais quanto mais alto
  return lerpHex(sh, rock, smooth(0.85, 1.7, g + (nz - 0.5) * 0.5) * (1 - 0.8 * alt));
};

// obstáculos da arena (formas unitárias): rochas nevadas, cristais de gelo, pinheiro, monte de neve
function obstacle(kit, r, k) {
  const rock = C.rockMid;
  if (k === 0) { kit.rock(1, rock, { sy: 0.9 }, 0, 0.22); kit.rock(0.8, C.snow, { y: 0.55, sy: 0.35, sx: 1.0, sz: 1.0 }, 0, 0.08, 0.15); }
  else if (k === 1) { kit.rock(0.85, C.rockDark, { x: -0.3, sy: 1.1 }, 0, 0.22); kit.rock(0.6, rock, { x: 0.65, z: 0.2, sy: 0.8 }, 0, 0.22); kit.rock(0.7, C.snow, { x: -0.3, y: 0.7, sy: 0.3 }, 0, 0.08, 0.12); }
  else if (k === 2) { for (let i = 0; i < 4; i++) kit.cyl(0.3 + i * 0.03, 0.02, 1.6 + (i % 2) * 0.7, 5, lerpHex(C.ice, C.iceDeep, i / 4), { x: Math.cos(i * 1.7) * 0.5, z: Math.sin(i * 1.7) * 0.5, rx: Math.sin(i) * 0.25, rz: Math.cos(i * 2) * 0.25 }, 0.2); }
  else if (k === 3) { peak(kit, 0, 0, 1.0, 2.8, C.rockDark, C.snow, 0.3, 6, 0.1); }
  else if (k === 4) { kit.rock(1.2, C.snow, { sy: 0.55 }, 1, 0.06, 0.12); kit.rock(0.5, C.rockMid, { x: 0.5, y: 0.4, sy: 0.7 }, 0, 0.2); }
  else { pine(kit, 0, 0, 5.2, true); kit.rock(0.5, C.snow, { x: 0.5, sy: 0.4 }, 0, 0.06, 0.1); }
}
// pinheiros espalhados em declives suaves
function scatterPines(ctx, hfn, n, r0, r1, hmin = 5, hmax = 10) {
  const { rnd, solid, R } = ctx; let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 8) {
    const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r), s = Math.hypot(hfn(x + 3, z, r) - y, hfn(x, z + 3, r) - y) / 3;
    if (s > 0.55 || y < -3) continue; pine(solid, x, z, hmin + rnd() * (hmax - hmin), true, y); placed++;
  }
}
function scatterPeaks(ctx, hfn, n, r0, r1, hmin, hmax) {
  const { rnd, solid } = ctx;
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, b = 36 + rnd() * 50, h = hmin + rnd() * (hmax - hmin); peak(solid, x, z, b, h, lerpHex(0x626a78, 0x8a92a3, rnd()), C.snow, 0.5 + rnd() * 0.3, 8 + (rnd() * 3 | 0), (rnd() - 0.5) * 0.25, hfn(x, z, r) - 6); }
}
// agulhas e blocos de rocha escura com neve no topo (como as colunas da referência)
function rockNeedles(ctx, hfn, n, r0, r1, hmin, hmax) {
  const { rnd, solid } = ctx;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, h = hmin + rnd() * (hmax - hmin), b = h * (0.18 + rnd() * 0.12);
    peak(solid, x, z, b, h, lerpHex(0x4a505e, 0x6f7788, rnd()), C.snow, 0.3 + rnd() * 0.3, 6, (rnd() - 0.5) * 0.4, hfn(x, z, r) - 3);
  }
}
function iceFalls(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx; let k = 0, tries = 0;
  while (k < n && tries++ < n * 60) {
    const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r), dx = -x / r, dz = -z / r;
    const yIn = hfn(x + dx * 8, z + dz * 8, r - 8); if (y - yIn < 8 || y < 10) continue;
    iceFall(solid, x + dx * 3.6, z + dz * 3.6, yIn - 1, y - 0.5, 14 + rnd() * 20, dx, dz); k++;
  }
}

const montanhas = {
  name: 'Montanhas Nevadas', clutter: 'snow', sky: SKY, env: ENV, ground: { kind: 'snow', tint: 0xe9f1fb }, obstacle,
  build(ctx) {
    ctx.mist(16, ctx.R + 30, ctx.R + 260, 6, 22, 130, 0xeaf3ff, 0.42);
    const hfn = mountainHeight(ctx);
    ctx.ring({ R1: 560, nr: 56, nt: 160, height: hfn, color: (x, y, z, s, r) => snowColor(x, y, z, s, r, ctx) });
    scatterPeaks(ctx, hfn, 14, 200, 380, 110, 220);
    rockNeedles(ctx, hfn, ctx.touch ? 30 : 60, ctx.R + 20, ctx.R + 240, 18, 60);
    scatterPines(ctx, hfn, ctx.touch ? 100 : 200, ctx.R + 6, ctx.R + 170, 9, 17);
    iceFalls(ctx, hfn, 10, ctx.R + 50, ctx.R + 230);
    return {};
  },
};

const posto = {
  name: 'Posto Avançado', clutter: 'snow', sky: { ...SKY, cover: 0.38, cloudShade: 0xb4c6de }, env: ENV, ground: { kind: 'snow', tint: 0xf4f8ff }, obstacle,
  build(ctx) {
    ctx.mist(12, ctx.R + 30, ctx.R + 260, 5, 20, 120, 0xeaf3ff, 0.36);
    const { R, solid, glow, rnd, noise } = ctx, a0 = 0.5, pr = R + 105, padH = 16;
    const P = { x: Math.cos(a0) * pr, z: Math.sin(a0) * pr, r: 62, h: padH, fall: 9 }, Q = { x: Math.cos(a0 + 0.95) * (R + 135), z: Math.sin(a0 + 0.95) * (R + 135), r: 26, h: padH + 6, fall: 9 }, W = { x: Math.cos(a0 - 0.9) * (R + 125), z: Math.sin(a0 - 0.9) * (R + 125), r: 24, h: padH + 3, fall: 9 };
    const hfn = mountainHeight(ctx, { amp: 200, midAmp: 14, terrace: 0.5, pads: [P, Q, W] });
    ctx.ring({ R1: 640, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => snowColor(x, y, z, g, r, ctx) });
    scatterPeaks(ctx, hfn, 12, 260, 420, 110, 210);
    rockNeedles(ctx, hfn, ctx.touch ? 14 : 30, R + 150, R + 300, 18, 55);
    scatterPines(ctx, hfn, ctx.touch ? 50 : 100, R + 6, R + 170, 9, 16);
    iceFalls(ctx, hfn, 6, R + 60, R + 230);
    // falésias de rocha escura sustentando as plataformas (como no posto sobre o precipício)
    const cliffAround = (c, h, n) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, d = c.r + 2 + rnd() * 3, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (Math.hypot(x, z) < R + 8) continue; const w = 9 + rnd() * 8; const poly = []; for (let k = 0; k < 6; k++) { const aa = k / 6 * 6.28; poly.push([Math.cos(aa) * w * (0.8 + rnd() * 0.4), Math.sin(aa) * w * (0.8 + rnd() * 0.4)]); } const hh = h + 8 - 2.4 - rnd() * 1.4; solid.prism(poly, hh, lerpHex(0x2b303c, 0x58637a, rnd() * 0.8), { x, y: -8, z }, 0.92, 0.14); solid.prism(poly.map(p => [p[0] * 1.03, p[1] * 1.03]), 1.6, 0xf1f6fb, { x, y: -8 + hh - 0.2, z }, 0.97, 0.1); } };
    cliffAround(P, padH, 26); cliffAround(Q, Q.h, 12); cliffAround(W, W.h, 10);
    const ox = P.x, oz = P.z, rot = a0 + Math.PI / 2, at = (lx, lz) => { const c = Math.cos(rot), s = Math.sin(rot); return [ox + lx * c + lz * s, oz - lx * s + lz * c]; };
    const place = (lx, lz, w, d, h, o = {}) => { const [x, z] = at(lx, lz); building(solid, glow, x, z, w, d, h, { y: padH, ry: rot, ...o }); };
    place(0, 6, 46, 24, 15, { wall: C.concrete, trim: C.yellow, glowWin: false }); const [hx, hz] = at(0, 18.3); glow.box(17, 9, 0.35, 0xffd68a, { x: hx, y: padH + 0.2, z: hz, ry: rot }, 1, 1, 0);
    place(-38, 8, 18, 14, 10, { wall: 0x5f636b, trim: C.orange }); place(38, 8, 16, 12, 9, { wall: 0x62666e, trim: C.yellow }); place(-10, -22, 24, 12, 8, { wall: C.concrete });
    place(26, -20, 14, 14, 24, { wall: 0x5a5f68, trim: C.red, taper: 0.9 }); place(-28, -24, 12, 12, 18, { wall: 0x666a72, trim: C.yellow });
    const [tx, tz] = at(12, -12); radioTower(solid, glow, tx, tz, 92, padH); const [t2x, t2z] = at(-46, -14); radioTower(solid, glow, t2x, t2z, 52, padH);
    const [dx, dz] = at(-38, 8); dish(solid, dx, dz, padH + 10, 4, rot, -0.5); const [d2x, d2z] = at(-6, 6); dish(solid, d2x, d2z, padH + 15, 5, rot + 0.6, -0.5); const [d3x, d3z] = at(34, -20); dish(solid, d3x, d3z, padH + 24, 4.2, rot - 0.8, -0.5);
    for (let i = 0; i < 3; i++) { const [cx, cz] = at(46 + i * 7, -10); tank(solid, cx, cz, 3.2, 8, 0x8b9199, padH); }
    for (let i = 0; i < 12; i++) { const [cx, cz] = at(-30 + (i % 6) * 8, 28 + Math.floor(i / 6) * 4.5); container(solid, cx, cz, [C.rust, C.orange, 0x2f5d3a, C.red, 0x3a4a6a][i % 5], rot + 0.04 * i, padH + (i % 4 === 3 ? 2.6 : 0)); }
    for (let i = 0; i < 9; i++) { const [lx, lz] = at(-48 + i * 12, 34); lamp(solid, glow, lx, lz, 6.5, padH); }
    for (const [lx, lz] of [[-52, 24], [52, 22], [-50, -8]]) { const [wx, wz] = at(lx, lz); solid.box(5, 13, 5, C.steel, { x: wx, y: padH, z: wz }, 0.8, 0.8); building(solid, glow, wx, wz, 7.5, 7.5, 4.2, { y: padH + 13, trim: C.red }); glow.box(0.9, 0.9, 0.9, 0xff3b2a, { x: wx, y: padH + 18.6, z: wz }, 1, 1, 0); }
    banner(solid, ...at(-20, 30), 11, 4, 0xb52a22, padH, rot); banner(solid, ...at(22, 30), 11, 4, 0xb52a22, padH, rot);
    // rampa de aço da borda da arena até o pátio, ponte entre plataformas
    const [rx, rz] = at(0, 38); ramp(solid, Math.cos(a0) * (R + 2.5), Math.sin(a0) * (R + 2.5), 1.0, rx, padH + 0.5, rz, 9, 0x3a3d44, C.yellow, false);
    ramp(solid, ...at(46, 0).slice(0, 1), padH + 1, ...at(46, 0).slice(1), Q.x - 8, Q.h + 1, Q.z - 8, 6, 0x3a3d44, C.yellow, false);
    building(solid, glow, Q.x, Q.z, 24, 18, 10, { y: Q.h, wall: 0x5d6168, trim: C.orange }); radioTower(solid, glow, Q.x + 9, Q.z, 56, Q.h);
    building(solid, glow, W.x, W.z, 18, 14, 8, { y: W.h, wall: C.concrete, trim: C.yellow }); dish(solid, W.x + 7, W.z, W.h + 8, 3.4, 1.2); radioTower(solid, glow, W.x - 7, W.z, 38, W.h);
    // perímetro do posto ao redor da arena: cerca amarela, postes de luz, guaritas, pilhas de contêineres e torres de rádio
    const fenceN = 40;
    for (let i = 0; i < fenceN; i++) { const a = i / fenceN * Math.PI * 2, a1 = (i + 0.82) / fenceN * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) < 0.14) continue; fence(solid, Math.cos(a) * (R + 3.8), Math.sin(a) * (R + 3.8), Math.cos(a1) * (R + 3.8), Math.sin(a1) * (R + 3.8), 0, 0xd8a82a, 1.5); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2 + 0.07; lamp(solid, glow, Math.cos(a) * (R + 7), Math.sin(a) * (R + 7), 7, 0, 0xffe3a0); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3, x = Math.cos(a) * (R + 12), z = Math.sin(a) * (R + 12); solid.box(4.5, 8, 4.5, C.steel, { x, y: 0, z }, 0.8, 0.8); building(solid, glow, x, z, 6.5, 6.5, 3.6, { y: 8, ry: -a, trim: C.red, wall: 0x6a6f78 }); glow.box(0.8, 0.8, 0.8, 0xff3b2a, { x, y: 13.2, z }, 1, 1, 0); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.9; for (let k = 0; k < 3; k++) { const r = R + 15 + k * 4.2, x = Math.cos(a + k * 0.03) * r, z = Math.sin(a + k * 0.03) * r; container(solid, x, z, [C.rust, C.orange, 0x2f5d3a, C.red, 0x3a4a6a][(i + k) % 5], -a + Math.PI / 2, 0); if (k === 1) container(solid, x, z, [C.orange, C.rust][i % 2], -a + Math.PI / 2 + 0.1, 0, 6, 2.6, 2.4); } }
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 2.2, r = R + 40, x = Math.cos(a) * r, z = Math.sin(a) * r; radioTower(solid, glow, x, z, 46 + i * 12, hfn(x, z, r)); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.5, x = Math.cos(a) * (R + 9), z = Math.sin(a) * (R + 9); banner(solid, x, z, 9, 3.2, 0xb52a22, 0, a + 1.57); }
    return {};
  },
};

const vale = {
  name: 'Vale Congelado', clutter: 'ice', sky: { ...SKY, top: 0x3a82d6, cover: 0.4, haze: 0.5 }, env: { ...ENV, fogColor: 0xa9c8e2, near: 210, far: 780 }, ground: { kind: 'ice', tint: 0xe8f6ff }, obstacle,
  build(ctx) {
    ctx.mist(18, ctx.R + 20, ctx.R + 110, -6, 8, 110, 0xdff2ff, 0.46);
    const { R, noise, solid, rnd } = ctx, LAKE = -8, rim = mountainHeight(ctx, { amp: 230 });
    const hfn = (x, z, r) => {
      const drop = smooth(R + 3, R + 12, r), plate = noise.fbm(x * 0.012 + 2, z * 0.012, 3) * 2.4, up = smooth(R + 150, R + 330, r);
      return lerp(0, LAKE + 1.2 + plate * 0.5, drop) * (1 - smooth(R + 100, R + 120, r)) + rim(x, z, r) * up + smooth(R + 118, R + 150, r) * (LAKE * -1 + 30 + noise.fbm(x * 0.02, z * 0.02, 3) * 40) * (1 - up);
    };
    ctx.water(LAKE - 0.2, 0x1d6a98, 0.94, 0.1);
    ctx.ring({ R1: 640, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => { if (y < LAKE + 3 && g < 0.5) return lerpHex(0x7ec8e4, 0xe0f6fc, noise.fbm(x * 0.05, z * 0.05, 3)); return snowColor(x, y, z, g, r, ctx); } });
    // paredão de rocha azulada em colunas ao redor do lago, com neve no topo e cortinas de gelo azul
    cliffRing(ctx, { r0: R + 112, r1: R + 140, hmin: 46, hmax: 92, wmin: 18, wmax: 32, cols: [0x232936, 0x56627a], cap: 0xf3f8fc, capH: 3, sides: 6, noise, y0: LAKE - 4, hfn: () => 0 });
    cliffRing(ctx, { r0: R + 150, r1: R + 190, hmin: 70, hmax: 130, wmin: 26, wmax: 44, cols: [0x2a303d, 0x66728a], cap: 0xf3f8fc, capH: 4, sides: 7, noise, y0: -6, hfn: () => 0 });
    for (let i = 0; i < (ctx.touch ? 26 : 56); i++) { const a = rnd() * Math.PI * 2, r = R + 106 + rnd() * 6, x = Math.cos(a) * r, z = Math.sin(a) * r, dx = -x / r, dz = -z / r; iceFall(solid, x, z, LAKE - 1, LAKE + 36 + rnd() * 34, 16 + rnd() * 20, dx, dz); }
    // placas de gelo (azul-turquesa, empilhadas) flutuando no lago e junto à borda
    for (let i = 0; i < (ctx.touch ? 60 : 130); i++) { const a = rnd() * Math.PI * 2, r = R + 10 + rnd() * 95, x = Math.cos(a) * r, z = Math.sin(a) * r, w = 10 + rnd() * 40, d = 8 + rnd() * 30, hh = 0.8 + rnd() * 2.6; if (hfn(x, z, r) > LAKE + 3) continue; const cc = lerpHex(0xcff0fa, 0x7fcbe4, rnd() * 0.7); solid.prism([[-w / 2, -d / 2], [w / 2, -d * 0.45], [w * 0.5, d / 2], [-w * 0.45, d * 0.5]], hh, cc, { x, y: LAKE - 0.5 + rnd() * 0.9, z, ry: rnd() * 6 }, 1, 0.1); if (rnd() < 0.5) solid.prism([[-w * 0.3, -d * 0.3], [w * 0.3, -d * 0.3], [w * 0.3, d * 0.3], [-w * 0.3, d * 0.3]], hh * 0.8, 0xe6f8fd, { x: x + (rnd() - 0.5) * w * 0.3, y: LAKE + hh - 0.4, z, ry: rnd() * 6 }, 0.9, 0.1); }
    scatterPeaks(ctx, hfn, 12, 300, 440, 110, 210);
    scatterPines(ctx, hfn, ctx.touch ? 14 : 30, R + 150, R + 210, 7, 13);
    return {};
  },
};

export const NORTE = { id: 'norte', name: 'Região Norte', biome: 'ice', variants: [montanhas, posto, vale] };
