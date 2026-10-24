// Região Central: campos abertos, vilarejo e torre de vigilância (planícies).
import { lerpHex, smooth } from './scn_util.js';
import { C, tree, building, container, lamp, radioTower, dish } from './scn_props.js';
import { derrick, mesa, houseWood, windmill, fence, banner, ruinTower, fern, hay, tent, stall, watchtowerWood, well, barn, bush, cliffRing, wall, obstacleSet } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x3a82dc, horizon: 0xdcebf5, sunDir: [0.5, 0.55, 0.35], sunCol: 0xfff0cc, cover: 0.55, haze: 0.4, cloudShade: 0xa8bdd8 };
const ENV = { fogColor: 0xbcd3e6, near: 240, far: 900, camFar: 960, hemi: [0xe2efff, 0x8a9a46, 1.05], sun: [0xfff0cc, 1.8, [55, 80, 35]], exposure: 1.12 };
const GRASS = 0x7a9a38, GRASS_D = 0x58782a, DIRT = 0x8c6a40, ROCKC = 0x7a766a;

function plainsHeight(ctx, o = {}) {
  const { R, noise } = ctx;
  return (x, z, r) => {
    const u = smooth(R + 4, R + 80, r), far = smooth(R + 170, R + 520, r);
    let h = u * (3 + 16 * noise.fbm(x * 0.008 + 4, z * 0.008, 4)) + far * (noise.ridge(x * 0.0045 + 2, z * 0.0045 + 9, 4) * 120);
    if (o.river) { const d = Math.abs(z - (o.riverZ ?? 150) - 70 * Math.sin(x * 0.011 + 1.3)), k = (1 - smooth(10, 38, d)) * smooth(R + 20, R + 50, r); h = lerp(h, -4.4, k); }
    return h + (o.add ? o.add(x, z, r) : 0);
  };
}
const grassColor = (x, y, z, g, r, ctx) => {
  const n = ctx.noise.fbm(x * 0.03, z * 0.03, 3), grass = lerpHex(lerpHex(GRASS_D, GRASS, n), 0xc8b050, ctx.noise.fbm(x * 0.012 + 6, z * 0.012, 2) * 0.7), rock = lerpHex(ROCKC, 0x4a4840, n);
  if (y < -2.8) return lerpHex(0x6a5a3a, 0x8a7a50, n);
  return lerpHex(grass, rock, smooth(0.55, 1.2, g));
};
function obstacle(kit, r, k) {
  if (k === 0) { kit.rock(1, ROCKC, { sy: 0.9 }, 0, 0.22); kit.rock(0.7, GRASS, { y: 0.45, sy: 0.3 }, 0, 0.2, 0.2); }
  else if (k === 1) { kit.rock(0.8, 0x8a8478, { x: -0.4, sy: 1.0 }, 0, 0.22); kit.rock(0.6, ROCKC, { x: 0.6, z: 0.3, sy: 0.9 }, 0, 0.22); kit.rock(0.4, GRASS_D, { x: -0.4, y: 0.6, sy: 0.4 }, 0, 0.2, 0.2); }
  else if (k === 2) { kit.box(1.8, 1.0, 1.0, 0x8a6a42, { ry: 0.3 }, 1, 1, 0.2); kit.box(1.8, 1.0, 1.0, 0x6a4a2c, { y: 1.0, ry: 0.5 }, 1, 1, 0.2); kit.box(1.2, 0.8, 0.9, 0x9a7a4a, { y: 2.0, ry: 0.1 }, 1, 1, 0.2); }
  else if (k === 3) { hay(kit, 0, 0, 0, 0.4, 1.0); hay(kit, 0.2, 0.9, 0, 0.9, 0.8); hay(kit, 0.1, 0.4, 1.0, 0.2, 0.7); }
  else if (k === 4) { kit.box(1.5, 1.5, 1.5, 0x8a6a2c, {}, 1, 1, 0.2); kit.box(1.5, 0.1, 1.5, 0x4a3a1a, { y: 1.5 }); kit.box(1.0, 1.0, 1.0, 0x6a7a30, { x: 1.2, z: 0.4 }, 1, 1, 0.2); }
  else { kit.rock(0.9, 0x86806e, { sy: 1.2 }, 0, 0.25); kit.rock(0.4, GRASS_D, { x: 0.5, y: 0.3, sy: 0.5 }, 0, 0.2); }
}
function oaks(ctx, hfn, n, r0, r1, hmin, hmax, minY = -2) {
  const { rnd, solid } = ctx; let k = 0, t = 0;
  while (k < n && t++ < n * 5) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < minY) continue; tree(solid, x, z, hmin + rnd() * (hmax - hmin), lerpHex(0x3f7a2a, 0x7aa83a, rnd()), 0x5a4430, y - 0.2, 4); k++; }
}
function tufts(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < -2) continue; for (let q = 0; q < 3; q++) solid.cyl(0.14, 0.01, 1.0 + rnd() * 0.8, 3, lerpHex(GRASS, 0xd8c050, rnd()), { x: x + (rnd() - 0.5), y, z: z + (rnd() - 0.5) }, 0.2, false); }
}
function farTowers(ctx, hfn, n, r0, r1) {
  const { rnd, solid, glow } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r), h = 40 + rnd() * 50; ruinTower(solid, x, z, 9 + rnd() * 8, h, lerpHex(0x9a9484, 0x7a7568, rnd()), y - 1, 0x4a6a30); glow.box(0.9, 0.9, 0.9, 0xff5a2a, { x, y: y + h + 2, z }, 1, 1, 0); }
}
function farRocks(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r; mesa(solid, x, z, 18 + rnd() * 30, 14 + rnd() * 34, lerpHex(0x9a8d78, 0x7a7060, rnd()), hfn(x, z, r) - 2, 0x6a8a38, 7); }
}
function boulders(ctx, hfn, n, r0, r1, s0 = 1.6, s1 = 5) {
  const { rnd, solid } = ctx; for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, s = s0 + rnd() * (s1 - s0); solid.rock(s, lerpHex(ROCKC, 0x4a4840, rnd()), { x, y: hfn(x, z, r) + s * 0.1, z, sy: 0.85 }, 0, 0.24); if (rnd() < 0.5) solid.rock(s * 0.5, 0x6a8a38, { x, y: hfn(x, z, r) + s * 0.55, z, sy: 0.4 }, 0, 0.2, 0.2); }
}
function truck(kit, glow, x, z, y, ry, col = 0x8a4a2a) { kit.box(5.4, 1.8, 2.4, col, { x, y: y + 0.6, z, ry }, 1, 1, 0.14); const c = Math.cos(ry), s = Math.sin(ry); kit.box(2.2, 1.6, 2.4, 0x3a3a3a, { x: x + s * 3.4, y: y + 0.6, z: z + c * 3.4, ry }, 0.9, 1, 0.1); glow.box(0.3, 0.3, 0.1, 0xfff0b0, { x: x + s * 4.5 + c * 0.8, y: y + 1.2, z: z + c * 4.5 - s * 0.8, ry }, 1, 1, 0); }
// estrada de terra em anel junto à arena (faixa fina acima do terreno)
function dirtRing(ctx, hfn, r, w = 6, n = 80) { const { solid } = ctx; for (let i = 0; i < n; i++) { const a0 = i / n * 6.28, a1 = (i + 1) / n * 6.28, x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r, len = Math.hypot(x1 - x0, z1 - z0) * 1.05; solid.box(w, 0.12, len, DIRT, { x: (x0 + x1) / 2, y: hfn((x0 + x1) / 2, (z0 + z1) / 2, r) + 0.02, z: (z0 + z1) / 2, ry: Math.atan2(x1 - x0, z1 - z0) }, 1, 1, 0.2); } }

