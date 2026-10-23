import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from './lib/jsm/utils/SkeletonUtils.js';
import { net } from './net.js';
import { loadBots, createBot, animateBot, botsReady } from './bots.js';
import * as WL from './worldlogic.mjs';

// Configurações do jogador (salvas só neste aparelho)
const SET_KEY = 'multipunk_settings';
const coarse = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch { /* sem armazenamento */ }
  return Object.assign({ volume: 0.8, sens: 1, quality: coarse ? 'medium' : 'high', input: 'auto' }, s);
}
const settings = loadSettings();
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* ok */ } };
// Celular/tablet: tela de toque como entrada principal (modo automático, forçado nas configurações ou ?touch=1 para testar no PC)
const isTouch = new URLSearchParams(location.search).has('touch') || settings.input === 'touch' || (settings.input === 'auto' && coarse);

// ───────────────────────── Configuração ─────────────────────────
let ARENA_R = 95;
const PLAYER = { speed: 7, sprint: 10.5, walk: 3.4, rollSpeed: 18, rollTime: 0.45, rollCooldown: 1.0, maxHp: 100 };
const WEAPONS = [
  { id: 'smg', name: 'SMG-9 Bombeiro', mag: 30, reserveMax: 240, reserve0: 180, rate: 11, dmg: 12, spread: 0.012, reload: 1.6, range: 120, pellets: 1, auto: true, recoil: 0.004 },
  { id: 'shotgun', name: 'Escopeta Rajada', mag: 6, reserveMax: 48, reserve0: 30, rate: 1.4, dmg: 11, spread: 0.075, reload: 2.2, range: 40, pellets: 9, auto: false, recoil: 0.035 },
  { id: 'dmr', name: 'Marksman Lança', mag: 10, reserveMax: 70, reserve0: 40, rate: 2.6, dmg: 52, spread: 0.002, reload: 1.9, range: 220, pellets: 1, auto: false, recoil: 0.022 },
];
const SUPPLY_COOLDOWN = 35, STRIKE_COOLDOWN = 60;

// Facção dos robôs: mesmos papéis dos insetos (corpo a corpo com espada, atirador com arma, pesado, kamikaze, investida e chefe).
// height/radius definem a esfera de acerto no meio do corpo; reach é o alcance do golpe (para animar a espada).
const BOT_TYPES = {
  crawler: { hp: 40, speed: 5.4, dmg: 9, radius: 0.85, height: 1.0, scale: 0.9, color: 0x4b4e56, kind: 'sword', reach: 2.6 },
  spitter: { hp: 55, speed: 3.2, dmg: 12, radius: 0.9, height: 1.05, scale: 1.0, color: 0x4b4e56, kind: 'gun', reach: 0 },
  brute:   { hp: 520, speed: 3.2, dmg: 28, radius: 1.5, height: 1.8, scale: 1.7, color: 0x4b4e56, kind: 'greatsword', reach: 4.6 },
  bomber:  { hp: 45, speed: 5.0, dmg: 35, radius: 0.75, height: 0.85, scale: 0.85, color: 0x4b4e56, kind: 'bomb', reach: 0 },
  charger: { hp: 170, speed: 3.8, dmg: 32, radius: 1.1, height: 1.3, scale: 1.3, color: 0x4b4e56, kind: 'lance', reach: 3.4 },
  queen:   { hp: 2000, speed: 2.5, dmg: 38, radius: 2.6, height: 3.0, scale: 3.0, color: 0x4b4e56, kind: 'boss', reach: 8 },
};
let curFaction = 'bugs';                       // 'bugs' (insetos) | 'bots' (robôs); no online o host decide
const ET = () => curFaction === 'bots' ? BOT_TYPES : ENEMY_TYPES;
// Mapa de fronteira: insetos e robôs juntos. mixFac = pesos { bugs, bots }; eles entram por lados opostos, brigam entre si e só depois miram nos jogadores.
let mixFac = null, mixAngle = 0;
const pickFac = () => !mixFac ? curFaction : (Math.random() * (mixFac.bugs + mixFac.bots) < mixFac.bugs ? 'bugs' : 'bots');
const FT = s => curFaction !== 'bots' ? s : String(s)
  .replace(/Rainha da colmeia/g, 'Comandante Mecha').replace(/A Rainha/g, 'O Comandante').replace(/a Rainha/g, 'o Comandante').replace(/Rainha/g, 'Comandante')
  .replace(/ela invoca/g, 'ele convoca').replace(/Chefe da colmeia/g, 'Chefe da fortaleza').replace(/enxame/g, 'exército').replace(/colmeia/g, 'fortaleza');

const ENEMY_TYPES = {
  crawler: { hp: 30, speed: 6.2, dmg: 9, radius: 0.9, height: 0.8, scale: 1, color: 0x8a2b22 },
  spitter: { hp: 45, speed: 3.4, dmg: 12, radius: 0.95, height: 0.65, scale: 1.6, color: 0x3d7a34 },
  brute:   { hp: 450, speed: 3.6, dmg: 28, radius: 2.0, height: 2.0, scale: 2.4, color: 0x4a3a66 },
  bomber:  { hp: 40, speed: 5.4, dmg: 35, radius: 0.9, height: 0.9, scale: 1, color: 0xb8651f },
  charger: { hp: 150, speed: 4.2, dmg: 32, radius: 1.3, height: 1.1, scale: 1.5, color: 0x56697a },
  queen:   { hp: 1800, speed: 2.7, dmg: 38, radius: 3.4, height: 3.0, scale: 4.4, color: 0x6a2b6f },
  // Titã ácido: gigante lento; pisa (área) e cospe um jato de ácido (inspirado no Bile Titan). Esfera de acerto no meio do corpo (as pernas são longas).
  titan:   { hp: 2200, speed: 1.7, dmg: 42, radius: 4.2, height: 4.4, scale: 9, color: 0xb59a62 },
};

const MISSIONS = [
  { id: 'operation', base: { hp: 1.0, dmg: 1.0, speed: 1.0, count: 1.0, elite: 0 }, mix: { spit: 0.18, bomb: 0.06, chrg: 0.04 }, title: 'Operação Gerador', tag: 'CAMPANHA', danger: 4, par: 16, biome: 'desert',
    desc: 'Seu esquadrão pousa longe do objetivo. Atravesse o território dominado pelo enxame, ative e defenda o gerador contra 8 ondas, siga até a zona de extração, aguente 1:30 e embarque na nave pela rampa traseira.',
    phases: ['Deslocamento', 'Defender o gerador · 8 ondas', 'Zona de extração · 1:30', 'Embarque'] },
  { id: 'purge', base: { hp: 1.25, dmg: 1.15, speed: 1.03, count: 1.0, elite: 0.02 }, mix: { spit: 0.22, bomb: 0.08, chrg: 0.06 }, title: 'Limpeza do setor', tag: 'RÁPIDA', danger: 2, par: 6, biome: 'desert', desc: 'Seis ondas seguindo a sequência de Fibonacci: 5, 8, 13, 21, 34 e 55 inimigos. Limpe uma onda para a próxima chegar.', phases: ['Ondas: 5 · 8 · 13 · 21 · 34 · 55'] },
  { id: 'samples', base: { hp: 1.5, dmg: 1.3, speed: 1.05, count: 1.1, elite: 0.04 }, mix: { spit: 0.24, bomb: 0.10, chrg: 0.08 }, title: 'Coleta de amostras', tag: 'RÁPIDA', danger: 2, par: 5, biome: 'ice', desc: 'Recolha 6 cápsulas pelo gelo. Cada uma atrai uma onda do enxame.', phases: ['Coletar 6 cápsulas'] },
  { id: 'beacon', base: { hp: 1.8, dmg: 1.45, speed: 1.07, count: 1.2, elite: 0.06 }, mix: { spit: 0.26, bomb: 0.12, chrg: 0.10 }, title: 'Faróis de comunicação', tag: 'RÁPIDA', danger: 2, par: 5, biome: 'toxic', desc: 'Ative 3 faróis ficando dentro do círculo enquanto o enxame ataca.', phases: ['Ativar 3 faróis'] },
  { id: 'defend', base: { hp: 2.1, dmg: 1.6, speed: 1.09, count: 1.3, elite: 0.08 }, mix: { spit: 0.28, bomb: 0.14, chrg: 0.12 }, title: 'Defesa do gerador', tag: 'RÁPIDA', danger: 3, par: 4, biome: 'ice', desc: 'Proteja o gerador por 2 minutos. Bombardeiros e investidores miram nele.', phases: ['Resistir 2 minutos'] },
  { id: 'extract', base: { hp: 2.5, dmg: 1.8, speed: 1.11, count: 1.4, elite: 0.10 }, mix: { spit: 0.30, bomb: 0.16, chrg: 0.14 }, title: 'Extração sob fogo', tag: 'RÁPIDA', danger: 3, par: 5, biome: 'volcanic', desc: 'Derrube 2 brutamontes e alcance a zona de extração.', phases: ['2 brutamontes', 'Extração'] },
  { id: 'queen', base: { hp: 3.0, dmg: 2.0, speed: 1.12, count: 1.5, elite: 0.12 }, mix: { spit: 0.32, bomb: 0.18, chrg: 0.16 }, title: 'Rainha da colmeia', tag: 'CHEFE', danger: 5, par: 6, biome: 'volcanic', desc: 'Chefe: derrube a Rainha enquanto ela invoca o enxame.', phases: ['Derrotar a Rainha'] },
];
const BIOME_CSS = {
  desert: 'linear-gradient(135deg,#7a5a38,#c9a27a 55%,#3a2a1c)', ice: 'linear-gradient(135deg,#34506c,#aec9e2 55%,#25364a)',
  toxic: 'linear-gradient(135deg,#25381c,#7fa65a 55%,#16210f)', volcanic: 'linear-gradient(135deg,#3a1410,#c2502a 55%,#160806)',
};

// Melhorias permanentes: ganhos pequenos e fixos por nível, custo alto (compradas com créditos, salvas no navegador)
const UPGRADES = [
  { id: 'hp', name: 'Armadura reforçada', desc: '+5 de vida máxima por nível' },
  { id: 'dmg', name: 'Munição perfurante', desc: '+1 de dano por disparo por nível' },
  { id: 'ammo', name: 'Mochila de munição', desc: '+5% de munição reserva por nível' },
  { id: 'speed', name: 'Servo-pernas', desc: '+1% de velocidade por nível' },
  { id: 'strike', name: 'Canal orbital', desc: '-2s na recarga do ataque orbital por nível' },
  { id: 'xp', name: 'Treinamento tático', desc: '+5% de XP por nível' },
];
const UPG_MAX = 10;
// Progressão: a fase seguinte só libera depois de vencer a anterior em nível de ameaça 3 ou mais
const UNLOCK_LEVEL = 3;
const missionUnlocked = i => i <= 0 || ((save.cleared || {})[MISSIONS[i - 1].id] || 0) >= UNLOCK_LEVEL;
const upgCost = l => 500 + 250 * l;
function loadSave() {
  try { return Object.assign({ credits: 0, upg: {}, best: {}, name: '', levels: {} }, JSON.parse(localStorage.getItem('multipunk_save') || localStorage.getItem('freedivers_save') || '{}')); }
  catch { return { credits: 0, upg: {}, best: {} }; }
}
let save = loadSave();
function persist() { try { localStorage.setItem('multipunk_save', JSON.stringify(save)); } catch { /* sem armazenamento */ } }
const lvl = id => (save.upg && save.upg[id]) || 0;
const maxHp = () => PLAYER.maxHp + 5 * lvl('hp');
const reserveCap = w => Math.round(w.reserveMax * (1 + 0.05 * lvl('ammo')));
// Cada fase tem a sua própria base (vida, ataque, velocidade, quantidade, elites e mistura de inimigos).
// Dentro da fase, a força de cada onda sobe pela sequência de Fibonacci (1, 1, 2, 3, 5, 8, 13, 21…).
const FIB = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const fib = n => FIB[Math.min(Math.max(0, n), FIB.length - 1)];
const fibHp = n => 1 + 0.04 * fib(n), fibDm = n => 1 + 0.025 * fib(n);
let curMix = { spit: 0.22, bomb: 0.10, chrg: 0.07 };
// Nível de ameaça escolhido para cada fase (1 = modo relax). Multiplica a base da fase.
const LEVEL_MAX = 20;
function levelScale(L) {
  const k = L - 1;
  return { hp: 1 + 0.2 * k, dmg: 1 + 0.12 * k, speed: 1 + 0.015 * k, count: 1 + 0.06 * k, elite: 0.015 * k, mix: 1 + 0.08 * k, reward: 1 + 0.1 * k };
}
function effective(def, L) {
  const b = def.base, s = levelScale(L);
  return {
    hp: b.hp * s.hp, dmg: b.dmg * s.dmg, speed: b.speed * s.speed, count: b.count * s.count, elite: Math.min(0.6, b.elite + s.elite),
    mix: { spit: Math.min(0.5, def.mix.spit * s.mix), bomb: Math.min(0.3, def.mix.bomb * s.mix), chrg: Math.min(0.3, def.mix.chrg * s.mix) },
  };
}
const missionLevel = id => Math.min(LEVEL_MAX, Math.max(1, (save.levels && save.levels[id]) || 1));
const XP_VALUES = { crawler: 6, spitter: 10, bomber: 12, charger: 26, brute: 60, queen: 400, titan: 220 };
const TITAN_MIN_LEVEL = 6;                 // o Titã só aparece a partir deste nível de ameaça

// ───────────────────────── Cena ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9a27a);
scene.fog = new THREE.Fog(0xc9a27a, 40, 150);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xffe7c8, 0x4a3a2a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
sun.position.set(40, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
scene.add(sun, sun.target);
function applyQuality() {
  const q = settings.quality, cap = q === 'high' ? (isTouch ? 1.5 : 2) : q === 'medium' ? 1.25 : 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap)); renderer.setSize(innerWidth, innerHeight);
  const shadows = q !== 'low';
  if (renderer.shadowMap.enabled !== shadows) { renderer.shadowMap.enabled = shadows; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
  sun.castShadow = shadows;
  const size = q === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
}
applyQuality();

