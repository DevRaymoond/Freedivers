// Região Leste: campos de lava, fortaleza corrompida e zona de extração.
import { lerpHex, smooth } from './scn_util.js';
import { C, peak, building, bridge, lamp, radioTower } from './scn_props.js';
import { derrick, tank, smokestack, wall, conveyor, crane, banner, brazier, mesa } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x1c0a0e, horizon: 0xe0561e, sunDir: [-0.5, 0.18, 0.5], sunCol: 0xff8a3a, cover: 0.78, haze: 0.62, cloudCol: 0x6a2a20, cloudShade: 0x1a0a0a, sunSize: 200 };
const ENV = { fogColor: 0x7a2814, near: 70, far: 520, camFar: 640, hemi: [0xff9a68, 0x4a2014, 1.15], exposure: 1.3, sun: [0xff8a4a, 1.45, [-50, 40, 30]] };
const BASALT = 0x2a2220, BASALT_L = 0x4a3a34, OBS = 0x1a1618, METAL = 0x2d2b2e;

// terreno: platôs de basalto com canais de lava; moat = fosso em volta da arena (R+8..R+30)
function lavaHeight(ctx, o = {}) {
  const { R, noise } = ctx, LAV = -4.2;
  return (x, z, r) => {
    const n = noise.fbm(x * 0.011 + 6, z * 0.011 + 2, 3), plateau = smooth(0.44, 0.485, n), tops = Math.floor((1.5 + noise.fbm(x * 0.02, z * 0.02, 2) * 22) / 3.5) * 3.5 + 1.5;
    let h = lerp(LAV, tops, plateau);
    const moat = smooth(R + 6, R + 12, r) * (1 - smooth(R + (o.moat ?? 26), R + (o.moat ?? 26) + 8, r)), arena = 1 - smooth(R + 2, R + 6, r);
    h = lerp(h, LAV, moat * (o.moatAmt ?? 1)); h = lerp(h, 0.4 * noise.fbm(x * 0.05, z * 0.05, 2), arena);
    h += smooth(R + 240, R + 470, r) * Math.pow(noise.ridge(x * 0.0055 + 3, z * 0.0055 + 5, 4), 1.6) * 170;
    return h + (o.add ? o.add(x, z, r) : 0);
  };
}
const basaltColor = (x, y, z, g, r, ctx) => {
  const n = ctx.noise.fbm(x * 0.06, z * 0.06, 3), rock = lerpHex(BASALT, BASALT_L, n * 0.8), glowK = smooth(0.4, -3.4, y);
  const c = lerpHex(rock, 0x120e0f, smooth(0.7, 1.6, g) * 0.5);
  return lerpHex(c, y < -2.4 ? 0xff7a1e : 0xe2480f, glowK * 0.95);
};
function obstacle(kit, r, k) {
  if (k === 0) { kit.rock(1, BASALT_L, { sy: 0.95 }, 0, 0.22); kit.rock(0.5, 0xd8481a, { x: 0.3, y: 0.55, sy: 0.3 }, 0, 0.1, 0.15); }
  else if (k === 1) { peak(kit, 0, 0, 0.9, 2.6, OBS, 0x3a2a26, 0.0, 6, 0.1); }
  else if (k === 2) { kit.prism([[-0.9, -0.5], [0.8, -0.7], [1.0, 0.3], [-0.2, 0.8], [-1.0, 0.2]], 1.4, BASALT, {}, 0.85, 0.2); kit.prism([[-0.6, -0.3], [0.5, -0.4], [0.6, 0.2], [-0.1, 0.5]], 0.9, BASALT_L, { y: 1.4 }, 0.8, 0.2); }
  else if (k === 3) { kit.rock(0.8, OBS, { x: -0.4, sy: 1.1 }, 0, 0.25); kit.rock(0.7, BASALT, { x: 0.6, z: 0.3, sy: 0.9 }, 0, 0.25); }
  else if (k === 4) { kit.box(1.5, 1.8, 1.5, METAL, { ry: 0.3 }, 0.9, 0.9, 0.2); kit.box(1.1, 0.25, 1.1, 0x6a3a1a, { y: 1.8, ry: 0.3 }, 1, 1, 0.1); }
  else { kit.rock(1.0, 0x3a2a2a, { sy: 1.2 }, 0, 0.3); kit.rock(0.4, BASALT_L, { x: 0.7, sy: 0.9 }, 0, 0.3); }
}
function spires(ctx, hfn, n, r0, r1, hmin, hmax) {
  const { rnd, solid } = ctx;
  for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, h = hmin + rnd() * (hmax - hmin); peak(solid, x, z, h * (0.2 + rnd() * 0.2), h, lerpHex(OBS, BASALT_L, rnd() * 0.6), 0x3a2a26, 0.0, 6 + (rnd() * 3 | 0), (rnd() - 0.5) * 0.3, hfn(x, z, r) - 3); }
}
function lavaFalls(ctx, hfn, n, r0, r1) {
  const { rnd, glow } = ctx; let k = 0, t = 0;
  while (k < n && t++ < n * 40) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r), dx = -x / r, dz = -z / r, yo = hfn(x + dx * 6, z + dz * 6, r - 6); if (y - yo < 4 || y < 3) continue; glow.box(3 + rnd() * 5, y - yo, 0.8, 0xff6a1a, { x: x + dx * 2.2, y: yo, z: z + dz * 2.2, ry: Math.atan2(dx, dz) }, 0.9, 1, 0.15); k++; }
}
function bridgesOverMoat(ctx, n, y = 1.2) {
  const { R, solid, glow } = ctx;
  for (let i = 0; i < n; i++) { const a = i / n * 6.28 + 0.4, x0 = Math.cos(a) * (R + 3), z0 = Math.sin(a) * (R + 3), x1 = Math.cos(a) * (R + 36), z1 = Math.sin(a) * (R + 36); bridge(solid, x0, z0, x1, z1, y, 6, { deck: METAL, rail: 0xc04a1a, y0: -6, pillars: 2 }); glow.box(0.5, 0.5, 0.5, 0xff9a3a, { x: x1, y: y + 1.4, z: z1 }, 1, 1, 0); glow.box(0.5, 0.5, 0.5, 0xff9a3a, { x: x0, y: y + 1.4, z: z0 }, 1, 1, 0); }
}
function groundSteam(ctx) {}

