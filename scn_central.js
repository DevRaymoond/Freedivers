// Região Central: campos abertos, vilarejo e torre de vigilância (planícies).
import { lerpHex, smooth } from './scn_util.js';
import { C, tree, building, container, lamp, radioTower, dish } from './scn_props.js';
import { derrick, mesa, houseWood, windmill, fence, banner, ruinTower, fern } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x3b84dc, horizon: 0xd8e8f4, sunDir: [0.5, 0.55, 0.35], sunCol: 0xfff0cc, cover: 0.55, haze: 0.42, cloudShade: 0xa8bdd8 };
const ENV = { fogColor: 0xbfd5e6, near: 220, far: 880, camFar: 940, hemi: [0xdcecff, 0x7a8a3a, 1.0], sun: [0xfff0cc, 1.75, [55, 80, 35]] };
const GRASS = 0x6f8f35, GRASS_D = 0x56752a, DIRT = 0x8c6a40, ROCKC = 0x6e6a60;

function plainsHeight(ctx, o = {}) {
  const { R, noise } = ctx;
  return (x, z, r) => {
    const u = smooth(R + 4, R + 80, r), far = smooth(R + 170, R + 520, r);
    let h = u * (4 + 20 * noise.fbm(x * 0.008 + 4, z * 0.008, 4)) + far * (noise.ridge(x * 0.0045 + 2, z * 0.0045 + 9, 4) * 110);
    if (o.river) { const d = Math.abs(z - (o.riverZ ?? 150) - 70 * Math.sin(x * 0.011 + 1.3)), k = (1 - smooth(10, 38, d)) * smooth(R + 20, R + 50, r); h = lerp(h, -4.4, k); }
    return h + (o.add ? o.add(x, z, r) : 0);
  };
}
const grassColor = (x, y, z, g, r, ctx) => {
  const n = ctx.noise.fbm(x * 0.03, z * 0.03, 3), grass = lerpHex(lerpHex(GRASS_D, GRASS, n), 0xc8b050, ctx.noise.fbm(x * 0.012 + 6, z * 0.012, 2) * 0.5), rock = lerpHex(ROCKC, 0x4a4840, n);
  if (y < -2.8) return lerpHex(0x6a5a3a, 0x8a7a50, n);
  return lerpHex(grass, rock, smooth(0.55, 1.1, g));
};
function obstacle(kit, r, k) {
  if (k === 0) { kit.rock(1, ROCKC, { sy: 0.9 }, 0, 0.22); kit.rock(0.7, GRASS, { y: 0.45, sy: 0.3 }, 0, 0.2, 0.2); }
  else if (k === 1) { kit.rock(0.8, 0x7a7468, { x: -0.4, sy: 1.0 }, 0, 0.22); kit.rock(0.6, ROCKC, { x: 0.6, z: 0.3, sy: 0.9 }, 0, 0.22); }
  else if (k === 2) { kit.box(1.8, 1.0, 1.0, 0x8a6a42, { ry: 0.3 }, 1, 1, 0.2); kit.box(1.8, 1.0, 1.0, 0x6a4a2c, { y: 1.0, ry: 0.5 }, 1, 1, 0.2); }
  else if (k === 3) { kit.cyl(1.0, 1.0, 0.9, 10, 0xc9a85a, { }, 0.2); kit.cyl(0.95, 0.9, 0.5, 10, 0xe0c070, { y: 0.9 }, 0.2); }
  else if (k === 4) { kit.box(1.4, 1.4, 1.4, 0x8a6a2c, {}, 1, 1, 0.2); kit.box(1.4, 0.1, 1.4, 0x4a3a1a, { y: 1.4 }); kit.box(0.6, 0.6, 0.6, 0x5a6a30, { x: 1.0, z: 0.4 }, 1, 1, 0.2); }
  else { kit.rock(0.9, 0x77705e, { sy: 1.1 }, 0, 0.25); kit.rock(0.4, GRASS_D, { x: 0.5, y: 0.3, sy: 0.5 }, 0, 0.2); }
}
function oaks(ctx, hfn, n, r0, r1, hmin, hmax, minY = -2) {
  const { rnd, solid } = ctx; let k = 0, t = 0;
  while (k < n && t++ < n * 5) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < minY) continue; tree(solid, x, z, hmin + rnd() * (hmax - hmin), lerpHex(0x3f7a2a, 0x6a9a35, rnd()), 0x5a4430, y - 0.2, 4); k++; }
}
function tufts(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < -2) continue; for (let q = 0; q < 3; q++) solid.cyl(0.14, 0.01, 1.0 + rnd() * 0.8, 3, lerpHex(GRASS, 0xc8b050, rnd()), { x: x + (rnd() - 0.5), y, z: z + (rnd() - 0.5) }, 0.2, false); }
}
function farTowers(ctx, hfn, n, r0, r1) {
  const { rnd, solid, glow } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r), h = 40 + rnd() * 50; ruinTower(solid, x, z, 9 + rnd() * 8, h, lerpHex(0x8a8574, 0x6a6558, rnd()), y - 1, 0x4a6a30); glow.box(0.9, 0.9, 0.9, 0xff5a2a, { x, y: y + h + 2, z }, 1, 1, 0); }
}
function farRocks(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r; mesa(solid, x, z, 18 + rnd() * 30, 14 + rnd() * 30, lerpHex(0x8a7d68, 0x6a6050, rnd()), hfn(x, z, r) - 2, null, 7); }
}
function truck(kit, glow, x, z, y, ry, col = 0x8a4a2a) { kit.box(5.4, 1.8, 2.4, col, { x, y: y + 0.6, z, ry }, 1, 1, 0.14); const c = Math.cos(ry), s = Math.sin(ry); kit.box(2.2, 1.6, 2.4, 0x3a3a3a, { x: x + s * 3.4, y: y + 0.6, z: z + c * 3.4, ry }, 0.9, 1, 0.1); glow.box(0.3, 0.3, 0.1, 0xfff0b0, { x: x + s * 4.5 + c * 0.8, y: y + 1.2, z: z + c * 4.5 - s * 0.8, ry }, 1, 1, 0); }