// Chão com textura procedural
function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7556';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const v = 90 + Math.random() * 70;
    g.fillStyle = `rgba(${v + 40},${v + 20},${v - 10},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(330, 64),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Rochas com colisão e espiras decorativas (reconstruídas a cada missão conforme o tamanho do mapa)
const rocks = [];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5d4a, roughness: 1, flatShading: true });
const GRID = { cell: 2, n: 0, off: 0, blocked: null, dirty: true, fields: new Map() };
let rockMeshes = [], spireMeshes = [];
function buildTerrain(R, count, avoid = [], data = null) {
  rockMeshes.forEach(m => scene.remove(m)); spireMeshes.forEach(m => scene.remove(m));
  rockMeshes = []; spireMeshes = []; rocks.length = 0;
  ARENA_R = R; GRID.dirty = true;
  const addRock = (x, z, r) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.position.set(x, -r * 0.15, z);                      // enterrada: só o topo aparece
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.castShadow = m.receiveShadow = true;
    scene.add(m); rockMeshes.push(m);
    rocks.push({ x, z, r: r * 0.85, y: m.position.y });
  };
  if (data) data.forEach(k => addRock(k[0], k[1], k[2] / 0.85));          // mesmas rochas do host
  else {
    let tries = 0;
    while (rockMeshes.length < count && tries++ < count * 30) {
      const r = 1.2 + Math.random() * 2.6;
      const a = Math.random() * Math.PI * 2;
      const d = 8 + Math.random() * (R - 14);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (avoid.some(v => Math.hypot(v.x - x, v.z - z) < v.r + r)) continue;
      addRock(x, z, r);
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = R + 5 + Math.random() * 25;
    const h = 18 + Math.random() * 30;
    const m = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 3, h, 6), rockMat);
    m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    m.castShadow = true;
    scene.add(m); spireMeshes.push(m);
  }
}
buildTerrain(95, 45, [{ x: 0, z: 0, r: 10 }]);

// Biomas: cada missão muda cores do céu, da neblina, do chão e das rochas
const BIOMES = {
  desert:   { bg: 0xc9a27a, ground: 0xffffff, rock: 0x6b5d4a, sky: 0xffe7c8, under: 0x4a3a2a, sun: 0xfff0d8 },
  ice:      { bg: 0xaec9e2, ground: 0xc4dcff, rock: 0x8aa4bd, sky: 0xe8f4ff, under: 0x5a6a80, sun: 0xe8f0ff },
  toxic:    { bg: 0x5f7f4c, ground: 0x9fd08a, rock: 0x445436, sky: 0xcdf2a0, under: 0x2a3a22, sun: 0xd8ffb0 },
  volcanic: { bg: 0x4a2220, ground: 0xc8806a, rock: 0x2c2220, sky: 0xff9a6a, under: 0x301410, sun: 0xff8a5a },
};
function applyBiome(name) {
  const b = BIOMES[name] || BIOMES.desert;
  scene.background.set(b.bg); scene.fog.color.set(b.bg);
  ground.material.color.set(b.ground); rockMat.color.set(b.rock);
  hemi.color.set(b.sky); hemi.groundColor.set(b.under); sun.color.set(b.sun);
}

// ───────────────────────── Jogador ─────────────────────────
// Personagem: modelo riggado com dedos (tools/build_final.py). A animação é em camadas, uma instância ("rig") por jogador:
//  - baixo (pernas/quadril): LowIdle ou Walk_/Run_ em 8 direções, misturadas pelo ângulo do movimento em relação à mira
//  - cima (tronco/braços/dedos): Aim, Reload, Shoot, Hit  → o personagem corre em 360° sem tirar a mira da direção
//  - corpo todo: Dash e Death por cima de tudo
const DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
const ONCE = ['Reload', 'Shoot', 'Hit', 'Dash', 'Death'];
const LOWER = ['LowIdle', ...['Walk', 'Run'].flatMap(k => DIRS.map(d => `${k}_${d}`))];
const UPPER = ['Aim', 'Reload', 'Shoot', 'Hit'];
const NOMINAL = { Run: 7, Walk: 3.4 };   // velocidade (m/s) em que o ciclo de passos está calibrado
let charAsset = null;
try { charAsset = await new GLTFLoader().loadAsync('./assets/character.glb'); }
catch (err) { console.warn('Não foi possível carregar o personagem, usando o modelo simples.', err); }

function makeNameTag(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 54px "Bahnschrift","Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
  g.strokeText(name, 256, 50); g.fillStyle = '#ffd27a'; g.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.6, 0.49, 1); sp.position.y = 2.45; sp.renderOrder = 10;
  return sp;
}
function setNameTag(group, name) {
  if (group.userData.tag) { group.remove(group.userData.tag); group.userData.tag.material.map.dispose(); group.userData.tag.material.dispose(); }
  group.userData.tag = makeNameTag(name); group.add(group.userData.tag);
}

function makeCapsuleBody(group) {
  const armor = new THREE.MeshStandardMaterial({ color: 0x2f4f6f, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xffcf3f, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 10), armor); body.position.y = 0.95;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), trim); helmet.position.y = 1.78;
  [body, helmet].forEach(m => { m.castShadow = true; group.add(m); });
}

function createRig(group) {
  const rig = { group, mixer: null, actions: {}, wts: {}, fullW: 0, locoPhase: 0 };
  if (!charAsset) { makeCapsuleBody(group); return rig; }
  const model = cloneSkeleton(charAsset.scene);
  model.rotation.y = Math.PI;                    // o modelo olha para +Z; o jogo olha para -Z
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  group.add(model);
  rig.mixer = new THREE.AnimationMixer(model);
  for (const clip of charAsset.animations) {
    const a = rig.mixer.clipAction(clip);
    if (ONCE.includes(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (/^(Walk|Run)_/.test(clip.name)) a.paused = true;     // o tempo dos passos é controlado por locoPhase
    a.setEffectiveWeight(0);
    a.play();
    rig.actions[clip.name] = a;
    rig.wts[clip.name] = 0;
  }
  rig.wts.Aim = 1; rig.wts.LowIdle = 1;
  return rig;
}
const approach = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
function triggerRig(rig, name, timeScale = 1) {
  const a = rig && rig.actions[name];
  if (!a) return;
  a.reset(); a.timeScale = timeScale; a.play();
}
function resetRig(rig) {
  if (!rig || !rig.mixer) return;
  for (const k in rig.wts) rig.wts[k] = 0;
  rig.wts.Aim = 1; rig.wts.LowIdle = 1; rig.fullW = 0; rig.locoPhase = 0;
}
// S: { dead, rolling, moving, moveKind, moveAlpha, moveScale, reloading, flashing, hit }
function animateRig(rig, S, dt) {
  if (!rig || !rig.mixer) return;
  const { wts, actions } = rig;
  const dead = !!S.dead;
  const full = dead || S.rolling;
  rig.fullW = approach(rig.fullW, full ? 1 : 0, dt, dead ? 10 : S.rolling ? 30 : 18);

  // camada de baixo
  const lt = Object.fromEntries(LOWER.map(n => [n, 0]));
  if (S.moving && !dead) {
    const kind = S.moveKind, al = S.moveAlpha;
    const i = Math.floor(al / 45) % 8, j = (i + 1) % 8, fr = (al % 45) / 45;
    lt[`${kind}_${DIRS[i]}`] += 1 - fr; lt[`${kind}_${DIRS[j]}`] += fr;
  } else lt.LowIdle = 1;
  let sum = 0;
  for (const n of LOWER) { wts[n] = approach(wts[n], lt[n], dt, 14); sum += wts[n]; }
  // camada de cima
  const ut = { Reload: S.reloading ? 1 : 0, Shoot: S.flashing && !S.reloading ? 1 : 0, Hit: S.hit ? 1 : 0 };
  ut.Aim = 1 - Math.max(ut.Reload, ut.Shoot, ut.Hit);
  let usum = 0;
  for (const n of UPPER) { wts[n] = approach(wts[n], ut[n], dt, n === 'Aim' ? 12 : 22); usum += wts[n]; }

  // ciclo de passos compartilhado entre andar/correr para não escorregar na troca
  let wr = 0, ww = 0;
  for (const d of DIRS) { wr += wts[`Run_${d}`]; ww += wts[`Walk_${d}`]; }
  if (wr + ww > 0.01) {
    const cps = (wr / 0.62 + ww / 1.1) / (wr + ww);
    rig.locoPhase = (rig.locoPhase + dt * cps * (S.moveScale || 1)) % 1;
  }

  const rest = 1 - rig.fullW;
  for (const n of LOWER) {
    const a = actions[n]; if (!a) continue;
    a.setEffectiveWeight(sum > 0 ? wts[n] / sum * rest : 0);
    if (n !== 'LowIdle') a.time = rig.locoPhase * a.getClip().duration;
  }
  for (const n of UPPER) actions[n].setEffectiveWeight(usum > 0 ? wts[n] / usum * rest : 0);
  actions.Dash.setEffectiveWeight(dead ? 0 : rig.fullW);
  actions.Death.setEffectiveWeight(dead ? rig.fullW : 0);
  rig.mixer.update(dt);
}

// jogador local
const playerGroup = new THREE.Group();
scene.add(playerGroup);
const localRig = createRig(playerGroup);
const mixer = localRig.mixer;               // compatibilidade: null quando o modelo não carregou
const actions = localRig.actions, wts = localRig.wts;
const localEv = { Shoot: 0, Reload: 0, Hit: 0, Dash: 0, Death: 0 };   // contadores enviados aos outros jogadores
function trigger(name, timeScale = 1) { localEv[name]++; triggerRig(localRig, name, timeScale); }
function resetAnimation() { resetRig(localRig); }
function animate(dt) {
  animateRig(localRig, {
    dead: state === 'dying' || state === 'downed', rolling: player.rolling > 0, moving: player.moving,
    moveKind: player.moveKind, moveAlpha: player.moveAlpha, moveScale: player.moveScale,
    reloading: player.reloading > 0, flashing: player.flash > 0, hit: player.hitT > 0,
  }, dt);
}

const player = {
  pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0.15,
  hp: PLAYER.maxHp, weapon: 0, mag: 30, reserve: 180, ammo: [],
  reloading: 0, fireCd: 0, rolling: 0, rollCd: 0, rollDir: new THREE.Vector3(),
  lastHit: 0, supplyCd: 0, strikeCd: 0, clickT: 0, invuln: 0,
};

// ───────────────────────── Estado do jogo ─────────────────────────
let state = 'menu'; // menu | playing | paused | ended
let mission = null;
let relax = true;
let enemies = [];
let projectiles = [];
let tracers = [];
let particles = [];
let crates = [];
let beacons = [];
let pods = [], strikes = [], flashes = [], drops = [];
let generator = null, shake = 0;
let party = { hp: 1, count: 1, dmg: 1 };                                 // escala invisível pelo número de jogadores na sessão
const cnt = () => mods.count * party.count;
let mods = { hp: 1, count: 1, speed: 1, edmg: 1, elite: 0 };            // dificuldade acumulada pelo sorteio de nível
let xp = 0, level = 1, xpNeed = 60, pendingLoot = 0, lootRun = null;
let platoons = [], turrets = [], waypoint = null, opLayout = null, zoneRing = null, plane = null;
const checkpoint = new THREE.Vector3();
let stats = { shots: 0, hits: 0, supplies: 0, orbitals: 0, deaths: 0 };
let buffs = { dmg: 0, shield: 0 };
let cinT = 0;
const others = {};                 // jogadores remotos (por id)
let uidSeq = 0; const uid = () => ++uidSeq;
let killsBy = {};                  // abates por jogador (créditos individuais)
let respawnTimers = {};            // host: id -> segundos para o reforço chegar
let uiOpen = false;                // menu aberto durante uma partida online (o jogo não pausa)
let pendingHits = [];              // cliente: tiros que acertaram, enviados ao host junto com o estado
let waypointHide = 0;              // some a seta quando você já está a menos de X m do ponto (zona de extração)
let snapT = 0, stateT = 0, partyT = 0;
const NOKEYS = {};
const TYPE_LIST = ['crawler', 'spitter', 'brute', 'bomber', 'charger', 'queen', 'titan'];
const ST_CODE = { walk: 0, wind: 1, charge: 2, stun: 3, stomp: 4, jet: 5 }, ST_NAME = ['walk', 'wind', 'charge', 'stun', 'stomp', 'jet'];
const PLANE_ST = ['inbound', 'landed', 'opening', 'open', 'closing', 'takeoff'];
let pad = null;
let kills = 0;
let spawnTimer = 0;
let elapsed = 0;
const keys = {};
let mouseDown = false;

// ───────────────────────── Helpers ─────────────────────────
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const fwdOf = yaw => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
const rightOf = yaw => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

let msgTimer = 0;
function say(text, secs = 2.5) {
  text = FT(text);
  $('msg').textContent = text;
  $('msg').classList.add('on');
  msgTimer = secs;
}

// Áudio procedural (sem arquivos)
let audio = null, master = null;
function ensureAudio() {
  if (!audio) { audio = new (window.AudioContext || window.webkitAudioContext)(); master = audio.createGain(); master.gain.value = settings.volume; master.connect(audio.destination); }
  if (audio.state === 'suspended') audio.resume();
}
function noise(dur, gain, freq) {
  if (!audio) return;
  const n = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = audio.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start();
}
function beep(freq, dur, gain = 0.08) {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(master);
  o.start(); o.stop(audio.currentTime + dur);
}

// ───────────────────────── Partículas e traçantes ─────────────────────────
const partGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
function burst(pos, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    scene.add(m);
    particles.push({
      m, life: rand(0.3, 0.7),
      v: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed * rand(0.5, 1)),
    });
  }
}
function addTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}

// ───────────────────────── Inimigos ─────────────────────────
function makeBotMesh(type) {
  const t = BOT_TYPES[type];
  const bot = createBot(t.kind);
  const g = new THREE.Group(); g.add(bot.root); g.userData.bot = bot;
  g.scale.setScalar(t.scale);
  return g;
}
function animateBots(dt) {
  for (const e of enemies) {
    const bot = e.mesh.userData.bot; if (!bot) continue;
    const p = e.mesh.position;
    if (camPos.distanceToSquared(p) > 100 * 100) { bot.prev = null; continue; }   // longe: congela a pose
    let speed = 0;
    if (bot.prev) speed = Math.hypot(p.x - bot.prev.x, p.z - bot.prev.z) / Math.max(dt, 1e-3); else bot.prev = new THREE.Vector3();
    bot.prev.copy(p);
    const near = nearestLive(p), foe = foeOf(e, 42);
    let d = near ? Math.hypot(near.pos.x - p.x, near.pos.z - p.z) : 99;
    if (foe) d = Math.min(d, Math.hypot(foe.mesh.position.x - p.x, foe.mesh.position.z - p.z));
    animateBot(bot, { dt, speed: Math.min(speed, 9), engaged: e.t.reach > 0 && d < e.t.reach, aim: e.t.kind === 'gun' && d < 42 ? 1 : 0, charge: e.st === 'charge' });
  }
}
let spiderAsset = null, spiderLoadPromise = null;
function loadSpider() {
  if (spiderAsset) return Promise.resolve(spiderAsset);
  if (!spiderLoadPromise) spiderLoadPromise = new GLTFLoader().loadAsync('./assets/spider.glb')
    .then(gltf => (spiderAsset = gltf))
    .catch(err => { console.warn('Aranha rigada indisponível; usando o modelo de reserva.', err); spiderLoadPromise = null; return null; });
  return spiderLoadPromise;
}
function makeSpiderMesh() {
  const g = new THREE.Group();
  const model = cloneSkeleton(spiderAsset.scene);
  model.rotation.y = Math.PI; // o FBX aponta para +Z; os inimigos do jogo avançam por -Z
  model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; o.frustumCulled = false; } });   // materiais próprios: o brilho de elite não vaza para as outras aranhas
  g.add(model);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const clip of spiderAsset.animations) actions[clip.name] = mixer.clipAction(clip);
  const idle = actions.Idle;
  if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity); idle.play(); }
  g.scale.setScalar(ENEMY_TYPES.spitter.scale);
  g.userData.spider = { mixer, actions, active: 'Idle', spitT: 0 };
  return g;
}
function setSpiderAction(spider, name) {
  const next = spider.actions[name];
  if (!next || spider.active === name) return;
  const previous = spider.actions[spider.active];
  next.setLoop(name === 'Spit' ? THREE.LoopOnce : THREE.LoopRepeat, name === 'Spit' ? 1 : Infinity);
  next.clampWhenFinished = name === 'Spit';
  next.reset().fadeIn(0.12).play();
  if (previous) previous.fadeOut(0.12);
  spider.active = name;
}
function triggerSpiderSpit(enemy) {
  const spider = enemy.mesh.userData.spider;
  if (!spider) return;
  spider.spitT = Math.max(0.9, spider.actions.Spit?.getClip().duration || 0.9);
  setSpiderAction(spider, 'Spit');
}
function animateSpider(enemy, dt, moving) {
  const spider = enemy.mesh.userData.spider;
  if (!spider) return;
  if (spider.spitT > 0) spider.spitT = Math.max(0, spider.spitT - dt);
  setSpiderAction(spider, spider.spitT > 0 ? 'Spit' : moving ? 'Walk' : 'Idle');
  spider.mixer.update(dt);
}
let titanAsset = null, titanLoadPromise = null;
function loadTitan() {
  if (titanAsset) return Promise.resolve(titanAsset);
  if (!titanLoadPromise) titanLoadPromise = new GLTFLoader().loadAsync('./assets/titan.glb')
    .then(gltf => (titanAsset = gltf))
    .catch(err => { console.warn('Titã indisponível:', err); titanLoadPromise = null; return null; });
  return titanLoadPromise;
}
function makeTitanMesh() {
  const g = new THREE.Group(), model = cloneSkeleton(titanAsset.scene);
  model.rotation.y = Math.PI;                                    // o modelo olha para +Z; os inimigos avançam por -Z
  model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; o.frustumCulled = false; } });
  g.add(model);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const clip of titanAsset.animations) actions[clip.name] = mixer.clipAction(clip);
  actions.Idle.play();
  g.scale.setScalar(ENEMY_TYPES.titan.scale);
  g.userData.titan = { mixer, actions, active: 'Idle' };
  return g;
}
function setTitanAction(T, name) {
  if (T.active === name) return;
  const next = T.actions[name], prev = T.actions[T.active]; if (!next) return;
  const once = name === 'Stomp' || name === 'Jet';
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
  next.reset().fadeIn(once ? 0.18 : 0.35).play(); if (prev) prev.fadeOut(once ? 0.18 : 0.35);
  T.active = name;
}
function animateTitan(e, dt, moving) {
  const T = e.mesh.userData.titan; if (!T) return;
  setTitanAction(T, e.st === 'stomp' ? 'Stomp' : e.st === 'jet' ? 'Jet' : moving ? 'Walk' : 'Idle');
  T.mixer.update(dt * (T.active === 'Walk' ? 0.9 : 1));
}
function makeEnemyMesh(type, fac = curFaction) {
  if (type === 'titan' && titanAsset) return makeTitanMesh();
  if (fac === 'bots' && botsReady()) return makeBotMesh(type);
  const t = ENEMY_TYPES[type];
  if (type === 'spitter' && fac !== 'bots' && spiderAsset) return makeSpiderMesh();
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
  const glowColor = { spitter: 0x9dff5c, bomber: 0xffd040, charger: 0x66ccff, queen: 0xff40c0 }[type] || 0xff7a30;
  const glow = new THREE.MeshBasicMaterial({ color: glowColor });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), mat);
  body.scale.set(1, 0.75, 1.4);
  body.position.y = 0.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat);
  head.position.set(0, 0.95, -0.85);
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glow);
    eye.position.set(s * 0.16, 1.02, -1.15);
    g.add(eye);
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), dark);
      leg.position.set(s * 0.65, 0.4, -0.5 + k * 0.5);
      leg.rotation.z = s * 0.5;
      g.add(leg);
    }
  }
  if (type === 'spitter') {
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xa4ff6a, emissive: 0x3a7a20 }));
    sac.position.set(0, 1.35, 0.4);
    g.add(sac);
  }
  if (type === 'bomber') {
    const sac = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff5a10, emissiveIntensity: 1.2 }));
    sac.position.set(0, 1.25, 0.45);
    g.add(sac);
  }
  if (type === 'charger') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 1.0), new THREE.MeshStandardMaterial({ color: 0x9aa8b8, metalness: 0.5, roughness: 0.4 }));
    plate.position.set(0, 1.3, -0.55);
    g.add(plate);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }));
      horn.position.set(s * 0.28, 1.0, -1.35); horn.rotation.x = -Math.PI / 2;
      g.add(horn);
    }
  }
  if (type === 'brute' || type === 'queen') {
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0xddd0b0 }));
      horn.position.set(s * 0.3, 1.45, -0.9);
      horn.rotation.z = -s * 0.5;
      g.add(horn);
    }
  }
  if (type === 'queen') {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0xff40c0, emissive: 0x8a1a6a }));
      spike.position.set(Math.cos(a) * 0.4, 1.9, -0.75 + Math.sin(a) * 0.3);
      g.add(spike);
    }
  }
  g.scale.setScalar(t.scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function spawnEnemy(type, atPos, opts = {}) {
  const fac = type === 'titan' ? 'bugs' : (opts.fac || pickFac());
  const t = (fac === 'bots' ? BOT_TYPES : ENEMY_TYPES)[type];
  const mesh = makeEnemyMesh(type, fac);
  let p = atPos;
  if (!p) {
    const lp = livePlayers(), base = lp.length ? pick(lp).pos : player.pos;
    const a = mixFac ? mixAngle + (fac === 'bots' ? 0 : Math.PI) + rand(-0.9, 0.9) : Math.random() * Math.PI * 2;
    const d = rand(45, 70);
    p = new THREE.Vector3(base.x + Math.cos(a) * d, 0, base.z + Math.sin(a) * d);
    const len = Math.hypot(p.x, p.z);
    if (len > ARENA_R - 3) p.multiplyScalar((ARENA_R - 3) / len);
  }
  mesh.position.copy(p);
  let hp = t.hp * (relax ? 0.8 : 1) * mods.hp * party.hp * (opts.hpMul || 1);
  const elite = type !== 'queen' && type !== 'brute' && type !== 'titan' && Math.random() < mods.elite;
  if (elite) {
    hp *= 2.4; mesh.scale.multiplyScalar(1.25);
    mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.set(0x7a3a00); });
  }
  scene.add(mesh);
  const e = {
    id: uid(), by: -1, dm: (opts.dmMul || 1) * party.dmg, type, fac, t, mesh, hp, maxHp: hp, atkCd: rand(0, 0.5), shootCd: rand(1, 2.5), phase: Math.random() * 6,
    st: 'walk', stT: rand(1.5, 3), volleyCd: 3, summonCd: 10, stompCd: rand(2, 4), jetCd: rand(4, 8), hitDone: false, jetAcc: 0, spd: mods.speed, elite, bias: Math.random() < 0.5 ? 1 : -1,
    pl: opts.pl || null, wave: opts.wave || 0, alert: !!opts.alert, slot: opts.slot || 0,
  };
  enemies.push(e);
  return e;
}

function pickEnemyType() {
  return rollType(typeMix(1 + Math.floor(elapsed / 30)), Math.random());
}

function damagePlayer(amount) {
  if (player.rolling > 0 || state !== 'playing' || player.invuln > 0) return;
  let dmg = amount * (relax ? 0.5 : 1);
  if (buffs.shield > 0) { const ab = Math.min(buffs.shield, dmg); buffs.shield -= ab; dmg -= ab; }
  player.hp -= dmg;
  player.lastHit = elapsed;
  const el = $('dmg');
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 180);
  noise(0.15, 0.2, 500);
  player.hitT = 0.3; trigger('Hit');
  shake = Math.max(shake, 0.25);
  if (player.hp <= 0) startDeath();
}
let dyingT = 0;
function startDeath() {
  if (state !== 'playing') return;
  state = 'dying'; dyingT = 1.9; mouseDown = false;
  stats.deaths++;
  trigger('Death', actions.Death ? actions.Death.getClip().duration / 1.7 : 1);
  noise(0.4, 0.25, 300);
  if (net.role === 'client') net.toHost({ k: 'died' }); else onPlayerDied(net.id);
}
// host/solo: decide entre reforço (reaparece depois de alguns segundos) e queda definitiva
function onPlayerDied(id) {
  const o = others[id];
  if (mission.livesLeft > 0) { mission.livesLeft--; respawnTimers[id] = 3.5; if (o) o.status = 'respawning'; }
  else if (o) { o.status = 'downed'; net.to(id, { k: 'downed' }); }
}
function respawnPlayer(at) {
  player.hp = maxHp(); player.pos.copy(at || spawnRing(checkpoint, Math.max(0, net.roster.findIndex(p => p.id === net.id)))); player.invuln = 4; player.hitT = 0;
  state = 'playing'; resetAnimation(); playerGroup.visible = true;
  say('Reforço no campo!', 3); beep(660, 0.3, 0.1);
}
function hostTimers(dt) {
  for (const id of Object.keys(respawnTimers)) {
    respawnTimers[id] -= dt;
    if (respawnTimers[id] > 0) continue;
    delete respawnTimers[id];
    const idx = Math.max(0, net.roster.findIndex(p => p.id === +id));
    if (+id === net.id) respawnPlayer();
    else { const o = others[id]; if (o) { o.status = 'alive'; const p = spawnRing(checkpoint, idx); net.to(+id, { k: 'respawn', x: p.x, z: p.z }); } }
  }
  // fim de jogo: ninguém vivo, nenhum reforço a caminho
  if (state !== 'dying' && livePlayers().length === 0 && !Object.keys(respawnTimers).length && !(state === 'cinematic')) endMission(false);
}

function makeGenerator(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0x3b4450, metalness: 0.5, roughness: 0.5 }));
  base.position.y = 0.6;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.6, 10), new THREE.MeshStandardMaterial({ color: 0x66d9ff, emissive: 0x2290c0, emissiveIntensity: 1.2 }));
  core.position.y = 3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0x66d9ff }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  g.add(base, core, ring);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, 0, z);
  scene.add(g);
  rocks.push({ x, z, r: 2.4, y: 1.5 });                     // colisão (jogador e inimigos contornam)
  GRID.dirty = true;
  return { g, core, x, z, hp: 1400, max: 1400, active: false };
}
function damageGenerator(n) {
  if (!generator || generator.hp <= 0 || !generator.active) return;
  generator.hp -= n * (relax ? 0.45 : 0.7);
  generator.core.material.emissive.set(0xff3030);
  setTimeout(() => generator && generator.core.material.emissive.set(0x2290c0), 120);
  if (generator.hp <= 0) { generator.hp = 0; sayAll('O gerador caiu!', 3); endMission(false); }
}

function addFlash(pos, radius, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  m.position.copy(pos).setY(Math.max(0.6, pos.y));
  scene.add(m);
  flashes.push({ m, t: 0.4, max: 0.4, radius });
}
function boomFx(pos, radius) {
  addFlash(pos, radius, 0xffa040);
  burst(pos.clone().setY(1), 0xffa040, 30, 9);
  const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (d < 60) { noise(0.35, 0.3, 700); shake = Math.max(shake, 0.5 * (1 - d / 60)); }
}
function explode(pos, radius, playerDmg, enemyDmg) {
  boomFx(pos, radius);
  net.all({ k: 'fx', t: 'boom', x: pos.x, z: pos.z, r: radius });
  alertNear(pos, 80);
  for (const p of livePlayers()) {
    const dp = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (dp < radius) hurtPlayer(p.id, playerDmg * (1 - 0.5 * dp / radius));
  }
  if (generator && Math.hypot(generator.x - pos.x, generator.z - pos.z) < radius + 2.5) damageGenerator(playerDmg * 2);
  for (const o of [...enemies]) {
    if (o.mesh.position.distanceTo(pos) < radius) damageEnemy(o, enemyDmg, -1);
  }
}

const pendingFlag = { shot: false };
function damageEnemy(e, amount, by = net.id) {
  if (net.role === 'client') {                    // o cliente só informa o acerto; o host aplica o dano
    pendingHits.push([e.id, Math.round(amount)]); e.hp -= amount; return;
  }
  if (!enemies.includes(e)) return;
  if (e.pl && e.pl.state === 'patrol') alertPlatoon(e.pl);
  e.by = by;
  e.hp -= amount;
  if (e.hp <= 0) killEnemy(e);
}

function addDrop(id, type, x, z) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: type === 'hp' ? 0x5ce08a : 0xffcf3f }));
  m.position.set(x, 0.7, z);
  scene.add(m);
  drops.push({ id, m, type, t: 22 });
}
function removeDrop(d) { scene.remove(d.m); const i = drops.indexOf(d); if (i >= 0) drops.splice(i, 1); }
function maybeDropForce(pos) { const type = Math.random() < 0.5 ? 'hp' : 'ammo', id = uid(); addDrop(id, type, pos.x, pos.z); net.all({ k: 'drop', id, type, x: pos.x, z: pos.z }); }
function maybeDrop(pos) {
  if (Math.random() > 0.14) return;
  const type = Math.random() < 0.5 ? 'hp' : 'ammo', id = uid();
  addDrop(id, type, pos.x, pos.z);
  net.all({ k: 'drop', id, type, x: pos.x, z: pos.z });
}

const deathColor = e => e.fac === 'bots' ? (e.type === 'spitter' ? 0xffb03a : 0xc0c6ce) : (e.type === 'spitter' ? 0xa4ff6a : 0xc23b2a);
function killEnemy(e) {
  if (!enemies.includes(e)) return;
  burst(e.mesh.position.clone().setY(e.t.height), deathColor(e), e.type === 'brute' || e.type === 'queen' ? 40 : 14, 6);
  scene.remove(e.mesh);
  enemies.splice(enemies.indexOf(e), 1);
  if (e.by !== -2) { kills++; killsBy[e.by] = (killsBy[e.by] || 0) + 1; $('kills').textContent = 'Abates: ' + kills; }
  if (e.type === 'bomber') explode(e.mesh.position, 5.5, 35 * e.dm * mods.edmg, 70);
  else if (e.type === 'titan') { for (let k = 0; k < 4; k++) maybeDropForce(e.mesh.position.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4)))); }
  else maybeDrop(e.mesh.position);
  if (e.type === 'titan') { mission.boss = null; sayAll('Titã ácido abatido!', 3); shake = Math.max(shake, 0.6); }
  if (e.by !== -2) addXp((XP_VALUES[e.type] || 5) * (e.elite ? 2 : 1));
  mission.onKill?.(e);
}

// ───────────────────────── Equipe ─────────────────────────
// No host (e no solo) a simulação enxerga todos os jogadores vivos: o local e os remotos.
const localAlive = () => state === 'playing' || state === 'loot';
function livePlayers() {
  const arr = [];
  if (localAlive()) arr.push({ id: net.id, pos: player.pos, sprinting: !!player.sprinting, walk: !!keys.KeyC && !player.sprinting, local: true });
  for (const o of Object.values(others)) if (o.status === 'alive') arr.push({ id: o.id, pos: o.pos, sprinting: !!o.st.sp, walk: !!o.st.wk, local: false });
  return arr;
}
function nearestLive(pos) {
  let b = null, bd = 1e9;
  for (const p of livePlayers()) { const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; b = p; } }
  return b;
}
function teamCenter() {
  const L = livePlayers();
  if (!L.length) return player.pos.clone().setY(0);
  const c = new THREE.Vector3(); L.forEach(p => c.add(p.pos));
  return c.multiplyScalar(1 / L.length).setY(0);
}
const anyLiveNear = (pt, r) => livePlayers().some(p => Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z) < r);
const minLiveDist = pt => livePlayers().reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z)), 1e9);
function hurtPlayer(pid, n) { if (pid === net.id) damagePlayer(n); else net.to(pid, { k: 'dmg', n }); }
function sayAll(text, secs = 2.5) { say(text, secs); net.all({ k: 'say', text, secs }); }
const spawnRing = (base, i) => base.clone().add(new THREE.Vector3(Math.cos(i * 1.6) * (i ? 2.6 : 0), 0, Math.sin(i * 1.6) * (i ? 2.6 : 0)));

// ───────────────────────── Pelotões (grupos de patrulha) ─────────────────────────
// Lógica própria: um pelotão é uma âncora que percorre pontos do mapa com os membros em formação.
// Ele passa a atacar em grupo quando alguém chega perto, quando há tiros/explosões na região
// ou quando um membro leva dano; o alerta contagia pelotões vizinhos.
const PL_DETECT = 28;
function formationOffset(i, heading) {
  const row = Math.floor(i / 3), col = (i % 3) - 1;
  const x = col * 2.8, z = row * 2.8;
  const c = Math.cos(heading), sn = Math.sin(heading);
  return new THREE.Vector3(x * c + z * sn, 0, -x * sn + z * c);
}
function makePlatoon(center, types, opts = {}) {
  const fac = opts.fac || pickFac();
  const pl = { fac, members: [], anchor: center.clone().setY(0), wps: opts.wps || [], wi: 0, state: opts.alert ? 'alert' : 'patrol', speed: 2.3, heading: rand(0, Math.PI * 2), msgT: 0 };
  types.forEach((t, i) => {
    const e = spawnEnemy(t, pl.anchor.clone().add(formationOffset(i, pl.heading)), { pl, fac, wave: opts.wave, alert: !!opts.alert, slot: i, hpMul: opts.hpMul, dmMul: opts.dmMul });
    pl.members.push(e);
  });
  platoons.push(pl);
  return pl;
}
function alertPlatoon(pl, depth = 0) {
  if (pl.state === 'alert') return;
  pl.state = 'alert';
  pl.members.forEach(e => { e.alert = true; });
  if (elapsed - lastAlertMsg > 4) { lastAlertMsg = elapsed; sayAll('Pelotão inimigo alertado!', 1.6); beep(160, 0.25, 0.08); }
  if (depth < 2) for (const o of platoons) {
    if (o.state === 'patrol' && o.anchor.distanceTo(pl.anchor) < 36) alertPlatoon(o, depth + 1);
  }
}
let lastAlertMsg = -10;
function alertNear(pos, radius) {
  for (const pl of platoons) if (pl.state === 'patrol' && Math.hypot(pl.anchor.x - pos.x, pl.anchor.z - pos.z) < radius) alertPlatoon(pl);
}
function updatePlatoons(dt) {
  const live = livePlayers();
  for (const pl of [...platoons]) {
    pl.members = pl.members.filter(e => enemies.includes(e));
    if (!pl.members.length) { platoons.splice(platoons.indexOf(pl), 1); continue; }
    if (pl.state !== 'patrol') continue;
    if (pl.wps.length) {
      const tgt = pl.wps[pl.wi], dx = tgt.x - pl.anchor.x, dz = tgt.z - pl.anchor.z, d = Math.hypot(dx, dz);
      if (d < 2) pl.wi = (pl.wi + 1) % pl.wps.length;
      else { pl.anchor.x += dx / d * pl.speed * dt; pl.anchor.z += dz / d * pl.speed * dt; pl.heading = Math.atan2(dx, dz); }
    }
    if (mixFac && pl.members.some(e => foeOf(e, 32))) { alertPlatoon(pl); continue; }
    for (const p of live) {                                  // qualquer jogador pode chamar a atenção do pelotão
      const reach = PL_DETECT * (p.sprinting ? 1.35 : p.walk ? 0.65 : 1);
      if (pl.members.some(e => e.mesh.position.distanceTo(p.pos) < reach)) { alertPlatoon(pl); break; }
    }
  }
}

// ───────────────────────── XP, nível e sorteio ─────────────────────────
// Cada nível exige o dobro de XP do anterior. Ao subir, sorteia-se um efeito: 70% aumenta a dificuldade,
// 20% dá um bônus de combate e 10% uma ajuda no mapa.
function addXp(n) {
  xp += n * (1 + 0.05 * lvl('xp'));
  while (xp >= xpNeed) { xp -= xpNeed; level++; xpNeed *= 2; pendingLoot++; }
  if (pendingLoot > 0 && state === 'playing') startLoot();
}
const LOOT = {
  diff: [
    { name: 'Carapaça reforçada', desc: 'Inimigos com +20% de vida', apply: () => { mods.hp *= 1.2; } },
    { name: 'Enxame faminto', desc: '+25% de inimigos por onda e por pelotão', apply: () => { mods.count *= 1.25; } },
    { name: 'Frenesi', desc: 'Inimigos 10% mais rápidos', apply: () => { mods.speed *= 1.1; } },
    { name: 'Presas afiadas', desc: 'Inimigos causam +15% de dano', apply: () => { mods.edmg *= 1.15; } },
    { name: 'Casta de elite', desc: '+12% de chance de inimigos elite (vida x2,4)', apply: () => { mods.elite += 0.12; } },
    { name: 'Emboscada!', desc: 'Um pelotão ataca a equipe agora', apply: () => ambush() },
  ],
  buff: [
    { name: 'Fúria de combate', desc: '+25% de dano por 40 segundos', apply: () => teamBuff('dmg') },
    { name: 'Escudo de energia', desc: 'Absorve 60 de dano', apply: () => teamBuff('shield') },
    { name: 'Estimulante', desc: 'Vida totalmente restaurada', apply: () => teamBuff('heal') },
    { name: 'Munição cheia', desc: 'Todas as armas recarregadas', apply: () => teamBuff('ammo') },
  ],
  help: [
    { name: 'Torre automática', desc: 'Uma torre defende a área por 40 segundos', apply: () => dropTurret() },
    { name: 'Caixa de suprimentos', desc: 'Cai munição e vida perto de você', apply: () => dropSupplyNear() },
    { name: 'Orbital liberado', desc: 'Ataque orbital pronto agora', apply: () => teamBuff('orb') },
    { name: 'Reparos', desc: 'Gerador +30% (ou vida cheia sem gerador)', apply: () => { if (generator && generator.hp > 0) generator.hp = Math.min(generator.max, generator.hp + generator.max * 0.3); else teamBuff('heal'); } },
  ],
};
const LOOT_LABEL = { diff: 'Aumento de dificuldade', buff: 'Bônus de combate', help: 'Ajuda no mapa' };
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function startLoot() {
  pendingLoot--;
  state = 'loot'; mouseDown = false;
  const r = Math.random();
  const kind = r < 0.7 ? 'diff' : r < 0.9 ? 'buff' : 'help';
  const item = pick(LOOT[kind]);
  lootRun = { kind, item, t: 0, flick: 0, shown: false, remote: false };
  net.all({ k: 'loot', kind, name: item.name, desc: item.desc, lv: level });
  $('lootLvl').textContent = `NÍVEL ${level}`;
  $('loot').classList.add('on');
  $('lootCard').className = 'loot-card spin';
  beep(520, 0.15); beep(780, 0.2);
}
function startLootRemote(d) {                    // cliente: só mostra a roleta; os efeitos vêm do host
  state = 'loot'; mouseDown = false;
  lootRun = { kind: d.kind, item: { name: d.name, desc: d.desc, apply: () => {} }, t: 0, flick: 0, shown: false, remote: true };
  $('lootLvl').textContent = `NÍVEL ${d.lv}`;
  $('loot').classList.add('on');
  $('lootCard').className = 'loot-card spin';
  beep(520, 0.15); beep(780, 0.2);
}
function updateLoot(dt) {
  const L = lootRun; L.t += dt; L.flick -= dt;
  const SPIN = 1.9, TOTAL = 3.4;
  if (L.t < SPIN) {
    if (L.flick <= 0) {                                   // desacelera como uma roleta
      L.flick = 0.06 + 0.2 * (L.t / SPIN) ** 2;
      const k = pick(['diff', 'buff', 'help']);
      const it = pick(LOOT[k]);
      $('lootKind').textContent = LOOT_LABEL[k]; $('lootName').textContent = it.name; $('lootDesc').textContent = '';
      $('lootCard').className = 'loot-card spin ' + k;
      beep(300 + Math.random() * 400, 0.04, 0.03);
    }
  } else if (!L.shown) {
    L.shown = true;
    $('lootKind').textContent = LOOT_LABEL[L.kind]; $('lootName').textContent = L.item.name; $('lootDesc').textContent = L.item.desc;
    $('lootCard').className = 'loot-card ' + L.kind;
    beep(L.kind === 'diff' ? 140 : 880, 0.4, 0.1);
    if (!L.remote) { L.item.apply(); refreshMods(); }
  }
  if (L.t >= TOTAL) {
    $('loot').classList.remove('on');
    lootRun = null; state = 'playing';
    if (!L.remote && pendingLoot > 0) startLoot();
  }
}
// efeitos que valem para todos os jogadores: cada máquina aplica o seu
function applyBuff(id) {
  if (id === 'dmg') buffs.dmg = 40;
  else if (id === 'shield') buffs.shield = 60;
  else if (id === 'heal') player.hp = maxHp();
  else if (id === 'ammo') refillAmmo();
  else if (id === 'orb') player.strikeCd = 0;
}
function teamBuff(id) { applyBuff(id); net.all({ k: 'buff', id }); }
function refreshMods() {
  const rows = [];
  const pct = v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  if (mods.hp !== 1) rows.push(`☠ Vida inimiga ${pct(mods.hp)}`);
  if (mods.count !== 1) rows.push(`☠ Inimigos ${pct(mods.count)}`);
  if (mods.speed !== 1) rows.push(`☠ Velocidade ${pct(mods.speed)}`);
  if (mods.edmg !== 1) rows.push(`☠ Dano inimigo ${pct(mods.edmg)}`);
  if (mods.elite > 0) rows.push(`☠ Elites ${Math.round(mods.elite * 100)}%`);
  const el = $('mods');
  el.innerHTML = rows.map(r => `<div>${r}</div>`).join('') +
    (buffs.dmg > 0 ? `<div class="up">✚ Fúria ${Math.ceil(buffs.dmg)}s</div>` : '') +
    (buffs.shield > 0 ? `<div class="up">✚ Escudo ${Math.ceil(buffs.shield)}</div>` : '');
}
function refillAmmo() {
  WEAPONS.forEach((w, i) => {
    if (i === player.weapon) { player.mag = w.mag; player.reserve = reserveCap(w); }
    else player.ammo[i] = { mag: w.mag, reserve: reserveCap(w) };
  });
}
function ambush() {
  const lp = livePlayers(), base = lp.length ? pick(lp).pos : player.pos;
  const a = rand(0, Math.PI * 2), c = base.clone().add(new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24));
  const types = []; const n = Math.round(6 * cnt());
  for (let i = 0; i < n; i++) types.push(i % 4 === 3 ? 'spitter' : 'crawler');
  makePlatoon(c, types, { alert: true });
}
function addCrate(id, x, z) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a7a3a }));
  box.castShadow = true;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ce08a, transparent: true, opacity: 0.5 }));
  beam.position.y = 20;
  g.add(box, beam); g.position.set(x, 0, z); box.position.y = 30; scene.add(g);
  crates.push({ id, g, box, landed: false, t: 0 });
}
function removeCrate(c) { scene.remove(c.g); const i = crates.indexOf(c); if (i >= 0) crates.splice(i, 1); }
function hostAddCrate(x, z) { const id = uid(); addCrate(id, x, z); net.all({ k: 'crate', id, x, z }); }
function dropSupplyNear() {
  const lp = livePlayers(), base = lp.length ? pick(lp).pos : player.pos, a = rand(0, Math.PI * 2);
  hostAddCrate(base.x + Math.cos(a) * 6, base.z + Math.sin(a) * 6);
}
function addTurret(id, x, z, life = 40) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x3b4450, metalness: 0.5 }));
  base.position.y = 0.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.9), new THREE.MeshStandardMaterial({ color: 0x66d9ff, emissive: 0x1a6a8a }));
  head.position.y = 1.15;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0x222831 }));
  gun.position.set(0, 1.15, -0.8);
  const pivot = new THREE.Group(); pivot.add(head, gun); g.add(base, pivot);
  g.position.set(x, 0, z); scene.add(g);
  turrets.push({ id, g, pivot, t: life, cd: 0 });
}
function dropTurret() {
  const lp = livePlayers(), base = lp.length ? pick(lp).pos : player.pos, a = rand(0, Math.PI * 2);
  const x = base.x + Math.cos(a) * 4, z = base.z + Math.sin(a) * 4, id = uid();
  addTurret(id, x, z); net.all({ k: 'turret', id, x, z });
}
function updateTurrets(dt) {
  for (const T of [...turrets]) {
    T.t -= dt; T.cd -= dt;
    if (net.role !== 'client') {                          // só o host atira; clientes apenas mostram a torre
      let best = null, bd = 38;
      for (const e of enemies) { const d = e.mesh.position.distanceTo(T.g.position); if (d < bd) { bd = d; best = e; } }
      if (best) {
        T.pivot.rotation.y = Math.atan2(-(best.mesh.position.x - T.g.position.x), -(best.mesh.position.z - T.g.position.z));
        if (T.cd <= 0) {
          T.cd = 0.16;
          const from = T.g.position.clone().setY(1.2), to = best.mesh.position.clone().setY(best.t.height);
          addTracer(from, to); damageEnemy(best, 7, -1);
        }
      }
    }
    if (T.t <= 0) { scene.remove(T.g); turrets.splice(turrets.indexOf(T), 1); if (net.role === 'host') net.all({ k: 'turretGone', id: T.id }); }
  }
}

// ───────────────────────── Objetivo concluído ─────────────────────────
let objTimer = 0;
function showObjectiveDone(title, text, kick = 'OBJETIVO CONCLUÍDO') {
  $('odKick').textContent = kick; $('odTitle').textContent = title; $('odText').textContent = text;
  const el = $('objDone'); el.classList.add('on');
  clearTimeout(objTimer); objTimer = setTimeout(() => el.classList.remove('on'), 7500);
  beep(523, 0.18, 0.1); setTimeout(() => beep(659, 0.18, 0.1), 140); setTimeout(() => beep(784, 0.35, 0.12), 280);
}
function objectiveDone(title, text, kick) { showObjectiveDone(title, text, kick); net.all({ k: 'objdone', title, text, kick }); }

// ───────────────────────── Missões ─────────────────────────
function makeBeacon(x, z) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.18, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffcf3f }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.35 }));
  col.position.y = 7;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), new THREE.MeshStandardMaterial({ color: 0x333a44 }));
  core.position.y = 1;
  g.add(ring, col, core);
  g.position.set(x, 0, z);
  scene.add(g);
  return { g, ring, col, x, z, progress: 0, done: false };
}

function makePod(x, z) {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 10), new THREE.MeshStandardMaterial({ color: 0x66ffb0, emissive: 0x22aa66, emissiveIntensity: 1.1 }));
  cap.position.y = 1.0;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 22, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ffb0, transparent: true, opacity: 0.4 }));
  beam.position.y = 11;
  g.add(cap, beam);
  g.position.set(x, 0, z);
  scene.add(g);
  return { g, cap, x, z, got: false };
}

function planOperation() {
  const a0 = rand(0, Math.PI * 2);
  const pol = (a, d) => new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
  return { S: pol(a0, 118), G: pol(a0 + rand(1, 5), rand(0, 14)), E: pol(a0 + Math.PI + rand(-0.7, 0.7), 105), R: 150 };
}
function clampArena(v, margin = 4) {
  const l = Math.hypot(v.x, v.z);
  if (l > ARENA_R - margin) v.multiplyScalar((ARENA_R - margin) / l);
  return v;
}
function buildOperationPlatoons(L) {
  const dir = L.G.clone().sub(L.S), perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = 0.34 + 0.54 * i / (N - 1);                              // espalhados ao longo do caminho
    const c = clampArena(L.S.clone().lerp(L.G, t).addScaledVector(perp, rand(-26, 26)));
    const size = Math.round(rand(4, 6) * cnt()) + (t > 0.6 ? 1 : 0);
    const types = [];
    for (let k = 0; k < size; k++) {
      const r = Math.random();
      types.push(t > 0.55 && r < 0.14 ? 'charger' : t > 0.35 && r < 0.12 ? 'bomber' : r < 0.3 ? 'spitter' : 'crawler');
    }
    if (i >= N - 2) types.push('brute');
    const wps = [0, 1, 2].map(j => clampArena(c.clone().add(new THREE.Vector3(Math.cos(j * 2.1) * rand(10, 18), 0, Math.sin(j * 2.1) * rand(10, 18)))));
    makePlatoon(c, types, { wps });
  }
  for (let i = 0; i < 2; i++) {                                         // guarda do gerador
    const a = rand(0, Math.PI * 2), c = L.G.clone().add(new THREE.Vector3(Math.cos(a) * 34, 0, Math.sin(a) * 34));
    const wps = [0, 1, 2, 3].map(j => L.G.clone().add(new THREE.Vector3(Math.cos(a + j * 1.6) * 36, 0, Math.sin(a + j * 1.6) * 36)));
    makePlatoon(c, ['crawler', 'crawler', 'spitter', 'crawler', 'spitter'], { wps });
  }
}
function typeMix(n) {                      // probabilidades da fase, crescendo com Fibonacci a cada onda
  const f = 1 + 0.04 * fib(n);
  return { bomb: n >= 2 ? curMix.bomb * f : 0, chrg: n >= 4 ? curMix.chrg * f : 0, spit: curMix.spit };
}
function rollType(m, r) { return r < m.bomb ? 'bomber' : r < m.bomb + m.chrg ? 'charger' : r < m.bomb + m.chrg + m.spit ? 'spitter' : 'crawler'; }
function waveTypes(n, count) {
  const arr = [], m = typeMix(n);
  for (let i = 0; i < count; i++) arr.push(rollType(m, Math.random()));
  return arr;
}
function spawnWave(op, n) {
  op.wave = n; op.waveActive = true;
  const total = Math.round((10 + 3 * n) * cnt()), hpMul = fibHp(n), dmMul = fibDm(n);
  const base = rand(0, Math.PI * 2);
  for (let g = 0; g < 3; g++) {
    const ang = base + g * 2.1 + rand(-0.3, 0.3);
    const c = clampArena(new THREE.Vector3(generator.x + Math.cos(ang) * rand(58, 70), 0, generator.z + Math.sin(ang) * rand(58, 70)));
    makePlatoon(c, waveTypes(n, Math.round(total / 3)), { alert: true, wave: n, hpMul, dmMul });
  }
  const brutes = n === 8 ? 2 : (n === 5 || n === 7) ? 1 : 0;
  if (titanAsset && (mission.level || 1) >= TITAN_MIN_LEVEL && (n === 6 || n === 8) && !(curFaction === 'bots' && !mixFac)) {
    const ang = rand(0, Math.PI * 2); spawnEnemy('titan', clampArena(new THREE.Vector3(generator.x + Math.cos(ang) * 66, 0, generator.z + Math.sin(ang) * 66)), { wave: n, alert: true, hpMul: 1 + 0.06 * ((mission.level || 1) - TITAN_MIN_LEVEL) });
    sayAll('Um Titã ácido entrou na batalha!', 3.5);
  }
  for (let k = 0; k < brutes; k++) {
    const ang = rand(0, Math.PI * 2);
    spawnEnemy('brute', clampArena(new THREE.Vector3(generator.x + Math.cos(ang) * 64, 0, generator.z + Math.sin(ang) * 64)), { wave: n, alert: true, hpMul, dmMul });
  }
  op.waveSize = Math.max(1, enemies.filter(e => e.wave === n).length);
  sayAll(`ONDA ${n} / ${op.waves}`, 3); beep(200, 0.4, 0.1);
}
function spawnReinforcement() {
  if (enemies.length > 32) return;
  const E = opLayout.E, a = rand(0, Math.PI * 2);
  for (let g = 0; g < 2; g++) {
    const ang = a + g * 3.1;
    const c = clampArena(new THREE.Vector3(E.x + Math.cos(ang) * 68, 0, E.z + Math.sin(ang) * 68));
    const n = Math.round((7 + level) * cnt() * 0.5);
    makePlatoon(c, waveTypes(8, n), { alert: true, wave: 99, hpMul: fibHp(8), dmMul: fibDm(8) });
  }
  sayAll('Reforços inimigos!', 1.8);
}

function makePlane() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x59636f, metalness: 0.5, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.9 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(5, 4.2, 20), hull, 0, 3.1, 0);
  const nose = add(new THREE.ConeGeometry(2.5, 6, 4), hull, 0, 3.1, -13); nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4;
  add(new THREE.BoxGeometry(26, 0.5, 6), hull, 0, 3.4, -1.5);
  add(new THREE.BoxGeometry(0.6, 4.4, 3.4), hull, 0, 6.6, 8);
  add(new THREE.BoxGeometry(9, 0.4, 2.6), hull, 0, 5.6, 9);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(1.1, 1.3, 3.2, 12), hull, sx * 9, 3.6, -1.5);
    add(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 12), new THREE.MeshBasicMaterial({ color: 0x66d9ff }), sx * 9, 1.95, -1.5);
  }
  add(new THREE.BoxGeometry(3.6, 3.2, 0.2), dark, 0, 2.7, 10.05);                  // interior visível quando a rampa abre
  add(new THREE.BoxGeometry(3.2, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xf28c1f, emissive: 0x7a3a00 }), 0, 1.15, 5.8);
  const ramp = new THREE.Group(); ramp.position.set(0, 1.1, 10.1);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 5.2), hull); plate.position.set(0, 0, 2.6); plate.castShadow = true; ramp.add(plate);
  ramp.rotation.x = -Math.PI / 2;                                                  // fechada (de pé)
  g.add(ramp);
  scene.add(g);
  return { g, ramp, state: 'inbound', t: 0, yaw: 0, land: new THREE.Vector3(), start: new THREE.Vector3() };
}
function planeLocal(pos) {
  const dx = pos.x - plane.g.position.x, dz = pos.z - plane.g.position.z, c = Math.cos(plane.yaw), sn = Math.sin(plane.yaw);
  return { x: dx * c - dz * sn, z: dx * sn + dz * c };
}
function resolvePlane(pos) {
  if (!plane || plane.state === 'inbound' || plane.rampVisited) return;           // o casco só é sólido até você usar a rampa
  const l = planeLocal(pos);
  if (Math.abs(l.x) < 2.9 && l.z > -9 && l.z < 8.6) {
    const push = (2.9 - Math.abs(l.x)) * Math.sign(l.x || 1);
    const c = Math.cos(plane.yaw), sn = Math.sin(plane.yaw);
    pos.x += push * c; pos.z += -push * sn;
  }
}

function localBoardingCheck() {
  if (!plane || plane.state !== 'open') { player.boarded = false; return; }
  const l = planeLocal(player.pos);
  if (Math.abs(l.x) < 2.4 && l.z > 8.6 && l.z < 15) plane.rampVisited = true;
  player.boarded = !!(plane.rampVisited && Math.abs(l.x) < 2.4 && l.z > -4 && l.z < 8.6);
}
function updateOperation(m, dt) {
  const op = m.op, L = opLayout;
  const gpct = () => Math.max(0, Math.round(generator.hp / generator.max * 100));
  if (op.phase === 'travel') {
    waypoint = L.G; waypointHide = 0;
    const d = Math.min(9999, minLiveDist(L.G));
    m.text = `Chegue ao gerador: ${Math.round(d)} m — evite ou enfrente os pelotões`;
    m.progress = Math.max(0, 1 - d / op.travelTotal);
    if (d < 16) {
      op.phase = 'defend'; op.countdown = 8; generator.active = true;
      checkpoint.copy(L.G).add(new THREE.Vector3(8, 0, 8));
      sayAll('Gerador alcançado! Defenda-o: a primeira onda chega em 8 s.', 4);
    }
  } else if (op.phase === 'defend') {
    waypoint = null;
    if (!op.waveActive) {
      op.countdown -= dt;
      m.text = `Onda ${op.wave + 1}/${op.waves} em ${Math.max(0, Math.ceil(op.countdown))} s — gerador ${gpct()}%`;
      if (op.countdown <= 0) spawnWave(op, op.wave + 1);
    } else {
      const alive = enemies.filter(e => e.wave === op.wave).length;
      m.text = `Onda ${op.wave}/${op.waves} — inimigos: ${alive} — gerador ${gpct()}%`;
      m.progress = (op.wave - 1 + (1 - alive / op.waveSize)) / op.waves;
      if (alive === 0) {
        op.waveActive = false;
        if (op.wave >= op.waves) {
          op.phase = 'extract'; m.progress = 0;
          generator.active = false;                 // objetivo concluído: os inimigos passam a focar nos jogadores
          const geo = new THREE.TorusGeometry(50, 0.35, 6, 120);
          zoneRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf28c1f }));
          zoneRing.rotation.x = Math.PI / 2; zoneRing.position.set(L.E.x, 0.3, L.E.z); scene.add(zoneRing);
          objectiveDone('Gerador estabilizado', `${op.waves} ondas contidas em ${fmtTime(elapsed)}. Siga até a zona de extração (raio de 50 m) e segure a posição por 1:30.`);
        } else { op.countdown = 10; sayAll(`Onda ${op.wave} contida! Próxima em 10 s.`, 2.5); }
      }
    }
  } else if (op.phase === 'extract') {
    const d = Math.min(9999, minLiveDist(L.E)), inside = anyLiveNear(L.E, 50);
    waypoint = L.E; waypointHide = 50;
    if (inside && !op.zoneIn) { op.zoneIn = true; checkpoint.copy(L.E); sayAll('Segure a zona por 1:30!', 3); }
    zoneRing.material.color.set(inside ? 0x4cd68a : 0xf28c1f);
    if (inside) op.exT += dt;
    m.text = inside ? `Segure a zona de extração: ${fmtTime(op.exNeed - op.exT)}` : `Vá à zona de extração: ${Math.round(d)} m (o tempo só corre dentro dela)`;
    m.progress = op.exT / op.exNeed;
    if (op.zoneIn) { op.reinfT -= dt; if (op.reinfT <= 0) { op.reinfT = 20; spawnReinforcement(); } }
    if (op.exT >= op.exNeed) {
      op.phase = 'plane';
      plane = makePlane();
      plane.yaw = rand(0, Math.PI * 2);
      const fwd = new THREE.Vector3(-Math.sin(plane.yaw), 0, -Math.cos(plane.yaw));
      plane.land.copy(L.E).addScaledVector(fwd, -6);                                    // pousa com a rampa voltada para o centro
      plane.start.copy(plane.land).addScaledVector(fwd, -260).setY(85);
      plane.g.rotation.y = plane.yaw;
      plane.g.position.copy(plane.start);
      objectiveDone('Extração liberada', 'Contagem concluída: a nave de extração está descendo. Aguarde o pouso e entre pela rampa traseira — todos precisam embarcar.', 'ZONA SEGURA');
      beep(180, 0.6, 0.12);
    }
  } else if (op.phase === 'plane') {
    plane.t += dt;
    const pl = plane;
    if (pl.state === 'inbound') {
      const u = Math.min(1, pl.t / 9), e = 1 - Math.pow(1 - u, 3);
      pl.g.position.lerpVectors(pl.start, pl.land, e);
      pl.g.rotation.x = 0.1 * (1 - u);
      if (u >= 1) { pl.state = 'landed'; pl.t = 0; pl.g.rotation.x = 0; noise(0.6, 0.3, 300); shake = Math.max(shake, 0.4); }
      m.text = 'A nave de extração está pousando…'; m.progress = 1;
    } else if (pl.state === 'landed') {
      if (pl.t > 1.2) { pl.state = 'opening'; pl.t = 0; }
      m.text = 'A nave pousou…';
    } else if (pl.state === 'opening') {
      const u = Math.min(1, pl.t / 2.5);
      pl.ramp.rotation.x = -Math.PI / 2 + (Math.PI / 2 + 0.22) * (u * u * (3 - 2 * u));
      if (u >= 1) { pl.state = 'open'; sayAll('Rampa aberta! Entre na nave pela traseira!', 4); beep(660, 0.3, 0.1); }
      m.text = 'Abrindo a rampa traseira…';
    } else if (pl.state === 'open') {
      waypoint = pl.g.position; waypointHide = 0;
      localBoardingCheck();
      const liveOthers = Object.values(others).filter(o => o.status === 'alive');
      const boardedN = (player.boarded ? 1 : 0) + liveOthers.filter(o => o.bd).length;
      const totalN = (localAlive() ? 1 : 0) + liveOthers.length;
      m.text = totalN > 1 ? `Todos precisam embarcar pela rampa traseira: ${boardedN}/${totalN} a bordo` :
        (pl.rampVisited ? 'Entre na cabine!' : `Entre na nave pela rampa traseira — ${Math.round(minLiveDist(pl.g.position))} m`);
      if (totalN > 0 && boardedN === totalN) {
        pl.state = 'closing'; pl.t = 0; state = 'cinematic'; cinT = 0; waypoint = null;
        playerGroup.visible = false; mouseDown = false;
        sayAll('Todos a bordo!', 3);
      }
    }
  }
}

function updateCinematic(dt) {
  cinT += dt; const pl = plane;
  if (!pl) return;
  if (net.role !== 'client') {                       // o host (ou solo) conduz a animação; clientes só assistem
    if (pl.state === 'closing') {
      pl.t += dt;
      const u = Math.min(1, pl.t / 2);
      pl.ramp.rotation.x = 0.22 - (Math.PI / 2 + 0.22) * (u * u * (3 - 2 * u));
      if (u >= 1) { pl.state = 'takeoff'; pl.t = 0; noise(0.8, 0.3, 200); }
    } else if (pl.state === 'takeoff') {
      pl.t += dt;
      const fwd = new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
      pl.g.position.y += (1.5 * pl.t * pl.t + 2) * dt * 3;
      pl.g.position.addScaledVector(fwd, pl.t * pl.t * 3 * dt);
      pl.g.rotation.x = Math.min(0.28, pl.t * 0.08);
      if (pl.t > 5.0) $('fade').style.opacity = 1;
      if (pl.t > 6.4) endMission(true);
    }
  } else if (pl.state === 'takeoff' && pl.g.position.y > 40) $('fade').style.opacity = 1;
  const a = pl.yaw + 2.2 + cinT * 0.12, dist = 44;
  camera.position.set(pl.g.position.x + Math.sin(a) * dist, pl.g.position.y + 12, pl.g.position.z + Math.cos(a) * dist);
  camera.lookAt(pl.g.position.x, pl.g.position.y + 3, pl.g.position.z);
}

function buildMission(id) {
  const m = { id, onKill: null, update: null, title: '', text: '', progress: 0, cap: 14, interval: 1.0 };
  if (id === 'purge') {
    m.title = 'Limpeza do setor';
    m.cap = 0; m.interval = 999;
    m.fib = [5, 8, 13, 21, 34, 55];                         // quantidade de inimigos por onda
    m.pw = { wave: 0, active: false, countdown: 5, size: 1 };
    m.update = dt => {
      const w = m.pw, total = m.fib.length;
      if (!w.active) {
        w.countdown -= dt;
        m.text = `Onda ${w.wave + 1}/${total} em ${Math.max(0, Math.ceil(w.countdown))} s`;
        if (w.countdown <= 0) {
          w.wave++; w.active = true;
          const count = m.fib[w.wave - 1], hpMul = fibHp(w.wave), dmMul = fibDm(w.wave);      // contagem exata de Fibonacci
          const groups = count >= 13 ? 3 : count >= 8 ? 2 : 1, base = rand(0, Math.PI * 2);
          for (let g = 0; g < groups; g++) {
            const ang = base + g * (Math.PI * 2 / groups), n = Math.floor(count / groups) + (g < count % groups ? 1 : 0);
            const c = clampArena(teamCenter().add(new THREE.Vector3(Math.cos(ang) * rand(44, 58), 0, Math.sin(ang) * rand(44, 58))));
            makePlatoon(c, waveTypes(w.wave + 1, n), { alert: true, wave: w.wave, hpMul, dmMul });
          }
          // o sorteio "mais inimigos" não muda a sequência: vira um reforço que chega depois, na mesma onda
          w.extra = mods.count > 1.01 ? Math.round(count * (mods.count - 1)) : 0; w.extraT = 9;
          w.size = Math.max(1, enemies.filter(e => e.wave === w.wave).length);
          sayAll(`ONDA ${w.wave} / ${total} — ${count} inimigos`, 3); beep(200, 0.4, 0.1);
        }
      } else {
        if (w.extra > 0) {
          w.extraT -= dt;
          if (w.extraT <= 0) {
            const a = rand(0, Math.PI * 2), c = clampArena(teamCenter().add(new THREE.Vector3(Math.cos(a) * 50, 0, Math.sin(a) * 50)));
            makePlatoon(c, waveTypes(w.wave + 1, w.extra), { alert: true, wave: w.wave, hpMul: fibHp(w.wave), dmMul: fibDm(w.wave) });
            w.size += w.extra; w.extra = 0; sayAll('Reforços do enxame!', 2);
          }
        }
        const alive = enemies.filter(e => e.wave === w.wave).length;
        m.text = `Onda ${w.wave}/${total} — inimigos restantes: ${alive}`;
        m.progress = (w.wave - 1 + (1 - alive / w.size)) / total;
        if (alive === 0) {
          w.active = false;
          if (w.wave >= total) endMission(true);
          else { w.countdown = 7; sayAll(`Onda ${w.wave} limpa! Próxima: ${m.fib[w.wave]} inimigos.`, 2.5); }
        }
      }
    };
  }
  if (id === 'samples') {
    m.title = 'Coleta de amostras';
    m.total = 6; m.got = 0; m.cap = 12; m.interval = 1.8;
    for (let i = 0; i < m.total; i++) {
      let x, z, tries = 0;
      do {                                                    // não deixa a cápsula dentro de uma rocha
        const a = (i / m.total) * Math.PI * 2 + rand(-0.3, 0.3), d = rand(30, 72);
        x = Math.cos(a) * d; z = Math.sin(a) * d; tries++;
      } while (tries < 40 && rocks.some(k => Math.hypot(k.x - x, k.z - z) < k.r + 3.5));
      pods.push(makePod(x, z));
    }
    m.update = () => {
      for (const p of pods) {
        if (p.got) continue;
        p.cap.rotation.y = elapsed * 2; p.cap.position.y = 1.0 + 0.15 * Math.sin(elapsed * 3);
        if (anyLiveNear(p, 2.6)) {
          p.got = true; scene.remove(p.g); m.got++;
          sayAll(`Amostra ${m.got}/${m.total} coletada — o enxame sentiu!`, 2.5); beep(900, 0.2);
          for (let k = 0; k < 4 + m.got; k++) {
            const a = rand(0, Math.PI * 2), d = rand(20, 30);
            spawnEnemy(k % 5 === 4 ? 'bomber' : 'crawler', new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d));
          }
        }
      }
      m.text = `Amostras coletadas: ${m.got} / ${m.total}`;
      m.progress = m.got / m.total;
      if (m.got >= m.total) endMission(true);
    };
  }
  if (id === 'beacon') {
    m.title = 'Faróis de comunicação';
    m.cap = 22; m.interval = 1.1;
    const base = Math.random() * 6;
    for (let i = 0; i < 3; i++) {
      const a = base + (i * Math.PI * 2) / 3;
      const d = rand(38, 55);
      beacons.push(makeBeacon(Math.cos(a) * d, Math.sin(a) * d));
    }
    m.update = (dt) => {
      let done = 0, best = 0;
      for (const b of beacons) {
        if (!b.done) {
          const inside = anyLiveNear(b, 6);
          b.progress = Math.max(0, Math.min(1, b.progress + (inside ? dt / 10 : -dt / 25)));
          if (b.progress >= 1) { b.done = true; b.ring.material.color.set(0x5ce08a); b.col.material.color.set(0x5ce08a); sayAll('Farol ativado!'); beep(880, 0.3); }
          best = Math.max(best, b.progress);
        }
        if (b.done) done++;
        b.col.scale.x = b.col.scale.z = 1 + 0.2 * Math.sin(elapsed * 4);
      }
      m.text = `Faróis ativados: ${done} / 3 — fique dentro do círculo`;
      m.progress = (done + (done < 3 ? best : 0)) / 3;
      if (done >= 3) endMission(true);
    };
  }
  if (id === 'operation') {
    const L = opLayout;
    m.title = 'Operação Gerador'; m.lives = 3; m.cap = 0; m.interval = 999;
    generator = makeGenerator(L.G.x, L.G.z); generator.hp = generator.max = 1800;
    m.op = { phase: 'travel', wave: 0, waves: 8, countdown: 0, waveActive: false, waveSize: 1, exT: 0, exNeed: 90, reinfT: 12,
             rampVisited: false, travelTotal: Math.hypot(L.S.x - L.G.x, L.S.z - L.G.z), zoneIn: false };
    buildOperationPlatoons(L);
    m.update = dt => updateOperation(m, dt);
  }
  if (id === 'defend') {
    m.title = 'Defesa do gerador';
    m.duration = 120; m.cap = 20; m.interval = 1.0; m.ev = {};
    generator = makeGenerator(0, -14); generator.active = true;
    m.update = () => {
      const left = Math.max(0, m.duration - elapsed);
      if (elapsed > 40 && !m.ev.c) { m.ev.c = 1; sayAll('Investidores a caminho!', 3); for (let i = 0; i < 2; i++) spawnEnemy('charger'); }
      if (elapsed > 80 && !m.ev.b) { m.ev.b = 1; sayAll('Um brutamontes se aproxima do gerador!', 3); spawnEnemy('brute'); }
      m.text = `Defenda o gerador: ${Math.ceil(left)}s — integridade ${Math.max(0, Math.round(generator.hp / generator.max * 100))}%`;
      m.progress = elapsed / m.duration;
      if (left <= 0) endMission(true);
    };
  }
  if (id === 'extract') {
    m.title = 'Extração sob fogo';
    m.cap = 18; m.interval = 1.1;
    m.brutes = 2;
    spawnEnemy('brute', new THREE.Vector3(-40, 0, -40));
    spawnEnemy('brute', new THREE.Vector3(40, 0, 40));
    m.phase = 1;
    m.holdT = 0;
    m.onKill = e => {
      if (e.type === 'brute') {
        m.brutes--;
        if (m.brutes <= 0) {
          m.phase = 2;
          const a = Math.random() * Math.PI * 2;
          pad = makeBeacon(Math.cos(a) * 50, Math.sin(a) * 50);
          objectiveDone('Brutamontes abatidos', 'Vá até a zona de extração e aguarde o transporte.');
        }
      }
    };
    m.update = (dt) => {
      if (m.phase === 1) {
        m.text = `Derrube os brutamontes: ${2 - m.brutes} / 2`;
        m.progress = (2 - m.brutes) / 2;
      } else {
        const inside = anyLiveNear(pad, 6);
        m.holdT = Math.max(0, Math.min(1, m.holdT + (inside ? dt / 6 : -dt / 12)));
        m.text = 'Chegue à zona de extração e aguarde o transporte';
        m.progress = m.holdT;
        if (m.holdT >= 1) endMission(true);
      }
    };
  }
  if (id === 'queen') {
    m.title = 'Rainha da colmeia';
    m.cap = 9; m.interval = 2.4;
    m.boss = spawnEnemy('queen', new THREE.Vector3(0, 0, -55));
    m.onKill = e => { if (e.type === 'queen') endMission(true); };
    m.update = () => {
      const q = m.boss;
      m.text = enemies.includes(q) ? `Derrube a Rainha: ${Math.max(0, Math.ceil(q.hp))} / ${Math.round(q.maxHp)}` : 'A Rainha caiu!';
      m.progress = enemies.includes(q) ? 1 - q.hp / q.maxHp : 1;
    };
  }
  return m;
}

let titanTimer = 60;
function maybeTitan(dt) {                                   // nível 6+: um Titã por vez, de tempos em tempos (e nunca nas ondas já cobertas pela missão)
  if (!titanAsset || (mission.level || 1) < TITAN_MIN_LEVEL || (mixFac ? false : curFaction === 'bots')) return;
  titanTimer -= dt; if (titanTimer > 0) return;
  titanTimer = rand(80, 120);
  if (enemies.some(e => e.type === 'titan')) return;
  const lp = livePlayers(), base = lp.length ? pick(lp).pos : player.pos, a = Math.random() * Math.PI * 2;
  const p = clampArena(new THREE.Vector3(base.x + Math.cos(a) * 70, 0, base.z + Math.sin(a) * 70));
  const e = spawnEnemy('titan', p, { alert: true, hpMul: 1 + 0.06 * ((mission.level || 1) - TITAN_MIN_LEVEL) });
  sayAll('Um Titã ácido se aproxima! Cuidado com a pisada e com o jato.', 4); beep(90, 0.8, 0.15);
}
function spawnLogic(dt) {
  if (mission.id !== 'operation' && mission.id !== 'queen') maybeTitan(dt);
  spawnTimer -= dt;
  const small = enemies.filter(e => e.type !== 'brute' && e.type !== 'queen' && e.type !== 'titan').length;
  if (spawnTimer <= 0 && small < mission.cap) {
    spawnTimer = mission.interval;
    // Mission 1 limita o total de inimigos que ainda podem nascer
    spawnEnemy(pickEnemyType());
  }
}

// ───────────────────────── Fluxo ─────────────────────────
function clearWorld() {
  [...enemies].forEach(e => scene.remove(e.mesh));
  enemies = []; platoons = [];
  projectiles.forEach(p => scene.remove(p.m)); projectiles = [];
  tracers.forEach(t => scene.remove(t.line)); tracers = [];
  particles.forEach(p => scene.remove(p.m)); particles = [];
  crates.forEach(c => scene.remove(c.g)); crates = [];
  beacons.forEach(b => scene.remove(b.g)); beacons = [];
  pods.forEach(p => scene.remove(p.g)); pods = [];
  strikes.forEach(s => { scene.remove(s.center); scene.remove(s.dot); s.outer.forEach(m => scene.remove(m)); }); strikes = [];
  flashes.forEach(f => scene.remove(f.m)); flashes = [];
  drops.forEach(d => scene.remove(d.m)); drops = [];
  turrets.forEach(T => scene.remove(T.g)); turrets = [];
  if (generator) { scene.remove(generator.g); const i = rocks.findIndex(k => k.x === generator.x && k.z === generator.z); if (i >= 0) rocks.splice(i, 1); GRID.dirty = true; generator = null; }
  if (pad) { scene.remove(pad.g); pad = null; }
  if (zoneRing) { scene.remove(zoneRing); zoneRing = null; }
  if (plane) { scene.remove(plane.g); plane = null; }
  $('objDone').classList.remove('on');
  waypoint = null; waypointHide = 0; lootRun = null; enemyById.clear(); projById.clear();
  Object.values(others).forEach(o => { o.group.visible = false; });
  $('loot').classList.remove('on'); $('mods').innerHTML = ''; $('party').innerHTML = '';
  playerGroup.visible = true; $('fade').style.opacity = 0;
}

let campaignCell = null, campaignRemote = false, curBiome = 'desert', startBase = null, campSector = null;
const lateSent = new Set();
async function startMission(id, levelArg, opts = {}) {
  if (net.role === 'client') return;
  if ((opts.faction || selFaction) !== 'bots' || opts.mix) { await loadSpider(); if (Math.round(levelArg || 1) >= TITAN_MIN_LEVEL) await loadTitan(); }
  const mi = MISSIONS.findIndex(m => m.id === id);
  if (!opts.cell && !missionUnlocked(mi)) { say('Fase bloqueada: vença a anterior em nível 3 ou mais.', 3); return; }
  ensureAudio();
  const L = Math.min(LEVEL_MAX, Math.max(1, Math.round(levelArg || missionLevel(id))));
  relax = L === 1;                                       // modo relax só no nível 1
  if (opts.cell && !opts.remote && net.role !== 'solo') { say('Saia do esquadrão online para jogar a campanha local.', 3); return; }
  curFaction = opts.faction || selFaction; campaignCell = opts.cell || null; campaignRemote = !!opts.remote; campSector = opts.sector || null;
  clientMixed = false;
  mixFac = opts.mix ? { bugs: opts.mix.i, bots: opts.mix.r } : null; mixAngle = Math.random() * Math.PI * 2;
  if (mixFac) loadBots().catch(() => {});
  const np = Math.max(1, net.role === 'host' ? net.roster.length : 1); campParty = np;
  party = { hp: 1 + 0.45 * (np - 1), count: 1 + 0.5 * (np - 1), dmg: 1 + 0.08 * (np - 1) };
  clearWorld();
  const def = MISSIONS.find(m => m.id === id);
  curBiome = opts.biome || (def ? def.biome : 'desert');
  applyBiome(curBiome);
  opLayout = null;
  if (id === 'operation') {
    opLayout = planOperation();
    const L = opLayout;
    buildTerrain(L.R, 130, [{ x: L.S.x, z: L.S.z, r: 10 }, { x: L.G.x, z: L.G.z, r: 12 }, { x: L.E.x, z: L.E.z, r: 22 }]);
  } else buildTerrain(opts.R || 95, opts.rocks || 45, [{ x: 0, z: 0, r: 10 }]);
  const rockData = rocks.map(k => [r1(k.x), r1(k.z), r1(k.r), r1(k.y)]);
  kills = 0; killsBy = {}; respawnTimers = {};
  elapsed = 0;
  spawnTimer = 1;
  shake = 0;
  const E = effective(def, L);
  curMix = E.mix;
  mods = { hp: E.hp, count: E.count, speed: E.speed, edmg: E.dmg, elite: E.elite };
  xp = 0; level = 1; xpNeed = 60; pendingLoot = 0; buffs = { dmg: 0, shield: 0 };
  stats = { shots: 0, hits: 0, supplies: 0, orbitals: 0, deaths: 0 };
  resetLocalPlayer();
  const base = opLayout ? opLayout.S.clone() : new THREE.Vector3(0, 0, 0);
  const roster = net.role === 'host' && net.roster.length ? net.roster : [{ id: net.id, name: myName() }];
  const spawn = {};
  roster.forEach((p, i) => {
    const pos = spawnRing(base, i), yaw = opLayout ? Math.atan2(-(opLayout.G.x - base.x), -(opLayout.G.z - base.z)) : 0;
    spawn[p.id] = [r1(pos.x), r1(pos.z), r2(yaw)];
    if (p.id === net.id) { player.pos.copy(pos); player.yaw = yaw; }
    else { const o = ensureOther(p.id); o.status = 'alive'; o.pos.copy(pos); o.tp.copy(pos); o.seen = 0; o.last = null; o.bd = false; o.st = {}; o.group.visible = true; }
  });
  checkpoint.copy(base);
  mission = buildMission(id);
  mission.par = def ? def.par : 4;
  mission.level = L;
  mission.livesLeft = mission.lives || 0;
  afterMissionBuilt(id);
  startBase = { k: 'start', id, faction: curFaction, cell: campaignCell, remote: campaignRemote, sector: campSector, title: mission.title, relax, level: L, biome: curBiome, R: ARENA_R, rocks: rockData, par: mission.par };
  lateSent.clear(); roster.forEach(p => lateSent.add(p.id));
  if (net.role === 'host') net.all({ ...startBase, spawn, lives: mission.lives || 0, mods: [mods.hp, mods.count, mods.speed, mods.edmg, mods.elite] });
  state = 'playing'; uiOpen = false;
  say(id === 'operation' ? 'Siga até o gerador. Cuidado com os pelotões.' : 'Boa sorte, soldado.', 3);
  captureInput();
}
function resetLocalPlayer() {
  $('kills').textContent = 'Abates: 0';
  player.ammo = WEAPONS.map(w => ({ mag: w.mag, reserve: Math.min(reserveCap(w), Math.round(w.reserve0 + w.reserveMax * 0.05 * lvl('ammo'))) }));
  Object.assign(player, {
    hp: maxHp(), weapon: 0, mag: player.ammo[0].mag, reserve: player.ammo[0].reserve, reloading: 0, fireCd: 0,
    rolling: 0, rollCd: 0, lastHit: 0, supplyCd: 0, strikeCd: 0, clickT: 0, invuln: 0, yaw: 0, pitch: 0.15, boarded: false,
  });
  player.hitT = 0; player.moving = false; resetAnimation(); playerGroup.visible = true;
}
function afterMissionBuilt(id) {
  setNameTag(playerGroup, myName());
  mission.title = FT(mission.title);
  $('oTitle').textContent = `${mission.title} · NV ${mission.level}`;
  $('boss').style.display = id === 'queen' ? 'block' : 'none';
  $('bossName').textContent = FT('Rainha da colmeia').toUpperCase();
  $('hud').classList.add('on');
  $('sectorLine').style.display = campSector ? '' : 'none';
  if (campSector) $('sectorLine').innerHTML = `SETOR ${campSector.name} · liberação <b>${WL.pct2(campSector.h)}</b> de ${WL.pct2(WL.HUMAN_MIN)} · vitória <b>+${WL.pct2(campSector.gain)}</b>`;
  $('menu').classList.add('hidden'); $('results').classList.remove('on');
  $('resume').style.display = 'none'; $('abort').style.display = 'none';
}

function endMission(win) {
  if (net.role === 'client') return;                       // só o host (ou o solo) decide o fim
  if (!['playing', 'dying', 'downed', 'cinematic', 'loot'].includes(state)) return;
  const R = buildResults(win);
  if (net.role === 'host') {
    for (const p of net.roster) if (p.id !== net.id) net.to(p.id, { k: 'end', ...R, credits: creditFor(p.id, win, R.total), kills: killsBy[p.id] || 0 });
  }
  finishMission(win);
  presentResults({ ...R, credits: creditFor(net.id, win, R.total), kills: net.role === 'solo' ? kills : (killsBy[net.id] || 0) });
  beep(win ? 660 : 180, 0.6, 0.12);
}
function finishMission() {
  state = 'ended'; uiOpen = false;
  document.exitPointerLock();
  $('hud').classList.remove('on'); $('loot').classList.remove('on'); $('clickGo').classList.remove('on');
  playerGroup.visible = true; $('fade').style.opacity = 0;
  Object.values(others).forEach(o => { o.group.visible = false; });
}
function abortMission() {
  if (state === 'ended' || state === 'menu') return;
  if (campaignCell && campaignRemote && net.role !== 'client') net.campEnd(false, true);
  campaignCell = null; campaignRemote = false;
  if (net.role === 'host') net.all({ k: 'abort' });
  if (net.role === 'client') { net.leave(); }
  finishMission();
  clearWorld();
  $('menu').classList.remove('hidden');
  $('resume').style.display = 'none'; $('abort').style.display = 'none';
  $('sub').textContent = 'Operação abandonada. Nenhuma recompensa.';
  renderAll();
}

// ───────────────────────── Mapa-múndi: campanha local e mundo online ─────────────────────────
// Cada quadrado de terra do continente é uma operação; três forças (humanos H, insetos I, robôs R) têm uma porcentagem de domínio em cada um.
// • NOVO JOGO = campanha local: você contra o resto do mapa, sem conta, salva neste aparelho (WLOC).
// • MODO ONLINE = mundo compartilhado por todos os jogadores, mantido no servidor e mostrado ao vivo (WNET). Precisa de login.
const AUTH = { enabled: false, user: null };
const GEO = { n: 24, cells: [], idx: null, img: null };
const mkWorld = (id, remote) => ({ id, remote, sec: new Map(), init: { i: 1, r: 1 }, season: 1, turn: 0, log: [], timeOffset: 0, sel: null, pending: null, squads: [] });
const WLOC = mkWorld('camp', false), WNET = mkWorld('onl', true), WMAP = mkWorld('map', true);
WMAP.viewOnly = true; WMAP.sec = WNET.sec;                     // MAPA mostra o mundo online sem poder atacar (e sem exigir login)
const OWN = { H: { name: 'Jogadores', color: '#35b6ff' }, I: { name: 'Insetos', color: '#c050ff', fac: 'bugs' }, R: { name: 'Robôs', color: '#ff3b2e', fac: 'bots' } };
const ckey = o => WL.key(o.c, o.r), cellName = o => WL.cellName(o.c, o.r);
const worldReady = W => !!GEO.idx && W.sec.size > 0;
const attackable = (W, o) => WL.attackable(GEO.idx, W.sec, ckey(o));
const campMinLevel = (W, f) => WL.minLevel(W.sec, W.init, f, LEVEL_MAX);
const sectorMin = (W, o) => WL.minLevelSector(W.sec, W.init, W.sec.get(ckey(o)), LEVEL_MAX);
const enemyOfCell = (W, o) => WL.enemyOf(W.sec.get(ckey(o)));
const worldNow = W => Date.now() + (W.timeOffset || 0);
function cellMission(W, o) { return MISSIONS.find(m => m.id === WL.missionOf(o.c, o.r, W.season, worldNow(W))) || MISSIONS[0]; }
const fmtMin = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function FT2(str, fac) { const keep = curFaction; curFaction = fac; const r = FT(str); curFaction = keep; return r; }
async function loadWorld() {
  if (!GEO.idx) {
    try {
      const j = await (await fetch('./assets/world.json')).json();
      GEO.n = j.n; GEO.cells = j.cells; GEO.idx = WL.makeIndex(j.cells);
      GEO.img = new Image(); GEO.img.src = './assets/worldmap.jpg'; GEO.img.onload = () => { drawCampaign(WLOC); drawCampaign(WNET); };
    } catch { return; }                                            // sem o mapa: só a partida livre
  }
  ensureLocalCampaign();
  renderCampaign(WLOC); renderOnline();
}
function ensureLocalCampaign() {
  const C = save.campaign;
  if (C && C.sec && Object.keys(C.sec).length === GEO.cells.length) {
    Object.assign(WLOC, { sec: WL.unpackSectors(C.sec), init: C.init, turn: C.turn, log: C.log || [], season: C.season || 1 }); return;
  }
  const sec = WL.seedSectors(GEO.idx);
  Object.assign(WLOC, { sec, init: WL.initTotals(sec), turn: 0, season: 1, log: [{ t: 0, m: 'Cabeça de ponte estabelecida. Insetos e robôs disputam o continente.' }] });
  saveLocalCampaign();
}
function saveLocalCampaign() { save.campaign = { sec: WL.packSectors(WLOC.sec), init: WLOC.init, turn: WLOC.turn, log: WLOC.log, season: WLOC.season }; persist(); }
function applyServerWorld(d, full) {                              // mundo compartilhado: tudo vem do servidor
  if (full) WNET.sec = WL.unpackSectors(d.sectors);
  else for (const [k, v] of Object.entries(d.sectors || {})) WNET.sec.set(k, { h: v[0], i: v[1], r: v[2] });
  Object.assign(WNET, { init: d.init || WNET.init, season: d.season, turn: d.turn, log: d.log || [] });
  if (d.now) WNET.timeOffset = d.now - Date.now();
  WMAP.sec = WNET.sec; Object.assign(WMAP, { init: WNET.init, season: WNET.season, turn: WNET.turn, log: WNET.log, timeOffset: WNET.timeOffset });
  if (onlineTabIsMap()) renderCampaign(WNET); else drawCampaign(WNET);
  if ($('pane-map') && $('pane-map').classList.contains('on')) renderCampaign(WMAP);
}
// local: resultado da operação + um passo da guerra
function campaignResult(k, win, level, party) {
  const W = WLOC, o = GEO.idx.byKey.get(k), s = W.sec.get(k); if (!o || !s) return;
  const name = cellName(o), before = WL.dominant(s), ev = [];
  const mid = (mission && mission.id) || 'operation';
  if (win) { const d = WL.applyWin(s, mid, level); ev.push(WL.isHuman(s) && before !== 'H' ? `Setor ${name} libertado dos ${OWN[before].name.toLowerCase()}! (+${WL.pct2(d)})` : `Os jogadores avançaram ${WL.pct2(d)} em ${name}.`); }
  else { const d = WL.applyLoss(s, mid, level); ev.push(`A operação em ${name} falhou. O inimigo recuperou ${WL.pct2(-d)} do setor.`); }
  W.turn++;
  ev.push(...WL.warTick(GEO.idx, W.sec, WL.hash2(W.season, W.turn)).events);
  if (win && WL.campaignWon(W.sec)) ev.push('O continente é dos jogadores. Campanha vencida!');
  for (const m of ev) W.log.unshift({ t: W.turn, m });
  W.log.length = Math.min(W.log.length, 14);
  saveLocalCampaign();
}
let campParty = 1;
// ───────── mapa com zoom: roda do mouse / pinça / botões; arrastar move; toque seleciona ─────────
const MAPU = 1000;                                              // o mapa tem 1000 unidades de lado; a escala em tela vem de view.k
const KMAX = 8;
function mapMetrics(W, cv) {
  const r = cv.getBoundingClientRect(), v = W.view || (W.view = { k: 1, x: 0, y: 0, fit: true });
  const base = Math.min(r.width, r.height) / MAPU, s = base * v.k, mw = MAPU * s;
  if (v.fit) { v.x = (r.width - MAPU * base) / 2; v.y = (r.height - MAPU * base) / 2; v.fit = false; }
  v.x = mw <= r.width ? (r.width - mw) / 2 : Math.min(0, Math.max(r.width - mw, v.x));      // não deixa o mapa sair da tela
  v.y = mw <= r.height ? (r.height - mw) / 2 : Math.min(0, Math.max(r.height - mw, v.y));
  return { r, v, base, s };
}
function zoomAt(W, cv, px, py, factor) {
  const { v, base } = mapMetrics(W, cv), k2 = Math.min(KMAX, Math.max(1, v.k * factor));
  const wx = (px - v.x) / (base * v.k), wy = (py - v.y) / (base * v.k);        // ponto do mundo sob o cursor continua sob o cursor
  v.k = k2; v.x = px - wx * base * k2; v.y = py - wy * base * k2;
  drawCampaign(W);
}
function drawCampaign(W) {
  const cv = $(W.id + 'Cv'); if (!cv || !worldReady(W)) return;
  const { r, v, s } = mapMetrics(W, cv), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const ctx = cv.getContext('2d'), cs = MAPU / GEO.n, px = n => n / s;           // px(n) = n pixels de tela, em unidades do mapa
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * v.x, dpr * v.y);
  if (GEO.img && GEO.img.complete) ctx.drawImage(GEO.img, 0, 0, MAPU, MAPU);
  const canAttack = net.role !== 'client', big = cs * s >= 58, huge = cs * s >= 96;
  for (const o of GEO.cells) {
    const sc = W.sec.get(ckey(o)), f = WL.dominant(sc), x = o.c * cs, y = o.r * cs, top = Math.max(sc.h, sc.i, sc.r) / 100;
    if (x * s + v.x > r.width || y * s + v.y > r.height || (x + cs) * s + v.x < 0 || (y + cs) * s + v.y < 0) continue;      // fora da tela
    ctx.fillStyle = OWN[f].color + Math.round(34 + top * 0.5).toString(16).padStart(2, '0'); ctx.fillRect(x, y, cs, cs);
    ctx.strokeStyle = OWN[f].color + '88'; ctx.lineWidth = px(1); ctx.strokeRect(x, y, cs, cs);
    if (sc.h < WL.SCALE && (sc.h > 0 || sc.i < WL.SCALE && sc.r < WL.SCALE)) {      // barra de domínio do quadrado (humanos | insetos | robôs)
      let bx = x + px(2); const bw = cs - px(4), bh = px(huge ? 7 : 4), by = y + cs - bh - px(2);
      for (const [val, c] of [[sc.h, OWN.H.color], [sc.i, OWN.I.color], [sc.r, OWN.R.color]]) { if (!val) continue; ctx.fillStyle = c; ctx.fillRect(bx, by, bw * val / WL.SCALE, bh); bx += bw * val / WL.SCALE; }
    }
    if (canAttack && attackable(W, o)) { ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = px(2); ctx.strokeRect(x + px(3), y + px(3), cs - px(6), cs - px(6)); }
    const label = (txt, ox, oy, size, align = 'center') => {
      ctx.font = `bold ${px(size)}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.lineWidth = px(3); ctx.strokeStyle = '#000c'; ctx.strokeText(txt, x + ox, y + oy); ctx.fillStyle = '#fff'; ctx.fillText(txt, x + ox, y + oy);
    };
    if (sc.h > 0 && sc.h < WL.HUMAN_MIN) label(`${(sc.h / 100).toFixed(sc.h < 1000 || big ? (big ? 2 : 1) : 0)}%`, cs / 2, cs / 2 - px(3), huge ? 17 : big ? 13 : 11);   // % de liberação escrita na célula
    else if (big && !WL.isHuman(sc)) label('0%', cs / 2, cs / 2 - px(3), 12);
    if (big) label(cellName(o), px(5), px(10), 10, 'left');
  }
  if (W.sel) { const x = W.sel.c * cs, y = W.sel.r * cs; ctx.strokeStyle = '#fff'; ctx.lineWidth = px(3); ctx.strokeRect(x + px(1), y + px(1), cs - px(2), cs - px(2)); }
}
function bindMapInput(W) {
  const cv = $(W.id + 'Cv'); if (!cv) return;
  const ptrs = new Map(); let drag = null, pinch = 0, moved = false;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.onwheel = e => { e.preventDefault(); const [x, y] = local(e); zoomAt(W, cv, x, y, e.deltaY < 0 ? 1.2 : 1 / 1.2); };
  cv.onpointerdown = e => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); moved = false;
    if (ptrs.size === 1) { const { v } = mapMetrics(W, cv); drag = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  };
  cv.onpointermove = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 2) {                                         // pinça: zoom no ponto médio
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && d > 0) zoomAt(W, cv, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d; moved = true; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; const { v } = mapMetrics(W, cv); v.x = drag.vx + dx; v.y = drag.vy + dy; drawCampaign(W);
    }
  };
  const end = e => {
    const was = ptrs.size; ptrs.delete(e.pointerId);
    if (ptrs.size === 0 && was === 1 && !moved && e.type === 'pointerup') {          // toque curto: seleciona o setor
      const [x, y] = local(e), { v, base } = mapMetrics(W, cv), k = base * v.k;
      W.sel = GEO.idx.byKey.get(WL.key(Math.floor(((x - v.x) / k) / (MAPU / GEO.n)), Math.floor(((y - v.y) / k) / (MAPU / GEO.n)))) || null;
      W.squads = []; renderCampCell(W); drawCampaign(W); requestSquads(W);
    }
    if (ptrs.size < 2) pinch = 0;
    if (ptrs.size === 1) { const [id] = [...ptrs.keys()], { v } = mapMetrics(W, cv); const p = ptrs.get(id); drag = { x: p[0] + cv.getBoundingClientRect().left, y: p[1] + cv.getBoundingClientRect().top, vx: v.x, vy: v.y }; }
    if (ptrs.size === 0) drag = null;
  };
  cv.onpointerup = end; cv.onpointercancel = end;
  const zb = (id, f) => { const b = $(W.id + id); if (b) b.onclick = () => { const r = cv.getBoundingClientRect(); if (f) zoomAt(W, cv, r.width / 2, r.height / 2, f); else { W.view = { k: 1, x: 0, y: 0, fit: true }; drawCampaign(W); } }; };
  zb('ZIn', 1.5); zb('ZOut', 1 / 1.5); zb('ZReset', 0);
  if (!cv._ro && window.ResizeObserver) { cv._ro = new ResizeObserver(() => drawCampaign(W)); cv._ro.observe(cv); }
}
function renderCampaign(W) {
  const host = W === WMAP ? $('pane-map') : W.remote ? $('onlMap') : $('pane-camp'); if (!host) return;
  const head = W === WMAP ? subNav('map') : W.remote ? '' : subNav('camp');
  if (!worldReady(W)) {
    host.innerHTML = `${head}<h2 class="sec">${W.remote ? 'Mundo online' : 'Campanha'}</h2><p style="color:var(--dim)">${!AUTH.enabled && W.remote ? 'O mapa online só existe no servidor com contas (modo local não tem mundo compartilhado).' : W.remote && !net.connected && W !== WMAP ? 'Conectando ao mundo compartilhado…' : 'Carregando o mapa…'}</p>`;
    if (W === WMAP || !W.remote) bindSubNav(host); return;
  }
  const count = f => { let n = 0; for (const sc of W.sec.values()) if (WL.dominant(sc) === f) n++; return n; };
  const title = W === WMAP ? 'Mundo online (só leitura)' : W.remote ? 'Mundo compartilhado' : 'Campanha local';
  const status = W.remote ? (net.connected || W === WMAP ? (W === WMAP ? '' : ' · ao vivo') : ' · reconectando…') : '';
  host.innerHTML = `${head}
    <div class="camp">
      <div class="camp-map">
        <canvas id="${W.id}Cv"></canvas>
        <div class="zoombtns"><button id="${W.id}ZIn" title="Aproximar">+</button><button id="${W.id}ZOut" title="Afastar">−</button><button id="${W.id}ZReset" title="Ver o mapa todo">⌂</button></div>
        <div class="map-hint">roda do mouse ou pinça: zoom · arraste: mover · toque: escolher setor</div>
      </div>
      <div class="camp-side">
        <div class="camp-box compact"><div class="stat-line"><b>${title}</b><small>T${W.season}·${W.turn}${status}</small></div>
          <div class="fac-count"><span style="color:${OWN.H.color}">● Jogadores <b>${count('H')}</b></span><span style="color:${OWN.I.color}">● Insetos <b>${count('I')}</b></span><span style="color:${OWN.R.color}">● Robôs <b>${count('R')}</b></span></div>
          <small>Setor liberado com 50%+ · nível mínimo: insetos ${campMinLevel(W, 'I')}+ · robôs ${campMinLevel(W, 'R')}+</small></div>
        <div class="camp-box compact" id="${W.id}Cell"></div>
        <details class="camp-box compact camp-news"><summary>Notícias</summary><div class="camp-log">${W.log.map(l => `<div>${W.remote ? '' : `<i>T${l.t}</i> `}${l.m}</div>`).join('')}</div>
          ${W.remote || W === WMAP ? '' : '<button class="btn ghost" id="campReset" style="margin-top:8px;padding:5px 12px;font-size:11px">Reiniciar campanha</button>'}</details>
      </div>
    </div>`;
  if (W === WMAP || !W.remote) bindSubNav(host);
  bindMapInput(W);
  if ($('campReset')) $('campReset').onclick = () => { if (confirm('Reiniciar a campanha local? O mapa volta ao começo (créditos e melhorias ficam).')) { save.campaign = null; WLOC.sel = null; ensureLocalCampaign(); renderCampaign(WLOC); } };
  renderCampCell(W); drawCampaign(W); requestSquads(W);
}
function requestSquads(W) { if (W.remote && !W.viewOnly && W.sel && net.connected && !WL.isHuman(W.sec.get(ckey(W.sel)))) net.send({ t: 'sq:list', key: ckey(W.sel) }); }
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderSquadList(W) {
  const el = $(W.id + 'Squads'); if (!el) return;
  if (!W.squads.length) { el.innerHTML = '<small style="color:var(--dim)">Nenhum esquadrão aberto aqui agora.</small>'; return; }
  el.innerHTML = W.squads.map(q => `<div class="sq-row"><span><b>${esc(q.host)}</b> · nv ${q.level} · ${fmtTime(q.secs)}${q.friends ? ' · amigos' : ''}</span>
    <i>${q.members}/${q.max}</i><button class="btn" data-sq="${q.id}" ${net.role === 'solo' || net.role === 'client' ? '' : 'disabled'} style="padding:5px 12px;font-size:11px">Entrar</button></div>`).join('');
  el.querySelectorAll('[data-sq]').forEach(b => { b.onclick = () => { b.disabled = true; net.send({ t: 'sq:join', room: +b.dataset.sq, ver: net.version }); }; });
}
function libHtml(sc, gain) {                              // liberação do setor: número grande, barra até 50% e quanto falta
  const need = WL.HUMAN_MIN, pct = Math.min(100, sc.h / need * 100), add = gain ? Math.min(100 - pct, gain / need * 100) : 0;
  const falta = Math.max(0, need - sc.h);
  return `<div class="lib"><div class="lib-top"><b>${WL.pct2(sc.h)}</b><span>liberado · meta ${WL.pct2(need)}</span></div>
    <div class="libbar"><i style="width:${pct}%"></i>${add ? `<em style="left:${pct}%;width:${add}%"></em>` : ''}<u></u></div>
    <small>${falta <= 0 ? 'Setor liberado.' : `Faltam ${WL.pct2(falta)}${gain ? ` · esta missão: <b>+${WL.pct2(gain)}</b> (~${Math.ceil(falta / gain)} vitória${Math.ceil(falta / gain) > 1 ? 's' : ''})` : ''}`}</small></div>`;
}
function renderCampCell(W) {
  const box = $(W.id + 'Cell'); if (!box) return;
  const o = W.sel;
  if (!o) { box.innerHTML = '<small style="color:var(--dim)">Escolha um quadrado no mapa. Contorno amarelo = pode atacar.</small>'; return; }
  const sc = W.sec.get(ckey(o)), f = WL.dominant(sc), isClient = net.role === 'client';
  const stack = `<div class="stackbar" title="Humanos ${WL.pct2(sc.h)} · Insetos ${WL.pct2(sc.i)} · Robôs ${WL.pct2(sc.r)}"><i style="width:${sc.h / 100}%;background:${OWN.H.color}"></i><i style="width:${sc.i / 100}%;background:${OWN.I.color}"></i><i style="width:${sc.r / 100}%;background:${OWN.R.color}"></i></div>
    <div class="stack-leg"><span style="color:${OWN.H.color}">${WL.pct2(sc.h)}</span><span style="color:${OWN.I.color}">${WL.pct2(sc.i)}</span><span style="color:${OWN.R.color}">${WL.pct2(sc.r)}</span></div>`;
  const head = `<div class="stat-line"><b>Setor ${cellName(o)}</b><small style="color:${OWN[f].color}">${OWN[f].name} · ${BIOME_NAME[o.b]}</small></div>
    <div id="${W.id}Lib">${libHtml(sc, 0)}</div>${stack}`;
  if (WL.isHuman(sc)) { box.innerHTML = `${head}<small style="color:var(--dim)">Território dos jogadores. Os inimigos podem tentar retomá-lo.</small>`; return; }
  if (W.viewOnly) { box.innerHTML = `${head}<small style="color:var(--dim)">${attackable(W, o) ? 'Pode ser atacado no Modo online.' : 'Fora de alcance por enquanto.'}</small><button class="btn" id="mapGoOnline" style="margin-top:6px;padding:6px 14px;font-size:11px">Ir para o Modo online</button>`; $('mapGoOnline').onclick = () => { if (!AUTH.user && AUTH.enabled) showAuth('', 'online'); else showTab('online'); }; return; }
  const squadsBox = W.remote ? `<div class="mini-h">Esquadrões aqui</div><div id="${W.id}Squads"></div>` : '';
  if (!attackable(W, o)) { box.innerHTML = `${head}<small style="color:var(--dim)">Fora de alcance. Domine um setor vizinho antes.</small>${squadsBox}`; renderSquadList(W); return; }
  const ef = enemyOfCell(W, o), fac = OWN[ef].fac, m = cellMission(W, o), min = sectorMin(W, o), L = Math.min(LEVEL_MAX, Math.max(min, save.campLevel || min)), mix = WL.mixOf(sc);
  const offline = W.remote && (!net.connected || !AUTH.user), blockedLocal = !W.remote && net.role !== 'solo';
  box.innerHTML = `${head}${mix ? '<div class="frontier">⚔ Fronteira: insetos e robôs lutam entre si</div>' : ''}
    <div class="mission-line" title="${esc(FT2(m.desc, fac))}"><b>${FT2(m.title, fac)}</b> <small id="${W.id}Rot">· muda em ${fmtMin(WL.nextRotation(worldNow(W)) - worldNow(W))}</small></div>
    <div class="lvl-row"><span>Nível <b id="${W.id}Lv">${L}</b> <small id="${W.id}Tag">${levelTag(L)} · mín. ${min}</small></span>
      <div class="lvl-ctl"><button class="btn" id="${W.id}Dn" ${isClient ? 'disabled' : ''}>−</button><input type="range" id="${W.id}Range" min="${min}" max="${LEVEL_MAX}" value="${L}" ${isClient ? 'disabled' : ''}><button class="btn" id="${W.id}Up" ${isClient ? 'disabled' : ''}>+</button></div></div>
    ${W.remote ? `<div class="pol-row"><small>Esquadrão</small><select id="${W.id}Policy" class="field"><option value="open">Aberto</option><option value="friends">Só amigos</option><option value="closed">Fechado</option></select></div>` : ''}
    <button class="btn primary" id="${W.id}Go" style="width:100%" ${!isClient && !missionBusy() && !offline && !blockedLocal ? '' : 'disabled'}>${isClient ? 'Aguardando o host' : offline ? (AUTH.user ? 'Reconectando…' : 'Entre para jogar online') : blockedLocal ? 'Saia da sala online primeiro' : 'Atacar este setor'}</button>
    <div id="${W.id}Msg" class="onlinemsg"></div>${squadsBox}`;
  const rng = $(W.id + 'Range');
  const prog = v => { const g = WL.missionGain(m.id, v); $(W.id + 'Lib').innerHTML = libHtml(sc, g); };
  const set = v => { v = Math.min(LEVEL_MAX, Math.max(min, v)); save.campLevel = v; persist(); rng.value = v; $(W.id + 'Lv').textContent = v; $(W.id + 'Tag').textContent = `${levelTag(v)} · mín. ${min}`; prog(v); };
  prog(L);
  rng.oninput = e => set(+e.target.value); $(W.id + 'Dn').onclick = () => set(+rng.value - 1); $(W.id + 'Up').onclick = () => set(+rng.value + 1);
  if ($(W.id + 'Policy')) { $(W.id + 'Policy').value = squadPolicy; $(W.id + 'Policy').onchange = e => { squadPolicy = e.target.value; if (net.role === 'host') net.send({ t: 'sq:policy', policy: squadPolicy }); }; }
  const go = $(W.id + 'Go');
  go.onclick = async () => {
    if (fac === 'bots' || mix) { if (!botsReady()) { go.disabled = true; go.textContent = 'Carregando robôs…'; try { await loadBots(); } catch { /* usa o modelo simples */ } } }
    const h = WL.hash2(o.c, o.r), level = +rng.value;
    const opts = { cell: ckey(o), faction: fac, biome: o.b, R: 80 + (h % 40), rocks: 35 + (h >> 4) % 45, mix, remote: W.remote, sector: { name: cellName(o), h: sc.h, gain: WL.missionGain(m.id, level) } };
    if (!W.remote) return startMission(m.id, level, opts);
    const msg = t => { const el = $(W.id + 'Msg'); if (el) el.textContent = t; };
    go.disabled = true;
    if (net.role === 'solo') { try { msg('Criando esquadrão…'); await net.host(myName()); } catch (e) { msg(e.message || 'Falha ao criar o esquadrão.'); go.disabled = false; return; } }
    net.send({ t: 'sq:policy', policy: squadPolicy });
    W.pending = { m, level, opts }; net.campStart(opts.cell, level);       // o servidor confirma e escolhe a missão antes de começar
    setTimeout(() => { if (W.pending) { W.pending = null; renderCampCell(W); } }, 8000);
  };
  if (W.remote) renderSquadList(W);
}
let squadPolicy = 'open';
net.onCamp = msg => {
  const W = WNET;
  if (msg.t === 'campErr') { W.pending = null; renderCampCell(W); const el = $('onlMsg'); if (el) el.textContent = msg.msg; toast(msg.msg, { error: true }); return; }
  if (msg.t === 'campOk' && W.pending) {
    const p = W.pending; W.pending = null; p.opts.faction = msg.faction === 'I' ? 'bugs' : 'bots'; p.opts.mix = msg.mix || null;
    if (p.opts.sector) p.opts.sector.gain = WL.missionGain(msg.mission || p.m.id, msg.level);
    startMission(msg.mission || p.m.id, msg.level, p.opts);                       // quem manda na missão é o servidor
  }
};
net.onWorld = applyServerWorld;
async function fetchPublicWorld() {                    // sem login: lê o mapa público (o servidor limita a taxa)
  if (!AUTH.enabled || net.connected) return;
  try { const r = await fetch('/api/world', { cache: 'no-store' }); if (r.ok) applyServerWorld(await r.json(), true); } catch { /* sem rede */ }
}
setInterval(() => { if ($('pane-map') && $('pane-map').classList.contains('on')) fetchPublicWorld(); }, 15000);
let rotEpoch = -1;
setInterval(() => {                                      // contagem para a próxima troca de missão; ao virar o ciclo, redesenha o painel
  for (const W of [WLOC, WNET]) {
    if (!worldReady(W)) continue;
    const ep = WL.epochOf(worldNow(W));
    if (W === WLOC && rotEpoch !== -1 && ep !== rotEpoch && $('pane-camp') && $('pane-camp').classList.contains('on')) renderCampCell(W);
    if (W === WNET && W.epoch !== undefined && ep !== W.epoch && onlineTabIsMap() && !W.pending) renderCampCell(W);
    if (W === WLOC) rotEpoch = ep; else W.epoch = ep;
    const el = $(W.id + 'Rot'); if (el) el.textContent = `· muda em ${fmtMin(WL.nextRotation(worldNow(W)) - worldNow(W))}`;
  }
}, 1000);
setInterval(() => { if (onlineTabIsMap() && WNET.sel) requestSquads(WNET); }, 5000);

