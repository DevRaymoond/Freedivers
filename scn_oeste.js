// Região Oeste: floresta densa, ruínas antigas, rio e pântano.
import { lerpHex, smooth } from './scn_util.js';
import { C, tree } from './scn_props.js';
import { jungleTree, palm, fern, mesa, arch, ruinTower, houseWood, fence, cliffRing, bush } from './scn_props2.js';

const lerp = (a, b, t) => a + (b - a) * t;
const SKY = { top: 0x3a86d6, horizon: 0xd2ecdf, sunDir: [0.5, 0.6, 0.35], sunCol: 0xfff3cf, cover: 0.46, haze: 0.5, cloudShade: 0xa9bfd0 };
const ENV = { fogColor: 0x9ec6b0, near: 150, far: 720, camFar: 780, hemi: [0xe2f2ff, 0x4d6b3c, 0.92], sun: [0xfff0cc, 1.7, [50, 90, 30]] };
const MOSS = 0x4f7a2e, STONE = 0x8b8978, STONE_D = 0x5f5d52;

// terreno de selva: colinas suaves + paredões altos; lowland = nível da água (opcional)
function jungleHeight(ctx, o = {}) {
  const { R, noise } = ctx;
  return (x, z, r) => {
    const u = smooth(R + 4, R + 90, r), far = smooth(R + 120, R + 380, r);
    let h = u * (10 + 22 * noise.fbm(x * 0.012 + 5, z * 0.012, 4)) + far * noise.ridge(x * 0.005 + 3, z * 0.005 + 8, 4) * 90;
    return h + (o.add ? o.add(x, z, r) : 0);
  };
}
const forestColor = (x, y, z, g, r, ctx) => {
  const n = ctx.noise.fbm(x * 0.05, z * 0.05, 3), moss = lerpHex(0x3f6b2a, 0x6a8f35, n), rock = lerpHex(0x6a6a58, 0x4a4a3e, n);
  return lerpHex(moss, rock, smooth(0.55, 1.1, g));
};
// obstáculos: rochas musgosas, tronco caído, bloco de ruína, samambaias, toco com raízes
function obstacle(kit, r, k) {
  if (k === 0) { kit.rock(1, 0x6c6a5c, { sy: 0.85 }, 0, 0.22); kit.rock(0.8, MOSS, { y: 0.45, sy: 0.35 }, 0, 0.2, 0.2); }
  else if (k === 1) { kit.cyl(0.35, 0.3, 3.2, 7, 0x5a4430, { rz: Math.PI / 2, y: 0.4, x: -1.6 }, 0.2); kit.rock(0.5, MOSS, { y: 0.6, x: 0.3, sy: 0.4 }, 0, 0.2); kit.rock(0.5, 0x5a4a3a, { x: -2.2, y: 0.2 }, 0, 0.2); }
  else if (k === 2) { kit.box(1.6, 1.2, 1.4, STONE, { ry: 0.3 }, 0.95, 0.95, 0.18); kit.box(1.0, 0.7, 1.0, STONE_D, { y: 1.2, ry: 0.6 }, 0.9, 0.9, 0.18); kit.rock(0.7, MOSS, { y: 1.55, sy: 0.35 }, 0, 0.2, 0.2); }
  else if (k === 3) { for (let i = 0; i < 6; i++) fern(kit, Math.cos(i * 1.4) * 0.5, Math.sin(i * 1.4) * 0.5, 1.8, 0, 0x3f8a32); kit.rock(0.5, 0x6a6a58, { sy: 0.7 }, 0, 0.2); }
  else if (k === 4) { kit.cyl(0.8, 0.6, 1.3, 7, 0x5a4430, {}, 0.2); for (let i = 0; i < 5; i++) kit.box(0.2, 0.7, 0.7, 0x5a4430, { x: Math.cos(i * 1.3) * 0.7, z: Math.sin(i * 1.3) * 0.7, ry: -i * 1.3, rz: 0.5 }, 0.3, 0.6, 0.2); kit.rock(0.45, MOSS, { y: 1.3, sy: 0.4 }, 0, 0.2, 0.2); }
  else { kit.rock(0.9, 0x77705e, { x: -0.3, sy: 1.0 }, 0, 0.22); kit.rock(0.6, 0x5f5d52, { x: 0.7, z: 0.2, sy: 0.9 }, 0, 0.22); kit.rock(0.5, MOSS, { x: -0.3, y: 0.8, sy: 0.4 }, 0, 0.2, 0.2); }
}
// paredões de selva com cachoeira e copas no topo (como as torres verdes ao fundo da referência)
function jungleCliffs(ctx, hfn, n, r0, r1, hmin, hmax, waterfalls = true) {
  const { rnd, solid, glow } = ctx;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, h = hmin + rnd() * (hmax - hmin), w = 28 + rnd() * 44, y = hfn(x, z, r) - 4;
    mesa(solid, x, z, w, h, lerpHex(0x6a6858, 0x8a7d62, rnd()), y, null, 7);
    for (let k = 0; k < 9; k++) { const aa = rnd() * 6.28, d = rnd() * w * 0.7; solid.rock(8 + rnd() * 9, lerpHex(0x2f6a2a, 0x4a8a30, rnd()), { x: x + Math.cos(aa) * d, y: y + h + rnd() * 4, z: z + Math.sin(aa) * d, sy: 0.7 }, 0, 0.2, 0.25); }
    for (let k = 0; k < 6; k++) { const aa = rnd() * 6.28, d = w * (0.55 + rnd() * 0.3); solid.rock(5 + rnd() * 6, 0x3f7a2c, { x: x + Math.cos(aa) * d, y: y + h * (0.3 + rnd() * 0.5), z: z + Math.sin(aa) * d, sy: 0.8 }, 0, 0.2, 0.25); }
    if (waterfalls && rnd() < 0.7) { const dx = -x / r, dz = -z / r, c = Math.atan2(dx, dz); glow.box(5 + rnd() * 6, h * 0.82, 1.2, 0xe9f7ff, { x: x + dx * w * 0.72, y: y + h * 0.1, z: z + dz * w * 0.72, ry: c }, 0.8, 1, 0.1); }
  }
}
// falésias contínuas de selva (pedra úmida, topo coberto de árvores, cachoeiras) ao redor da arena
function jungleWall(ctx, hfn, r0, r1, hmin, hmax, o = {}) {
  const { rnd, solid, glow, noise } = ctx;
  cliffRing(ctx, { r0, r1, hmin, hmax, wmin: o.wmin ?? 20, wmax: o.wmax ?? 36, cols: [0x4a4a3e, 0x8a8068], cap: 0x3f7a2c, capH: 4.5, sides: 6, noise, y0: o.y0 ?? -4, hfn: o.hfn || (() => 0), skip: o.skip,
    onColumn: (x, z, y, h, w, a) => {
      for (let k = 0; k < (ctx.touch ? 2 : 4); k++) { const aa = rnd() * 6.28, d = rnd() * w * 0.7; solid.rock(5 + rnd() * 6, lerpHex(0x2f6a2a, 0x58a032, rnd()), { x: x + Math.cos(aa) * d, y: y + h + 1 + rnd() * 3, z: z + Math.sin(aa) * d, sy: 0.7 }, 0, 0.2, 0.25); }
      for (let k = 0; k < (ctx.touch ? 1 : 3); k++) { const aa = rnd() * 6.28; solid.rock(3 + rnd() * 3, lerpHex(0x3f7a2c, 0x2a5a24, rnd()), { x: x + Math.cos(aa) * w * 0.8, y: y + h * (0.2 + rnd() * 0.5), z: z + Math.sin(aa) * w * 0.8, sy: 0.8 }, 0, 0.2, 0.25); }
      if (rnd() < (o.fall ?? 0.45)) { const dx = -Math.cos(a), dz = -Math.sin(a); glow.box(3 + rnd() * 5, h * 0.9, 0.9, 0xeaf8ff, { x: x + dx * w * 0.8, y: y + h * 0.05, z: z + dz * w * 0.8, ry: Math.atan2(dx, dz) }, 0.85, 1, 0.08); }
    } });
}
function scatterJungle(ctx, hfn, n, r0, r1, hmin, hmax, o = {}) {
  const { rnd, solid } = ctx; let k = 0, tries = 0;
  while (k < n && tries++ < n * 6) {
    const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (o.minY != null && y < o.minY) continue;
    jungleTree(solid, x, z, hmin + rnd() * (hmax - hmin), y - 0.3, lerpHex(o.leaf ?? 0x2f6a2a, 0x5aa032, rnd() * 0.5)); k++;
  }
}
function scatterFerns(ctx, hfn, n, r0, r1, minY = -99) {
  const { rnd, solid } = ctx; let k = 0, t = 0;
  while (k < n && t++ < n * 3) { const a = rnd() * 6.28, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); if (y < minY) continue; fern(solid, x, z, 2.2 + rnd() * 2, y - 0.1, lerpHex(0x3f8a32, 0x7ab040, rnd())); k++; }
}