const campos = {
  name: 'Campos Abertos', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xffffff }, obstacle,
  build(ctx) {
    const { R, noise, rnd, solid } = ctx, hfn = plainsHeight(ctx, { river: true });
    ctx.water(-2.6, 0x4a9ac0, 0.88, 0.1);
    ctx.ring({ R1: 680, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => grassColor(x, y, z, g, r, ctx) });
    oaks(ctx, hfn, ctx.touch ? 40 : 90, R + 6, R + 260, 10, 20);
    tufts(ctx, hfn, ctx.touch ? 120 : 300, R + 2, R + 100);
    farRocks(ctx, hfn, 20, R + 120, R + 480);
    farTowers(ctx, hfn, 7, R + 160, R + 420);
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = R + 10 + rnd() * 90, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.rock(1.4 + rnd() * 2.4, lerpHex(ROCKC, 0x4a4840, rnd()), { x, y: hfn(x, z, r), z, sy: 0.8 }, 0, 0.22); }
    return {};
  },
};

const vilarejo = {
  name: 'Vilarejo', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xf4efd8 }, obstacle,
  build(ctx) {
    const { R, noise, rnd, solid, glow } = ctx, hfn = plainsHeight(ctx, { river: true, riverZ: -170 });
    ctx.water(-2.6, 0x4a9ac0, 0.88, 0.1);
    ctx.ring({ R1: 680, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => { const c = grassColor(x, y, z, g, r, ctx); return lerpHex(c, DIRT, 0.35 * smooth(R + 5, R + 25, r) * (1 - smooth(R + 40, R + 120, r)) * noise.fbm(x * 0.02, z * 0.02, 2) * 2); } });
    oaks(ctx, hfn, ctx.touch ? 28 : 56, R + 6, R + 250, 10, 18);
    tufts(ctx, hfn, ctx.touch ? 60 : 160, R + 2, R + 100);
    farRocks(ctx, hfn, 14, R + 150, R + 480); farTowers(ctx, hfn, 5, R + 190, R + 440);
    // casas, celeiros e cercas formando o povoado, com moinho e torre de petróleo
    const wallc = [0x8a6a42, 0x9a7a4c, 0x7a5a38, 0xa88a58], roofc = [0x5a4030, 0x6a3a2a, 0x4a3828];
    const cx = Math.cos(0.9) * (R + 70), cz = Math.sin(0.9) * (R + 70);
    for (let i = 0; i < (ctx.touch ? 10 : 18); i++) { const a = rnd() * 6.28, d = 12 + rnd() * 55, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = hfn(x, z, Math.hypot(x, z)); houseWood(solid, glow, x, z, 7 + rnd() * 6, 6 + rnd() * 5, 3.6 + rnd() * 2.4, y, a + 1.57, wallc[i % 4], roofc[i % 3]); }
    houseWood(solid, glow, cx - 20, cz + 12, 16, 10, 6, hfn(cx - 20, cz + 12, R + 60), 0.3, 0x9a4a2a, 0x4a3a2a);
    windmill(solid, cx + 22, cz - 10, 30, hfn(cx + 22, cz - 10, R + 70), 0.9, 0.35); windmill(solid, Math.cos(-1.0) * (R + 90), Math.sin(-1.0) * (R + 90), 24, hfn(Math.cos(-1.0) * (R + 90), Math.sin(-1.0) * (R + 90), R + 90), -0.4, 1.2);
    derrick(solid, glow, cx - 34, cz - 22, 22, hfn(cx - 34, cz - 22, R + 80), 0x4a3a30);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.3, x0 = cx + Math.cos(a) * 52, z0 = cz + Math.sin(a) * 52, x1 = cx + Math.cos(a + 0.9) * 52, z1 = cz + Math.sin(a + 0.9) * 52; fence(solid, x0, z0, x1, z1, hfn(x0, z0, R + 70)); }
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 40, x = Math.cos(a) * r, z = Math.sin(a) * r; fence(solid, x, z, x + 8, z + 3, hfn(x, z, r)); }
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 40 + rnd() * 80, x = Math.cos(a) * r, z = Math.sin(a) * r; banner(solid, x, z, 8, 2.4, 0xb52a22, hfn(x, z, r), a); }
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, d = 6 + rnd() * 40, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; solid.box(1.4, 1.2, 1.4, 0x8a6a2c, { x, y: hfn(x, z, R + 70), z, ry: rnd() * 3 }, 1, 1, 0.2); }
    return {};
  },
};