// ───────────── avisos na tela ─────────────
function toast(text, o = {}) {
  let box = $('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast' + (o.error ? ' err' : '');
  const span = document.createElement('span'); span.textContent = text; el.appendChild(span);
  const close = () => { el.remove(); };
  for (const [label, fn] of (o.buttons || [])) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); close(); }; el.appendChild(b); }
  box.appendChild(el); setTimeout(close, o.ms || 7000);
  while (box.children.length > 4) box.firstChild.remove();
}

// ───────────── amigos, bloqueios e convites ─────────────
let FR = { friends: [], incoming: [], outgoing: [], blocked: [] };
net.onSocial = m => {
  switch (m.t) {
    case 'f:lists': FR = { friends: m.friends, incoming: m.incoming, outgoing: m.outgoing, blocked: m.blocked }; renderOnline(); break;
    case 'f:notice':
      if (m.kind === 'request') toast(`${m.from.name} quer ser seu amigo.`, { ms: 15000, buttons: [['Aceitar', () => net.send({ t: 'f:accept', id: m.from.id })], ['Recusar', () => net.send({ t: 'f:decline', id: m.from.id })]] });
      else toast(`${m.from.name} agora é seu amigo!`);
      break;
    case 'chat:msg': case 'chat:err': case 'chat:ok': net.chatEvent(m); break;
    case 'f:ok': toast(m.msg); break;
    case 'f:err': toast(m.msg, { error: true }); { const el = $('onlineMsg'); if (el) el.textContent = m.msg; } break;
    case 'f:pres': net.send({ t: 'f:list' }); if (m.online) toast(`${m.name} ficou online.`, { ms: 3500 }); break;
    case 'sq:list': if (WNET.sel && m.key === ckey(WNET.sel)) { WNET.squads = m.squads; renderSquadList(WNET); } break;
    case 'sq:policy': squadPolicy = m.policy; break;
    case 'sq:invite':
      toast(`${m.from} convidou você para um esquadrão (${m.members}/${m.max}).`, { ms: m.secs * 1000, buttons: [['Entrar', () => { if (net.role !== 'solo') { toast('Saia do seu esquadrão atual antes.', { error: true }); return; } net.send({ t: 'sq:accept', inviteId: m.inviteId, ver: net.version }); }], ['Recusar', () => net.send({ t: 'sq:decline', inviteId: m.inviteId })]] });
      beep(660, 0.12, 0.08); break;
  }
};
// Chat: o servidor apenas repassa a mensagem em memória. Nada é gravado nem registrado lá: o histórico (e a lista de "jogados recentemente")
// fica só neste aparelho, em localStorage, separado por conta.
const chatKey = () => `mp_chat_${AUTH.user ? AUTH.user.id : 0}`, recentKey = () => `mp_recent_${AUTH.user ? AUTH.user.id : 0}`;
const readLocal = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch { return d; } };
const writeLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
let CHAT = { active: null, hist: {}, unread: {}, loadedFor: -1 };
function chatLoad() {
  const uid = AUTH.user ? AUTH.user.id : 0; if (CHAT.loadedFor === uid) return;
  CHAT = { active: null, hist: readLocal(chatKey(), {}), unread: {}, loadedFor: uid }; CHAT.hist.sq = [];
}
const chatSave = () => { const { sq, ...rest } = CHAT.hist; writeLocal(chatKey(), rest); };                // o chat do esquadrão não é gravado
function chatPush(key, mine, text, from) {
  chatLoad(); const arr = CHAT.hist[key] || (CHAT.hist[key] = []);
  arr.push({ m: mine ? 1 : 0, t: text, at: Date.now(), f: from }); if (arr.length > 200) arr.splice(0, arr.length - 200);
  if (key !== 'sq') chatSave();
}
function addRecent(name) {
  if (!AUTH.user || !name || name === AUTH.user.name) return;
  const list = readLocal(recentKey(), []).filter(r => r.name !== name); list.unshift({ name, at: Date.now() });
  writeLocal(recentKey(), list.slice(0, 30));
}
const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
function renderChatMessages() {
  const box = $('chatMsgs'); if (!box || CHAT.active == null) return;
  const arr = CHAT.hist[CHAT.active] || []; box.textContent = '';
  if (!arr.length) { const p = document.createElement('small'); p.textContent = 'Nenhuma mensagem ainda.'; box.appendChild(p); }
  for (const m of arr) {
    const d = document.createElement('div'); d.className = 'cm' + (m.m ? ' mine' : '');
    const w = document.createElement('b'); w.textContent = m.m ? 'Você' : (m.f || ''); const t = document.createElement('span'); t.textContent = m.t;
    const h = document.createElement('i'); h.textContent = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    d.append(w, t, h); box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}
function chatSend() {
  const inp = $('chatIn'); if (!inp || CHAT.active == null) return; const text = inp.value.trim().slice(0, 300); if (!text) return;
  if (CHAT.active === 'sq') { if (net.role === 'solo') return toast('Você não está em um esquadrão.', { error: true }); net.send({ t: 'chat:squad', text }); }
  else net.send({ t: 'chat:dm', to: Number(CHAT.active), text });
  chatPush(CHAT.active, true, text); inp.value = ''; renderChatMessages();
}
net.chatEvent = m => {
  chatLoad();
  if (m.t === 'chat:msg') {
    const key = m.kind === 'squad' ? 'sq' : String(m.from.id);
    chatPush(key, false, m.text, m.from.name);
    const open = CHAT.active === key && onlineTabIsFriends();
    if (open) renderChatMessages();
    else { CHAT.unread[key] = (CHAT.unread[key] || 0) + 1; toast(`${m.from.name}${m.kind === 'squad' ? ' (esquadrão)' : ''}: ${m.text.slice(0, 80)}`, { ms: 5000, buttons: [['Abrir', () => { onlTab = 'friends'; CHAT.active = key; CHAT.unread[key] = 0; showTab('online'); renderOnline(true); }]] }); beep(520, 0.08, 0.06); if (onlineTabIsFriends()) renderOnline(true); }
  } else if (m.t === 'chat:err') toast(m.msg, { error: true });
};
const onlineTabIsFriends = () => !!$('chatPanel') && $('pane-online').classList.contains('on');
function renderFriends(el) {
  chatLoad();
  const row = (f, btns) => `<div class="fr-row"><span class="dot ${f.online ? 'on' : ''}"></span><b>${esc(f.name)}</b><em>${f.online ? (f.squad ? `em operação ${f.squad.sector ? WL.cellName(...f.squad.sector.split(',').map(Number)) : '(sala)'} · ${f.squad.members}/${f.squad.max}` : 'no menu') : 'offline'}</em><span class="fr-btns">${btns}</span></div>`;
  const b = (act, id, label, cls = '') => `<button class="btn ${cls}" data-fa="${act}" data-id="${id}" style="padding:5px 12px;font-size:11px;letter-spacing:1px">${label}</button>`;
  const inRoom = net.role !== 'solo';
  const friendNames = new Set([...FR.friends, ...FR.incoming, ...FR.outgoing, ...FR.blocked].map(f => f.name));
  const recents = readLocal(recentKey(), []).filter(r => !friendNames.has(r.name));
  const unread = id => CHAT.unread[id] ? ` <span class="badge">${CHAT.unread[id]}</span>` : '';
  el.innerHTML = `<div class="friends-grid"><div>
    <div class="camp-box"><h4>Adicionar amigo</h4>
      <div style="display:flex;gap:8px"><input class="field" id="frName" maxlength="20" placeholder="nome de usuário exato" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn primary" id="frAdd">Enviar pedido</button></div>
      <small>O outro jogador precisa aceitar. Você pode bloquear quem incomodar.</small></div>
    ${FR.incoming.length ? `<div class="camp-box" style="margin-top:12px"><h4>Pedidos recebidos</h4>${FR.incoming.map(f => row({ ...f, online: false }, b('f:accept', f.id, 'Aceitar', 'primary') + b('f:decline', f.id, 'Recusar') + b('f:block', f.id, 'Bloquear', 'ghost')).replace('<em>offline</em>', '<em>quer ser seu amigo</em>')).join('')}</div>` : ''}
    <div class="camp-box" style="margin-top:12px"><h4>Amigos (${FR.friends.length})</h4>
      ${FR.friends.length ? FR.friends.slice().sort((a, c) => (c.online - a.online) || a.name.localeCompare(c.name)).map(f => row(f,
        b('chat', f.id, 'Conversar' + unread(f.id), 'primary') +
        (f.online && inRoom && !net.roster.some(p => p.name === f.name) ? b('sq:invite', f.id, 'Convidar') : '') +
        (f.online && f.squad && net.role === 'solo' && !f.squad.locked && f.squad.members < f.squad.max && f.squad.policy !== 'closed' ? b('sq:joinf', f.squad.id, 'Entrar no esquadrão') : '') +
        b('f:remove', f.id, 'Remover') + b('f:block', f.id, 'Bloquear', 'ghost'))).join('') : '<small>Você ainda não tem amigos. Envie um pedido acima.</small>'}</div>
    <div class="camp-box" style="margin-top:12px"><h4>Jogados recentemente</h4>
      ${recents.length ? recents.slice(0, 12).map(r => `<div class="fr-row"><b>${esc(r.name)}</b><em>jogou com você ${ago(r.at)}</em><span class="fr-btns">${b('f:addname', esc(r.name), 'Adicionar') + b('f:blockname', esc(r.name), 'Bloquear', 'ghost')}</span></div>`).join('') : '<small>Quem jogar com você aparece aqui.</small>'}</div>
    ${FR.outgoing.length ? `<div class="camp-box" style="margin-top:12px"><h4>Pedidos enviados</h4>${FR.outgoing.map(f => row({ ...f, online: false }, b('f:cancel', f.id, 'Cancelar')).replace('<em>offline</em>', '<em>aguardando</em>')).join('')}</div>` : ''}
    ${FR.blocked.length ? `<div class="camp-box" style="margin-top:12px"><h4>Bloqueados</h4>${FR.blocked.map(f => row({ ...f, online: false }, b('f:unblock', f.id, 'Desbloquear')).replace('<em>offline</em>', '')).join('')}</div>` : ''}
    </div>
    <div class="camp-box chat" id="chatPanel"><h4>Chat</h4>
      <div class="chat-tabs">${inRoom ? `<button data-chat="sq" class="${CHAT.active === 'sq' ? 'on' : ''}">Esquadrão${unread('sq')}</button>` : ''}${FR.friends.map(f => `<button data-chat="${f.id}" class="${String(CHAT.active) === String(f.id) ? 'on' : ''}">${esc(f.name)}${unread(f.id)}</button>`).join('')}</div>
      ${CHAT.active == null ? '<small>Escolha uma conversa acima.</small>' : `
        <div id="chatMsgs" class="chat-msgs"></div>
        <div style="display:flex;gap:8px;margin-top:8px"><input class="field" id="chatIn" maxlength="300" placeholder="Digite e aperte Enter" autocomplete="off"><button class="btn primary" id="chatSend">Enviar</button></div>
        <button class="btn ghost" id="chatClear" style="margin-top:8px;padding:5px 12px;font-size:11px">Apagar histórico deste aparelho</button>`}
    </div></div>`;
  const add = () => { const n = $('frName').value.trim(); if (n) { net.send({ t: 'f:add', name: n }); $('frName').value = ''; } };
  $('frAdd').onclick = add; $('frName').onkeydown = e => { if (e.key === 'Enter') add(); };
  el.querySelectorAll('[data-fa]').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.fa, id = btn.dataset.id;
      if (act === 'chat') { CHAT.active = String(id); CHAT.unread[id] = 0; renderOnline(true); }
      else if (act === 'sq:joinf') net.send({ t: 'sq:join', room: +id, ver: net.version });
      else if (act === 'f:addname') net.send({ t: 'f:add', name: id });
      else if (act === 'f:blockname') { if (confirm('Bloquear este usuário?')) net.send({ t: 'f:block', name: id }); }
      else if (act === 'f:block') { if (confirm('Bloquear este usuário? Ele não poderá mais enviar pedidos, mensagens nem entrar nos seus esquadrões.')) net.send({ t: act, id: +id }); }
      else if (act === 'f:remove') { if (confirm('Remover este amigo?')) net.send({ t: act, id: +id }); }
      else net.send({ t: act, id: +id });
    };
  });
  el.querySelectorAll('[data-chat]').forEach(btn => { btn.onclick = () => { CHAT.active = btn.dataset.chat; CHAT.unread[CHAT.active] = 0; renderOnline(true); }; });
  if (CHAT.active != null && $('chatIn')) {
    renderChatMessages(); $('chatSend').onclick = chatSend; $('chatIn').onkeydown = e => { if (e.key === 'Enter') chatSend(); };
    $('chatClear').onclick = () => { if (confirm('Apagar o histórico desta conversa neste aparelho?')) { CHAT.hist[CHAT.active] = []; chatSave(); renderChatMessages(); } };
  }
}