const floresta = {
  name: 'Floresta Densa', clutter: 'jungle', sky: SKY, env: ENV, ground: { kind: 'forest', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(16, ctx.R + 20, ctx.R + 180, 3, 18, 120, 0xdfeedd, 0.3);
    const { R, noise, rnd, solid, glow } = ctx, hfn = jungleHeight(ctx, { add: (x, z, r) => -smooth(R + 40, R + 70, r) * (1 - smooth(R + 110, R + 150, r)) * 7 * noise.fbm(x * 0.01 + 20, z * 0.01, 2) });
    ctx.water(-3.2, 0x27b5aa, 0.9, 0.1);
    ctx.ring({ R1: 600, nr: 56, nt: 160, height: hfn, color: (x, y, z, g, r) => y < -2.4 ? lerpHex(0xcbb98a, 0x8a7a55, noise.fbm(x * 0.1, z * 0.1, 2)) : forestColor(x, y, z, g, r, ctx) });
    scatterJungle(ctx, hfn, ctx.touch ? 70 : 150, R + 5, R + 130, 22, 44);
    scatterJungle(ctx, hfn, ctx.touch ? 8 : 16, R + 2, R + 24, 50, 74);
    scatterFerns(ctx, hfn, ctx.touch ? 90 : 220, R + 2, R + 110, -2);
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = R + 3 + rnd() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r; bush(solid, x, z, 1.6 + rnd() * 1.8, hfn(x, z, r), lerpHex(0x2f6a2a, 0x58a032, rnd())); }
    jungleWall(ctx, hfn, R + 150, R + 175, 70, 150, { fall: 0.5 });
    jungleCliffs(ctx, hfn, 10, R + 230, R + 430, 100, 190);
    // ponte de pedra em ruínas coberta de musgo cruzando o rio ao longe
    const a0 = 1.9, bx = Math.cos(a0) * (R + 70), bz = Math.sin(a0) * (R + 70), ry = a0 + Math.PI / 2;
    for (let i = 0; i < 4; i++) { const t = (i - 1.5) * 15; arch(solid, bx + Math.cos(ry) * t * -1 * 0 + Math.sin(a0) * t * -1, bz + Math.cos(a0) * t, 11, 9, 2.2, STONE, -1, ry + Math.PI / 2, MOSS); }
    solid.box(62, 1.6, 6, STONE_D, { x: bx, y: 8.2, z: bz, ry: -a0 + Math.PI / 2 * 0 + (Math.PI / 2 - a0) }, 1, 1, 0.12);
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 70; solid.rock(0.6 + rnd() * 0.7, [0xd8392f, 0xe86a2a, 0xf0c030][i % 3], { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, sy: 0.8 }, 0, 0.1, 0.2); }
    return {};
  },
};