const campos = {
  name: 'Campos Abertos', clutter: 'grass', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(8, ctx.R + 40, ctx.R + 260, 2, 12, 140, 0xffffff, 0.2);
    const { R, noise, rnd, solid, glow } = ctx, hfn = plainsHeight(ctx, { river: true });
    ctx.water(-2.6, 0x4a9ac0, 0.88, 0.1);
    ctx.ring({ R1: 700, nr: 60, nt: 190, height: hfn, color: (x, y, z, g, r) => grassColor(x, y, z, g, r, ctx) });
    oaks(ctx, hfn, ctx.touch ? 50 : 110, R + 6, R + 270, 10, 22);
    tufts(ctx, hfn, ctx.touch ? 120 : 300, R + 2, R + 100);
    boulders(ctx, hfn, ctx.touch ? 14 : 28, R + 4, R + 70, 2.4, 6);
    farRocks(ctx, hfn, 22, R + 120, R + 500); farTowers(ctx, hfn, 8, R + 160, R + 430);
    // postos de vigia de madeira, pontes e muretas espalhados pelos campos
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.4, r = R + 40 + rnd() * 90, x = Math.cos(a) * r, z = Math.sin(a) * r; watchtowerWood(solid, glow, x, z, 9 + rnd() * 5, hfn(x, z, r), a); }
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, r = R + 120 + rnd() * 200, x = Math.cos(a) * r, z = Math.sin(a) * r; wall(solid, x, z, x + 20 + rnd() * 20, z + (rnd() - 0.5) * 12, 6 + rnd() * 6, 3, 0x8a8574, hfn(x, z, r) - 0.4, true); }
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r; bush(solid, x, z, 1.2 + rnd() * 1.3, hfn(x, z, r), lerpHex(0x4a7a2a, 0x7aa83a, rnd())); }
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r; if (hfn(x, z, r) < -2) continue; solid.cyl(0.07, 0.03, 0.5, 4, [0xf6f2e0, 0xf0c030, 0xd8483a][i % 3], { x, y: hfn(x, z, r) + 0.7, z }, 0.1); }
    return {};
  },
};