const campos = {
  name: 'Campos de Lava', sky: SKY, env: ENV, ground: { kind: 'basalt', tint: 0xffffff }, obstacle,
  build(ctx) {
    const { R, rnd, solid, glow } = ctx, hfn = lavaHeight(ctx);
    ctx.lava(-2.2);
    ctx.ring({ R1: 620, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => basaltColor(x, y, z, g, r, ctx) });
    spires(ctx, hfn, ctx.touch ? 22 : 46, R + 40, R + 460, 25, 130);
    lavaFalls(ctx, hfn, 18, R + 40, R + 260);
    bridgesOverMoat(ctx, 4, 0.9);
    // torres de vigia, antenas e postes sobre os platôs
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = R + 50 + rnd() * 190, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < 4) continue; building(solid, glow, x, z, 7 + rnd() * 5, 7 + rnd() * 5, 8 + rnd() * 12, { y, wall: 0x34302f, trim: 0xc04a1a, roof: 0x241f20, win: 0xff9a3a, taper: 0.88 }); if (i % 2) radioTower(solid, glow, x + 6, z, 30 + rnd() * 20, y, METAL); }
    for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, r = R + 8 + rnd() * 24, x = Math.cos(a) * r, z = Math.sin(a) * r; if (hfn(x, z, r) < -2) continue; brazier(solid, glow, x, z, hfn(x, z, r), 1.2); }
    return {};
  },
};

const fortaleza = {
  name: 'Fortaleza Corrompida', sky: SKY, env: { ...ENV, fogColor: 0x6a2416 }, ground: { kind: 'basalt', tint: 0xffffff }, obstacle,
  build(ctx) {
    const { R, rnd, solid, glow } = ctx, hfn = lavaHeight(ctx, { moat: 22 });
    ctx.lava(-2.2);
    ctx.ring({ R1: 620, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => basaltColor(x, y, z, g, r, ctx) });
    spires(ctx, hfn, ctx.touch ? 14 : 30, R + 60, R + 460, 25, 120);
    lavaFalls(ctx, hfn, 12, R + 40, R + 260);
    bridgesOverMoat(ctx, 2, 0.9);
    // muralhas com ameias, portão e torres de canto com pináculos; keep central alto com fenda brilhante
    const wr = R + 58, wn = 12, WALL = 0x2a2426, TRIM = 0x6a2418;
    for (let i = 0; i < wn; i++) { const a0 = i / wn * 6.28, a1 = (i + 1) / wn * 6.28, x0 = Math.cos(a0) * wr, z0 = Math.sin(a0) * wr, x1 = Math.cos(a1) * wr, z1 = Math.sin(a1) * wr; if (hfn(x0, z0, wr) < 2) continue; wall(solid, x0, z0, x1, z1, 16, 4, WALL, hfn(x0, z0, wr) - 0.5); }
    for (let i = 0; i < wn; i++) { const a = i / wn * 6.28, x = Math.cos(a) * wr, z = Math.sin(a) * wr, y = hfn(x, z, wr); if (y < 2) continue; const h = 34 + (i % 3) * 8; solid.box(8, h, 8, WALL, { x, y: y - 0.5, z, ry: -a }, 0.85, 0.85, 0.12); solid.box(10.5, 2, 10.5, TRIM, { x, y: y + h * 0.82, z, ry: -a }); solid.cyl(5.2, 0.1, 18, 4, 0x1e1a1c, { x, y: y + h - 0.5, z, ry: -a + 0.78 }, 0.15); glow.box(0.7, h * 0.35, 0.2, 0xff4a1a, { x: x - Math.cos(a) * 3.6 * 0, y: y + h * 0.35, z: z + 0 }, 1, 1, 0); }
    const kx = Math.cos(2.6) * (R + 120), kz = Math.sin(2.6) * (R + 120), ky = Math.max(hfn(kx, kz, R + 120), 4) - 1;
    solid.box(44, 36, 44, WALL, { x: kx, y: ky, z: kz }, 0.9, 0.9, 0.1); solid.box(26, 70, 26, 0x241f21, { x: kx, y: ky + 36, z: kz }, 0.7, 0.7, 0.1); solid.cyl(14, 0.1, 56, 4, 0x181415, { x: kx, y: ky + 106, z: kz, ry: 0.78 }, 0.12);
    glow.box(1.4, 62, 0.4, 0xff4a1a, { x: kx + 0, y: ky + 40, z: kz + 9.4 }, 1, 1, 0); glow.box(1.4, 62, 0.4, 0xff4a1a, { x: kx, y: ky + 40, z: kz - 9.4 }, 1, 1, 0); glow.cyl(2.2, 0.4, 5, 8, 0xff6a2a, { x: kx, y: ky + 108, z: kz }, 0.1, false);
    for (let i = 0; i < 4; i++) { const a = 2.6 + (i - 1.5) * 0.28, x = Math.cos(a) * (R + 100), z = Math.sin(a) * (R + 100), y = Math.max(hfn(x, z, R + 100), 4) - 1; solid.box(10, 44 + i * 6, 10, WALL, { x, y, z, ry: -a }, 0.8, 0.8, 0.12); solid.cyl(6, 0.1, 22, 4, 0x1e1a1c, { x, y: y + 44 + i * 6, z, ry: 0.78 }, 0.15); glow.box(0.6, 12, 0.2, 0xff4a1a, { x, y: y + 20, z: z + 5.2 }, 1, 1, 0); banner(solid, x + 6, z, 16, 4.5, 0x9a1a14, y + 8, a); }
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = R + 8 + rnd() * 40, x = Math.cos(a) * r, z = Math.sin(a) * r; if (hfn(x, z, r) < -2) continue; brazier(solid, glow, x, z, hfn(x, z, r), 1.3); }
    return {};
  },
};

