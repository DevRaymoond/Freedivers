// Facção dos robôs: carrega assets/robot.glb (esqueleto padrão Mixamo, sem animações nem textura), pinta a malha por região
// e anima o esqueleto por código: pernas em ciclo de corrida, braços por cinemática inversa de 2 ossos (espada, arma de fogo).
// Os ossos do arquivo têm eixos locais arbitrários, então tudo é feito em espaço de modelo (x esquerda, y cima, z frente):
// cada osso recebe uma rotação MUNDIAL desejada ("aponte para esta direção") e a rotação local é derivada do pai.
import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from './lib/jsm/utils/SkeletonUtils.js';

const P = 'mixamorig';
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const PARENT = {
  Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
};
const AIM_AT = {   // osso -> osso para onde ele "aponta" no repouso
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', LeftFoot: 'LeftToeBase', RightFoot: 'RightToeBase',
};
export const BOT_SCALE = 2;           // o modelo tem 0.95 de altura: ×2 = 1,9 m

let tpl = null;
const REST = { wq: {}, wp: {}, lq: {}, lp: {}, dir: {} };
const Y = new THREE.Vector3(0, 1, 0);

// ───────────── carregamento e pintura ─────────────
export async function loadBots(url = './assets/robot.glb') {
  if (tpl) return;
  const g = await new GLTFLoader().loadAsync(url);
  const scene = g.scene; scene.updateMatrixWorld(true);
  let sm = null; scene.traverse(o => { if (o.isSkinnedMesh) sm = o; });
  paint(sm);
  const get = n => scene.getObjectByName(P + n);
  for (const n of [...ORDER, 'LeftToeBase', 'RightToeBase']) {
    const b = get(n); if (!b) continue;
    REST.wq[n] = b.getWorldQuaternion(new THREE.Quaternion()); REST.wp[n] = b.getWorldPosition(new THREE.Vector3());
    REST.lq[n] = b.quaternion.clone(); REST.lp[n] = b.position.clone();
  }
  for (const [n, to] of Object.entries(AIM_AT)) REST.dir[n] = REST.wp[to].clone().sub(REST.wp[n]).normalize();
  tpl = { scene, mesh: sm };
}
export const botsReady = () => !!tpl;

