// Região Sudeste: dunas e cânions, cidade abandonada e cratera gigante.
import { lerpHex, smooth } from './scn_util.js';
import { C, building, container, bridge, lamp, radioTower } from './scn_props.js';
import { derrick, mesa, tank, banner, arch, wall, smokestack, crane, cliffRing } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x4a7fc0, horizon: 0xf3c9a0, sunDir: [0.6, 0.4, 0.4], sunCol: 0xffe2b0, cover: 0.28, haze: 0.72, cloudCol: 0xfff0e0, cloudShade: 0xe0a67c };
const ENV = { fogColor: 0xe3b890, near: 120, far: 700, camFar: 760, hemi: [0xffe3c4, 0x93502e, 0.95], sun: [0xffe0b4, 1.85, [60, 55, 40]] };
const SAND = 0xdf8e50, SAND_D = 0xb8693a, ROCK = 0xa8482c, ROCK_D = 0x5e281a, METAL = 0x4a423c;

const sandColor = (x, y, z, g, r, ctx) => {
  const n = ctx.noise.fbm(x * 0.03, z * 0.03, 3), rock = lerpHex(ROCK, ROCK_D, 0.4 + 0.6 * n), sand = lerpHex(SAND, 0xf0a868, ctx.noise.fbm(x * 0.012 + 8, z * 0.012, 2));
  return lerpHex(sand, rock, smooth(0.7, 1.4, g));
};
function obstacle(kit, r, k) {
  if (k === 0) { kit.rock(1, ROCK, { sy: 1.0 }, 0, 0.22); kit.rock(0.5, SAND_D, { x: 0.6, z: 0.2, sy: 0.6 }, 0, 0.2); }
  else if (k === 1) { mesa(kit, 0, 0, 1.0, 1.9, ROCK, 0, null, 6); }
  else if (k === 2) { kit.box(0.5, 2.2, 1.4, METAL, { rz: 0.35, y: 0 }, 0.9, 0.9, 0.2); kit.box(0.25, 1.6, 1.0, 0x6a5a4a, { x: 0.5, rz: 0.2 }, 0.9, 0.9, 0.2); }
  else if (k === 3) { kit.rock(0.8, ROCK_D, { x: -0.4, sy: 1.1 }, 0, 0.22); kit.rock(0.7, ROCK, { x: 0.6, z: 0.3, sy: 0.9 }, 0, 0.22); kit.rock(0.5, SAND_D, { x: 0.1, z: -0.7, sy: 0.7 }, 0, 0.2); }
  else if (k === 4) { kit.box(1.8, 1.4, 1.4, 0x7a6a58, { ry: 0.4 }, 0.9, 0.9, 0.2); kit.box(1.2, 0.8, 1.0, 0x5a4a3c, { y: 1.4, ry: 0.9 }, 0.8, 0.8, 0.2); }
  else { kit.cyl(0.3, 0.25, 2.8, 6, METAL, { rx: 0.25 }, 0.2); kit.box(1.4, 0.2, 0.2, METAL, { y: 2.2, rx: 0.25 }); }
}
function scatterMesas(ctx, hfn, n, r0, r1, hmin, hmax, w0 = 14, w1 = 36) {
  const { rnd, solid } = ctx;
  for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r; mesa(solid, x, z, w0 + rnd() * (w1 - w0), hmin + rnd() * (hmax - hmin), lerpHex(ROCK, 0xc8603a, rnd() * 0.5), hfn(x, z, r) - 3, null, 7); }
}
function scatterRubble(ctx, hfn, n, r0, r1) {
  const { rnd, solid } = ctx;
  for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r; solid.rock(0.8 + rnd() * 2.2, lerpHex(ROCK, ROCK_D, rnd()), { x, y: hfn(x, z, r), z, sy: 0.7 }, 0, 0.2); }
}
function duneHeight(ctx, o = {}) {
  const { R, noise } = ctx;
  return (x, z, r) => {
    const u = smooth(R + 4, R + 60, r), wx = x + 60 * noise.fbm(x * 0.006, z * 0.006, 2), crest = 0.5 + 0.5 * Math.sin(wx * 0.022 + noise.fbm(x * 0.01, z * 0.01, 2) * 6), dune = Math.pow(crest, 1.6) * (14 + 10 * noise.fbm(x * 0.008 + 4, z * 0.008, 2));
    const far = smooth(R + 140, R + 420, r) * noise.ridge(x * 0.005 + 5, z * 0.005 + 1, 4) * (o.amp ?? 70);
    return u * dune + far + (o.add ? o.add(x, z, r) : 0);
  };
}