const torre = {
  name: 'Torre de Vigilância', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xf0ecd2 }, obstacle,
  build(ctx) {
    const { R, noise, rnd, solid, glow } = ctx, tx = Math.cos(0.5) * (R + 85), tz = Math.sin(0.5) * (R + 85);
    const hfn = plainsHeight(ctx, { river: false, add: (x, z, r) => { const d = Math.hypot(x - tx, z - tz); return (1 - smooth(18, 70, d)) * (34 + 6 * noise.fbm(x * 0.05, z * 0.05, 2)); } });
    ctx.ring({ R1: 680, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => grassColor(x, y, z, g, r, ctx) });
    oaks(ctx, hfn, ctx.touch ? 30 : 60, R + 6, R + 250, 10, 18);
    tufts(ctx, hfn, ctx.touch ? 60 : 150, R + 2, R + 100);
    farRocks(ctx, hfn, 14, R + 140, R + 480);
    // torre alta sobre a colina: pernas em treliça, cabine com janelas, faixa vermelha, antenas, andaimes
    const ty = hfn(tx, tz, R + 85) - 1, H = 56, S = 0xa89b82;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) solid.strut(tx + sx * 8, ty, tz + sz * 8, tx + sx * 4.2, ty + H, tz + sz * 4.2, 1.3, 0x5a4a38);
    for (let k = 1; k < 8; k++) { const f = k / 8, w = 8 * (1 - f * 0.48); for (const [sx, sz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) solid.strut(tx + sx * w, ty + f * H, tz + sz * w, tx + ex * w, ty + f * H, tz + ez * w, 0.5, 0x5a4a38); }
    building(solid, glow, tx, tz, 14, 14, 9, { y: ty + H, wall: S, trim: 0xb52a22, roof: 0x4a3f33, win: 0xffd070, taper: 0.9 });
    solid.box(18, 1, 18, 0x3a3228, { x: tx, y: ty + H - 0.5, z: tz });
    banner(solid, tx + 8, tz, 24, 7, 0xb52a22, ty + H - 10, 0); banner(solid, tx - 8, tz + 2, 20, 6, 0xb52a22, ty + H - 8, 3.14);
    radioTower(solid, glow, tx, tz, 26, ty + H + 9, 0x4a4038); dish(solid, tx + 5, tz + 4, ty + H + 9, 2.4, 0.8);
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28, d = 24 + (i % 3) * 5; solid.rock(5 + (i % 4) * 1.5, lerpHex(ROCKC, 0x4a4840, (i % 5) / 5), { x: tx + Math.cos(a) * d, y: hfn(tx + Math.cos(a) * d, tz + Math.sin(a) * d, R + 85) - 1, z: tz + Math.sin(a) * d, sy: 0.8 }, 0, 0.25); }
    for (let i = 0; i < 3; i++) { const a = 2.4 + i * 0.5, d = 30, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; truck(solid, glow, x, z, hfn(x, z, R + 85), a, [0x8a4a2a, 0x4a5a38, 0x6a6a70][i]); }
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, d = 20 + rnd() * 18, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; container(solid, x, z, [0x9a5a2a, 0x5a6a3a, 0x7a2a22][i % 3], rnd() * 3, hfn(x, z, R + 85), 3.2, 1.6, 1.6); }
    for (let i = 0; i < 6; i++) { const a = 2.8 + i * 0.35, d1 = 55, x0 = tx + Math.cos(a) * d1, z0 = tz + Math.sin(a) * d1; fence(solid, x0, z0, x0 + 9, z0 + 4, hfn(x0, z0, R + 85)); }
    return {};
  },
};
export const CENTRAL = { id: 'central', name: 'Região Central', biome: 'plains', variants: [campos, vilarejo, torre] };