const ruinas = {
  name: 'Ruínas Antigas', clutter: 'ruins', sky: { ...SKY, cover: 0.4 }, env: ENV, ground: { kind: 'stone', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(14, ctx.R + 20, ctx.R + 180, 3, 18, 120, 0xdfeedd, 0.3);
    const { R, noise, rnd, solid, glow } = ctx, hfn = jungleHeight(ctx, { add: (x, z, r) => -smooth(R + 50, R + 80, r) * (1 - smooth(R + 130, R + 170, r)) * 9 * noise.fbm(x * 0.012 + 20, z * 0.012, 2) });
    ctx.water(-4.2, 0x2db6a8, 0.9, 0.1);
    ctx.ring({ R1: 600, nr: 56, nt: 160, height: hfn, color: (x, y, z, g, r) => y < -3.4 ? lerpHex(0xcbb98a, 0x8a7a55, noise.fbm(x * 0.1, z * 0.1, 2)) : forestColor(x, y, z, g, r, ctx) });
    scatterJungle(ctx, hfn, ctx.touch ? 6 : 12, R + 6, R + 26, 22, 38);
    scatterJungle(ctx, hfn, ctx.touch ? 30 : 64, R + 96, R + 190, 22, 40);
    scatterFerns(ctx, hfn, ctx.touch ? 60 : 130, R + 2, R + 130, -3);
    jungleWall(ctx, hfn, R + 175, R + 200, 80, 160, { fall: 0.6 });
    jungleCliffs(ctx, hfn, 10, R + 240, R + 440, 100, 200);
    // arcadas góticas em ruínas ao redor da arena (dois anéis, com falhas), cobertas de musgo; no anel de fora, arcos maiores e um aqueduto
    const rings = [[R + 32, 38, 12.5, 15, 22, 0.22], [R + 54, 46, 14.5, 22, 32, 0.3]];
    for (const [rr, n, w, h0, h1, gap] of rings) for (let i = 0; i < n; i++) { if (rnd() < gap) continue; const a = i / n * 6.28, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = h0 + rnd() * (h1 - h0); arch(solid, x, z, w, h, 2.6 + rnd() * 0.6, lerpHex(STONE, STONE_D, rnd() * 0.7), hfn(x, z, rr) - 0.5, -a + Math.PI / 2, MOSS); if (rnd() < 0.55) solid.box(w * 1.1, 1.5, 3.2, STONE_D, { x, y: hfn(x, z, rr) + h * 1.45, z, ry: -a + Math.PI / 2 }, 1, 1, 0.15); }
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = R + 20 + rnd() * 20, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.cyl(1.4, 1.2, 7 + rnd() * 10, 8, lerpHex(STONE, STONE_D, rnd()), { x, y: hfn(x, z, r) - 0.4, z }, 0.2); solid.rock(1.6, MOSS, { x, y: hfn(x, z, r) + 6 + rnd() * 6, z, sy: 0.4 }, 0, 0.2, 0.2); }
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = R + 25 + rnd() * 110; ruinTower(solid, Math.cos(a) * r, Math.sin(a) * r, 8 + rnd() * 7, 24 + rnd() * 30, lerpHex(STONE, STONE_D, rnd()), hfn(Math.cos(a) * r, Math.sin(a) * r, r) - 0.5); }
    for (let i = 0; i < 30; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.cyl(1.0, 0.9, 5 + rnd() * 9, 8, lerpHex(STONE, STONE_D, rnd()), { x, y: hfn(x, z, r) - 0.4, z }, 0.18); }
    for (let i = 0; i < 20; i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 100, x = Math.cos(a) * r, z = Math.sin(a) * r; solid.box(2 + rnd() * 3, 1 + rnd() * 2, 2 + rnd() * 3, lerpHex(STONE, STONE_D, rnd()), { x, y: hfn(x, z, r) - 0.3, z, ry: rnd() * 3 }, 0.9, 0.9, 0.2); }
    return {};
  },
};