// Paleta do atlas (aço escuro, vermelho, faixas brancas): sem UV no arquivo, então a cor vai por região do corpo.
function paint(sm) {
  const geo = sm.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, bones = sm.skeleton.bones;
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
    const name = bones[bi].name.replace(P, ''), y = pos.getY(i), z = pos.getZ(i);
    let hex = 0x4b4e56;
    if (/Hand|Foot|Toe/.test(name)) hex = 0x9aa0a8;
    else if (/ForeArm|Leg$/.test(name)) hex = 0x62666e;
    if (name === 'Hips' && y < 0.40 && z > -0.02) hex = 0xc4202a;                 // saiote vermelho
    if (/Head|Neck/.test(name) && y > 0.78) hex = 0xe6e3dc;                       // capuz de faixas brancas
    if (/Head/.test(name) && z > 0.07 && y > 0.66 && y < 0.76) hex = 0xff2a22;    // visor
    c.setHex(hex);
    const j = (((i * 2654435761) >>> 0) % 100) / 100 * 0.1 - 0.05;                // variação leve para não ficar chapado
    col[i * 3] = c.r * (1 + j); col[i * 3 + 1] = c.g * (1 + j); col[i * 3 + 2] = c.b * (1 + j);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ───────────── armas e acessórios (peças de caixa, origem na empunhadura, lâmina/cano ao longo de +Y) ─────────────
const M = {};
const mat = (k, o) => M[k] || (M[k] = new THREE.MeshStandardMaterial(o));
const steel = () => mat('steel', { color: 0xc4cad2, roughness: 0.3, metalness: 0.7 });
const dark = () => mat('dark', { color: 0x23252a, roughness: 0.6, metalness: 0.4 });
const red = () => mat('red', { color: 0xff2a22, emissive: 0xff1a10, emissiveIntensity: 1.3, roughness: 0.4 });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
function makeSword(len = 0.55) {
  const g = new THREE.Group();
  g.add(box(0.026, 0.1, 0.026, dark(), 0, 0, 0));
  g.add(box(0.13, 0.026, 0.04, dark(), 0, 0.06, 0));
  g.add(box(0.038, len, 0.012, steel(), 0, 0.07 + len / 2, 0));
  g.add(box(0.012, len * 0.9, 0.016, red(), 0, 0.09 + len * 0.45, 0));          // fio incandescente
  g.add(box(0.03, 0.03, 0.03, red(), 0, -0.06, 0));
  return g;
}
function makeGun(big = false) {
  const g = new THREE.Group(), s = big ? 1.5 : 1;
  g.add(box(0.05 * s, 0.22 * s, 0.07 * s, dark(), 0, 0.03 * s, 0));
  g.add(box(0.022 * s, 0.22 * s, 0.022 * s, dark(), 0, 0.26 * s, 0));
  g.add(box(0.03 * s, 0.03 * s, 0.03 * s, red(), 0, 0.38 * s, 0));               // boca do cano
  g.add(box(0.035 * s, 0.07 * s, 0.045 * s, dark(), 0, -0.03 * s, 0.06 * s));    // empunhadura (a gravidade é +Z local)
  g.add(box(0.03 * s, 0.1 * s, 0.04 * s, steel(), 0, 0.07 * s, 0.07 * s));       // carregador
  g.add(box(0.02 * s, 0.05 * s, 0.03 * s, red(), 0, 0.05 * s, -0.05 * s));       // mira
  return g;
}

// ───────────── criação ─────────────
// kind: 'sword' | 'gun' | 'greatsword' | 'bomb' | 'lance' | 'boss'
export function createBot(kind, tint = 0xffffff) {
  const scene = cloneSkeleton(tpl.scene);
  let sm = null; scene.traverse(o => { if (o.isSkinnedMesh) sm = o; });
  sm.frustumCulled = false; sm.castShadow = true;
  sm.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, color: tint });
  const model = new THREE.Group(); model.add(scene);
  model.scale.setScalar(BOT_SCALE); model.rotation.y = Math.PI;           // o modelo olha para +Z; o jogo usa -Z como frente
  const b = {};
  for (const n of ORDER) b[n] = scene.getObjectByName(P + n);
  const wq = {}, wp = {};
  for (const n of ORDER) { wq[n] = new THREE.Quaternion(); wp[n] = new THREE.Vector3(); }
  const bot = { root: model, b, wq, wp, kind, ph: Math.random() * 6, atk: Math.random(), prev: null, smooth: { aim: 0, mv: 0 }, props: {} };
  const add = (k, o) => { bot.props[k] = o; scene.add(o); };
  if (kind === 'sword' || kind === 'lance') add('sword', makeSword(0.55));
  if (kind === 'greatsword') add('sword', makeSword(0.85));
  if (kind === 'gun') add('gun', makeGun());
  if (kind === 'boss') { add('sword', makeSword(0.9)); add('gun', makeGun(true)); }
  if (kind === 'bomb') add('chest', box(0.17, 0.15, 0.1, mat('bomb', { color: 0xffa030, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.5 })));
  if (kind === 'lance') add('chest', box(0.3, 0.2, 0.04, mat('plate', { color: 0x7a8088, roughness: 0.4, metalness: 0.6 })));
  return bot;
}

// ───────────── animação ─────────────
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const IDQ = new THREE.Quaternion(), ZERO = new THREE.Vector3();
const _hips = new THREE.Vector3();
const sm = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const eul = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

// Poses do golpe de espada (mão direita em coordenadas do peito e direção da lâmina), em [0,1)
const SWING = [
  { t: 0.00, h: [-0.14, -0.04, 0.14], d: [0, 0.6, 0.8], twist: 0, lean: 0 },
  { t: 0.28, h: [-0.12, 0.30, -0.03], d: [0.05, 0.92, -0.4], twist: -0.45, lean: -0.08 },
  { t: 0.44, h: [-0.03, -0.07, 0.27], d: [0, -0.3, 0.95], twist: 0.35, lean: 0.28 },
  { t: 0.72, h: [-0.10, -0.06, 0.2], d: [0, 0.3, 0.95], twist: 0.1, lean: 0.1 },
  { t: 1.00, h: [-0.14, -0.04, 0.14], d: [0, 0.6, 0.8], twist: 0, lean: 0 },
];
function swing(u, out) {
  let i = 0; while (i < SWING.length - 2 && u > SWING[i + 1].t) i++;
  const a = SWING[i], b = SWING[i + 1], k = sm(Math.min(1, Math.max(0, (u - a.t) / (b.t - a.t))));
  for (let j = 0; j < 3; j++) { out.h[j] = lerp(a.h[j], b.h[j], k); out.d[j] = lerp(a.d[j], b.d[j], k); }
  out.twist = lerp(a.twist, b.twist, k); out.lean = lerp(a.lean, b.lean, k);
}
const SW = { h: [0, 0, 0], d: [0, 0, 0], twist: 0, lean: 0 };