const dunas = {
  name: 'Dunas e Cânions', clutter: 'sand', sky: SKY, env: ENV, ground: { kind: 'sand', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(12, ctx.R + 40, ctx.R + 300, 2, 14, 130, 0xf0d0a8, 0.3);
    const { R, rnd, solid, glow } = ctx, hfn = duneHeight(ctx);
    ctx.ring({ R1: 620, nr: 56, nt: 170, height: hfn, color: (x, y, z, g, r) => sandColor(x, y, z, g, r, ctx) });
    scatterMesas(ctx, hfn, ctx.touch ? 16 : 30, R + 60, R + 420, 25, 95);
    // arcos naturais de pedra vermelha
    for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, r = R + 90 + rnd() * 200, x = Math.cos(a) * r, z = Math.sin(a) * r; arch(solid, x, z, 22 + rnd() * 10, 22 + rnd() * 12, 8, ROCK, hfn(x, z, r) - 1, a); }
    // derricks e torres de perfuração em cima das formações, ponte de ferro entre elas
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 40 + rnd() * 160, x = Math.cos(a) * r, z = Math.sin(a) * r; derrick(solid, glow, x, z, 22 + rnd() * 20, hfn(x, z, r), METAL); }
    const a0 = 0.7, ax = Math.cos(a0) * (R + 90), az = Math.sin(a0) * (R + 90), bx = Math.cos(a0 + 0.35) * (R + 140), bz = Math.sin(a0 + 0.35) * (R + 140);
    mesa(solid, ax, az, 26, 36, ROCK, hfn(ax, az, R + 90) - 3, null, 7); mesa(solid, bx, bz, 24, 40, ROCK, hfn(bx, bz, R + 140) - 3, null, 7);
    bridge(solid, ax, az, bx, bz, 32, 5, { deck: METAL, rail: 0xc0842a, y0: 0, pillars: 0 });
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 10 + rnd() * 110, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.box(1.4, 6 + rnd() * 6, 3, METAL, { x, y: hfn(x, z, r) - 0.3, z, rz: 0.3 + rnd() * 0.3, ry: rnd() * 6 }, 0.9, 0.9, 0.2); }
    scatterRubble(ctx, hfn, ctx.touch ? 30 : 70, R + 4, R + 140);
    return {};
  },
};

const cidade = {
  name: 'Cidade Abandonada', clutter: 'sand', sky: { ...SKY, haze: 0.8, cover: 0.34 }, env: { ...ENV, near: 90, far: 620 }, ground: { kind: 'sand', tint: 0xf2d2b0 }, obstacle,
  build(ctx) {
    ctx.mist(14, ctx.R + 20, ctx.R + 200, 2, 16, 120, 0xe8c49a, 0.36);
    const { R, rnd, solid, glow } = ctx, hfn = duneHeight(ctx, { amp: 50 });
    ctx.ring({ R1: 620, nr: 56, nt: 170, height: hfn, color: (x, y, z, g, r) => sandColor(x, y, z, g, r, ctx) });
    scatterMesas(ctx, hfn, ctx.touch ? 8 : 16, R + 230, R + 460, 30, 90, 18, 40);
    const walls = [0x6a5a4c, 0x7a6a58, 0x594a3e, 0x84705c], trim = [0xc08030, 0x9a4a2a, 0x6a6a70];
    // quarteirões de prédios em ruínas: caixas altas, alguns inclinados, janelas acesas raras
    for (let i = 0; i < (ctx.touch ? 42 : 90); i++) {
      const a = rnd() * 6.28, r = R + 14 + Math.pow(rnd(), 0.75) * 190, x = Math.cos(a) * r, z = Math.sin(a) * r, w = 9 + rnd() * 16, d = 9 + rnd() * 16, h = 8 + rnd() * (r > R + 100 ? 46 : 28);
      building(solid, glow, x, z, w, d, h, { y: hfn(x, z, r) - 0.4, ry: rnd() * 1.6, wall: walls[i % 4], trim: trim[i % 3], win: 0xffb24a, glowWin: rnd() < 0.35, taper: 0.92 + rnd() * 0.08 });
      if (rnd() < 0.4) solid.box(w * 0.5, h * 0.18, d * 0.5, 0x3a322c, { x: x + (rnd() - 0.5) * w * 0.4, y: hfn(x, z, r) - 0.4 + h, z: z + (rnd() - 0.5) * d * 0.4, ry: rnd() * 2 }, 0.9, 0.9, 0.25);
    }
    // torre central de aço (landmark), antenas, torres de água e chaminés
    const tx = Math.cos(1.2) * (R + 120), tz = Math.sin(1.2) * (R + 120); radioTower(solid, glow, tx, tz, 110, hfn(tx, tz, R + 120), METAL);
    for (let i = 0; i < 4; i++) { const a = 1.2 + (i - 1.5) * 0.3, r = R + 100 + (i % 2) * 40, x = Math.cos(a) * r, z = Math.sin(a) * r; tank(solid, x, z, 5, 10, 0x6a6258, hfn(x, z, r) + 18); for (const [sx, sz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) solid.box(0.5, 18, 0.5, METAL, { x: x + sx, y: hfn(x, z, r), z: z + sz }); }
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.28, r = R + 60 + rnd() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r; smokestack(solid, glow, x, z, 34 + rnd() * 22, 3, hfn(x, z, r), 0x6a5a4c); }
    // viadutos de aço ligando quarteirões
    for (let i = 0; i < 3; i++) { const a = 0.2 + i * 2.1, r1 = R + 60 + i * 15, x0 = Math.cos(a) * r1, z0 = Math.sin(a) * r1, x1 = Math.cos(a + 0.3) * (r1 + 30), z1 = Math.sin(a + 0.3) * (r1 + 30); bridge(solid, x0, z0, x1, z1, 20 + i * 4, 6, { deck: 0x3a3631, rail: 0xc08030, y0: hfn(x0, z0, r1), pillars: 4 }); }
    // faixas vermelhas penduradas
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, r = R + 30 + rnd() * 90, x = Math.cos(a) * r, z = Math.sin(a) * r; banner(solid, x, z, 14 + rnd() * 6, 3.2, 0xb52a22, hfn(x, z, r), a); }
    scatterRubble(ctx, hfn, ctx.touch ? 20 : 50, R + 4, R + 120);
    return {};
  },
};