// ───────────── login ─────────────
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(j.error || 'Falha de comunicação com o servidor.');
  return j;
}
let authThen = null;
function updateWho() {
  $('who').style.display = AUTH.enabled ? '' : 'none';
  $('whoName').textContent = AUTH.user ? AUTH.user.name : 'visitante';
  $('logout').style.display = AUTH.user ? '' : 'none';
  $('loginBtn').style.display = AUTH.user ? 'none' : '';
}
function showAuth(msg, then) {
  authThen = then || null;
  $('auth').classList.add('on'); $('authMsg').textContent = msg || ''; $('authMsg').classList.toggle('err', !!msg);
}
function startSession(user) {
  AUTH.user = user; $('auth').classList.remove('on'); updateWho();
  setNameTag(playerGroup, myName());
  net.kicked = false; net.connect().catch(() => {});
  renderAll();
  if (authThen) { const t = authThen; authThen = null; showTab(t); }
}
async function bootAuth() {
  try { AUTH.enabled = !!(await (await fetch('/api/config', { cache: 'no-store' })).json()).auth; } catch { AUTH.enabled = false; }
  updateWho();
  loadWorld();
  if (!AUTH.enabled) return;
  try { const r = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) return startSession((await r.json()).user); } catch { /* sem rede */ }
}
function dropSession(msg) {
  net.disconnect(); AUTH.user = null; WNET.sec = new Map(); WNET.sel = null; FR = { friends: [], incoming: [], outgoing: [], blocked: [] };
  if (campaignRemote && (state === 'playing' || state === 'paused')) abortMission();
  clearOthers(); updateWho(); renderAll(); if (msg) toast(msg, { error: true, ms: 9000 });
}
function bindAuthUi() {
  let mode = 'login';
  const setMode = m => {
    mode = m;
    document.querySelectorAll('#auth .atab').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('authConfirmRow').style.display = m === 'register' ? '' : 'none';
    $('authGo').textContent = m === 'register' ? 'Criar conta' : 'Entrar';
    $('authPass').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    $('authMsg').textContent = '';
  };
  document.querySelectorAll('#auth .atab').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
  const go = async e => {
    e.preventDefault();
    const username = $('authUser').value.trim(), password = $('authPass').value, confirm = $('authConfirm').value;
    $('authMsg').classList.remove('err'); $('authMsg').textContent = mode === 'register' ? 'Criando conta…' : 'Entrando…'; $('authGo').disabled = true;
    try {
      const j = await api(mode === 'register' ? '/api/register' : '/api/login', mode === 'register' ? { username, password, confirm } : { username, password });
      $('authPass').value = ''; $('authConfirm').value = ''; startSession(j.user);
    } catch (err) { $('authMsg').textContent = err.message; $('authMsg').classList.add('err'); }
    $('authGo').disabled = false;
  };
  $('authForm').onsubmit = go;
  $('authClose').onclick = () => { $('auth').classList.remove('on'); authThen = null; };
  $('loginBtn').onclick = () => showAuth('', 'online');
  $('logout').onclick = async () => { try { await api('/api/logout', {}); } catch { /* ok */ } dropSession(); showTab('home'); };
  net.onKicked = () => { dropSession('Sua conta foi aberta em outro lugar.'); showAuth('Sua conta foi aberta em outro lugar.'); };
  let chk = 0;
  net.onConn = ok => {                                        // conexão caiu: confere se a sessão ainda vale (pode ter expirado)
    if (!AUTH.user) return;
    if (ok) net.send({ t: 'f:list' });
    if (onlineTabIsMap()) renderCampaign(WNET);
    if (!ok && Date.now() - chk > 10000) { chk = Date.now(); fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' }).then(r => { if (r.status === 401) { dropSession('Sua sessão expirou. Entre de novo.'); showAuth('Sua sessão expirou. Entre de novo.', 'online'); } }).catch(() => {}); }
  };
  setMode('login');
}

// ───────────────────────── Pontuação e créditos finais ─────────────────────────
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function teamStats() {
  const S = { ...stats };
  for (const o of Object.values(others)) { const t = o.stats || [0, 0, 0, 0, 0]; S.shots += t[0]; S.hits += t[1]; S.supplies += t[2]; S.orbitals += t[3]; S.deaths += t[4]; }
  return S;
}
function computeScore(win, S = teamStats()) {
  const mins = elapsed / 60, par = mission.par || 4;
  const rows = [];
  const add = (label, v) => rows.push([label, Math.round(v)]);
  if (win) add('Missão cumprida', 100);
  if (win) add(`Tempo ${fmtTime(elapsed)} (meta ${Math.round(par * 0.75)} min)`, Math.max(0, 120 * (1 - Math.max(0, mins - par * 0.75) / (par * 0.75))));
  add(`Abates (${kills})`, Math.min(80, Math.floor(kills * 0.25)));
  const acc = S.shots ? S.hits / S.shots : 0;
  add(`Precisão (${Math.round(acc * 100)}% de ${S.shots} disparos)`, 60 * acc);
  add(`Nível alcançado (${level})`, (level - 1) * 3);
  if ((mission.level || 1) > 1) add(`Nível de ameaça (${mission.level})`, 4 * (mission.level - 1));
  if (S.deaths) add(`Mortes (${S.deaths})`, -25 * S.deaths);
  if (S.supplies) add(`Suprimentos usados (${S.supplies})`, -6 * S.supplies);
  if (S.orbitals) add(`Orbitais usados (${S.orbitals})`, -10 * S.orbitals);
  const total = Math.max(0, rows.reduce((a, r) => a + r[1], 0));
  return { rows, total };
}
const rankOf = t => t >= 330 ? 'S' : t >= 270 ? 'A' : t >= 210 ? 'B' : t >= 140 ? 'C' : 'D';
function buildResults(win) {
  const { rows, total } = computeScore(win);
  return { win, mid: mission.id, title: `${mission.title} · NV ${mission.level || 1}`, rows, total };
}
const creditFor = (id, win, total) => !win ? 0 : Math.round((total * 1.2 + (net.role === 'solo' ? kills : (killsBy[id] || 0)) * 0.5 + (win ? 40 : 0)) * levelScale(mission.level || 1).reward);
function presentResults(r) {
  save.credits += r.credits;
  if (r.win) { save.cleared = save.cleared || {}; save.cleared[r.mid] = Math.max(save.cleared[r.mid] || 0, (mission && mission.level) || 1); }
  $('resSector').textContent = '';
  if (campaignCell && campSector) $('resSector').innerHTML = r.win ? `Setor ${campSector.name}: liberação ${WL.pct2(campSector.h)} → <b>${WL.pct2(Math.min(WL.SCALE, campSector.h + campSector.gain))}</b> (+${WL.pct2(campSector.gain)})` : `Setor ${campSector.name}: a missão falhou e o inimigo recupera parte da liberação (${WL.pct2(campSector.h)} atual).`;
  if (campaignCell) {
    if (campaignRemote) { if (net.role !== 'client') net.campEnd(r.win); }        // o servidor aplica no mundo compartilhado
    else campaignResult(campaignCell, r.win, (mission && mission.level) || 1, campParty);
    campaignCell = null; campaignRemote = false;
  }
  const prev = save.best[r.mid];
  const record = r.win && (prev == null || r.total > prev);
  if (record) save.best[r.mid] = r.total;
  persist(); renderAll();
  $('results').classList.toggle('win', !!r.win); $('results').classList.toggle('lose', !r.win);
  $('resBadge').textContent = r.win ? 'VITÓRIA' : 'DERROTA';
  $('resKicker').textContent = (r.win ? 'OPERAÇÃO CONCLUÍDA' : 'OPERAÇÃO FALHOU') + ' · ' + r.title.toUpperCase();
  $('resTitle').textContent = r.win ? (r.mid === 'operation' ? 'Extração confirmada' : 'Missão cumprida') : 'Esquadrão perdido';
  $('resRows').innerHTML = r.rows.map((x, i) =>
    `<div class="res-row" style="animation-delay:${0.25 + i * 0.28}s"><span>${x[0]}</span><b class="${x[1] < 0 ? 'neg' : 'pos'}">${x[1] >= 0 ? '+' : ''}${x[1]}</b></div>`).join('');
  const t0 = 0.25 + r.rows.length * 0.28;
  document.querySelectorAll('.res-total').forEach(el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = `rowin .6s ${t0}s forwards`; });
  $('resScore').textContent = r.total;
  $('resRank').textContent = r.win ? rankOf(r.total) : '—';
  $('resCredits').textContent = r.win ? `+${r.credits} créditos para você${r.kills ? ` (${r.kills} abates seus)` : ''}${record ? ' · NOVO RECORDE!' : ''}`
    : 'Sem créditos: o objetivo não foi concluído.';
  $('results').classList.add('on');
}