const pantano = {
  name: 'Rio e Pântano', clutter: 'swamp', sky: { ...SKY, cover: 0.5, haze: 0.62, top: 0x4a8ad0 }, env: { ...ENV, fogColor: 0x8fb4a0, near: 90, far: 520 }, ground: { kind: 'mud', tint: 0xffffff }, obstacle,
  build(ctx) {
    ctx.mist(22, ctx.R + 10, ctx.R + 160, 0.5, 5, 110, 0xd6e8de, 0.4);
    const { R, noise, rnd, solid, glow } = ctx, W = -0.5;
    const hfn = (x, z, r) => { const u = smooth(R + 6, R + 20, r), isl = noise.fbm(x * 0.03 + 7, z * 0.03, 3), far = smooth(R + 150, R + 380, r); return lerp(0, lerp(-2.4, 1.4, smooth(0.52, 0.66, isl)), u) + far * noise.ridge(x * 0.005 + 3, z * 0.005 + 8, 4) * 80; };
    ctx.water(W, 0x2b5a5a, 0.86, 0.06);
    ctx.ring({ R1: 600, nr: 56, nt: 160, height: hfn, color: (x, y, z, g, r) => y < W + 0.2 ? lerpHex(0x3e4a2a, 0x2a3a22, noise.fbm(x * 0.1, z * 0.1, 2)) : forestColor(x, y, z, g, r, ctx) });
    // cipreste e árvores com raízes aparentes e musgo pendurado
    let k = 0, tries = 0; while (k < (ctx.touch ? 30 : 60) && tries++ < 400) { const a = rnd() * 6.28, r = R + 8 + rnd() * 170, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hfn(x, z, r); jungleTree(solid, x, z, 18 + rnd() * 20, y - 0.4, lerpHex(0x4a7a2c, 0x7a9a3a, rnd())); for (let q = 0; q < 4; q++) solid.cyl(0.5, 0.05, 1.6 + rnd() * 1.4, 5, 0x5a4a34, { x: x + (rnd() - 0.5) * 8, y: y - 0.4, z: z + (rnd() - 0.5) * 8 }, 0.2); k++; }
    // vitórias-régias e juncos
    for (let i = 0; i < (ctx.touch ? 60 : 140); i++) { const a = rnd() * 6.28, r = R + 6 + rnd() * 150, x = Math.cos(a) * r, z = Math.sin(a) * r; if (hfn(x, z, r) > W - 0.1) { for (let q = 0; q < 3; q++) solid.cyl(0.06, 0.01, 2.4 + rnd() * 1.4, 4, 0x6a8a3a, { x: x + (rnd() - 0.5) * 1.4, y: hfn(x, z, r), z: z + (rnd() - 0.5) * 1.4 }, 0.2); continue; } solid.cyl(1.2 + rnd() * 1.3, 1.2, 0.08, 9, 0x3f7a30, { x, y: W + 0.03, z }, 0.2); if (rnd() < 0.3) glow.cyl(0.3, 0.05, 0.4, 6, 0xf6f0e0, { x, y: W + 0.1, z }, 0.1, false); }
    // passarelas de madeira sobre a água, torres de vigia e casas com lanternas
    const plank = 0x6a4a2c, post = 0x4a3420;
    const walkway = (x0, z0, x1, z1, wdt = 3) => { const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0); solid.box(wdt, 0.3, len, plank, { x: (x0 + x1) / 2, y: 0.9, z: (z0 + z1) / 2, ry }, 1, 1, 0.2); const n = Math.round(len / 6); for (let i = 0; i <= n; i++) { const f = i / n; solid.box(0.35, 4, 0.35, post, { x: x0 + (x1 - x0) * f, y: -2.4, z: z0 + (z1 - z0) * f }); if (i % 2 === 0) { solid.box(0.3, 1.6, 0.3, post, { x: x0 + (x1 - x0) * f + Math.cos(ry) * wdt / 2, y: 1.1, z: z0 + (z1 - z0) * f - Math.sin(ry) * wdt / 2 }); } } };
    const tower = (x, z, h) => { for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) solid.box(0.5, h, 0.5, post, { x: x + sx * 2.2, y: -2, z: z + sz * 2.2 }, 0.8, 0.8); solid.box(7, 0.4, 7, plank, { x, y: h - 2.4, z }); solid.box(5.5, 3, 5.5, 0x7a5a36, { x, y: h - 2, z }, 1, 1, 0.16); solid.prism([[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]], 3, 0x4a3828, { x, y: h + 1, z }, 0.15, 0.14); glow.box(1.1, 1.4, 0.1, 0xffc46a, { x, y: h - 1.3, z: z + 2.8 }, 1, 1, 0); glow.box(0.5, 0.5, 0.5, 0xffb050, { x: x + 3, y: h - 1.2, z: z + 3 }, 1, 1, 0); };
    for (let s = 0; s < 8; s++) { const a = s * 0.8 + 0.2, r0 = R + 4, r1 = R + 52 + (s % 3) * 14, x1 = Math.cos(a) * r1, z1 = Math.sin(a) * r1; walkway(Math.cos(a) * r0, Math.sin(a) * r0, x1, z1); if (s % 2 === 0) { const a2 = a + 0.28; walkway(x1, z1, Math.cos(a2) * (r1 + 22), Math.sin(a2) * (r1 + 22)); tower(Math.cos(a2) * (r1 + 22), Math.sin(a2) * (r1 + 22), 15 + (s % 4) * 3); } else { houseWood(solid, glow, x1, z1, 7, 6, 3.4, 0.8, a, 0x7a5a36, 0x4a3828); } }
    jungleCliffs(ctx, hfn, 8, R + 200, R + 440, 90, 180, true);
    return {};
  },
};
export const OESTE = { id: 'oeste', name: 'Região Oeste', biome: 'toxic', variants: [floresta, ruinas, pantano] };