const cratera = {
  name: 'Cratera Gigante', clutter: 'sand', sky: { ...SKY, haze: 0.8, cover: 0.3, top: 0x5a86bf }, env: { ...ENV, near: 100, far: 640, fogColor: 0xd8b08a }, ground: { kind: 'rock', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(14, ctx.R + 20, ctx.R + 120, 1, 14, 110, 0xe8c49a, 0.36);
    const { R, noise, rnd, solid, glow } = ctx;
    const hfn = (x, z, r) => smooth(R + 3, R + 60, r) * 3 * noise.fbm(x * 0.05, z * 0.05, 2) + smooth(R + 110, R + 200, r) * (52 + 14 * noise.fbm(x * 0.012, z * 0.012, 3)) + smooth(R + 260, R + 540, r) * noise.ridge(x * 0.006, z * 0.006, 3) * 55;
    ctx.ring({ R1: 640, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => { const strat = 0.5 + 0.5 * Math.sin(y * 0.55 + noise.fbm(x * 0.02, z * 0.02, 2) * 6); return lerpHex(sandColor(x, y, z, g, r, ctx), lerpHex(0x9a6648, 0xc88a5c, strat), smooth(8, 40, y)); } });
    // paredão da cratera em colunas estratificadas (vermelho, laranja, areia) com capa de poeira
    cliffRing(ctx, { r0: R + 112, r1: R + 138, hmin: 48, hmax: 96, wmin: 22, wmax: 36, cols: [0x7a3a26, 0xd88a58], cap: 0xe0b078, capH: 2.6, sides: 7, noise, y0: -3, hfn: () => 0 });
    cliffRing(ctx, { r0: R + 150, r1: R + 190, hmin: 70, hmax: 130, wmin: 28, wmax: 46, cols: [0x84432a, 0xe29a66], cap: 0xe8bd88, capH: 3, sides: 7, noise, y0: -3, hfn: () => 0 });
    // coliseu ao redor da arena: torres com lanternas, pontes de aço em anel, colunas
    const n = 14, ringR = R + 38;
    for (let i = 0; i < n; i++) { const a = i / n * 6.28, x = Math.cos(a) * ringR, z = Math.sin(a) * ringR; building(solid, glow, x, z, 9, 9, 24 + (i % 3) * 6, { y: 0, ry: -a, wall: 0x6a5648, trim: 0xc08030, taper: 0.9, glowWin: false }); solid.box(5, 6, 5, METAL, { x, y: 24 + (i % 3) * 6, z, ry: -a }, 0.7, 0.7, 0.1); glow.box(1.2, 1.2, 1.2, 0xffa040, { x, y: 31 + (i % 3) * 6, z }, 1, 1, 0); }
    for (let i = 0; i < n; i++) { const a0 = i / n * 6.28, a1 = (i + 1) / n * 6.28; bridge(solid, Math.cos(a0) * ringR, Math.sin(a0) * ringR, Math.cos(a1) * ringR, Math.sin(a1) * ringR, 14, 5, { deck: 0x4a4038, rail: 0xc08030, y0: 0, pillars: 1 }); }
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28 + 0.1, r = R + 70 + (i % 2) * 22, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.cyl(1.6, 1.3, 14 + (i % 3) * 5, 8, 0x7a6a58, { x, y: 0, z }, 0.18); }
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = R + 90 + rnd() * 18, x = Math.cos(a) * r, z = Math.sin(a) * r; derrick(solid, glow, x, z, 26 + rnd() * 14, 0, METAL); }
    scatterMesas(ctx, hfn, ctx.touch ? 8 : 16, R + 280, R + 520, 20, 70);
    scatterRubble(ctx, hfn, ctx.touch ? 30 : 70, R + 4, R + 108);
    return {};
  },
};
export const SUDESTE = { id: 'sudeste', name: 'Região Sudeste', biome: 'desert', variants: [dunas, cidade, cratera] };