const vilarejo = {
  name: 'Vilarejo', clutter: 'grass', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xf4efd8 }, obstacle: obstacleSet('village', obstacle),
  build(ctx) {
    const { R, noise, rnd, solid, glow } = ctx, hfn = plainsHeight(ctx, { river: true, riverZ: -170 });
    ctx.water(-2.6, 0x4a9ac0, 0.88, 0.1);
    ctx.ring({ R1: 700, nr: 60, nt: 190, height: hfn, color: (x, y, z, g, r) => { const c = grassColor(x, y, z, g, r, ctx); return lerpHex(c, DIRT, 0.45 * smooth(R + 5, R + 25, r) * (1 - smooth(R + 50, R + 120, r)) * noise.fbm(x * 0.02, z * 0.02, 2) * 1.6); } });
    oaks(ctx, hfn, ctx.touch ? 30 : 64, R + 6, R + 260, 10, 20);
    tufts(ctx, hfn, ctx.touch ? 60 : 160, R + 2, R + 100);
    farRocks(ctx, hfn, 16, R + 150, R + 500); farTowers(ctx, hfn, 5, R + 190, R + 440);
    dirtRing(ctx, hfn, R + 14, 7, 90); dirtRing(ctx, hfn, R + 46, 5, 110);
    // povoado em volta da arena (casas de madeira, celeiros, barracas, cercas, poços) + moinhos e torres de petróleo
    const wallc = [0x8a6a42, 0x9a7a4c, 0x7a5a38, 0xa88a58, 0x9a5a3a], roofc = [0x5a4030, 0x6a3a2a, 0x4a3828, 0x7a4a2a];
    const nH = ctx.touch ? 22 : 40;
    for (let i = 0; i < nH; i++) { const a = i / nH * 6.28 + rnd() * 0.07, r = R + 22 + rnd() * 34 + (i % 3) * 12, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < -1.5) continue; if (i % 9 === 4) barn(solid, glow, x, z, y, a + 1.57); else houseWood(solid, glow, x, z, 7 + rnd() * 6, 6 + rnd() * 5, 3.4 + rnd() * 3.2, y, a + 1.57 + (rnd() - 0.5) * 0.3, wallc[i % 5], roofc[i % 4]); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28 + 0.2, r = R + 12, x = Math.cos(a) * r, z = Math.sin(a) * r; stall(solid, x, z, [0xb52a22, 0x3a6aa8, 0xd8a030, 0x4a8a3a][i % 4], hfn(x, z, r), a + 1.57); }
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 16 + rnd() * 40, x = Math.cos(a) * r, z = Math.sin(a) * r; well(solid, x, z, hfn(x, z, r)); hay(solid, x + 4, z + 3, hfn(x, z, r), rnd() * 3); hay(solid, x - 3, z + 5, hfn(x, z, r), rnd() * 3); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.5, r = R + 70 + rnd() * 30, x = Math.cos(a) * r, z = Math.sin(a) * r; windmill(solid, x, z, 24 + rnd() * 10, hfn(x, z, r), a + 3.14, rnd() * 3); }
    for (let i = 0; i < 4; i++) { const a = 0.8 + i * 1.6, r = R + 95 + rnd() * 25, x = Math.cos(a) * r, z = Math.sin(a) * r; derrick(solid, glow, x, z, 24 + rnd() * 8, hfn(x, z, r), 0x4a3a30); }
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, x0 = Math.cos(a) * (R + 4), z0 = Math.sin(a) * (R + 4), x1 = Math.cos(a + 0.4) * (R + 4), z1 = Math.sin(a + 0.4) * (R + 4); fence(solid, x0, z0, x1, z1, hfn(x0, z0, R + 4)); }
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = R + 30 + rnd() * 70, x = Math.cos(a) * r, z = Math.sin(a) * r; banner(solid, x, z, 8, 2.4, 0xb52a22, hfn(x, z, r), a); }
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = R + 28 + rnd() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.box(1.4, 1.2, 1.4, 0x8a6a2c, { x, y: hfn(x, z, r), z, ry: rnd() * 3 }, 1, 1, 0.2); }
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = R + 30 + rnd() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r; lamp(solid, glow, x, z, 5, hfn(x, z, r), 0xffd890); }
    return {};
  },
};