function solveArm(S, T, pole, L1, L2, up, fore) {
  _a.copy(T).sub(S); let d = _a.length(); _a.multiplyScalar(1 / (d || 1));
  d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(d, (L1 + L2) * 0.999));
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a)).normalize();
  up.copy(_a).multiplyScalar(cosA).addScaledVector(_b, sinA);
  _c.copy(S).addScaledVector(up, L1);                       // cotovelo
  fore.copy(S).addScaledVector(_a, d).sub(_c).normalize();  // antebraço até a mão
}

const hT = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const upD = { L: new THREE.Vector3(), R: new THREE.Vector3() }, foD = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const poleL = new THREE.Vector3(0.6, -0.8, -0.35), poleR = new THREE.Vector3(-0.6, -0.8, -0.35);
const sworD = new THREE.Vector3(), gunD = new THREE.Vector3();

// ctx: { dt, speed (m/s), engaged (corpo a corpo), aim (0..1, arma levantada), charge }
export function animateBot(bot, ctx) {
  const { dt } = ctx, k = bot.smooth;
  const mvT = Math.min(1, ctx.speed / 3.2);
  k.mv += (mvT - k.mv) * Math.min(1, dt * 10);
  k.aim += ((ctx.aim || 0) - k.aim) * Math.min(1, dt * 8);
  const mv = k.mv;
  bot.ph += dt * (2.2 + Math.min(ctx.speed, 9) * 1.5);
  const ph = bot.ph, s = Math.sin(ph), c = Math.cos(ph);
  const attacking = ctx.engaged && (bot.kind === 'sword' || bot.kind === 'greatsword' || bot.kind === 'lance' || bot.kind === 'boss');
  if (attacking) bot.atk += dt * (bot.kind === 'greatsword' ? 0.95 : 1.35);
  else bot.atk = Math.max(0, bot.atk - dt * 2);
  const u = attacking ? bot.atk % 1 : 0;
  if (attacking) swing(u, SW); else { SW.h[0] = -0.14; SW.h[1] = -0.04; SW.h[2] = 0.14; SW.d[0] = 0; SW.d[1] = 0.6; SW.d[2] = 0.8; SW.twist = 0; SW.lean = 0; }

  const charge = !!ctx.charge;
  const lean = 0.06 + 0.2 * mv + (charge ? 0.35 : 0) + SW.lean + 0.1 * k.aim;
  const twist = 0.14 * mv * s + SW.twist;
  const breathe = Math.sin(ph * 0.35) * 0.012;

  // hips: oscilação vertical e giro alternado
  const bob = (0.014 + 0.018 * mv) * Math.abs(c) - 0.02 * mv;
  _hips.copy(REST.lp.Hips); _hips.y += bob + breathe * 0.5;
  const hipsQ = eul(0, -twist * 0.5, 0.05 * mv * s).multiply(REST.wq.Hips);
  const spineD = eul(lean, twist, 0);                                     // delta mundial do tronco
  const headD = eul(-lean * 0.8, -twist * 0.6, 0);

  // pernas
  const A = 0.1 + 0.62 * mv + (charge ? 0.12 : 0), K = 0.15 + 1.0 * mv;
  const leg = (side, off) => {
    const a = A * Math.sin(ph + off), kn = K * Math.max(0, Math.cos(ph + off)) * (0.6 + 0.4 * mv);
    const sx = side * 0.1, sh = a - kn;
    return { up: new THREE.Vector3(sx, -Math.cos(a), Math.sin(a)).normalize(), lo: new THREE.Vector3(sx * 0.8, -Math.cos(sh), Math.sin(sh)).normalize() };
  };
  const legL = leg(1, 0), legR = leg(-1, Math.PI);
  const footDir = new THREE.Vector3(0, -0.25, 1).normalize();

  // alvos das mãos (no referencial do peito, deslocado pela inclinação do tronco)
  const aimK = k.aim;
  let rx, ry, rz, lx, ly, lz;
  sworD.set(SW.d[0], SW.d[1], SW.d[2]);
  gunD.set(0, 0.03, 1);
  const kind = bot.kind;
  if (kind === 'gun') {
    rx = lerp(-0.10, -0.04, aimK); ry = lerp(-0.10, 0.0, aimK); rz = lerp(0.12, 0.14, aimK);
    lx = lerp(0.08, 0.05, aimK); ly = lerp(-0.05, 0.0, aimK); lz = lerp(0.16, 0.24, aimK);
    gunD.set(0, lerp(-0.5, 0.03, aimK), 1).normalize();
  } else if (kind === 'bomb') {
    const p = 0.02 * Math.sin(ph * 2);
    rx = -0.08; ry = 0.02 + p; rz = 0.2; lx = 0.08; ly = 0.02 - p; lz = 0.2;
  } else {
    rx = SW.h[0]; ry = SW.h[1]; rz = SW.h[2];
    if (charge) { rx = -0.06; ry = 0.0; rz = 0.25; sworD.set(0, 0.05, 1).normalize(); }
    lx = 0.13; ly = -0.1 + 0.02 * mv * c; lz = 0.02 - 0.1 * mv * s;
    if (attacking) { lx = 0.1; ly = 0.04; lz = 0.1; }
    if (kind === 'boss') { lx = 0.08; ly = 0.0; lz = 0.22; gunD.set(0, 0.03, 1); }
    if (!attacking && !charge && kind !== 'boss') { rz += 0.04 * mv * -s; ry += 0.02 * mv * c; }
  }

  // percorre o esqueleto de cima para baixo
  const { b, wq, wp } = bot;
  const chestOff = (x, y, z, out) => out.set(x, y, z).applyQuaternion(spineD).add(wp.Spine2);
  const L1 = REST.lp.LeftForeArm.length(), L2 = REST.lp.LeftHand.length();
  const R1 = REST.lp.RightForeArm.length(), R2 = REST.lp.RightHand.length();
  for (const name of ORDER) {
    const par = PARENT[name], pq = par ? wq[par] : IDQ, pp = par ? wp[par] : ZERO;
    wp[name].copy(name === 'Hips' ? _hips : REST.lp[name]).applyQuaternion(pq).add(pp);
    let want = null;
    switch (name) {
      case 'Hips': want = hipsQ; break;
      case 'Spine': case 'Spine1': case 'Spine2': want = _qd.copy(spineD).multiply(REST.wq[name]); break;
      case 'Neck': case 'Head': want = _qd.copy(headD).multiply(REST.wq[name]); break;
      case 'LeftArm': chestOff(lx, ly, lz, hT.L); solveArm(wp.LeftArm, hT.L, poleL, L1, L2, upD.L, foD.L); want = _qd.setFromUnitVectors(REST.dir.LeftArm, upD.L).multiply(REST.wq.LeftArm); break;
      case 'LeftForeArm': want = _qd.setFromUnitVectors(REST.dir.LeftForeArm, foD.L).multiply(REST.wq.LeftForeArm); break;
      case 'RightArm': chestOff(rx, ry, rz, hT.R); solveArm(wp.RightArm, hT.R, poleR, R1, R2, upD.R, foD.R); want = _qd.setFromUnitVectors(REST.dir.RightArm, upD.R).multiply(REST.wq.RightArm); break;
      case 'RightForeArm': want = _qd.setFromUnitVectors(REST.dir.RightForeArm, foD.R).multiply(REST.wq.RightForeArm); break;
      case 'LeftUpLeg': want = _qd.setFromUnitVectors(REST.dir.LeftUpLeg, legL.up).multiply(REST.wq.LeftUpLeg); break;
      case 'LeftLeg': want = _qd.setFromUnitVectors(REST.dir.LeftLeg, legL.lo).multiply(REST.wq.LeftLeg); break;
      case 'LeftFoot': want = _qd.setFromUnitVectors(REST.dir.LeftFoot, footDir).multiply(REST.wq.LeftFoot); break;
      case 'RightUpLeg': want = _qd.setFromUnitVectors(REST.dir.RightUpLeg, legR.up).multiply(REST.wq.RightUpLeg); break;
      case 'RightLeg': want = _qd.setFromUnitVectors(REST.dir.RightLeg, legR.lo).multiply(REST.wq.RightLeg); break;
      case 'RightFoot': want = _qd.setFromUnitVectors(REST.dir.RightFoot, footDir).multiply(REST.wq.RightFoot); break;
    }
    if (!want) want = _qd.copy(pq).multiply(REST.lq[name]);
    wq[name].copy(want);
    b[name].quaternion.copy(_q.copy(pq).invert().multiply(want));
    if (name === 'Hips') b.Hips.position.copy(_hips);
  }

  // armas e acessórios acompanham as mãos
  const pr = bot.props;
  if (pr.sword) { pr.sword.position.copy(wp.RightHand); pr.sword.quaternion.setFromUnitVectors(Y, sworD.normalize()); }
  if (pr.gun) {
    const hand = kind === 'boss' ? wp.LeftHand : wp.RightHand;
    pr.gun.position.copy(hand); pr.gun.quaternion.setFromUnitVectors(Y, gunD.normalize());
  }
  if (pr.chest) { chestOff(0, 0.0, kind === 'bomb' ? 0.1 : 0.115, pr.chest.position); pr.chest.quaternion.copy(spineD); if (kind === 'bomb') pr.chest.scale.setScalar(1 + 0.08 * Math.sin(ph * 2)); }
}