let selMission = 'operation', activeTab = 'home';
let selFaction = save.faction === 'bots' ? 'bots' : 'bugs';
curFaction = selFaction;
const TABS = [['ops', 'NOVO JOGO'], ['online', 'MODO ONLINE'], ['settings', 'CONFIGURAÇÕES'], ['keys', 'CONTROLES']];
const SUB_OF = { camp: 'ops', map: 'ops', arsenal: 'ops', upg: 'ops' };           // arsenal e melhorias moram dentro de NOVO JOGO
const FACTIONS = {
  bugs: { name: 'INSETOS', kick: 'O ENXAME', desc: 'Rastejadores, cuspidores, brutos, bombardeiros, investidores e a Rainha da colmeia. Veloz, numeroso e barulhento.' },
  bots: { name: 'ROBÔS', kick: 'EXÉRCITO MECHA', desc: 'Soldados-lâmina com espada, atiradores com rifle, pesados, kamikazes, lanceiros e o Comandante Mecha. Metódico e armado.' },
};
function setFaction(f) {
  if (net.role === 'client') return;
  selFaction = curFaction = f; save.faction = f; persist();
  if (f === 'bots') loadBots().catch(() => {});
  renderAll();
}
const BIOME_NAME = { desert: 'Deserto', ice: 'Gelo', toxic: 'Pântano tóxico', volcanic: 'Vulcânico' };
const ENEMY_INFO_BOTS = [
  ['Soldado-lâmina', 'Veloz. Corre até você e golpeia com a espada.'], ['Atirador', 'Mantém distância e dispara rajadas de plasma.'],
  ['Pesado', 'Gigante com espadão. Cada golpe dói.'], ['Kamikaze', 'Corre até você e detona. Atire de longe.'],
  ['Lanceiro', 'Avisa e investe com a espada em linha reta. Desvie com o dash.'], ['Comandante Mecha', 'Chefe: rajadas, golpes e convocação de tropas.'],
];
const ENEMY_INFO = [
  ['Rastejador', 'Veloz e frágil. Ataca em bando, corpo a corpo.'], ['Cuspidor', 'Mantém distância e lança bolas de ácido.'],
  ['Bruto', 'Enorme e resistente. Cada golpe dói.'], ['Bombardeiro', 'Corre até você e explode. Atire de longe.'],
  ['Investidor', 'Avisa e investe em linha reta. Desvie com o dash.'], ['Rainha', 'Chefe da colmeia: rajadas, golpes e invocações.'],
  ['Titã ácido', 'Gigante lento (nível 6+). Pisa em área e cospe um jato de ácido: mantenha distância e saia da linha do jato.'],
];