const torre = {
  name: 'Torre de Vigilância', clutter: 'grass', sky: SKY, env: ENV, ground: { kind: 'grass', tint: 0xf0ecd2 }, obstacle: obstacleSet('military', obstacle),
  build(ctx) {
    const { R, noise, rnd, solid, glow } = ctx, tx = Math.cos(0.5) * (R + 90), tz = Math.sin(0.5) * (R + 90);
    const hfn = plainsHeight(ctx, { river: false, add: (x, z, r) => { const d = Math.hypot(x - tx, z - tz); return (1 - smooth(14, 56, d)) * (30 + 8 * noise.fbm(x * 0.05, z * 0.05, 2)); } });
    ctx.ring({ R1: 700, nr: 60, nt: 190, height: hfn, color: (x, y, z, g, r) => { const d = Math.hypot(x - tx, z - tz); return lerpHex(grassColor(x, y, z, g, r, ctx), lerpHex(0x9a937f, 0x74705f, noise.fbm(x * 0.09, z * 0.09, 2)), smooth(0.9, 0.3, d / 60) * 0.8 * smooth(4, 14, y)); } });
    oaks(ctx, hfn, ctx.touch ? 34 : 70, R + 6, R + 260, 10, 20);
    tufts(ctx, hfn, ctx.touch ? 60 : 150, R + 2, R + 100);
    boulders(ctx, hfn, ctx.touch ? 14 : 26, R + 4, R + 70, 2.4, 6);
    farRocks(ctx, hfn, 16, R + 150, R + 500); farTowers(ctx, hfn, 5, R + 190, R + 440);
    // torre alta sobre a colina rochosa: pernas em treliça, cabine com janelas, faixas vermelhas, antenas, escadas e andaimes
    const ty = hfn(tx, tz, R + 90) - 1, H = 62, S = 0xb8ab90;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) solid.strut(tx + sx * 9, ty, tz + sz * 9, tx + sx * 4.6, ty + H, tz + sz * 4.6, 1.4, 0x5a4a38);
    for (let k = 1; k < 9; k++) { const f = k / 9, w = 9 * (1 - f * 0.49); for (const [sx, sz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) { solid.strut(tx + sx * w, ty + f * H, tz + sz * w, tx + ex * w, ty + f * H, tz + ez * w, 0.55, 0x5a4a38); solid.strut(tx + sx * w, ty + f * H, tz + sz * w, tx + ex * w * (1 - 0.05), ty + (f + 0.11) * H, tz + ez * w, 0.4, 0x5a4a38); } }
    building(solid, glow, tx, tz, 16, 16, 10, { y: ty + H, wall: S, trim: 0xb52a22, roof: 0x4a3f33, win: 0xffd070, taper: 0.9 });
    solid.box(20, 1.1, 20, 0x3a3228, { x: tx, y: ty + H - 0.5, z: tz });
    banner(solid, tx + 9, tz, 26, 8, 0xb52a22, ty + H - 12, 0); banner(solid, tx - 9, tz + 2, 22, 7, 0xb52a22, ty + H - 10, 3.14); banner(solid, tx, tz + 9.5, 24, 7, 0xb52a22, ty + H - 12, 1.57);
    radioTower(solid, glow, tx, tz, 28, ty + H + 10, 0x4a4038); dish(solid, tx + 6, tz + 4, ty + H + 10, 2.6, 0.8);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, d = 26 + (i % 3) * 6, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; solid.rock(5 + (i % 4) * 1.6, lerpHex(ROCKC, 0x4a4840, (i % 5) / 5), { x, y: hfn(x, z, R + 90) - 1, z, sy: 0.8 }, 0, 0.25); }
    for (let i = 0; i < 4; i++) { const a = 2.2 + i * 0.5, d = 34, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; truck(solid, glow, x, z, hfn(x, z, R + 90), a, [0x8a4a2a, 0x4a5a38, 0x6a6a70, 0x9a7a2a][i]); }
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = 22 + rnd() * 24, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d; container(solid, x, z, [0x9a5a2a, 0x5a6a3a, 0x7a2a22][i % 3], rnd() * 3, hfn(x, z, R + 90), 3.2, 1.6, 1.6); }
    for (let i = 0; i < 6; i++) { const a = 2.5 + i * 0.38, d1 = 55, x0 = tx + Math.cos(a) * d1, z0 = tz + Math.sin(a) * d1; fence(solid, x0, z0, x0 + 9, z0 + 4, hfn(x0, z0, R + 90)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 1.2, r = R + 30 + rnd() * 110, x = Math.cos(a) * r, z = Math.sin(a) * r; watchtowerWood(solid, glow, x, z, 10 + rnd() * 6, hfn(x, z, r), a); }
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = R + 8 + rnd() * 40, x = Math.cos(a) * r, z = Math.sin(a) * r; tent(solid, x, z, 4 + rnd() * 2, 3, [0xd8cfae, 0x8a9a6a, 0xb8a888][i % 3], hfn(x, z, r), rnd() * 3); }
    return {};
  },
};
export const CENTRAL = { id: 'central', name: 'Região Central', biome: 'plains', variants: [campos, vilarejo, torre] };