const extracao = {
  name: 'Zona de Extração', sky: SKY, env: { ...ENV, fogColor: 0x7a2c14 }, ground: { kind: 'basalt', tint: 0xffffff }, obstacle,
  build(ctx) {
    const { R, rnd, solid, glow } = ctx, hfn = lavaHeight(ctx, { moat: 18, moatAmt: 0.7 });
    ctx.lava(-2.2);
    ctx.ring({ R1: 620, nr: 60, nt: 180, height: hfn, color: (x, y, z, g, r) => basaltColor(x, y, z, g, r, ctx) });
    spires(ctx, hfn, ctx.touch ? 10 : 22, R + 80, R + 460, 25, 110);
    lavaFalls(ctx, hfn, 12, R + 40, R + 240);
    bridgesOverMoat(ctx, 4, 0.9);
    // complexo industrial: derricks, guindastes, esteiras, chaminés, tanques, galpões com janelas âmbar, lanternas
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, r = R + 40 + rnd() * 150, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < 3) continue; derrick(solid, glow, x, z, 30 + rnd() * 34, y, METAL); }
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = R + 40 + rnd() * 140, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < 3) continue; crane(solid, glow, x, z, 28 + rnd() * 14, y, rnd() * 6.28, 0xb87a1c); }
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 50 + rnd() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < 3) continue; smokestack(solid, glow, x, z, 34 + rnd() * 20, 3.2, y, 0x3a3234); tank(solid, x + 12, z + 6, 5.5, 11, 0x4a4244, y); }
    for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, r = R + 40 + rnd() * 150, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < 3) continue; building(solid, glow, x, z, 14 + rnd() * 14, 10 + rnd() * 10, 8 + rnd() * 10, { y, ry: rnd() * 6, wall: 0x3a3436, trim: 0xc87a1c, roof: 0x222022, win: 0xffb050, taper: 0.9 }); }
    for (let i = 0; i < 8; i++) { const a0 = rnd() * 6.28, r0 = R + 40 + rnd() * 90, x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0, x1 = Math.cos(a0 + 0.4) * (r0 + 24), z1 = Math.sin(a0 + 0.4) * (r0 + 24), y0 = Math.max(hfn(x0, z0, r0), 6); conveyor(solid, x0, z0, y0 + 2, x1, z1, y0 + 14); }
    for (let i = 0; i < 4; i++) { const a = 0.3 + i * 1.6, r1 = R + 70 + i * 12, x0 = Math.cos(a) * r1, z0 = Math.sin(a) * r1, x1 = Math.cos(a + 0.45) * (r1 + 32), z1 = Math.sin(a + 0.45) * (r1 + 32); bridge(solid, x0, z0, x1, z1, 16, 5, { deck: METAL, rail: 0xc87a1c, y0: -10, pillars: 5 }); }
    for (let i = 0; i < 24; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r; if (hfn(x, z, r) < -2) continue; lamp(solid, glow, x, z, 7, hfn(x, z, r), 0xffb050); }
    return {};
  },
};
export const LESTE = { id: 'leste', name: 'Região Leste', biome: 'volcanic', variants: [campos, fortaleza, extracao] };