function levelPreview(m, L) {
  const E = effective(m, L), pct = v => `×${v.toFixed(2)}`;
  return `<div><small>VIDA DOS INIMIGOS</small><b>${pct(E.hp)}</b></div><div><small>ATAQUE</small><b>${pct(E.dmg)}</b></div>
          <div><small>QUANTIDADE</small><b>${pct(E.count)}</b></div><div><small>ELITES</small><b>${Math.round(E.elite * 100)}%</b></div>
          <div><small>RECOMPENSA</small><b>${pct(levelScale(L).reward)}</b></div>`;
}
const levelTag = v => v === 1 ? 'RELAX' : v >= 15 ? 'EXTREMO' : v >= 8 ? 'DIFÍCIL' : 'NORMAL';
const subNav = on => `<div class="subnav">${[['camp', 'CAMPANHA'], ['map', 'MAPA'], ['ops', 'PARTIDA LIVRE'], ['arsenal', 'ARSENAL'], ['upg', 'MELHORIAS']].map(([id, l]) => `<button data-sub="${id}" class="${id === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function bindSubNav(pane) { pane.querySelectorAll('[data-sub]').forEach(b => { b.onclick = () => showTab(b.dataset.sub); }); }
function factionRow() {
  const canPick = net.role !== 'client';
  return `<div class="fac-row">${Object.entries(FACTIONS).map(([id, f]) => `
    <button class="fac-card ${id} ${id === selFaction ? 'on' : ''}" data-fac="${id}" ${canPick ? '' : 'disabled'}>
      <small>${f.kick}</small><b>${f.name}</b><span>${f.desc}</span></button>`).join('')}</div>
    ${canPick ? '' : '<small style="color:var(--dim)">Online, quem escolhe a facção inimiga é o host.</small>'}`;
}
function bindFactionRow(pane) { pane.querySelectorAll('[data-fac]').forEach(b => { b.onclick = () => setFaction(b.dataset.fac); }); }
function renderHome() {
  const hero = [['camp', 'NOVO JOGO', 'Campanha no mapa-múndi ou partida livre'], ['online', 'MODO ONLINE', 'Crie uma sala ou entre com o código do host'],
    ['settings', 'CONFIGURAÇÕES', 'Áudio, mira, gráficos e tipo de controle'], ['keys', 'CONTROLES', 'Teclas, botões de toque e regras de XP']];
  $('pane-home').innerHTML = `<div class="home">
    <div class="home-menu">${hero.map(([id, t, d], i) => `<button class="home-btn" data-go="${id}"><i>${String(i + 1).padStart(2, '0')}</i><b>${t}</b><span>${d}</span></button>`).join('')}</div>
    <div class="home-side"><small>MULTIPUNK</small><h1>Duas facções.<br>Uma operação.</h1>
      <p>Insetos ou robôs, sozinho ou com até 3 amigos. Cada fase tem o seu nível de ameaça e a sua recompensa: <b>créditos só vêm quando o objetivo é concluído</b>.</p>
      <div class="home-facs"><span class="bugs">INSETOS</span><span class="bots">ROBÔS</span></div></div></div>`;
  $('pane-home').querySelectorAll('[data-go]').forEach(b => { b.onclick = () => showTab(b.dataset.go); });
}
function renderSettings() {
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('pane-settings').innerHTML = `<h2 class="sec">Configurações</h2>
    <div class="set-list">
      <div class="set-row"><div><b>Volume geral</b><small>Efeitos sonoros do jogo</small></div><div class="set-ctl"><input type="range" id="setVol" min="0" max="100" value="${Math.round(settings.volume * 100)}"><em id="setVolV">${Math.round(settings.volume * 100)}%</em></div></div>
      <div class="set-row"><div><b>Sensibilidade da mira</b><small>${isTouch ? 'Arrastar o dedo na tela' : 'Movimento do mouse'}</small></div><div class="set-ctl"><input type="range" id="setSens" min="0.4" max="2.5" step="0.05" value="${settings.sens}"><em id="setSensV">${settings.sens.toFixed(2)}×</em></div></div>
      <div class="set-row"><div><b>Qualidade gráfica</b><small>Baixa desliga as sombras (mais fluidez em celulares)</small></div>${seg('quality', [['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']])}</div>
      <div class="set-row"><div><b>Tipo de controle</b><small>Automático detecta celular e tablet. Mudar recarrega a página.</small></div>${seg('input', [['auto', 'Automático'], ['pc', 'Teclado e mouse'], ['touch', 'Toque']])}</div>
      <div class="set-row"><div><b>Tela cheia</b><small>Melhor para jogar</small></div><div class="set-ctl"><button class="btn" id="setFs">Alternar tela cheia</button></div></div>
      <div class="set-row"><div><b>Restaurar padrões</b><small>Não apaga créditos, melhorias nem recordes</small></div><div class="set-ctl"><button class="btn ghost" id="setReset">Restaurar</button></div></div>
    </div>`;
  const vol = $('setVol'), sens = $('setSens');
  vol.oninput = () => { settings.volume = vol.value / 100; $('setVolV').textContent = `${vol.value}%`; if (master) master.gain.value = settings.volume; saveSettings(); };
  vol.onchange = () => { ensureAudio(); beep(660, 0.12, 0.1); };
  sens.oninput = () => { settings.sens = +sens.value; $('setSensV').textContent = `${settings.sens.toFixed(2)}×`; saveSettings(); };
  document.querySelectorAll('#pane-settings .seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    const key = g.dataset.key; settings[key] = b.dataset.v; saveSettings();
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (key === 'quality') applyQuality();
    if (key === 'input') location.reload();
  }));
  $('setFs').onclick = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* sem suporte */ } };
  $('setReset').onclick = () => { Object.assign(settings, { volume: 0.8, sens: 1, quality: coarse ? 'medium' : 'high' }); saveSettings(); applyQuality(); if (master) master.gain.value = settings.volume; renderSettings(); };
}
function renderOps() {
  const m = MISSIONS.find(x => x.id === selMission);
  const best = save.best[m.id];
  const L = missionLevel(m.id), canPick = net.role !== 'client';
  const danger = '■'.repeat(m.danger) + '□'.repeat(5 - m.danger);
  const mIdx = MISSIONS.indexOf(m), locked = !missionUnlocked(mIdx);
  $('pane-ops').innerHTML = `
    ${subNav('ops')}
    <h2 class="sec">Facção inimiga</h2>${factionRow()}
    <h2 class="sec" style="margin-top:22px">Selecionar operação${net.role !== 'solo' ? ` · SALA ${net.code} · ${net.roster.length} jogador(es)` : ''}</h2>
    <div class="ops">
      <div class="op-list">${MISSIONS.map((x, i) => `
        <button class="op-item ${x.id === selMission ? 'on' : ''} ${missionUnlocked(i) ? '' : 'locked'}" data-id="${x.id}">
          <i>${missionUnlocked(i) ? '' : '🔒 '}${String(i + 1).padStart(2, '0')} · ${x.tag} · NV ${missionLevel(x.id)}</i><span>${save.best[x.id] != null ? 'MELHOR ' + save.best[x.id] : ''}</span>
          <b>${FT(x.title)}</b></button>`).join('')}</div>
      <div class="op-detail">
        <div class="op-banner" style="background:${BIOME_CSS[m.biome]}"><div class="tagrow">
          <span class="tag">${BIOME_NAME[m.biome]}</span><span class="tag hot">PERIGO ${danger}</span><span class="tag ok">${m.tag}</span></div></div>
        <div class="op-body">
          <h3>${FT(m.title)}</h3>
          <p>${FT(m.desc)}</p>
          <div class="phases">${m.phases.map((p, i) => `<span>${i + 1}. ${p}</span>`).join('')}</div>
          <div class="lvl">
            <div class="lvl-head"><small>NÍVEL DE AMEAÇA DESTA FASE</small><b id="lvNum">${L}</b><i id="lvTag">${levelTag(L)}</i></div>
            <div class="lvl-ctl">
              <button class="btn" id="lvDn" ${canPick ? '' : 'disabled'}>−</button>
              <input type="range" id="lvRange" min="1" max="${LEVEL_MAX}" value="${L}" ${canPick ? '' : 'disabled'}>
              <button class="btn" id="lvUp" ${canPick ? '' : 'disabled'}>+</button>
            </div>
            <div class="stats-row" id="lvStats">${levelPreview(m, L)}</div>
            ${canPick ? '' : '<small style="color:var(--dim)">Só o host escolhe o nível da operação.</small>'}
          </div>
          <div class="stats-row">
            <div><small>MELHOR PONTUAÇÃO</small><b>${best != null ? best : '—'}</b></div>
            <div><small>RANK</small><b>${best != null ? rankOf(best) : '—'}</b></div>
            <div><small>TEMPO-META</small><b>${Math.round(m.par * 0.75)} min</b></div>
          </div>
          <div class="op-foot"><button class="btn primary" id="deploy" ${net.role === 'client' || missionBusy() || locked ? 'disabled' : ''}>${net.role === 'client' ? 'Aguardando o host' : locked ? 'Fase bloqueada' : 'Iniciar operação'}</button>
            <span style="color:var(--dim);font-size:12px">${locked ? `Vença “${FT(MISSIONS[mIdx - 1].title)}” em nível ${UNLOCK_LEVEL} ou mais para liberar.` : 'Nível 1 é o modo relax. Níveis maiores dão mais pontos e créditos.'}</span></div>
        </div>
      </div>
    </div>`;
  bindSubNav($('pane-ops')); bindFactionRow($('pane-ops'));
  document.querySelectorAll('.op-item').forEach(b => b.onclick = () => { selMission = b.dataset.id; renderOps(); });
  const setLevel = v => {
    v = Math.min(LEVEL_MAX, Math.max(1, v));
    save.levels = save.levels || {}; save.levels[m.id] = v; persist();
    $('lvRange').value = v; $('lvNum').textContent = v; $('lvTag').textContent = levelTag(v);
    $('lvStats').innerHTML = levelPreview(m, v);
    document.querySelectorAll('.op-item.on i').forEach(i => { i.textContent = i.textContent.replace(/NV \d+/, 'NV ' + v); });
  };
  $('lvRange').oninput = e => setLevel(+e.target.value);
  $('lvDn').onclick = () => setLevel(missionLevel(m.id) - 1);
  $('lvUp').onclick = () => setLevel(missionLevel(m.id) + 1);
  $('deploy').onclick = async () => {
    if (selFaction === 'bots' && !botsReady()) { $('deploy').disabled = true; $('deploy').textContent = 'Carregando robôs…'; try { await loadBots(); } catch { /* usa o modelo simples */ } }
    startMission(selMission, missionLevel(selMission));
  };
}
function renderArsenal() {
  const maxOf = k => Math.max(...WEAPONS.map(w => k(w)));
  const bar = (label, v, mx, txt) => `<div class="stat"><span>${label}</span><div class="b"><i style="width:${Math.round(v / mx * 100)}%"></i></div><em>${txt}</em></div>`;
  $('pane-arsenal').innerHTML = `
    ${subNav('arsenal')}
    <h2 class="sec">Armas · troque com 1 / 2 / 3</h2>
    <div class="grid">${WEAPONS.map((w, i) => `
      <div class="card"><small class="k">ARMA ${i + 1}</small><h4>${w.name}</h4>
        <p>${w.id === 'smg' ? FT('Automática. Cadência alta, boa para o enxame.') : w.id === 'shotgun' ? 'Nove projéteis por tiro. Devastadora de perto.' : 'Tiro único e preciso. Ótima contra cuspidores e brutos.'}</p>
        ${bar('Dano', (w.dmg + lvl('dmg')) * w.pellets, maxOf(x => (x.dmg + lvl('dmg')) * x.pellets), (w.dmg + lvl('dmg')) + (w.pellets > 1 ? '×' + w.pellets : ''))}
        ${bar('Cadência', w.rate, maxOf(x => x.rate), w.rate)}
        ${bar('Pente', w.mag, maxOf(x => x.mag), w.mag)}
        ${bar('Alcance', w.range, maxOf(x => x.range), w.range + 'm')}
      </div>`).join('')}</div>
    <h2 class="sec" style="margin-top:28px">Estratagemas</h2>
    <div class="grid">
      <div class="card"><small class="k">E</small><h4>Suprimentos</h4><p>Uma caixa cai onde você mira: recarrega todas as armas e cura 50. Recarga de ${SUPPLY_COOLDOWN}s. Reduz sua pontuação.</p></div>
      <div class="card"><small class="k">Q</small><h4>Ataque orbital</h4><p>Marca o alvo com uma linha vermelha; seis linhas surgem, giram e se fecham no centro antes do impacto. Fere você também. Recarga de ${Math.max(20, STRIKE_COOLDOWN - 2 * lvl('strike'))}s. Reduz sua pontuação.</p></div>
    </div>
    <h2 class="sec" style="margin-top:28px">Inimigos · ${FACTIONS[curFaction].name}</h2>
    <div class="grid">${(curFaction === 'bots' ? ENEMY_INFO_BOTS : ENEMY_INFO).map(e => `<div class="card"><h4>${e[0]}</h4><p style="margin-bottom:0">${e[1]}</p></div>`).join('')}</div>`;
  bindSubNav($('pane-arsenal'));
}
function renderUpgrades() {
  $('pane-upg').innerHTML = `
    ${subNav('upg')}
    <h2 class="sec">Melhorias permanentes · custo ${upgCost(0)} + ${upgCost(1) - upgCost(0)} por nível</h2>
    <div class="grid">${UPGRADES.map(u => {
      const l = lvl(u.id), maxed = l >= UPG_MAX, cost = upgCost(l);
      return `<button class="upg-card" data-id="${u.id}" ${maxed || save.credits < cost ? 'disabled' : ''}>
        <h4>${u.name}</h4><p>${u.desc}</p>
        <div class="pips">${Array.from({ length: UPG_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
        <div class="upg-foot"><span>NÍVEL ${l} / ${UPG_MAX}</span><span>${maxed ? 'MÁXIMO' : `<b>${cost}</b> créditos`}</span></div></button>`;
    }).join('')}</div>`;
  document.querySelectorAll('.upg-card').forEach(b => b.onclick = () => {
    const id = b.dataset.id, l = lvl(id), cost = upgCost(l);
    if (l >= UPG_MAX || save.credits < cost) return;
    save.credits -= cost; save.upg[id] = l + 1; persist(); renderAll();
  });
  bindSubNav($('pane-upg'));
}
function renderKeys() {
  const rows = isTouch ? [
    ['JOYSTICK (esquerda)', 'Mover em qualquer direção — suave anda devagar, até a borda corre rápido'], ['ARRASTAR (direita)', 'Mirar'],
    ['FOGO', 'Atirar — segure e arraste o dedo para mirar atirando'], ['DASH', 'Esquiva'], ['RECAR.', 'Recarregar (também correndo)'],
    ['ARMA', 'Trocar de arma'], ['SUPR.', 'Chamar suprimentos'], ['ORBITAL', 'Ataque orbital'], ['II', 'Pausar'],
  ] : [
    ['W A S D', 'Mover em qualquer direção — a mira não muda'], ['MOUSE', 'Mirar'], ['CLIQUE', 'Atirar'], ['SHIFT', 'Correr rápido'],
    ['C', 'Andar devagar (pelotões te notam menos)'], ['R', 'Recarregar (também correndo)'], ['ESPAÇO', 'Dash / esquiva'],
    ['1 · 2 · 3 / RODA', 'Trocar de arma'], ['E', 'Chamar suprimentos'], ['Q', 'Ataque orbital'], ['ESC', 'Pausar'],
  ];
  $('pane-keys').innerHTML = `<h2 class="sec">Controles</h2><table class="keys">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <h2 class="sec" style="margin-top:28px">Nível e sorteio</h2>
    <table class="keys"><tr><td>XP</td><td>Cada inimigo dá XP; cada nível exige o dobro do anterior.</td></tr>
    <tr><td>SORTEIO</td><td>Ao subir de nível a sorte decide: pode vir ajuda... ou o inimigo ficar mais forte. Ninguém sabe o que vem.</td></tr></table>`;
}
function renderAll() {
  $('credits').textContent = save.credits;
  if (state === 'menu' || state === 'ended') curFaction = selFaction;
  renderHome(); renderCampaign(WLOC); renderOps(); renderOnline(); renderArsenal(); renderUpgrades(); renderSettings(); renderKeys();
}
function showTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === (SUB_OF[id] || id)));
  $('menu').classList.toggle('is-home', id === 'home');
  if (id === 'camp') renderCampaign(WLOC);
  if (id === 'map') { renderCampaign(WMAP); fetchPublicWorld(); }
  if (id === 'online') renderOnline(true);
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + id));
}
function buildMenu() {
  $('tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab" data-tab="${id}">${label}</button>`).join('');
  $('view').innerHTML = ['home', ...TABS.map(t => t[0]), 'camp', 'map', 'arsenal', 'upg'].map(id => `<section class="pane" id="pane-${id}"></section>`).join('');
  $('logoHome').onclick = () => showTab('home');
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab === 'ops' ? 'camp' : b.dataset.tab));
  $('resume').onclick = () => captureInput();
  $('abort').onclick = abortMission;
  $('resBtn').onclick = () => { $('results').classList.remove('on'); $('menu').classList.remove('hidden'); $('sub').textContent = net.role === 'solo' ? 'Pronto para o deploy.' : `Sala ${net.code} · aguardando a próxima operação`; $('resume').style.display = 'none'; $('abort').style.display = 'none'; clearWorld(); renderAll(); };
  $('clickGo').onclick = () => captureInput();
  setNameTag(playerGroup, myName());
  if (isTouch) buildTouchUI();
  if (selFaction === 'bots') loadBots().catch(() => {});
  bindAuthUi(); bootAuth();
  renderAll(); showTab('home');
}

// ───────────────────────── Controles de toque (celular) ─────────────────────────
// Estilo atirador mobile: joystick flutuante à esquerda (move), arrastar à direita (mira), botão FOGO grande (segure e arraste
// para mirar atirando) e botões de dash, recarga, arma, suprimentos e orbital. Vários dedos ao mesmo tempo (pointer events).
const touch = { x: 0, y: 0, mag: 0 };
const TOUCH_LOOK = 0.0052;
let touchResetFn = null;
function buildTouchUI() {
  document.body.classList.add('touch');
  const ui = document.createElement('div'); ui.id = 'touchUI';
  ui.innerHTML = `<div id="stickBase"><i id="stickKnob"></i></div>
    <button class="tb pause" data-act="pause">II</button>
    <button class="tb big" data-act="fire"><b>FOGO</b></button>
    <button class="tb roll" data-act="roll"><b>DASH</b></button>
    <button class="tb reload" data-act="reload"><b>RECAR.</b></button>
    <button class="tb swap" data-act="swap"><b id="tbSwapT">ARMA 1</b></button>
    <button class="tb sm supply" data-act="supply"><b>SUPR.</b></button>
    <button class="tb sm strike" data-act="strike"><b>ORBITAL</b></button>`;
  document.body.appendChild(ui);
  const base = $('stickBase'), knob = $('stickKnob'), R = 64;
  const pts = new Map();                       // pointerId -> { role, el, ox, oy, x, y }
  const live = () => state === 'playing' && !uiOpen;
  let fires = 0, on = false, fsTries = 0;
  const fullscreen = () => {
    if (document.fullscreenElement || fsTries >= 3) return; fsTries++;
    try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); p && p.catch && p.catch(() => {}); } catch { /* ok */ }
    try { const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); q && q.catch && q.catch(() => {}); } catch { /* ok */ }
  };
  const act = a => {
    if (a === 'pause') lockChanged(false);
    else if (a === 'roll') tryRoll();
    else if (a === 'reload') startReload();
    else if (a === 'swap') switchWeapon((player.weapon + 1) % WEAPONS.length);
    else if (a === 'supply') callSupply();
    else if (a === 'strike') callStrike();
  };
  const look = (dx, dy) => {
    if (!live()) return;
    player.yaw -= dx * TOUCH_LOOK * settings.sens;
    player.pitch = Math.max(-0.6, Math.min(0.8, player.pitch - dy * TOUCH_LOOK * settings.sens));
  };
  const stick = (p, e) => {
    let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
    const len = Math.hypot(dx, dy), k = Math.min(1, len / R);
    if (len > R) { dx *= R / len; dy *= R / len; }
    touch.x = dx / R; touch.y = -dy / R; touch.mag = k;
    keys.ShiftLeft = k > 0.92; keys.KeyC = k > 0.12 && k < 0.45;     // borda = correr rápido, suave = andar devagar
    knob.style.transform = `translate(${dx}px, ${dy}px)`; base.classList.toggle('run', keys.ShiftLeft);
  };
  const reset = () => {
    pts.forEach(p => p.el && p.el.classList.remove('down')); pts.clear();
    touch.x = touch.y = touch.mag = 0; keys.ShiftLeft = false; keys.KeyC = false; fires = 0; mouseDown = false;
    knob.style.transform = ''; base.classList.remove('on', 'run'); base.style.left = base.style.top = '';
  };
  touchResetFn = reset;
  ui.addEventListener('pointerdown', e => {
    if (!live()) return;
    e.preventDefault(); fullscreen();
    try { ui.setPointerCapture(e.pointerId); } catch { /* ok */ }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const a = btn.dataset.act;
      btn.classList.add('down');
      if (a === 'fire') { pts.set(e.pointerId, { role: 'look', el: btn, x: e.clientX, y: e.clientY, fire: true }); fires++; mouseDown = true; player.clickT = 0.2; }
      else { pts.set(e.pointerId, { role: 'btn', el: btn }); act(a); }
    } else if (e.clientX < innerWidth * 0.5 && ![...pts.values()].some(p => p.role === 'stick')) {
      const ox = Math.max(R + 12, Math.min(innerWidth * 0.5 - R, e.clientX)), oy = Math.max(R + 12, Math.min(innerHeight - R - 12, e.clientY));
      base.style.left = `${ox - base.offsetWidth / 2}px`; base.style.top = `${oy - base.offsetHeight / 2}px`; base.classList.add('on');
      const p = { role: 'stick', ox, oy }; pts.set(e.pointerId, p); stick(p, e);
    } else pts.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
  });
  ui.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    e.preventDefault();
    if (p.role === 'stick') stick(p, e);
    else if (p.role === 'look') { look(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; }
  });
  const up = e => {
    const p = pts.get(e.pointerId); if (!p) return;
    pts.delete(e.pointerId);
    if (p.el) p.el.classList.remove('down');
    if (p.fire && --fires <= 0) { fires = 0; mouseDown = false; }
    if (p.role === 'stick') { touch.x = touch.y = touch.mag = 0; keys.ShiftLeft = false; keys.KeyC = false; knob.style.transform = ''; base.classList.remove('on', 'run'); base.style.left = base.style.top = ''; }
  };
  ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
  ui.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
  // mostra os controles só quando dá para jogar; some (e solta tudo) em menu, pausa, sorteio, morte e cinemática
  setInterval(() => {
    const now = live();
    if (now !== on) { on = now; ui.classList.toggle('on', on); document.body.classList.toggle('ingame', on); if (!on) reset(); }
    if (on) $('tbSwapT').textContent = `ARMA ${player.weapon + 1}`;
  }, 100);
}

// ───────────────────────── Entrada ─────────────────────────
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'playing' || uiOpen) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Space') tryRoll();
  if (e.code === 'KeyE') callSupply();
  if (e.code === 'KeyQ') callStrike();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'Digit3') switchWeapon(2);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => { if (e.button === 0) { mouseDown = true; player.clickT = 0.2; } });
addEventListener('wheel', e => { if (state === 'playing' && !uiOpen) switchWeapon((player.weapon + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length); });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || state !== 'playing') return;
  player.yaw -= e.movementX * 0.0022 * settings.sens;
  player.pitch = Math.max(-0.6, Math.min(0.8, player.pitch - e.movementY * 0.0022 * settings.sens));
});
// No PC o "foco" do jogo é o ponteiro preso; no celular não existe: a pausa vira um botão na tela.
const inputLive = () => isTouch ? (state === 'playing' && !uiOpen) : document.pointerLockElement === renderer.domElement;
function captureInput() {
  if (isTouch) lockChanged(true); else renderer.domElement.requestPointerLock();
}
document.addEventListener('pointerlockchange', () => lockChanged(document.pointerLockElement === renderer.domElement));
function lockChanged(locked) {
  if (net.role !== 'solo' && mission && ['playing', 'loot', 'dying', 'downed'].includes(state)) {
    // online o jogo não pausa: o menu só abre por cima e você fica parado
    uiOpen = !locked;
    if (!locked) {
      $('sub').textContent = `Sala ${net.code} · a operação continua para os outros jogadores`;
      $('resume').style.display = 'inline-block'; $('abort').style.display = 'inline-block';
      $('menu').classList.remove('hidden');
    } else { $('menu').classList.add('hidden'); $('clickGo').classList.remove('on'); }
    return;
  }
  if (!locked && state === 'playing') {
    state = 'paused';
    $('sub').textContent = 'Pausado';
    $('resume').style.display = 'inline-block'; $('abort').style.display = 'inline-block';
    $('menu').classList.remove('hidden');
  } else if (locked && state === 'paused') {
    state = 'playing';
    $('menu').classList.add('hidden');
  }
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ───────────────────────── Ações do jogador ─────────────────────────
const curW = () => WEAPONS[player.weapon];
function switchWeapon(i) {
  if (i === player.weapon || !WEAPONS[i] || player.rolling > 0) return;
  player.ammo[player.weapon] = { mag: player.mag, reserve: player.reserve };
  player.weapon = i;
  player.mag = player.ammo[i].mag; player.reserve = player.ammo[i].reserve;
  player.reloading = 0; player.fireCd = 0.3;
  say(WEAPONS[i].name, 1); beep(420, 0.08);
}
function startReload() {
  const w = curW();
  if (player.reloading > 0 || player.mag === w.mag || player.reserve <= 0) return;
  player.reloading = w.reload;
  if (mixer) trigger('Reload', actions.Reload.getClip().duration / w.reload);
  beep(300, 0.1);
}
function inputDir(f, r, kk) {
  const d = new THREE.Vector3();
  if (kk.KeyW) d.add(f);
  if (kk.KeyS) d.sub(f);
  if (kk.KeyD) d.add(r);
  if (kk.KeyA) d.sub(r);
  if (isTouch && !uiOpen && touch.mag > 0.12) d.addScaledVector(f, touch.y).addScaledVector(r, touch.x);
  return d;
}
function tryRoll() {
  if (player.rolling > 0 || player.rollCd > 0) return;
  const f = fwdOf(player.yaw), r = rightOf(player.yaw);
  const d = inputDir(f, r, keys);
  if (d.lengthSq() === 0) d.copy(f).multiplyScalar(-1);
  player.rollDir.copy(d.normalize());
  player.rolling = PLAYER.rollTime;
  if (mixer) trigger('Dash', actions.Dash.getClip().duration / PLAYER.rollTime);
  player.rollCd = PLAYER.rollCooldown;
  noise(0.12, 0.08, 1500);
  burst(player.pos.clone().setY(0.2), 0xd9c9a0, 14, 3.5);
}

let camDir = new THREE.Vector3();
let camPos = new THREE.Vector3();

function aimOrigin() { return camPos.clone().addScaledVector(camDir, 4.6); }
function aimGround(maxD = 40) {
  let target;
  if (camDir.y < -0.02) {
    const t = -camPos.y / camDir.y;
    target = camPos.clone().addScaledVector(camDir, Math.min(t, maxD));
  } else {
    target = player.pos.clone().addScaledVector(fwdOf(player.yaw), 15);
  }
  target.y = 0;
  return target;
}

function callSupply() {
  if (player.supplyCd > 0) { say(`Suprimentos em ${Math.ceil(player.supplyCd)}s`, 1.2); return; }
  const target = aimGround(40);
  if (net.role === 'client') net.toHost({ k: 'crateReq', x: target.x, z: target.z });
  else hostAddCrate(target.x, target.z);
  player.supplyCd = SUPPLY_COOLDOWN;
  stats.supplies++;
  say('Suprimentos a caminho!', 1.5);
  beep(520, 0.2);
}

// Ataque orbital: marca o ponto mirado e, após alguns segundos, um raio devasta a área (também fere você)
function addStrike(id, x, z) {
  const pos = new THREE.Vector3(x, 0, z);
  const line = op => new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 80, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: op }));
  const center = line(0.95); center.position.copy(pos).setY(40);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  dot.rotation.x = -Math.PI / 2; dot.position.copy(pos).setY(0.08);
  scene.add(center, dot);
  strikes.push({ id, pos, center, dot, outer: [], t: 0, base: rand(0, Math.PI * 2), line });
}
function callStrike() {
  if (player.strikeCd > 0) { say(`Orbital em ${Math.ceil(player.strikeCd)}s`, 1.2); return; }
  const pos = aimGround(60);
  if (net.role === 'client') net.toHost({ k: 'strikeReq', x: pos.x, z: pos.z });
  else { const id = uid(); addStrike(id, pos.x, pos.z); net.all({ k: 'strike', id, x: pos.x, z: pos.z }); }
  player.strikeCd = Math.max(20, STRIKE_COOLDOWN - 2 * lvl('strike'));
  stats.orbitals++;
  say('Ataque orbital marcado — afaste-se!', 1.8); beep(300, 0.4, 0.1);
}

// Contorno de pedras: se o caminho reto está bloqueado, escolhe o menor desvio livre (sempre pelo mesmo lado de cada inimigo),
// o que também faz contornar paredes de pedras em vez de ficar empurrando uma delas.
function pathBlocked(pos, dx, dz, radius, look) {
  for (const k of rocks) {
    const rx = k.x - pos.x, rz = k.z - pos.z;
    const t = rx * dx + rz * dz;                                 // distância à frente até a pedra
    if (t < -k.r || t > look + k.r) continue;
    if (Math.abs(-rx * dz + rz * dx) < k.r + radius + 0.6) return true;   // distância lateral ao caminho
  }
  return false;
}
// Mapa de fluxo: grade de 2 m com as pedras como obstáculos. Uma busca em largura a partir do alvo diz, em cada célula,
// para onde andar. Isso resolve "becos" e paredes de pedras que o desvio simples não resolve.
function buildGrid() {
  const R = ARENA_R + 6, c = GRID.cell;
  GRID.off = R; GRID.n = Math.ceil(2 * R / c); GRID.blocked = new Uint8Array(GRID.n * GRID.n); GRID.fields.clear();
  for (const k of rocks) {
    const rr = k.r + 1.3;
    const x0 = Math.max(0, Math.floor((k.x - rr + GRID.off) / c)), x1 = Math.min(GRID.n - 1, Math.floor((k.x + rr + GRID.off) / c));
    const z0 = Math.max(0, Math.floor((k.z - rr + GRID.off) / c)), z1 = Math.min(GRID.n - 1, Math.floor((k.z + rr + GRID.off) / c));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (Math.hypot((cx + 0.5) * c - GRID.off - k.x, (cz + 0.5) * c - GRID.off - k.z) < rr) GRID.blocked[cz * GRID.n + cx] = 1;
    }
  }
  GRID.dirty = false;
}
function computeField(goal) {
  const n = GRID.n, c = GRID.cell, blocked = GRID.blocked;
  const dist = new Float32Array(n * n).fill(1e9), queue = new Int32Array(n * n);
  const gx = Math.min(n - 1, Math.max(0, Math.floor((goal.x + GRID.off) / c))), gz = Math.min(n - 1, Math.max(0, Math.floor((goal.z + GRID.off) / c)));
  let head = 0, tail = 0;
  let sx = gx, sz = gz;
  if (blocked[gz * n + gx]) {                                           // alvo colado numa pedra: parte da célula livre mais próxima
    let bd = 1e9;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const nx = gx + dx, nz = gz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || blocked[nz * n + nx]) continue;
      const dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; sx = nx; sz = nz; }
    }
  }
  dist[sz * n + sx] = 0; queue[tail++] = sz * n + sx;
  while (head < tail) {
    const cur = queue[head++], cx = cur % n, cz = (cur - cx) / n, d = dist[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const ni = nz * n + nx;
      if (dist[ni] <= d + 1 || blocked[ni]) continue;
      if (dx && dz && (blocked[cz * n + nx] || blocked[nz * n + cx])) continue;       // não corta quina de pedra
      dist[ni] = d + 1; queue[tail++] = ni;
    }
  }
  return { dist, gx, gz, t: performance.now() };
}
function flowDir(pos, tg) {
  if (GRID.dirty) buildGrid();
  const key = tg.gen ? 'gen' : 'p' + tg.pid, n = GRID.n, c = GRID.cell;
  let f = GRID.fields.get(key);
  const gx = Math.floor((tg.pos.x + GRID.off) / c), gz = Math.floor((tg.pos.z + GRID.off) / c);
  if (!f || performance.now() - f.t > 500 || (Math.abs(f.gx - gx) + Math.abs(f.gz - gz) > 2 && performance.now() - f.t > 150)) { f = computeField(tg.pos); GRID.fields.set(key, f); }
  const cx = Math.floor((pos.x + GRID.off) / c), cz = Math.floor((pos.z + GRID.off) / c);
  if (cx < 0 || cz < 0 || cx >= n || cz >= n) return null;
  let best = f.dist[cz * n + cx], bx = -1, bz = -1;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, nz = cz + dz;
    if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
    const d = f.dist[nz * n + nx];
    if (d < best - 0.01) { best = d; bx = nx; bz = nz; }
  }
  if (bx < 0 && GRID.blocked[cz * n + cx]) {                            // dentro da zona de uma pedra: sai pela célula livre mais próxima
    let bd = 1e9;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || GRID.blocked[nz * n + nx] || f.dist[nz * n + nx] >= 1e9) continue;
      const dd = dx * dx + dz * dz + f.dist[nz * n + nx] * 0.01; if (dd < bd) { bd = dd; bx = nx; bz = nz; }
    }
  }
  if (bx < 0) return null;
  const vx = (bx + 0.5) * c - GRID.off - pos.x, vz = (bz + 0.5) * c - GRID.off - pos.z, l = Math.hypot(vx, vz) || 1;
  return new THREE.Vector3(vx / l, 0, vz / l);
}
function steerRocks(pos, dir, radius, e, tg) {
  const look = 7;
  if (!pathBlocked(pos, dir.x, dir.z, radius, look)) { e.sN = 0; return dir; }
  if (tg) { const f = flowDir(pos, tg); if (f) return f; }
  if (e.sN > 0 && e.sdir && !pathBlocked(pos, e.sdir.x, e.sdir.z, radius, 3)) { e.sN--; return e.sdir; }   // mantém o desvio escolhido
  const base = Math.atan2(dir.z, dir.x);
  for (const deg of [30, 60, 90, 120, 150]) {
    for (const sg of [e.bias, -e.bias]) {
      const a = base + sg * deg * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a);
      if (!pathBlocked(pos, dx, dz, radius, look)) { e.sdir = new THREE.Vector3(dx, 0, dz); e.sN = 45; e.bias = sg; return e.sdir; }
    }
  }
  return dir;
}
function resolveRocks(pos, radius) {
  for (const k of rocks) {
    const dx = pos.x - k.x, dz = pos.z - k.z;
    const d = Math.hypot(dx, dz), min = k.r + radius;
    if (d < min && d > 0.001) { pos.x = k.x + (dx / d) * min; pos.z = k.z + (dz / d) * min; }
  }
  const len = Math.hypot(pos.x, pos.z);
  if (len > ARENA_R) { pos.x *= ARENA_R / len; pos.z *= ARENA_R / len; }
}

function shoot() {
  const w = curW();
  player.mag--;
  player.fireCd = 1 / w.rate;
  player.flash = 0.12;
  player.clickT = 0;
  stats.shots++;
  alertNear(player.pos, 65);
  pendingFlag.shot = true;
  if (mixer) trigger('Shoot');
  noise(w.id === 'shotgun' ? 0.22 : 0.09, w.id === 'dmr' ? 0.2 : 0.14, w.id === 'shotgun' ? 1800 : 2800);
  player.pitch = Math.min(0.8, player.pitch + w.recoil * rand(0.6, 1.2));
  const o = aimOrigin();
  const muzzle = player.pos.clone().add(new THREE.Vector3(0, 1.28, 0))     // ponta do cano da arma compacta no peito
    .addScaledVector(fwdOf(player.yaw), 0.72);
  const test = (c, r, d) => {
    const oc = c.clone().sub(o);
    const t = oc.dot(d);
    if (t < 0) return null;
    const d2 = oc.lengthSq() - t * t;
    if (d2 > r * r) return null;
    return t - Math.sqrt(r * r - d2);
  };
  let anyHit = false;
  for (let n = 0; n < w.pellets; n++) {
    const d = camDir.clone();
    d.x += rand(-w.spread, w.spread);
    d.y += rand(-w.spread, w.spread);
    d.z += rand(-w.spread, w.spread);
    d.normalize();
    let bestT = w.range, hitEnemy = null;
    for (const e of enemies) {
      const c = e.mesh.position.clone().setY(e.t.height);
      const t = test(c, e.t.radius, d);
      if (t !== null && t < bestT) { bestT = t; hitEnemy = e; }
    }
    for (const k of rocks) {
      const t = test(new THREE.Vector3(k.x, k.y, k.z), k.r, d);
      if (t !== null && t < bestT) { bestT = t; hitEnemy = null; }
    }
    if (d.y < -0.001) { const t = -o.y / d.y; if (t < bestT) { bestT = t; hitEnemy = null; } }
    const end = o.clone().addScaledVector(d, bestT);
    addTracer(muzzle, end);
    if (hitEnemy) {
      anyHit = true;
      burst(end, 0xff5a3a, 3, 4);
      damageEnemy(hitEnemy, (w.dmg + lvl('dmg')) * (buffs.dmg > 0 ? 1.25 : 1));
    } else if (n < 3) burst(end, 0xd9c9a0, 2, 3);
  }
  if (anyHit) stats.hits++;
  if (anyHit) { const c = $('cross'); c.classList.add('hit'); setTimeout(() => c.classList.remove('hit'), 70); }
  if (player.mag <= 0) startReload();
}

// ───────────────────────── Atualização ─────────────────────────
function updatePlayer(dt) {
  const kk = uiOpen ? NOKEYS : keys;
  player.moving = false; player.sprinting = false;
  if (player.hitT > 0) player.hitT -= dt;
  if (player.flash > 0) player.flash -= dt;
  if (player.fireCd > 0) player.fireCd -= dt;
  if (player.rollCd > 0) player.rollCd -= dt;
  if (player.supplyCd > 0) player.supplyCd -= dt;
  if (player.strikeCd > 0) player.strikeCd -= dt;
  if (player.invuln > 0) player.invuln -= dt;
  if (buffs.dmg > 0) buffs.dmg -= dt;
  if (player.clickT > 0) player.clickT -= dt;

  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const take = Math.min(curW().mag - player.mag, player.reserve);
      player.mag += take; player.reserve -= take;
    }
  }

  if (player.rolling > 0) {
    player.rolling -= dt;
    player.pos.addScaledVector(player.rollDir, PLAYER.rollSpeed * dt);
    if (!mixer) playerGroup.scale.y = 0.6;
  } else {
    playerGroup.scale.y = 1;
    const f = fwdOf(player.yaw), r = rightOf(player.yaw);
    const mv = inputDir(f, r, kk);
    if (mv.lengthSq() > 0) {
      mv.normalize();
      const mf = mv.dot(f), mr = mv.dot(r);
      const sprint = kk.ShiftLeft && mf > -0.35;           // correr rápido em qualquer direção, menos de costas
      const walk = kk.KeyC && !sprint;                     // C: andar devagar
      const kind = walk ? 'Walk' : 'Run';
      const speed = (walk ? PLAYER.walk : sprint ? PLAYER.sprint : PLAYER.speed) * (0.88 + 0.12 * mf) * (1 + 0.01 * lvl('speed'));   // lado e costas são mais lentos
      player.moving = true;
      player.sprinting = sprint;
      player.moveKind = kind;
      player.moveAlpha = (Math.atan2(mr, mf) * 180 / Math.PI + 360) % 360;   // 0 frente, 90 direita, 180 costas
      player.moveScale = speed / NOMINAL[kind];
      player.pos.addScaledVector(mv, speed * dt);
    }
  }
  resolveRocks(player.pos, 0.5);
  resolvePlane(player.pos);

  const wantFire = curW().auto ? mouseDown : player.clickT > 0;
  if (wantFire && inputLive()
      && player.fireCd <= 0 && player.reloading <= 0 && player.mag > 0 && player.rolling <= 0) shoot();

  if (relax && elapsed - player.lastHit > 5 && player.hp < maxHp()) player.hp = Math.min(maxHp(), player.hp + 6 * dt);

  animate(dt);
  playerGroup.position.copy(player.pos);
  // durante o dash o corpo vira para a direção do deslize; depois volta a seguir a mira
  playerGroup.rotation.y = (mixer && player.rolling > 0) ? Math.atan2(-player.rollDir.x, -player.rollDir.z) : player.yaw;
}

function updateCamera() {
  const pivot = player.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const f = fwdOf(player.yaw), r = rightOf(player.yaw);
  camDir.set(f.x * cp, sp, f.z * cp).normalize();
  camPos.copy(pivot).addScaledVector(camDir, -4.6).addScaledVector(r, 1.0);
  camPos.y = Math.max(camPos.y, 0.6);
  camera.position.copy(camPos);
  camera.lookAt(camPos.clone().addScaledVector(camDir, 50));
  const fov = player.sprinting ? 78 : 70;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.12; camera.updateProjectionMatrix(); }
  if (shake > 0.01) { camera.position.x += rand(-1, 1) * shake; camera.position.y += rand(-1, 1) * shake; shake *= 0.9; } else shake = 0;
  if (window.__debugCam) { camera.position.fromArray(window.__debugCam.pos); camera.lookAt(...window.__debugCam.look); }  // só para testes
}

let clientMixed = false;
function foeOf(e, range = 75) {                                         // inimigo mais próximo da outra facção (só em mapa de fronteira)
  if (!mixFac && !clientMixed) return null;
  let b = null, bd = range;
  for (const o of enemies) { if (o.fac === e.fac) continue; const d = Math.hypot(o.mesh.position.x - e.mesh.position.x, o.mesh.position.z - e.mesh.position.z); if (d < bd) { bd = d; b = o; } }
  return b;
}
function enemyTarget(e) {
  const foe = foeOf(e);
  if (foe) return { pos: foe.mesh.position, gen: false, rad: foe.t.radius * 0.7, pid: -1, en: foe };
  const near = nearestLive(e.mesh.position);
  const pos = near ? near.pos : player.pos;
  if (generator && generator.active && generator.hp > 0 && e.type !== 'spitter' && e.type !== 'queen') {
    const dg = Math.hypot(e.mesh.position.x - generator.x, e.mesh.position.z - generator.z);
    const dp = Math.hypot(e.mesh.position.x - pos.x, e.mesh.position.z - pos.z);
    if (dg < dp + 12 || !near) return { pos: new THREE.Vector3(generator.x, 0, generator.z), gen: true, rad: 2.6, pid: -1 };
  }
  return { pos, gen: false, rad: 0, pid: near ? near.id : -1 };
}

function spawnAcid(from, to, speed, dmg) {                // gota do jato de ácido: voa em arco até o alvo
  const dx = to.x - from.x, dz = to.z - from.z, hd = Math.max(1, Math.hypot(dx, dz)), t = hd / speed, G = 9;
  const v = new THREE.Vector3(dx / hd * speed, (to.y - from.y) / t + 0.5 * G * t, dz / hd * speed);
  const pm = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9dff1a }));
  pm.position.copy(from); scene.add(pm);
  projectiles.push({ id: uid(), m: pm, v, life: 3, dmg: dmg * mods.edmg, big: false, fac: 'bugs', acid: true, g: G });
}
function titanStomp(e, dir) {                               // pisada: dano em área à frente do Titã
  const c = e.mesh.position.clone().addScaledVector(dir, 6.5), R = 10;
  boomFx(c, R); net.all({ k: 'fx', t: 'boom', x: c.x, z: c.z, r: R });
  for (const p of livePlayers()) { const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z); if (d < R) hurtPlayer(p.id, e.t.dmg * e.dm * mods.edmg * (1 - 0.5 * d / R)); }
  if (generator && generator.active && Math.hypot(generator.x - c.x, generator.z - c.z) < R + 2.5) damageGenerator(e.t.dmg * e.dm * 2);
  if (mixFac) for (const o of [...enemies]) if (o.fac !== e.fac && o.mesh.position.distanceTo(c) < R) damageEnemy(o, e.t.dmg * 3, -2);
  alertNear(c, 80);
}
function titanJet(e, dir, tg, dt) {                         // jato de ácido pela boca: ~16 gotas por segundo, mira devagar (dá para desviar andando de lado)
  e.jetAcc += dt * 16;
  const from = e.mesh.position.clone().addScaledVector(dir, 4.2).setY(4.6);
  while (e.jetAcc >= 1) {
    e.jetAcc -= 1;
    const to = tg.pos.clone().add(new THREE.Vector3(rand(-1.2, 1.2), 0.8, rand(-1.2, 1.2)));
    spawnAcid(from, to, rand(26, 34), 5 * e.dm);
  }
}
function spitAt(from, dir, speed, dmg, big, fac = curFaction) {
  const bt = fac === 'bots';
  const pm = new THREE.Mesh(new THREE.SphereGeometry(big ? (bt ? 0.3 : 0.45) : (bt ? 0.14 : 0.28), 8, 6), new THREE.MeshBasicMaterial({ color: bt ? (big ? 0xff3030 : 0xffb03a) : (big ? 0xff40c0 : 0xa4ff6a) }));
  pm.position.copy(from);
  scene.add(pm);
  projectiles.push({ id: uid(), m: pm, v: dir.clone().normalize().multiplyScalar(speed), life: 4, dmg: dmg * mods.edmg, big, fac });
}
function patrolMove(e, dt) {
  const m = e.mesh, pl = e.pl;
  const goal = pl.anchor.clone().add(formationOffset(e.slot, pl.heading));
  const to = goal.sub(m.position).setY(0), d = to.length();
  e.phase += dt * 5; m.position.y = m.userData.spider ? 0 : Math.abs(Math.sin(e.phase)) * 0.08;
  if (d > 0.5) {
    const sp = Math.min(e.t.speed * 0.7 * e.spd, 2.3 + d * 1.6);
    to.normalize(); m.position.addScaledVector(steerRocks(m.position, to, e.t.radius * 0.6, e), sp * dt);
    m.rotation.y = Math.atan2(-to.x, -to.z);
  } else m.rotation.y = Math.atan2(-Math.sin(pl.heading), -Math.cos(pl.heading));
  animateSpider(e, dt, d > 0.5);
}

function updateEnemies(dt) {
  for (const e of [...enemies]) {
    if (!enemies.includes(e)) continue;
    const m = e.mesh;
    const beforeX = m.position.x, beforeZ = m.position.z;
    if (e.pl && e.pl.state === 'patrol') { patrolMove(e, dt); resolveRocks(m.position, e.t.radius * 0.6); continue; }
    const tg = enemyTarget(e);
    const to = tg.pos.clone().sub(m.position).setY(0);
    const dist = Math.max(0, to.length() - tg.rad);
    const dir = to.normalize();
    const hurt = d => tg.en ? damageEnemy(tg.en, d * mods.edmg * e.dm, -2) : tg.gen ? damageGenerator(d * mods.edmg * e.dm) : (tg.pid >= 0 ? hurtPlayer(tg.pid, d * mods.edmg * e.dm) : 0);
    const walkTo = sp => {                                   // anda para o alvo (ou se afasta se sp < 0), contornando pedras
      const d0 = sp >= 0 ? dir : dir.clone().negate();
      m.position.addScaledVector(steerRocks(m.position, d0, e.t.radius * 0.6, e, sp >= 0 ? tg : null), Math.abs(sp) * dt * e.spd);
    };
    e.phase += dt * (e.type === 'crawler' || e.type === 'bomber' ? 14 : 7);
    m.position.y = (m.userData.bot || m.userData.spider) ? 0 : Math.abs(Math.sin(e.phase)) * 0.12;
    if (e.type !== 'titan') m.rotation.y = Math.atan2(-dir.x, -dir.z);

    if (e.type === 'spitter') {
      const keep = 16;
      if (dist > keep + 3) walkTo(e.t.speed);
      else if (dist < keep - 4) walkTo(-e.t.speed);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 38) {
        e.shootCd = rand(1.8, 3);
        if (e.fac !== 'bots') triggerSpiderSpit(e);
        const from = m.position.clone().setY(e.fac === 'bots' ? 1.15 : 0.62);
        spitAt(from, tg.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(from), 18, e.t.dmg * e.dm, false, e.fac);
        beep(240, 0.12, 0.05);
      }
    } else if (e.type === 'bomber') {
      walkTo(e.t.speed);
      const s = 1 + 0.1 * Math.sin(e.phase * 2); m.scale.setScalar(e.t.scale * s);
      if (dist < 2.2) killEnemy(e);                      // explode ao chegar perto
    } else if (e.type === 'charger') {
      e.stT -= dt;
      if (e.st === 'walk') {
        if (dist > 3) walkTo(e.t.speed);
        if (e.stT <= 0 && dist < 24 && dist > 7 && !pathBlocked(m.position, dir.x, dir.z, e.t.radius * 0.6, dist)) { e.st = 'wind'; e.stT = 0.8; e.cdir = dir.clone(); noise(0.3, 0.12, 300); }
        else if (dist <= 2.6) { e.atkCd -= dt; if (e.atkCd <= 0) { e.atkCd = 0.9; hurt(e.t.dmg * 0.6); } }
      } else if (e.st === 'wind') {
        m.position.x += rand(-1, 1) * 0.03; m.position.z += rand(-1, 1) * 0.03;
        m.scale.setScalar(e.t.scale * (1 + 0.04 * Math.sin(e.stT * 60)));
        if (e.stT <= 0) { e.st = 'charge'; e.stT = 1.1; e.hitDone = false; m.scale.setScalar(e.t.scale); }
      } else if (e.st === 'charge') {
        m.position.addScaledVector(e.cdir, 17 * dt * e.spd);
        m.rotation.y = Math.atan2(-e.cdir.x, -e.cdir.z);
        if (!e.hitDone && dist < 2.6) { hurt(e.t.dmg); e.hitDone = true; e.st = 'stun'; e.stT = 1.3; burst(m.position.clone().setY(1), 0xd9c9a0, 14, 5); }
        else if (e.stT <= 0) { e.st = 'stun'; e.stT = 0.9; }
      } else if (e.st === 'stun') {
        if (e.stT <= 0) { e.st = 'walk'; e.stT = 2.5; }
      }
    } else if (e.type === 'titan') {
      e.stompCd -= dt; e.jetCd -= dt;
      const want = Math.atan2(-dir.x, -dir.z); let dr = want - m.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      m.rotation.y += Math.max(-0.8 * dt, Math.min(0.8 * dt, dr));              // gira devagar: dá para contornar
      const fwd = new THREE.Vector3(-Math.sin(m.rotation.y), 0, -Math.cos(m.rotation.y));
      if (e.st === 'stomp') {
        e.stT -= dt;
        if (!e.hitDone && e.stT <= 1.8 - 0.83) { e.hitDone = true; titanStomp(e, fwd); }
        if (e.stT <= 0) { e.st = 'walk'; e.stompCd = rand(3.5, 5.5); }
      } else if (e.st === 'jet') {
        e.stT -= dt; const t = 2.4 - e.stT;
        if (t > 0.82 && t < 2.02) titanJet(e, fwd, tg, dt);
        if (e.stT <= 0) { e.st = 'walk'; e.jetCd = rand(7, 11); e.jetAcc = 0; }
      } else {
        if (dist > 8) walkTo(e.t.speed);
        const facing = Math.abs(dr) < 0.45;                                       // só ataca de frente
        if (e.stompCd <= 0 && dist < 12 && facing) { e.st = 'stomp'; e.stT = 1.8; e.hitDone = false; }
        else if (e.jetCd <= 0 && dist > 14 && dist < 50 && facing) { e.st = 'jet'; e.stT = 2.4; e.jetAcc = 0; }
      }
      mission.boss = { hp: e.hp, maxHp: e.maxHp, titan: true };
    } else if (e.type === 'queen') {
      e.atkCd -= dt; e.volleyCd -= dt; e.summonCd -= dt;
      const enraged = e.hp < e.maxHp * 0.5;
      if (dist > 5.5) walkTo(e.t.speed * (enraged ? 1.35 : 1));
      if (dist <= 6.5 && e.atkCd <= 0) { e.atkCd = enraged ? 1.3 : 1.8; hurt(e.t.dmg); burst(m.position.clone().setY(1.5), 0xff40c0, 12, 5); shake = Math.max(shake, 0.2); }
      if (e.volleyCd <= 0 && dist > 9) {
        e.volleyCd = enraged ? 3 : 4.5;
        const from = m.position.clone().setY(curFaction === 'bots' ? 3.3 : 2.6);
        const base = tg.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(from);
        for (let i = -2; i <= 2; i++) {
          const v = base.clone(); const c = Math.cos(i * 0.16), sn = Math.sin(i * 0.16);
          const x = v.x * c - v.z * sn, z = v.x * sn + v.z * c; v.x = x; v.z = z;
          spitAt(from, v, 15, 14 * e.dm, true, e.fac);
        }
        beep(180, 0.25, 0.08);
      }
      if (e.summonCd <= 0 && enemies.length < 18) {
        e.summonCd = enraged ? 10 : 14;
        sayAll('A Rainha chama o enxame!', 2);
        for (let k = 0; k < 4; k++) {
          const a = rand(0, Math.PI * 2);
          spawnEnemy(k === 3 ? 'bomber' : 'crawler', m.position.clone().add(new THREE.Vector3(Math.cos(a) * 6, 0, Math.sin(a) * 6)));
        }
      }
    } else {
      const reach = e.type === 'brute' ? 3.2 : 1.7;
      if (dist > reach) walkTo(e.t.speed);
      e.atkCd -= dt;
      if (dist <= reach + 0.3 && e.atkCd <= 0) {
        e.atkCd = e.type === 'brute' ? 1.3 : 0.8;
        hurt(e.t.dmg);
      }
    }
    resolveRocks(m.position, e.t.radius * 0.6);
    animateSpider(e, dt, Math.hypot(m.position.x - beforeX, m.position.z - beforeZ) > 0.002);
    animateTitan(e, dt, Math.hypot(m.position.x - beforeX, m.position.z - beforeZ) > 0.002);
  }
  animateBots(dt);
}

function updateProjectiles(dt) {
  const live = livePlayers();
  for (const p of [...projectiles]) {
    if (p.g) p.v.y -= p.g * dt;
    p.m.position.addScaledVector(p.v, dt);
    p.life -= dt;
    for (const q of live) {
      if (p.m.position.distanceTo(q.pos.clone().setY(1.1)) < (p.acid ? 1.5 : p.big ? 1.2 : 0.9)) { hurtPlayer(q.id, p.dmg); p.life = 0; if (p.acid) burst(p.m.position.clone(), 0x9dff1a, 6, 4); break; }
    }
    if (mixFac && p.life > 0) for (const o of enemies) {                      // tiro da facção inimiga acerta quem é da outra
      if (o.fac !== p.fac && p.m.position.distanceTo(o.mesh.position.clone().setY(o.t.height)) < o.t.radius) { damageEnemy(o, p.dmg, -2); p.life = 0; break; }
    }
    if (p.life <= 0 || p.m.position.y < 0) {
      if (p.acid && p.m.position.y < 0.5) burst(p.m.position.clone().setY(0.2), 0x9dff1a, 5, 3.5);
      scene.remove(p.m);
      projectiles.splice(projectiles.indexOf(p), 1);
    }
  }
}

function updateEffects(dt) {
  for (const p of [...particles]) {
    p.life -= dt;
    p.v.y -= 9 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.life <= 0 || p.m.position.y < 0) { scene.remove(p.m); particles.splice(particles.indexOf(p), 1); }
  }
  for (const t of [...tracers]) {
    t.life -= dt;
    if (t.life <= 0) { scene.remove(t.line); tracers.splice(tracers.indexOf(t), 1); }
  }
  for (const c of [...crates]) {
    if (!c.landed) {
      c.box.position.y -= 18 * dt;
      if (c.box.position.y <= 0.6) { c.box.position.y = 0.6; c.landed = true; noise(0.3, 0.2, 400); }
    } else if (state === 'playing' && player.pos.distanceTo(c.g.position) < 2.4) {
      refillAmmo();
      player.hp = Math.min(maxHp(), player.hp + 50);
      say('Suprimentos coletados', 1.5);
      beep(760, 0.2);
      removeCrate(c);
      if (net.role === 'client') net.toHost({ k: 'crateGet', id: c.id }); else net.all({ k: 'crateGone', id: c.id });
    }
  }
  for (const s of [...strikes]) {
    s.t += dt;
    const R0 = 11, T_OUT = 0.5, T_SPIN = 0.6, T_HIT = 1.7;          // linhas externas em 0,5 s; giram a partir de 0,6 s; chegam em 1,6 s; impacto 100 ms depois
    if (s.t >= T_OUT && !s.outer.length) {
      for (let k = 0; k < 6; k++) { const m = s.line(0.8); scene.add(m); s.outer.push(m); }
      beep(520, 0.1, 0.06);
    }
    if (s.outer.length) {
      const u = Math.min(1, Math.max(0, (s.t - T_SPIN) / (T_HIT - 0.1 - T_SPIN)));
      const r = R0 * (1 - u * u), spin = u * u * Math.PI * 3;
      s.outer.forEach((m, k) => {
        const a = s.base + (k / 6) * Math.PI * 2 + spin;
        m.position.set(s.pos.x + Math.cos(a) * r, 40, s.pos.z + Math.sin(a) * r);
        m.visible = u < 1;                                               // chegaram ao centro
      });
    }
    if (s.t >= T_HIT) {
      scene.remove(s.center); scene.remove(s.dot); s.outer.forEach(m => scene.remove(m));
      strikes.splice(strikes.indexOf(s), 1);
      addFlash(s.pos, 12, 0xff6040);
      burst(s.pos.clone().setY(1), 0xff8040, 60, 14);
      const dl = Math.hypot(player.pos.x - s.pos.x, player.pos.z - s.pos.z);
      if (dl < 90) { noise(0.7, 0.4, 500); shake = Math.max(shake, 0.9 * Math.max(0.2, 1 - dl / 90)); }
      if (net.role !== 'client') {
        alertNear(s.pos, 90);
        const R = 11;
        for (const e of [...enemies]) {
          const d = e.mesh.position.distanceTo(s.pos);
          if (d < R) damageEnemy(e, 320 * (1 - 0.5 * d / R), -1);
        }
        for (const p of livePlayers()) {
          const dp = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
          if (dp < 8) hurtPlayer(p.id, 45 * (1 - dp / 10));
        }
      }
    }
  }
  for (const f of [...flashes]) {
    f.t -= dt;
    const k = 1 - f.t / f.max;
    f.m.scale.setScalar(Math.max(0.01, f.radius * Math.sqrt(k)));
    f.m.material.opacity = 0.7 * (1 - k);
    if (f.t <= 0) { scene.remove(f.m); flashes.splice(flashes.indexOf(f), 1); }
  }
  for (const d of [...drops]) {
    d.t -= dt; d.m.rotation.y += dt * 3; d.m.position.y = 0.7 + 0.15 * Math.sin(elapsed * 4);
    if (state === 'playing' && player.pos.distanceTo(d.m.position.clone().setY(0)) < 2.2) {
      if (d.type === 'hp') player.hp = Math.min(maxHp(), player.hp + 25);
      else player.reserve = Math.min(reserveCap(curW()), player.reserve + Math.ceil(curW().mag * 1.5));
      say(d.type === 'hp' ? '+ Vida' : '+ Munição', 1); beep(700, 0.1);
      if (net.role === 'client') net.toHost({ k: 'dropGet', id: d.id }); else net.all({ k: 'dropGone', id: d.id });
      d.t = 0;
    }
    if (d.t <= 0) removeDrop(d);
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('on'); }
}

function updateHud() {
  const pct = Math.max(0, player.hp) / maxHp() * 100;
  $('hpBar').style.width = pct + '%';
  $('hpBar').style.background = pct > 50 ? '#4cd68a' : pct > 25 ? '#ffcf3f' : '#ff4d4d';
  $('wname').textContent = `[${player.weapon + 1}] ${curW().name}`;
  $('ammo').innerHTML = (player.reloading > 0 ? 'Recarregando' : player.mag) + ` <small>/ ${player.reserve}</small>`;
  $('oText').textContent = state === 'downed' ? 'Você caiu. Aguarde um aliado ou o fim da operação.' : FT(mission.text);
  $('oBar').style.width = Math.min(100, mission.progress * 100) + '%';
  const sup = player.supplyCd > 0 ? `${Math.ceil(player.supplyCd)}s` : 'pronto';
  const orb = player.strikeCd > 0 ? `${Math.ceil(player.strikeCd)}s` : 'pronto';
  $('cd').textContent = isTouch ? `Suprimentos: ${sup} · Orbital: ${orb}` : `Suprimentos (E): ${sup} · Orbital (Q): ${orb}`;
  if (mission.id === 'queen' && mission.boss) $('bossBar').style.width = Math.max(0, mission.boss.hp / mission.boss.maxHp * 100) + '%';
  else if (mission.id !== 'queen') {
    const tb = mission.boss && mission.boss.titan ? mission.boss : null;
    $('boss').style.display = tb ? 'block' : 'none';
    if (tb) { $('bossName').textContent = 'TITÃ ÁCIDO'; $('bossBar').style.width = Math.max(0, tb.hp / tb.maxHp * 100) + '%'; }
  }
  $('xpBar').style.width = Math.min(100, xp / xpNeed * 100) + '%';
  $('lvl').textContent = `NV ${level} · XP ${Math.floor(xp)} / ${xpNeed}`;
  $('kills').textContent = 'Abates: ' + kills;
  $('lives').innerHTML = mission.lives ? 'REFORÇOS ' + [...Array(mission.lives)].map((_, i) => `<span class="${i < mission.livesLeft ? 'on' : ''}">●</span>`).join(' ') : '';
  const wp = $('wp');
  const wd = waypoint ? Math.hypot(waypoint.x - player.pos.x, waypoint.z - player.pos.z) : 0;
  if (waypoint && !(waypointHide && wd < waypointHide)) {
    const dx = waypoint.x - player.pos.x, dz = waypoint.z - player.pos.z;
    wp.style.display = 'block';
    $('arrow').style.transform = `rotate(${-(Math.atan2(-dx, -dz) - player.yaw)}rad)`;
    $('wpText').textContent = `${Math.round(wd)} m`;
  } else wp.style.display = 'none';
}



// ───────────────────────── Online ─────────────────────────
// Topologia em estrela: o host simula tudo (inimigos, pelotões, missão) e manda "fotos" do mundo 15x por segundo;
// cada jogador controla o próprio personagem e informa posição/tiros. Salvamento (créditos, melhorias, nome) é local.
const enemyById = new Map(), projById = new Map();
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const myName = () => AUTH.user ? AUTH.user.name : (save.name || 'Jogador');
const rosterName = id => (net.roster.find(p => p.id === id) || {}).name || `Jogador ${id}`;
const missionBusy = () => ['playing', 'loot', 'dying', 'downed', 'cinematic'].includes(state);
const EV_NAMES = ['Shoot', 'Reload', 'Hit', 'Dash', 'Death'];

function ensureOther(id) {
  let o = others[id];
  if (o) return o;
  const group = new THREE.Group(); scene.add(group);
  setNameTag(group, rosterName(id));
  o = { id, name: rosterName(id), group, rig: createRig(group), pos: new THREE.Vector3(), tp: new THREE.Vector3(), yaw: 0, ty: 0,
        status: 'alive', hp: 100, mh: 100, st: {}, ev: null, bd: false, stats: [0, 0, 0, 0, 0], seen: 0, hitT: 0, last: null, wasDead: false };
  others[id] = o;
  return o;
}
function removeOther(id) { const o = others[id]; if (!o) return; scene.remove(o.group); delete others[id]; }
function clearOthers() { Object.keys(others).forEach(removeOther); }

function myState() {
  return {
    x: r2(player.pos.x), z: r2(player.pos.z), y: r2(player.yaw),
    mv: player.moving ? 1 : 0, mk: player.moveKind === 'Walk' ? 1 : 0, ma: Math.round(player.moveAlpha || 0), ms: r2(player.moveScale || 1),
    rl: player.reloading > 0 ? 1 : 0, fl: player.flash > 0 ? 1 : 0, ro: player.rolling > 0 ? 1 : 0,
    rdy: r2(Math.atan2(-player.rollDir.x, -player.rollDir.z)),
    dd: state === 'dying' || state === 'downed' ? 1 : 0, hp: Math.round(Math.max(0, player.hp)), mh: maxHp(),
    sp: player.sprinting ? 1 : 0, wk: keys.KeyC && !player.sprinting ? 1 : 0, w: player.weapon, bd: player.boarded ? 1 : 0,
    ev: [localEv.Shoot, localEv.Reload, localEv.Hit, localEv.Dash, localEv.Death],
    st: [stats.shots, stats.hits, stats.supplies, stats.orbitals, stats.deaths],
  };
}
function applyState(o, s) {
  o.tp.set(s.x, 0, s.z); o.ty = s.y;
  if (!o.seen) { o.pos.copy(o.tp); o.yaw = s.y; o.seen = 1; }
  o.hp = s.hp; o.mh = s.mh || 100; o.bd = !!s.bd; o.stats = s.st || o.stats; o.st = s;
  if (o.wasDead && !s.dd) resetRig(o.rig);
  o.wasDead = !!s.dd;
  const ev = s.ev || [0, 0, 0, 0, 0];
  if (o.ev) EV_NAMES.forEach((n, i) => { if (ev[i] > o.ev[i]) remoteEvent(o, n); });
  o.ev = ev;
}
function remoteEvent(o, n) {
  const a = o.rig.actions[n];
  if (a) triggerRig(o.rig, n, n === 'Dash' ? a.getClip().duration / 0.45 : n === 'Reload' || n === 'Death' ? a.getClip().duration / 1.7 : 1);
  if (n === 'Hit') o.hitT = 0.3;
  if (n === 'Shoot') {                                      // rastro do tiro do outro jogador
    const f = fwdOf(o.yaw), from = o.pos.clone().add(new THREE.Vector3(0, 1.28, 0)).addScaledVector(f, 0.72);
    addTracer(from, from.clone().addScaledVector(f, 38));
  }
}
function updateOthers(dt) {
  for (const o of Object.values(others)) {
    if (!o.group.visible && state !== 'cinematic') continue;
    o.pos.lerp(o.tp, 1 - Math.exp(-dt * 14));
    let dy = o.ty - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * (1 - Math.exp(-dt * 14));
    o.group.position.copy(o.pos);
    o.group.rotation.y = o.st.ro ? o.st.rdy : o.yaw;
    if (o.hitT > 0) o.hitT -= dt;
    animateRig(o.rig, { dead: !!o.st.dd, rolling: !!o.st.ro, moving: !!o.st.mv, moveKind: o.st.mk ? 'Walk' : 'Run', moveAlpha: o.st.ma || 0,
      moveScale: o.st.ms || 1, reloading: !!o.st.rl, flashing: !!o.st.fl, hit: o.hitT > 0 }, dt);
    if (plane && (plane.state === 'closing' || plane.state === 'takeoff') && o.bd) o.group.visible = false;
  }
}

// ── cliente → host ──
function sendClientState(dt) {
  stateT -= dt; if (stateT > 0) return;
  stateT = 0.05;
  const m = myState(); m.k = 'p';
  m.al = state === 'playing' || state === 'loot' || state === 'cinematic' ? 1 : 0;
  if (pendingHits.length) { m.h = pendingHits; pendingHits = []; }
  if (pendingFlag.shot) { m.sh = 1; pendingFlag.shot = false; }
  net.toHost(m);
}

// ── host → clientes ──
function buildSnapshot() {
  const pl = [Object.assign({ id: net.id, al: localAlive() || state === 'cinematic' ? 1 : 0 }, myState())];
  for (const o of Object.values(others)) if (o.last) pl.push(Object.assign({ id: o.id, al: o.status === 'alive' ? 1 : 0 }, o.last));
  const en = enemies.map(e => [e.id, TYPE_LIST.indexOf(e.type), r1(e.mesh.position.x), r1(e.mesh.position.z), r2(e.mesh.rotation.y),
    Math.max(0, Math.round(e.hp / e.maxHp * 100)), (e.elite ? 1 : 0) | ((ST_CODE[e.st] || 0) << 1), e.fac === 'bots' ? 1 : 0]);
  const pr = projectiles.map(p => [p.id, r1(p.m.position.x), r1(p.m.position.y), r1(p.m.position.z), (p.big ? 1 : 0) | (p.fac === 'bots' ? 2 : 0) | (p.acid ? 4 : 0)]);
  const hud = {
    ti: mission.title, tx: mission.text, pg: r2(mission.progress), xp: Math.round(xp), xn: xpNeed, lv: level, ll: mission.livesLeft || 0,
    kl: kills, el: Math.round(elapsed), wp: waypoint ? [r1(waypoint.x), r1(waypoint.z), waypointHide] : null,
    bs: mission.boss ? [Math.max(0, Math.round(mission.boss.hp)), Math.round(mission.boss.maxHp), mission.boss.titan ? 1 : 0] : null,
    md: [mods.hp, mods.count, mods.speed, mods.edmg, mods.elite],
  };
  const ob = {
    gen: generator ? [r1(generator.x), r1(generator.z), Math.round(generator.hp), generator.max, generator.active ? 1 : 0] : null,
    pods: pods.length ? pods.map(p => [r1(p.x), r1(p.z), p.got ? 1 : 0]) : null,
    bea: beacons.length ? beacons.map(b => [r1(b.x), r1(b.z), r2(b.progress), b.done ? 1 : 0]) : null,
    pad: pad ? [r1(pad.x), r1(pad.z)] : null,
    zone: zoneRing ? [r1(zoneRing.position.x), r1(zoneRing.position.z)] : null,
    pln: plane ? [r1(plane.g.position.x), r1(plane.g.position.y), r1(plane.g.position.z), r2(plane.yaw), r2(plane.g.rotation.x), r2(plane.ramp.rotation.x), PLANE_ST.indexOf(plane.state)] : null,
  };
  return { k: 's', pl, en, pr, hud, ob };
}
function netHost(dt) {
  if (net.role !== 'host') return;
  snapT -= dt; if (snapT > 0) return;
  snapT = 1 / 15;
  net.all(buildSnapshot());
}

function createEnemyProxy(a) {
  const fac = a[7] === 1 ? 'bots' : 'bugs';
  if (fac !== curFaction) clientMixed = true;
  const type = TYPE_LIST[a[1]], t = (fac === 'bots' ? BOT_TYPES : ENEMY_TYPES)[type], mesh = makeEnemyMesh(type, fac);
  const elite = !!(a[6] & 1);
  if (elite) { mesh.scale.multiplyScalar(1.25); mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.set(0x7a3a00); }); }
  mesh.position.set(a[2], 0, a[3]); mesh.rotation.y = a[4];
  scene.add(mesh);
  const e = { id: a[0], type, fac, t, mesh, hp: t.hp, maxHp: t.hp, tx: a[2], tz: a[3], tr: a[4], st: 'walk', elite, phase: Math.random() * 6, last: new THREE.Vector3(a[2], 0, a[3]) };
  enemies.push(e); enemyById.set(e.id, e);
  return e;
}
function removeEnemyProxy(e, fx) {
  if (fx) burst(e.mesh.position.clone().setY(e.t.height), deathColor(e), e.type === 'brute' || e.type === 'queen' ? 40 : 14, 6);
  scene.remove(e.mesh); enemyById.delete(e.id);
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
}
function applySnapshot(d) {
  if (!mission) return;
  for (const p of d.pl) {
    if (p.id === net.id) continue;
    const o = ensureOther(p.id);
    o.status = p.al ? 'alive' : 'downed'; applyState(o, p);
  }
  const seen = new Set();
  for (const a of d.en) {
    seen.add(a[0]);
    const e = enemyById.get(a[0]) || createEnemyProxy(a);
    e.tx = a[2]; e.tz = a[3]; e.tr = a[4]; e.hp = a[5] / 100 * e.maxHp; e.st = ST_NAME[a[6] >> 1];
  }
  for (const e of [...enemies]) if (!seen.has(e.id)) removeEnemyProxy(e, true);
  const seenP = new Set();
  for (const a of d.pr) {
    seenP.add(a[0]);
    let p = projById.get(a[0]);
    if (!p) {
      const big = a[4] & 1, bt = !!(a[4] & 2), acid = !!(a[4] & 4);
      const m = new THREE.Mesh(new THREE.SphereGeometry(acid ? 0.55 : big ? (bt ? 0.3 : 0.45) : (bt ? 0.14 : 0.28), 8, 6), new THREE.MeshBasicMaterial({ color: acid ? 0x9dff1a : bt ? (big ? 0xff3030 : 0xffb03a) : (big ? 0xff40c0 : 0xa4ff6a) }));
      m.position.set(a[1], a[2], a[3]); scene.add(m); p = { id: a[0], m, tp: new THREE.Vector3(), acid }; projById.set(a[0], p); projectiles.push(p);
      if (!bt && !acid) {
        let shooter = null, nearest = 2.4;
        for (const e of enemies) if (e.fac === 'bugs' && e.type === 'spitter') {
          const d = Math.hypot(e.mesh.position.x - a[1], e.mesh.position.z - a[3]);
          if (d < nearest) { nearest = d; shooter = e; }
        }
        if (shooter) triggerSpiderSpit(shooter);
      }
    }
    p.tp.set(a[1], a[2], a[3]);
  }
  for (const p of [...projectiles]) if (!seenP.has(p.id)) { if (p.acid && p.m.position.y < 1.5) burst(p.m.position.clone().setY(0.2), 0x9dff1a, 5, 3.5); scene.remove(p.m); projById.delete(p.id); projectiles.splice(projectiles.indexOf(p), 1); }

  const h = d.hud;
  mission.title = h.ti; mission.text = h.tx; mission.progress = h.pg; mission.livesLeft = h.ll;
  xp = h.xp; xpNeed = h.xn; level = h.lv; kills = h.kl; elapsed = h.el;
  mission.boss = h.bs ? { hp: h.bs[0], maxHp: h.bs[1], titan: !!h.bs[2] } : null;
  if (h.wp) { waypoint = waypoint || new THREE.Vector3(); waypoint.set(h.wp[0], 0, h.wp[1]); waypointHide = h.wp[2]; } else waypoint = null;
  [mods.hp, mods.count, mods.speed, mods.edmg, mods.elite] = h.md;
  $('oTitle').textContent = `${mission.title} · NV ${mission.level}`;

  const ob = d.ob;
  if (ob.gen) {
    if (!generator) generator = makeGenerator(ob.gen[0], ob.gen[1]);
    generator.hp = ob.gen[2]; generator.max = ob.gen[3]; generator.active = !!ob.gen[4];
  }
  if (ob.pods) {
    if (!pods.length) ob.pods.forEach(p => pods.push(makePod(p[0], p[1])));
    ob.pods.forEach((p, i) => { if (p[2] && !pods[i].got) { pods[i].got = true; scene.remove(pods[i].g); } });
  }
  if (ob.bea) {
    if (!beacons.length) ob.bea.forEach(b => beacons.push(makeBeacon(b[0], b[1])));
    ob.bea.forEach((b, i) => { const x = beacons[i]; x.progress = b[2]; if (b[3] && !x.done) { x.done = true; x.ring.material.color.set(0x5ce08a); x.col.material.color.set(0x5ce08a); } });
  }
  if (ob.pad && !pad) pad = makeBeacon(ob.pad[0], ob.pad[1]);
  if (ob.zone && !zoneRing) {
    zoneRing = new THREE.Mesh(new THREE.TorusGeometry(50, 0.35, 6, 120), new THREE.MeshBasicMaterial({ color: 0xf28c1f }));
    zoneRing.rotation.x = Math.PI / 2; zoneRing.position.set(ob.zone[0], 0.3, ob.zone[1]); scene.add(zoneRing);
  }
  if (zoneRing) zoneRing.material.color.set(Math.hypot(player.pos.x - zoneRing.position.x, player.pos.z - zoneRing.position.z) < 50 ? 0x4cd68a : 0xf28c1f);
  if (ob.pln) {
    if (!plane) plane = makePlane();
    const p = ob.pln;
    plane.g.position.set(p[0], p[1], p[2]); plane.yaw = p[3]; plane.g.rotation.y = p[3]; plane.g.rotation.x = p[4];
    plane.ramp.rotation.x = p[5]; plane.state = PLANE_ST[p[6]];
    if ((plane.state === 'closing' || plane.state === 'takeoff') && state !== 'cinematic' && state !== 'ended') {
      state = 'cinematic'; cinT = 0; mouseDown = false; playerGroup.visible = false; waypoint = null;
    }
  }
}
// cliente: suaviza inimigos e projéteis recebidos
function updateClientWorld(dt) {
  const k = 1 - Math.exp(-dt * 14);
  for (const e of enemies) {
    const m = e.mesh;
    const beforeX = m.position.x, beforeZ = m.position.z;
    m.position.x += (e.tx - m.position.x) * k; m.position.z += (e.tz - m.position.z) * k;
    let dr = e.tr - m.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); m.rotation.y += dr * k;
    e.phase += dt * (e.type === 'crawler' || e.type === 'bomber' ? 14 : 7);
    m.position.y = (m.userData.bot || m.userData.spider) ? 0 : Math.abs(Math.sin(e.phase)) * 0.12;
    if (e.type === 'bomber') m.scale.setScalar(e.t.scale * (1 + 0.1 * Math.sin(e.phase * 2)));
    else if (e.type === 'charger' && e.st === 'wind') m.scale.setScalar(e.t.scale * (1 + 0.04 * Math.sin(e.phase * 8)));
    animateSpider(e, dt, Math.hypot(m.position.x - beforeX, m.position.z - beforeZ) > 0.002);
    animateTitan(e, dt, Math.hypot(m.position.x - beforeX, m.position.z - beforeZ) > 0.002);
  }
  animateBots(dt);
  for (const p of projectiles) if (p.tp) p.m.position.lerp(p.tp, k);
  if (generator && generator.active) generator.core.material.emissive.set(generator.hp / generator.max < 0.3 ? 0xaa4422 : 0x2290c0);
  for (const p of pods) if (!p.got) { p.cap.rotation.y = elapsed * 2; p.cap.position.y = 1.0 + 0.15 * Math.sin(elapsed * 3); }
  for (const b of beacons) b.col.scale.x = b.col.scale.z = 1 + 0.2 * Math.sin(elapsed * 4);
}

// ── mensagens ──
function onHostMessage(from, d) {
  if (d.k === 'p') {
    const o = ensureOther(from);
    o.last = { x: d.x, z: d.z, y: d.y, mv: d.mv, mk: d.mk, ma: d.ma, ms: d.ms, rl: d.rl, fl: d.fl, ro: d.ro, rdy: d.rdy, dd: d.dd, hp: d.hp, mh: d.mh, sp: d.sp, wk: d.wk, w: d.w, bd: d.bd, ev: d.ev, st: d.st };
    applyState(o, o.last);
    if (o.status !== 'respawning' && o.status !== 'downed') o.status = d.al || state === 'cinematic' ? 'alive' : o.status;
    if (d.sh) alertNear(o.pos, 65);
    if (d.h) for (const [id, n] of d.h) { const e = enemies.find(x => x.id === id); if (e && n > 0 && n < 600) damageEnemy(e, n, from); }
  } else if (d.k === 'died') onPlayerDied(from);
  else if (d.k === 'strikeReq') { const id = uid(); addStrike(id, d.x, d.z); net.all({ k: 'strike', id, x: d.x, z: d.z }); }
  else if (d.k === 'crateReq') hostAddCrate(d.x, d.z);
  else if (d.k === 'crateGet') { const c = crates.find(x => x.id === d.id); if (c) { removeCrate(c); net.all({ k: 'crateGone', id: d.id }); } }
  else if (d.k === 'dropGet') { const c = drops.find(x => x.id === d.id); if (c) { removeDrop(c); net.all({ k: 'dropGone', id: d.id }); } }
}
function onClientMessage(from, d) {
  switch (d.k) {
    case 's': if (['playing', 'loot', 'dying', 'downed', 'cinematic'].includes(state)) applySnapshot(d); break;
    case 'start': clientStartMission(d); break;
    case 'say': say(d.text, d.secs); break;
    case 'objdone': showObjectiveDone(d.title, d.text, d.kick); break;
    case 'fx': if (d.t === 'boom') boomFx(new THREE.Vector3(d.x, 0, d.z), d.r); break;
    case 'crate': addCrate(d.id, d.x, d.z); break;
    case 'crateGone': { const c = crates.find(x => x.id === d.id); if (c) removeCrate(c); break; }
    case 'drop': addDrop(d.id, d.type, d.x, d.z); break;
    case 'dropGone': { const c = drops.find(x => x.id === d.id); if (c) removeDrop(c); break; }
    case 'strike': addStrike(d.id, d.x, d.z); beep(300, 0.3, 0.08); break;
    case 'turret': addTurret(d.id, d.x, d.z, 42); break;
    case 'turretGone': { const T = turrets.find(x => x.id === d.id); if (T) { scene.remove(T.g); turrets.splice(turrets.indexOf(T), 1); } break; }
    case 'loot': startLootRemote(d); break;
    case 'buff': applyBuff(d.id); break;
    case 'dmg': damagePlayer(d.n); break;
    case 'respawn': respawnPlayer(new THREE.Vector3(d.x, 0, d.z)); break;
    case 'downed': break;                                   // a tela já mostra que você caiu
    case 'end': finishMission(); presentResults(d); break;
    case 'abort': finishMission(); clearWorld(); $('menu').classList.remove('hidden'); $('resume').style.display = 'none'; $('abort').style.display = 'none'; $('sub').textContent = 'O host abandonou a operação.'; renderAll(); break;
  }
}
net.onMessage = (from, d) => { if (net.role === 'host') onHostMessage(from, d); else if (net.role === 'client') onClientMessage(from, d); };
function sendLateStart(id) {                       // alguém entrou no esquadrão com a operação em andamento
  const o = ensureOther(id), at = spawnRing(player.pos.clone().setY(0), 1 + Object.keys(others).length);
  o.status = 'alive'; o.pos.copy(at); o.tp.copy(at); o.seen = 0; o.last = null; o.bd = false; o.st = {}; o.group.visible = true;
  net.to(id, { ...startBase, spawn: { [id]: [r1(at.x), r1(at.z), r2(player.yaw)] }, lives: mission.livesLeft || 0, mods: [mods.hp, mods.count, mods.speed, mods.edmg, mods.elite] });
  lateSent.add(id); say(`${rosterName(id)} entrou no esquadrão!`, 2.5);
}
net.onRoster = () => {
  if (net.role === 'host' && startBase && mission && missionBusy()) {
    const np = net.roster.length; party = { hp: 1 + 0.45 * (np - 1), count: 1 + 0.5 * (np - 1), dmg: 1 + 0.08 * (np - 1) };   // a escala invisível acompanha o esquadrão
    for (const p of net.roster) if (p.id !== net.id && !lateSent.has(p.id)) sendLateStart(p.id);
  }
  if (AUTH.user) for (const p of net.roster) if (p.id !== net.id) addRecent(p.name);
  const ids = new Set(net.roster.map(p => p.id));
  for (const id of Object.keys(others)) if (!ids.has(+id)) removeOther(+id);
  for (const p of net.roster) { const o = others[p.id]; if (o && o.name !== p.name) { o.name = p.name; setNameTag(o.group, p.name); } }
  renderOnline(); renderOps();
  if (!missionBusy() && state !== 'ended') $('sub').textContent = net.role === 'solo' ? 'Pronto para o deploy.' : `Sala ${net.code} · ${net.roster.length} jogador(es)`;
};
net.onClosedChat = () => { if (CHAT.hist) CHAT.hist.sq = []; };
net.onLeft = id => { removeOther(id); delete respawnTimers[id]; lateSent.delete(id); };
net.onClosed = msg => {
  if (missionBusy() || uiOpen) { finishMission(); clearWorld(); }
  net.onClosedChat(); clearOthers(); state = state === 'ended' ? 'ended' : 'menu';
  $('menu').classList.remove('hidden'); $('resume').style.display = 'none'; $('abort').style.display = 'none';
  $('sub').textContent = msg; renderAll();
};

async function clientStartMission(d) {
  ensureAudio();
  await loadSpider(); if ((d.level || 1) >= TITAN_MIN_LEVEL && d.faction !== 'bots') await loadTitan();
  if (missionBusy()) { clearWorld(); }
  relax = !!d.relax;
  campaignCell = d.cell || null; campaignRemote = !!d.remote; campSector = d.sector || null; mixFac = null; clientMixed = false;
  curFaction = d.faction === 'bots' ? 'bots' : 'bugs';
  loadBots().catch(() => {});
  if (curFaction === 'bots') loadBots().catch(() => {});
  clearWorld();
  applyBiome(d.biome);
  opLayout = null;
  buildTerrain(d.R, 0, [], d.rocks);
  kills = 0; elapsed = 0; shake = 0;
  [mods.hp, mods.count, mods.speed, mods.edmg, mods.elite] = d.mods;
  xp = 0; level = 1; xpNeed = 60; pendingLoot = 0; buffs = { dmg: 0, shield: 0 };
  stats = { shots: 0, hits: 0, supplies: 0, orbitals: 0, deaths: 0 };
  resetLocalPlayer();
  mission = { id: d.id, title: d.title, text: '', progress: 0, lives: d.lives, livesLeft: d.lives, par: d.par, level: d.level, boss: null, update: null, onKill: null };
  for (const p of net.roster) if (p.id !== net.id) { const o = ensureOther(p.id); o.status = 'alive'; o.seen = 0; o.last = null; o.ev = null; o.bd = false; o.st = {}; o.group.visible = true; resetRig(o.rig); }
  const sp = d.spawn[net.id];
  if (sp) { player.pos.set(sp[0], 0, sp[1]); player.yaw = sp[2]; }
  checkpoint.copy(player.pos);
  afterMissionBuilt(d.id);
  state = 'playing'; uiOpen = true;
  if (isTouch) captureInput();
  else $('clickGo').classList.add('on');                    // o navegador exige um clique para capturar o mouse
  say('Operação iniciada!', 3);
}

// ── barra de equipe e lobby ──
function updateParty(dt) {
  partyT -= dt; if (partyT > 0) return; partyT = 0.3;
  const list = Object.values(others);
  $('party').innerHTML = list.map(o => {
    const pct = Math.max(0, Math.min(100, (o.hp || 0) / (o.mh || 100) * 100));
    return `<div class="pm ${o.st.dd ? 'dead' : ''}"><b>${o.name}</b><div class="meter"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
}
let onlTab = 'map';
const onlineTabIsMap = () => !!$('onlMap') && $('pane-online').classList.contains('on');
function squadBar() {
  if (net.role === 'solo') return '';
  const members = net.roster.map(p => `<span class="sq-m">${p.host ? '★ ' : ''}${esc(p.name)}${p.id === net.id ? ' (você)' : ''}</span>`).join('');
  return `<div class="squadbar"><div><small>${net.role === 'host' ? 'SEU ESQUADRÃO' : 'ESQUADRÃO DE ' + esc((net.roster.find(p => p.host) || {}).name || '')} · ${net.roster.length}/4 · código ${net.code}</small><div>${members}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${net.role === 'host' && AUTH.user ? `<select id="sqPolicy" class="field" style="width:auto;font-size:12px;padding:6px 8px" title="Quem pode entrar"><option value="open">Aberto</option><option value="friends">Só amigos</option><option value="closed">Fechado</option></select>` : ''}
    <button class="btn ghost" id="leaveBtn" style="padding:7px 16px;font-size:12px">Sair do esquadrão</button></div></div>`;
}
function renderOnline(force) {
  const pane = $('pane-online'); if (!pane) return;
  if (!force && pane.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  if (AUTH.enabled && !AUTH.user) {
    pane.innerHTML = `<h2 class="sec">Modo online</h2><div class="camp-box" style="max-width:560px"><h4>Entre para jogar online</h4>
      <p>No modo online todos os jogadores disputam o <b>mesmo mapa</b>: cada setor mostra a porcentagem de domínio e muda ao vivo. Você pode jogar sozinho ou entrar no esquadrão de outras pessoas,
      adicionar amigos e convidá-los. Só precisa de usuário e senha.</p><button class="btn primary" id="onlLogin">Entrar ou criar conta</button></div>`;
    $('onlLogin').onclick = () => showAuth('', 'online'); return;
  }
  const curTab = AUTH.enabled ? onlTab : 'code';
  const tabs = AUTH.enabled ? [['map', 'MAPA ONLINE'], ['friends', 'AMIZADES' + (FR.incoming.length ? ` (${FR.incoming.length})` : '') + (Object.values(CHAT.unread || {}).reduce((x, y) => x + y, 0) ? ' ●' : '')], ['code', 'SALA POR CÓDIGO']] : [['code', 'SALA POR CÓDIGO']];
  pane.innerHTML = `<div class="subnav">${tabs.map(([id, l]) => `<button data-ot="${id}" class="${id === curTab ? 'on' : ''}">${l}</button>`).join('')}</div>${squadBar()}<div id="onlBody"></div><div id="onlineMsg" class="onlinemsg"></div>`;
  pane.querySelectorAll('[data-ot]').forEach(b => { b.onclick = () => { onlTab = b.dataset.ot; renderOnline(true); }; });
  if ($('leaveBtn')) $('leaveBtn').onclick = () => { net.leave(); clearOthers(); $('sub').textContent = 'Pronto para o deploy.'; renderAll(); showTab('online'); };
  if ($('sqPolicy')) { $('sqPolicy').value = squadPolicy; $('sqPolicy').onchange = e => { squadPolicy = e.target.value; net.send({ t: 'sq:policy', policy: squadPolicy }); }; }
  const body = $('onlBody');
  if (curTab === 'map') { body.innerHTML = '<div id="onlMap"></div>'; renderCampaign(WNET); }
  else if (curTab === 'friends') renderFriends(body);
  else renderCodeRooms(body);
}
function renderCodeRooms(el) {
  const inRoom = net.role !== 'solo';
  const roster = net.roster.map(p => `<div class="pm-row"><span>${p.host ? '★ ' : ''}${esc(p.name)}${p.id === net.id ? ' (você)' : ''}</span><i>${p.host ? 'HOST' : 'JOGADOR'}</i></div>`).join('');
  el.innerHTML = `
    <h2 class="sec">Sala por código · até 4 jogadores · só entra quem tem o código do host</h2>
    <div class="grid">
      <div class="card">
        <small class="k">PERFIL</small><h4>Seu nome</h4>
        <p>Seu nome aparece sobre a sua cabeça para os outros jogadores.</p>
        ${AUTH.user ? `<b style="color:var(--accent);letter-spacing:2px">${esc(AUTH.user.name)}</b>` : `<input class="field" id="nameIn" maxlength="16" placeholder="Seu nome" value="${(save.name || '').replace(/"/g, '')}" ${inRoom ? 'disabled' : ''}>`}
      </div>
      ${inRoom ? `
      <div class="card">
        <small class="k">${net.role === 'host' ? 'VOCÊ É O HOST' : 'CONECTADO'}</small><h4>Sala</h4>
        <div class="roomcode" id="roomCode">${net.code}</div>
        <p>${net.role === 'host' ? 'Passe este código aos amigos. Depois escolha a operação em PARTIDA LIVRE (ou ataque um setor no MAPA ONLINE).' : 'Aguarde o host iniciar a operação.'}</p>
        <div class="pm-list">${roster}</div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">${net.role === 'host' ? '<button class="btn" id="copyBtn">Copiar código</button>' : ''}</div>
      </div>` : `
      <div class="card">
        <small class="k">HOST</small><h4>Criar sala</h4>
        <p>Você roda o mundo e escolhe a operação. Os outros jogadores entram com o código.</p>
        <button class="btn primary" id="hostBtn">Criar sala</button>
      </div>
      <div class="card">
        <small class="k">CÓDIGO</small><h4>Entrar na sala de um amigo</h4>
        <p>Digite o código de 5 caracteres que o host enviou.</p>
        <input class="field code" id="codeIn" maxlength="5" placeholder="ABCDE">
        <button class="btn primary" id="joinBtn" style="margin-top:10px">Entrar</button>
      </div>`}
    </div>`;
  const msg = t => { const e2 = $('onlineMsg'); if (e2) e2.textContent = t; };
  const nm = $('nameIn');
  if (nm) nm.oninput = () => { save.name = nm.value.replace(/[<>]/g, '').slice(0, 16); persist(); setNameTag(playerGroup, myName()); };
  const doRoom = async fn => {
    if (missionBusy()) return;
    if (nm) { save.name = nm.value.trim().slice(0, 16) || 'Jogador'; persist(); }
    msg('Conectando…');
    try { await fn(); renderAll(); showTab('online'); } catch (e) { msg(e.message || 'Falha ao conectar.'); }
  };
  if ($('hostBtn')) $('hostBtn').onclick = () => doRoom(() => net.host(myName()));
  if ($('joinBtn')) $('joinBtn').onclick = () => doRoom(() => net.join(($('codeIn').value || '').trim().toUpperCase(), myName()));
  if ($('codeIn')) $('codeIn').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  if ($('copyBtn')) $('copyBtn').onclick = () => { try { navigator.clipboard.writeText(net.code); msg('Código copiado!'); } catch { msg('Código: ' + net.code); } };
}

// ───────────────────────── Validador de versão ─────────────────────────
// O servidor entrega a versão carregada na página e publica a versão atual em /version.json. Quando elas diferem, o modal de
// atualização só aparece para quem está no menu principal; quem está jogando (ou pausado no jogo) nunca é interrompido.
const loadedVersion = (document.querySelector('meta[name="app-version"]') || {}).content || '';
net.version = loadedVersion === '__VERSION__' ? '' : loadedVersion;
let newVersion = null, updDismissedAt = 0;
async function checkVersion() {
  if (!net.version) return;                                   // aberto fora do servidor (arquivo local): nada a validar
  try {
    const j = await (await fetch('/version.json', { cache: 'no-store' })).json();
    if (j.version && j.version !== net.version) newVersion = j.version;
  } catch { /* sem rede: tenta de novo depois */ }
}
const atMainMenu = () => ['menu', 'ended'].includes(state) && !uiOpen && !missionBusy() &&
  !$('menu').classList.contains('hidden') && !$('results').classList.contains('on');
function updateModalTick() {
  const modal = $('updateModal');
  if (newVersion && atMainMenu() && Date.now() - updDismissedAt > 10 * 60 * 1000) {
    $('updText').textContent = 'Saiu uma versão nova do Multipunk. Atualize a página para jogar com as novidades.' + (net.role !== 'solo' ? ' Você vai sair da sala online atual.' : '');
    modal.classList.add('on');
  } else modal.classList.remove('on');
}
$('updNow').onclick = () => location.reload();
$('updLater').onclick = () => { updDismissedAt = Date.now(); $('updateModal').classList.remove('on'); };
setInterval(checkVersion, 30000);
setInterval(updateModalTick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
setTimeout(checkVersion, 3000);

// ───────────────────────── Loop ─────────────────────────
let lastFrame = performance.now();
let cursorOn = null;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(); tick(Math.min(0.05, (now - lastFrame) / 1000)); lastFrame = now;
  const want = !isTouch && (state === 'menu' || state === 'paused' || state === 'ended');
  if (want !== cursorOn) { cursorOn = want; window.__cursor && window.__cursor.show(want); }
  renderer.render(scene, camera);
}

let lastModSec = -1;
// host/solo: mundo, inimigos e missão
function simStep(dt) {
  elapsed += dt;
  spawnLogic(dt);
  updatePlatoons(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateTurrets(dt);
  mission.update(dt);
  updateEffects(dt);
  hostTimers(dt);
  if (Math.floor(elapsed) !== lastModSec) { lastModSec = Math.floor(elapsed); refreshMods(); }
}
function followSun() { sun.position.set(player.pos.x + 40, 60, player.pos.z + 20); sun.target.position.copy(player.pos); }

function tick(dt) {
  if (net.role === 'client' && mission && ['playing', 'loot', 'dying', 'downed', 'cinematic'].includes(state)) return tickClient(dt);
  if (state === 'playing') {
    updatePlayer(dt);
    updateCamera();
    updateOthers(dt);
    simStep(dt);
    updateHud(); updateParty(dt); netHost(dt);
    followSun();
  } else if (state === 'loot') {
    player.moving = false;
    animate(dt);
    updateCamera();
    updateOthers(dt);
    updateLoot(dt);
  } else if (state === 'cinematic') {
    updateCinematic(dt);
    updateOthers(dt);
    updateEffects(dt);
    netHost(dt);
  } else if (state === 'dying' || state === 'downed') {
    animate(dt);
    updateCamera();
    updateOthers(dt);
    simStep(dt);
    updateHud(); updateParty(dt); netHost(dt);
    if (state === 'dying') { dyingT -= dt; if (dyingT <= 0) state = 'downed'; }
  } else {
    // Câmera lenta orbitando no menu
    const a = performance.now() / 8000;
    camera.position.set(Math.cos(a) * 30, 10, Math.sin(a) * 30);
    camera.lookAt(0, 2, 0);
  }
}

// cliente: o host simula; aqui só entram o jogador local, a interpolação e os efeitos
function tickClient(dt) {
  updateClientWorld(dt); updateOthers(dt); updateEffects(dt); updateTurrets(dt);
  if (state === 'playing') {
    elapsed += dt; updatePlayer(dt); updateCamera(); localBoardingCheck(); updateHud(); updateParty(dt);
  } else if (state === 'loot') {
    player.moving = false; animate(dt); updateCamera(); updateLoot(dt);
  } else if (state === 'dying' || state === 'downed') {
    animate(dt); updateCamera(); updateHud(); updateParty(dt);
    if (state === 'dying') { dyingT -= dt; if (dyingT <= 0) state = 'downed'; }
  } else if (state === 'cinematic') updateCinematic(dt);
  sendClientState(dt);
  followSun();
}

buildMenu();
loop();

// Gancho para testes automatizados e futuro multiplayer (estado serializável)
window.__freedivers = window.__multipunk = {
  get save() { return save; }, loadTitan, WLOC, WNET, WMAP, GEO, CHAT: () => CHAT, AUTH, WL, FR: () => FR, campaignResult, campMinLevel, attackable, cellMission, missionUnlocked, get party() { return party; }, toast,
  player, keys, tick, startMission, setFaction, settings, get curFaction() { return curFaction; }, loadBots, botsReady,
  get enemies() { return enemies; }, get state() { return state; }, get kills() { return kills; },
  get mission() { return mission; }, setMouse(v) { mouseDown = v; },
  get camPos() { return camPos; }, get rocks() { return rocks; }, get generator() { return generator; }, get strikes() { return strikes; }, switchWeapon, callStrike, spawnEnemy, damageEnemy, get pods() { return pods; }, endMission, get save() { return save; }, get level() { return level; }, get mods() { return mods; }, addXp, get platoons() { return platoons; }, get plane() { return plane; }, get opLayout() { return opLayout; }, get stats() { return stats; }, get xpNeed() { return xpNeed; }, respawnPlayer, abortMission, computeScore, get checkpoint() { return checkpoint; }, get loadedVersion() { return net.version; }, checkVersion, get newVersion() { return newVersion; }, updateModalTick, net, others, get enemyById() { return enemyById; }, get crates() { return crates; }, get drops() { return drops; }, get turrets() { return turrets; }, get uiOpen() { return uiOpen; }, buildSnapshot, applySnapshot, killsBy: () => killsBy, set stateX(v) { state = v; }, get wts() { return wts; }, damage: n => damagePlayer(n), get beacons() { return beacons; }, get pad() { return pad; },
};
