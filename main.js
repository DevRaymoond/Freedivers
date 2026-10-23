import * as THREE from 'three';
import { GLTFLoader } from './lib/jsm/loaders/GLTFLoader.js';

// ───────────────────────── Configuração ─────────────────────────
let ARENA_R = 95;
const PLAYER = { speed: 7, sprint: 10.5, walk: 3.4, rollSpeed: 18, rollTime: 0.45, rollCooldown: 1.0, maxHp: 100 };
const WEAPONS = [
  { id: 'smg', name: 'SMG-9 Bombeiro', mag: 30, reserveMax: 240, reserve0: 180, rate: 11, dmg: 12, spread: 0.012, reload: 1.6, range: 120, pellets: 1, auto: true, recoil: 0.004 },
  { id: 'shotgun', name: 'Escopeta Rajada', mag: 6, reserveMax: 48, reserve0: 30, rate: 1.4, dmg: 11, spread: 0.075, reload: 2.2, range: 40, pellets: 9, auto: false, recoil: 0.035 },
  { id: 'dmr', name: 'Marksman Lança', mag: 10, reserveMax: 70, reserve0: 40, rate: 2.6, dmg: 52, spread: 0.002, reload: 1.9, range: 220, pellets: 1, auto: false, recoil: 0.022 },
];
const SUPPLY_COOLDOWN = 35, STRIKE_COOLDOWN = 60;

const ENEMY_TYPES = {
  crawler: { hp: 30, speed: 6.2, dmg: 9, radius: 0.9, height: 0.8, scale: 1, color: 0x8a2b22 },
  spitter: { hp: 45, speed: 3.4, dmg: 12, radius: 1.0, height: 1.3, scale: 1.1, color: 0x3d7a34 },
  brute:   { hp: 450, speed: 3.6, dmg: 28, radius: 2.0, height: 2.0, scale: 2.4, color: 0x4a3a66 },
  bomber:  { hp: 40, speed: 5.4, dmg: 35, radius: 0.9, height: 0.9, scale: 1, color: 0xb8651f },
  charger: { hp: 150, speed: 4.2, dmg: 32, radius: 1.3, height: 1.1, scale: 1.5, color: 0x56697a },
  queen:   { hp: 1800, speed: 2.7, dmg: 38, radius: 3.4, height: 3.0, scale: 4.4, color: 0x6a2b6f },
};

const MISSIONS = [
  { id: 'operation', title: 'Operação Gerador', tag: 'CAMPANHA', danger: 4, par: 16, biome: 'desert',
    desc: 'Seu esquadrão pousa longe do objetivo. Atravesse o território dominado pelo enxame, ative e defenda o gerador contra 8 ondas, siga até a zona de extração, aguente 1:30 e embarque na nave pela rampa traseira.',
    phases: ['Deslocamento', 'Defender o gerador · 8 ondas', 'Zona de extração · 1:30', 'Embarque'] },
  { id: 'purge', title: 'Limpeza do setor', tag: 'RÁPIDA', danger: 2, par: 6, biome: 'desert', desc: 'Seis ondas seguindo a sequência de Fibonacci: 5, 8, 13, 21, 34 e 55 inimigos. Limpe uma onda para a próxima chegar.', phases: ['Ondas: 5 · 8 · 13 · 21 · 34 · 55'] },
  { id: 'samples', title: 'Coleta de amostras', tag: 'RÁPIDA', danger: 2, par: 5, biome: 'ice', desc: 'Recolha 6 cápsulas pelo gelo. Cada uma atrai uma onda do enxame.', phases: ['Coletar 6 cápsulas'] },
  { id: 'beacon', title: 'Faróis de comunicação', tag: 'RÁPIDA', danger: 2, par: 5, biome: 'toxic', desc: 'Ative 3 faróis ficando dentro do círculo enquanto o enxame ataca.', phases: ['Ativar 3 faróis'] },
  { id: 'defend', title: 'Defesa do gerador', tag: 'RÁPIDA', danger: 3, par: 4, biome: 'ice', desc: 'Proteja o gerador por 2 minutos. Bombardeiros e investidores miram nele.', phases: ['Resistir 2 minutos'] },
  { id: 'extract', title: 'Extração sob fogo', tag: 'RÁPIDA', danger: 3, par: 5, biome: 'volcanic', desc: 'Derrube 2 brutamontes e alcance a zona de extração.', phases: ['2 brutamontes', 'Extração'] },
  { id: 'queen', title: 'Rainha da colmeia', tag: 'CHEFE', danger: 5, par: 6, biome: 'volcanic', desc: 'Chefe: derrube a Rainha enquanto ela invoca o enxame.', phases: ['Derrotar a Rainha'] },
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
const upgCost = l => 500 + 250 * l;
function loadSave() {
  try { return Object.assign({ credits: 0, upg: {}, best: {} }, JSON.parse(localStorage.getItem('freedivers_save') || '{}')); }
  catch { return { credits: 0, upg: {}, best: {} }; }
}
let save = loadSave();
function persist() { try { localStorage.setItem('freedivers_save', JSON.stringify(save)); } catch { /* sem armazenamento */ } }
const lvl = id => (save.upg && save.upg[id]) || 0;
const maxHp = () => PLAYER.maxHp + 5 * lvl('hp');
const reserveCap = w => Math.round(w.reserveMax * (1 + 0.05 * lvl('ammo')));
const XP_VALUES = { crawler: 6, spitter: 10, bomber: 12, charger: 26, brute: 60, queen: 400 };

// ───────────────────────── Cena ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
let rockMeshes = [], spireMeshes = [];
function buildTerrain(R, count, avoid = []) {
  rockMeshes.forEach(m => scene.remove(m)); spireMeshes.forEach(m => scene.remove(m));
  rockMeshes = []; spireMeshes = []; rocks.length = 0;
  ARENA_R = R;
  let tries = 0;
  while (rockMeshes.length < count && tries++ < count * 30) {
    const r = 1.2 + Math.random() * 2.6;
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * (R - 14);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some(v => Math.hypot(v.x - x, v.z - z) < v.r + r)) continue;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.position.set(x, r * 0.6, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.castShadow = m.receiveShadow = true;
    scene.add(m); rockMeshes.push(m);
    rocks.push({ x, z, r: r * 0.9, y: m.position.y });
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
const playerGroup = new THREE.Group();
{
  const armor = new THREE.MeshStandardMaterial({ color: 0x2f4f6f, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xffcf3f, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 10), armor);
  body.position.y = 0.95;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), trim);
  helmet.position.y = 1.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  visor.position.set(0, 1.8, -0.22);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 1.0), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  gun.position.set(0.32, 1.25, -0.6);
  [body, helmet, visor, gun].forEach(m => { m.castShadow = true; playerGroup.add(m); });
}
scene.add(playerGroup);

// Personagem principal: modelo riggado com dedos (tools/build_final.py). A animação é em camadas:
//  - baixo (pernas/quadril): LowIdle ou Walk_/Run_ em 8 direções, misturadas pelo ângulo do movimento em relação à mira
//  - cima (tronco/braços/dedos): Aim, Reload, Shoot, Hit  → o personagem corre em 360° sem tirar a mira da direção
//  - corpo todo: Dash e Death por cima de tudo
let mixer = null;
const actions = {};
const wts = {};                          // peso suavizado de cada clipe
const DIRS = [0, 45, 90, 135, 180, 225, 270, 315];
const ONCE = ['Reload', 'Shoot', 'Hit', 'Dash', 'Death'];
const LOWER = ['LowIdle', ...['Walk', 'Run'].flatMap(k => DIRS.map(d => `${k}_${d}`))];
const UPPER = ['Aim', 'Reload', 'Shoot', 'Hit'];
const NOMINAL = { Run: 7, Walk: 3.4 };   // velocidade (m/s) em que o ciclo de passos está calibrado
let locoPhase = 0, fullW = 0;
try {
  const gltf = await new GLTFLoader().loadAsync('./assets/character.glb');
  const model = gltf.scene;
  model.rotation.y = Math.PI;                    // o modelo olha para +Z; o jogo olha para -Z
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  playerGroup.clear();
  playerGroup.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (ONCE.includes(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (/^(Walk|Run)_/.test(clip.name)) a.paused = true;     // o tempo dos passos é controlado por locoPhase
    a.setEffectiveWeight(0);
    a.play();
    actions[clip.name] = a;
    wts[clip.name] = 0;
  }
  wts.Aim = 1; wts.LowIdle = 1;
} catch (err) {
  console.warn('Não foi possível carregar o personagem, usando o modelo simples.', err);
}

function trigger(name, timeScale = 1) {
  const a = actions[name];
  if (!a) return;
  a.reset(); a.timeScale = timeScale; a.play();
}
const approach = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
function resetAnimation() {
  if (!mixer) return;
  for (const k in wts) wts[k] = 0;
  wts.Aim = 1; wts.LowIdle = 1; fullW = 0; locoPhase = 0;
}

function animate(dt) {
  if (!mixer) return;
  const dead = state === 'dying';
  const full = dead || player.rolling > 0;
  fullW = approach(fullW, full ? 1 : 0, dt, dead ? 10 : player.rolling > 0 ? 30 : 18);

  // camada de baixo
  const lt = Object.fromEntries(LOWER.map(n => [n, 0]));
  if (player.moving && !dead) {
    const kind = player.moveKind, al = player.moveAlpha;
    const i = Math.floor(al / 45) % 8, j = (i + 1) % 8, fr = (al % 45) / 45;
    lt[`${kind}_${DIRS[i]}`] += 1 - fr; lt[`${kind}_${DIRS[j]}`] += fr;
  } else lt.LowIdle = 1;
  let sum = 0;
  for (const n of LOWER) { wts[n] = approach(wts[n], lt[n], dt, 14); sum += wts[n]; }
  // camada de cima
  const reloading = player.reloading > 0, flashing = player.flash > 0 && !reloading, hit = player.hitT > 0;
  const ut = { Reload: reloading ? 1 : 0, Shoot: flashing ? 1 : 0, Hit: hit ? 1 : 0 };
  ut.Aim = 1 - Math.max(ut.Reload, ut.Shoot, ut.Hit);
  let usum = 0;
  for (const n of UPPER) { wts[n] = approach(wts[n], ut[n], dt, n === 'Aim' ? 12 : 22); usum += wts[n]; }

  // ciclo de passos compartilhado entre andar/correr para não escorregar na troca
  let wr = 0, ww = 0;
  for (const d of DIRS) { wr += wts[`Run_${d}`]; ww += wts[`Walk_${d}`]; }
  if (wr + ww > 0.01) {
    const cps = (wr / 0.62 + ww / 1.1) / (wr + ww);
    locoPhase = (locoPhase + dt * cps * (player.moveScale || 1)) % 1;
  }

  const rest = 1 - fullW;
  for (const n of LOWER) {
    const a = actions[n]; if (!a) continue;
    a.setEffectiveWeight(sum > 0 ? wts[n] / sum * rest : 0);
    if (n !== 'LowIdle') a.time = locoPhase * a.getClip().duration;
  }
  for (const n of UPPER) actions[n].setEffectiveWeight(usum > 0 ? wts[n] / usum * rest : 0);
  actions.Dash.setEffectiveWeight(dead ? 0 : fullW);
  actions.Death.setEffectiveWeight(dead ? fullW : 0);
  mixer.update(dt);
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
let mods = { hp: 1, count: 1, speed: 1, edmg: 1, elite: 0 };            // dificuldade acumulada pelo sorteio de nível
let xp = 0, level = 1, xpNeed = 60, pendingLoot = 0, lootRun = null;
let platoons = [], turrets = [], waypoint = null, opLayout = null, zoneRing = null, plane = null;
const checkpoint = new THREE.Vector3();
let stats = { shots: 0, hits: 0, supplies: 0, orbitals: 0, deaths: 0 };
let buffs = { dmg: 0, shield: 0 };
let cinT = 0;
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
  $('msg').textContent = text;
  $('msg').classList.add('on');
  msgTimer = secs;
}

// Áudio procedural (sem arquivos)
let audio = null;
function ensureAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
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
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
function beep(freq, dur, gain = 0.08) {
  if (!audio) return;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
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
function makeEnemyMesh(type) {
  const t = ENEMY_TYPES[type];
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
  const t = ENEMY_TYPES[type];
  const mesh = makeEnemyMesh(type);
  let p = atPos;
  if (!p) {
    const a = Math.random() * Math.PI * 2;
    let d = rand(45, 70);
    p = new THREE.Vector3(player.pos.x + Math.cos(a) * d, 0, player.pos.z + Math.sin(a) * d);
    const len = Math.hypot(p.x, p.z);
    if (len > ARENA_R - 3) p.multiplyScalar((ARENA_R - 3) / len);
  }
  mesh.position.copy(p);
  let hp = t.hp * (relax ? 0.8 : 1) * mods.hp * (opts.hpMul || 1);
  const elite = type !== 'queen' && type !== 'brute' && Math.random() < mods.elite;
  if (elite) {
    hp *= 2.4; mesh.scale.multiplyScalar(1.25);
    mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.set(0x7a3a00); });
  }
  scene.add(mesh);
  const e = {
    type, t, mesh, hp, maxHp: hp, atkCd: rand(0, 0.5), shootCd: rand(1, 2.5), phase: Math.random() * 6,
    st: 'walk', stT: rand(1.5, 3), volleyCd: 3, summonCd: 10, spd: mods.speed, elite,
    pl: opts.pl || null, wave: opts.wave || 0, alert: !!opts.alert, slot: opts.slot || 0,
  };
  enemies.push(e);
  return e;
}

function pickEnemyType() {
  const t = elapsed, r = Math.random();
  const pB = t > 20 ? 0.09 : 0, pC = t > 45 ? 0.07 : 0, pS = 0.22;
  if (r < pB) return 'bomber';
  if (r < pB + pC) return 'charger';
  if (r < pB + pC + pS) return 'spitter';
  return 'crawler';
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
  return { g, core, x, z, hp: 1400, max: 1400, active: false };
}
function damageGenerator(n) {
  if (!generator || generator.hp <= 0 || !generator.active) return;
  generator.hp -= n * (relax ? 0.45 : 0.7);
  generator.core.material.emissive.set(0xff3030);
  setTimeout(() => generator && generator.core.material.emissive.set(0x2290c0), 120);
  if (generator.hp <= 0) { generator.hp = 0; say('O gerador caiu!', 3); endMission(false); }
}

function addFlash(pos, radius, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  m.position.copy(pos).setY(Math.max(0.6, pos.y));
  scene.add(m);
  flashes.push({ m, t: 0.4, max: 0.4, radius });
}
function explode(pos, radius, playerDmg, enemyDmg) {
  addFlash(pos, radius, 0xffa040);
  burst(pos.clone().setY(1), 0xffa040, 30, 9);
  noise(0.35, 0.3, 700);
  shake = Math.max(shake, 0.5);
  alertNear(pos, 80);
  const dp = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
  if (dp < radius) damagePlayer(playerDmg * (1 - 0.5 * dp / radius));
  if (generator && Math.hypot(generator.x - pos.x, generator.z - pos.z) < radius + 2.5) damageGenerator(playerDmg * 2);
  for (const o of [...enemies]) {
    if (o.mesh.position.distanceTo(pos) < radius) damageEnemy(o, enemyDmg);
  }
}

function damageEnemy(e, amount) {
  if (!enemies.includes(e)) return;
  if (e.pl && e.pl.state === 'patrol') alertPlatoon(e.pl);
  e.hp -= amount;
  if (e.hp <= 0) killEnemy(e);
}

function maybeDrop(pos) {
  if (Math.random() > 0.14) return;
  const type = Math.random() < 0.5 ? 'hp' : 'ammo';
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: type === 'hp' ? 0x5ce08a : 0xffcf3f }));
  m.position.copy(pos).setY(0.7);
  scene.add(m);
  drops.push({ m, type, t: 22 });
}

function killEnemy(e) {
  if (!enemies.includes(e)) return;
  burst(e.mesh.position.clone().setY(e.t.height), e.type === 'spitter' ? 0xa4ff6a : 0xc23b2a, e.type === 'brute' || e.type === 'queen' ? 40 : 14, 6);
  scene.remove(e.mesh);
  enemies.splice(enemies.indexOf(e), 1);
  kills++;
  $('kills').textContent = 'Abates: ' + kills;
  if (e.type === 'bomber') explode(e.mesh.position, 5.5, 35, 70);
  else maybeDrop(e.mesh.position);
  addXp((XP_VALUES[e.type] || 5) * (e.elite ? 2 : 1));
  mission.onKill?.(e);
}

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
  const pl = { members: [], anchor: center.clone().setY(0), wps: opts.wps || [], wi: 0, state: opts.alert ? 'alert' : 'patrol', speed: 2.3, heading: rand(0, Math.PI * 2), msgT: 0 };
  types.forEach((t, i) => {
    const e = spawnEnemy(t, pl.anchor.clone().add(formationOffset(i, pl.heading)), { pl, wave: opts.wave, alert: !!opts.alert, slot: i, hpMul: opts.hpMul });
    pl.members.push(e);
  });
  platoons.push(pl);
  return pl;
}
function alertPlatoon(pl, depth = 0) {
  if (pl.state === 'alert') return;
  pl.state = 'alert';
  pl.members.forEach(e => { e.alert = true; });
  if (elapsed - lastAlertMsg > 4) { lastAlertMsg = elapsed; say('Pelotão inimigo alertado!', 1.6); beep(160, 0.25, 0.08); }
  if (depth < 2) for (const o of platoons) {
    if (o.state === 'patrol' && o.anchor.distanceTo(pl.anchor) < 36) alertPlatoon(o, depth + 1);
  }
}
let lastAlertMsg = -10;
function alertNear(pos, radius) {
  for (const pl of platoons) if (pl.state === 'patrol' && Math.hypot(pl.anchor.x - pos.x, pl.anchor.z - pos.z) < radius) alertPlatoon(pl);
}
function updatePlatoons(dt) {
  for (const pl of [...platoons]) {
    pl.members = pl.members.filter(e => enemies.includes(e));
    if (!pl.members.length) { platoons.splice(platoons.indexOf(pl), 1); continue; }
    if (pl.state !== 'patrol') continue;
    if (pl.wps.length) {
      const tgt = pl.wps[pl.wi], dx = tgt.x - pl.anchor.x, dz = tgt.z - pl.anchor.z, d = Math.hypot(dx, dz);
      if (d < 2) pl.wi = (pl.wi + 1) % pl.wps.length;
      else { pl.anchor.x += dx / d * pl.speed * dt; pl.anchor.z += dz / d * pl.speed * dt; pl.heading = Math.atan2(dx, dz); }
    }
    const reach = PL_DETECT * (player.sprinting ? 1.35 : keys.KeyC ? 0.65 : 1);
    if (pl.members.some(e => e.mesh.position.distanceTo(player.pos) < reach)) alertPlatoon(pl);
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
    { name: 'Emboscada!', desc: 'Um pelotão ataca você agora', apply: () => ambush() },
  ],
  buff: [
    { name: 'Fúria de combate', desc: '+25% de dano por 40 segundos', apply: () => { buffs.dmg = 40; } },
    { name: 'Escudo de energia', desc: 'Absorve 60 de dano', apply: () => { buffs.shield = 60; } },
    { name: 'Estimulante', desc: 'Vida totalmente restaurada', apply: () => { player.hp = maxHp(); } },
    { name: 'Munição cheia', desc: 'Todas as armas recarregadas', apply: () => refillAmmo() },
  ],
  help: [
    { name: 'Torre automática', desc: 'Uma torre defende a área por 40 segundos', apply: () => dropTurret() },
    { name: 'Caixa de suprimentos', desc: 'Cai munição e vida perto de você', apply: () => dropSupplyNear() },
    { name: 'Orbital liberado', desc: 'Ataque orbital pronto agora', apply: () => { player.strikeCd = 0; } },
    { name: 'Reparos', desc: 'Gerador +30% (ou vida cheia sem gerador)', apply: () => { if (generator && generator.hp > 0) generator.hp = Math.min(generator.max, generator.hp + generator.max * 0.3); else player.hp = maxHp(); } },
  ],
};
const LOOT_LABEL = { diff: 'Aumento de dificuldade', buff: 'Bônus de combate', help: 'Ajuda no mapa' };
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function startLoot() {
  pendingLoot--;
  state = 'loot'; mouseDown = false;
  const r = Math.random();
  const kind = r < 0.7 ? 'diff' : r < 0.9 ? 'buff' : 'help';
  lootRun = { kind, item: pick(LOOT[kind]), t: 0, flick: 0, shown: false };
  $('lootLvl').textContent = `NÍVEL ${level}`;
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
    L.item.apply();
    refreshMods();
  }
  if (L.t >= TOTAL) {
    $('loot').classList.remove('on');
    lootRun = null; state = 'playing';
    if (pendingLoot > 0) startLoot();
  }
}
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
  const a = rand(0, Math.PI * 2), c = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24));
  const types = []; const n = Math.round(6 * mods.count);
  for (let i = 0; i < n; i++) types.push(i % 4 === 3 ? 'spitter' : 'crawler');
  makePlatoon(c, types, { alert: true });
}
function dropSupplyNear() {
  const a = rand(0, Math.PI * 2);
  const target = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 6, 0, Math.sin(a) * 6));
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a7a3a }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ce08a, transparent: true, opacity: 0.5 }));
  beam.position.y = 20; g.add(box, beam); g.position.copy(target); box.position.y = 30; scene.add(g);
  crates.push({ g, box, landed: false, t: 0 });
}
function dropTurret() {
  const a = rand(0, Math.PI * 2), pos = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x3b4450, metalness: 0.5 }));
  base.position.y = 0.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.9), new THREE.MeshStandardMaterial({ color: 0x66d9ff, emissive: 0x1a6a8a }));
  head.position.y = 1.15;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0x222831 }));
  gun.position.set(0, 1.15, -0.8);
  const pivot = new THREE.Group(); pivot.add(head, gun); g.add(base, pivot);
  g.position.copy(pos); scene.add(g);
  turrets.push({ g, pivot, t: 40, cd: 0 });
}
function updateTurrets(dt) {
  for (const T of [...turrets]) {
    T.t -= dt; T.cd -= dt;
    let best = null, bd = 38;
    for (const e of enemies) { const d = e.mesh.position.distanceTo(T.g.position); if (d < bd) { bd = d; best = e; } }
    if (best) {
      T.pivot.rotation.y = Math.atan2(-(best.mesh.position.x - T.g.position.x), -(best.mesh.position.z - T.g.position.z));
      if (T.cd <= 0) {
        T.cd = 0.16;
        const from = T.g.position.clone().setY(1.2), to = best.mesh.position.clone().setY(best.t.height);
        addTracer(from, to); damageEnemy(best, 7);
      }
    }
    if (T.t <= 0) { scene.remove(T.g); turrets.splice(turrets.indexOf(T), 1); }
  }
}

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
    const size = Math.round(rand(4, 6) * mods.count) + (t > 0.6 ? 1 : 0);
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
function waveTypes(n, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    arr.push(n >= 2 && r < 0.10 ? 'bomber' : n >= 4 && r < 0.18 ? 'charger' : r < 0.36 ? 'spitter' : 'crawler');
  }
  return arr;
}
function spawnWave(op, n) {
  op.wave = n; op.waveActive = true;
  const total = Math.round((10 + 3 * n) * mods.count), hpMul = 1 + 0.08 * (n - 1);
  const base = rand(0, Math.PI * 2);
  for (let g = 0; g < 3; g++) {
    const ang = base + g * 2.1 + rand(-0.3, 0.3);
    const c = clampArena(new THREE.Vector3(generator.x + Math.cos(ang) * rand(58, 70), 0, generator.z + Math.sin(ang) * rand(58, 70)));
    makePlatoon(c, waveTypes(n, Math.round(total / 3)), { alert: true, wave: n, hpMul });
  }
  const brutes = n === 8 ? 2 : (n === 5 || n === 7) ? 1 : 0;
  for (let k = 0; k < brutes; k++) {
    const ang = rand(0, Math.PI * 2);
    spawnEnemy('brute', clampArena(new THREE.Vector3(generator.x + Math.cos(ang) * 64, 0, generator.z + Math.sin(ang) * 64)), { wave: n, alert: true, hpMul });
  }
  op.waveSize = Math.max(1, enemies.filter(e => e.wave === n).length);
  say(`ONDA ${n} / ${op.waves}`, 3); beep(200, 0.4, 0.1);
}
function spawnReinforcement() {
  if (enemies.length > 32) return;
  const E = opLayout.E, a = rand(0, Math.PI * 2);
  for (let g = 0; g < 2; g++) {
    const ang = a + g * 3.1;
    const c = clampArena(new THREE.Vector3(E.x + Math.cos(ang) * 68, 0, E.z + Math.sin(ang) * 68));
    const n = Math.round((7 + level) * mods.count * 0.5);
    makePlatoon(c, waveTypes(8, n), { alert: true, wave: 99, hpMul: 1.5 });
  }
  say('Reforços inimigos!', 1.8);
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

function updateOperation(m, dt) {
  const op = m.op, L = opLayout, P = player.pos;
  const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const gpct = () => Math.max(0, Math.round(generator.hp / generator.max * 100));
  if (op.phase === 'travel') {
    waypoint = L.G;
    const d = hd(P, L.G);
    m.text = `Chegue ao gerador: ${Math.round(d)} m — evite ou enfrente os pelotões`;
    m.progress = Math.max(0, 1 - d / op.travelTotal);
    if (d < 16) {
      op.phase = 'defend'; op.countdown = 8; generator.active = true;
      checkpoint.copy(L.G).add(new THREE.Vector3(8, 0, 8));
      say('Gerador alcançado! Defenda-o: a primeira onda chega em 8 s.', 4);
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
          const geo = new THREE.TorusGeometry(50, 0.35, 6, 120);
          zoneRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf28c1f }));
          zoneRing.rotation.x = Math.PI / 2; zoneRing.position.set(L.E.x, 0.3, L.E.z); scene.add(zoneRing);
          say('Gerador estável! Siga para a zona de extração.', 4);
        } else { op.countdown = 10; say(`Onda ${op.wave} contida! Próxima em 10 s.`, 2.5); }
      }
    }
  } else if (op.phase === 'extract') {
    const d = hd(P, L.E), inside = d < 50;
    waypoint = inside ? null : L.E;
    if (inside && !op.zoneIn) { op.zoneIn = true; checkpoint.copy(L.E); say('Segure a zona por 1:30!', 3); }
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
      say('A nave de extração está chegando!', 4); beep(180, 0.6, 0.12);
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
      if (u >= 1) { pl.state = 'open'; say('Rampa aberta! Entre na nave pela traseira!', 4); beep(660, 0.3, 0.1); }
      m.text = 'Abrindo a rampa traseira…';
    } else if (pl.state === 'open') {
      waypoint = pl.g.position;
      const l = planeLocal(P);
      if (Math.abs(l.x) < 2.4 && l.z > 8.6 && l.z < 15) pl.rampVisited = true;
      m.text = pl.rampVisited ? 'Entre na cabine!' : `Entre na nave pela rampa traseira — ${Math.round(hd(P, pl.g.position))} m`;
      if (pl.rampVisited && Math.abs(l.x) < 2.4 && l.z > -4 && l.z < 8.6) {
        pl.state = 'closing'; pl.t = 0; state = 'cinematic'; cinT = 0; waypoint = null;
        playerGroup.visible = false; mouseDown = false;
        say('Todos a bordo!', 3);
      }
    }
  }
}

function updateCinematic(dt) {
  cinT += dt; const pl = plane;
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
          const count = m.fib[w.wave - 1], hpMul = 1 + 0.06 * (w.wave - 1);      // contagem exata de Fibonacci
          const groups = count >= 13 ? 3 : count >= 8 ? 2 : 1, base = rand(0, Math.PI * 2);
          for (let g = 0; g < groups; g++) {
            const ang = base + g * (Math.PI * 2 / groups), n = Math.floor(count / groups) + (g < count % groups ? 1 : 0);
            const c = clampArena(player.pos.clone().add(new THREE.Vector3(Math.cos(ang) * rand(44, 58), 0, Math.sin(ang) * rand(44, 58))));
            makePlatoon(c, waveTypes(w.wave + 1, n), { alert: true, wave: w.wave, hpMul });
          }
          // o sorteio "mais inimigos" não muda a sequência: vira um reforço que chega depois, na mesma onda
          w.extra = mods.count > 1.01 ? Math.round(count * (mods.count - 1)) : 0; w.extraT = 9;
          w.size = Math.max(1, enemies.filter(e => e.wave === w.wave).length);
          say(`ONDA ${w.wave} / ${total} — ${count} inimigos`, 3); beep(200, 0.4, 0.1);
        }
      } else {
        if (w.extra > 0) {
          w.extraT -= dt;
          if (w.extraT <= 0) {
            const a = rand(0, Math.PI * 2), c = clampArena(player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 50, 0, Math.sin(a) * 50)));
            makePlatoon(c, waveTypes(w.wave + 1, w.extra), { alert: true, wave: w.wave, hpMul: 1 + 0.06 * (w.wave - 1) });
            w.size += w.extra; w.extra = 0; say('Reforços do enxame!', 2);
          }
        }
        const alive = enemies.filter(e => e.wave === w.wave).length;
        m.text = `Onda ${w.wave}/${total} — inimigos restantes: ${alive}`;
        m.progress = (w.wave - 1 + (1 - alive / w.size)) / total;
        if (alive === 0) {
          w.active = false;
          if (w.wave >= total) endMission(true);
          else { w.countdown = 7; say(`Onda ${w.wave} limpa! Próxima: ${m.fib[w.wave]} inimigos.`, 2.5); }
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
        if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 2.6) {
          p.got = true; scene.remove(p.g); m.got++;
          say(`Amostra ${m.got}/${m.total} coletada — o enxame sentiu!`, 2.5); beep(900, 0.2);
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
          const inside = Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < 6;
          b.progress = Math.max(0, Math.min(1, b.progress + (inside ? dt / 10 : -dt / 25)));
          if (b.progress >= 1) { b.done = true; b.ring.material.color.set(0x5ce08a); b.col.material.color.set(0x5ce08a); say('Farol ativado!'); beep(880, 0.3); }
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
      if (elapsed > 40 && !m.ev.c) { m.ev.c = 1; say('Investidores a caminho!', 3); for (let i = 0; i < 2; i++) spawnEnemy('charger'); }
      if (elapsed > 80 && !m.ev.b) { m.ev.b = 1; say('Um brutamontes se aproxima do gerador!', 3); spawnEnemy('brute'); }
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
          say('Brutamontes abatidos! Vá até a zona de extração!', 4);
        }
      }
    };
    m.update = (dt) => {
      if (m.phase === 1) {
        m.text = `Derrube os brutamontes: ${2 - m.brutes} / 2`;
        m.progress = (2 - m.brutes) / 2;
      } else {
        const inside = Math.hypot(player.pos.x - pad.x, player.pos.z - pad.z) < 6;
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

function spawnLogic(dt) {
  spawnTimer -= dt;
  const small = enemies.filter(e => e.type !== 'brute' && e.type !== 'queen').length;
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
  if (generator) { scene.remove(generator.g); const i = rocks.findIndex(k => k.x === generator.x && k.z === generator.z); if (i >= 0) rocks.splice(i, 1); generator = null; }
  if (pad) { scene.remove(pad.g); pad = null; }
  if (zoneRing) { scene.remove(zoneRing); zoneRing = null; }
  if (plane) { scene.remove(plane.g); plane = null; }
  waypoint = null; lootRun = null;
  $('loot').classList.remove('on'); $('mods').innerHTML = '';
  playerGroup.visible = true; $('fade').style.opacity = 0;
}

function startMission(id) {
  ensureAudio();
  const tier = Math.max(1, MISSIONS.findIndex(m => m.id === id) + 1);
  relax = tier === 1;                                    // modo relax só no nível 1
  clearWorld();
  const def = MISSIONS.find(m => m.id === id);
  applyBiome(def ? def.biome : 'desert');
  opLayout = null;
  if (id === 'operation') {
    opLayout = planOperation();
    const L = opLayout;
    buildTerrain(L.R, 130, [{ x: L.S.x, z: L.S.z, r: 10 }, { x: L.G.x, z: L.G.z, r: 12 }, { x: L.E.x, z: L.E.z, r: 22 }]);
  } else buildTerrain(95, 45, [{ x: 0, z: 0, r: 10 }]);
  kills = 0;
  elapsed = 0;
  spawnTimer = 1;
  shake = 0;
  mods = { hp: 1 + 0.15 * (tier - 1), count: 1 + 0.08 * (tier - 1), speed: 1 + 0.02 * (tier - 1), edmg: 1 + 0.1 * (tier - 1), elite: 0.02 * (tier - 1) };
  xp = 0; level = 1; xpNeed = 60; pendingLoot = 0; buffs = { dmg: 0, shield: 0 };
  stats = { shots: 0, hits: 0, supplies: 0, orbitals: 0, deaths: 0 };
  $('kills').textContent = 'Abates: 0';
  player.ammo = WEAPONS.map(w => ({ mag: w.mag, reserve: Math.min(reserveCap(w), Math.round(w.reserve0 + w.reserveMax * 0.05 * lvl('ammo'))) }));
  Object.assign(player, {
    hp: maxHp(), weapon: 0, mag: player.ammo[0].mag, reserve: player.ammo[0].reserve, reloading: 0, fireCd: 0,
    rolling: 0, rollCd: 0, lastHit: 0, supplyCd: 0, strikeCd: 0, clickT: 0, invuln: 0, yaw: 0, pitch: 0.15,
  });
  if (opLayout) {
    player.pos.copy(opLayout.S);
    const d = opLayout.G.clone().sub(opLayout.S);
    player.yaw = Math.atan2(-d.x, -d.z);                 // olhando para o gerador
    checkpoint.copy(opLayout.S);
  } else { player.pos.set(0, 0, 0); checkpoint.set(0, 0, 0); }
  mission = buildMission(id);
  mission.par = def ? def.par : 4;
  mission.tier = tier;
  mission.livesLeft = mission.lives || 0;
  player.hitT = 0; player.moving = false; resetAnimation();
  $('oTitle').textContent = mission.title;
  $('boss').style.display = id === 'queen' ? 'block' : 'none';
  $('bossName').textContent = 'RAINHA DA COLMEIA';
  $('hud').classList.add('on');
  $('menu').classList.add('hidden'); $('results').classList.remove('on');
  $('resume').style.display = 'none'; $('abort').style.display = 'none';
  state = 'playing';
  say(id === 'operation' ? 'Siga até o gerador. Cuidado com os pelotões.' : 'Boa sorte, soldado.', 3);
  renderer.domElement.requestPointerLock();
}

function endMission(win) {
  if (!['playing', 'dying', 'cinematic', 'loot'].includes(state)) return;
  state = 'ended';
  document.exitPointerLock();
  $('hud').classList.remove('on'); $('loot').classList.remove('on');
  playerGroup.visible = true; $('fade').style.opacity = 0;
  showResults(win);
  beep(win ? 660 : 180, 0.6, 0.12);
}
function abortMission() {
  if (state === 'ended' || state === 'menu') return;
  state = 'ended';
  document.exitPointerLock();
  clearWorld();
  $('hud').classList.remove('on');
  $('menu').classList.remove('hidden');
  $('resume').style.display = 'none'; $('abort').style.display = 'none';
  $('sub').textContent = 'Operação abandonada. Nenhuma recompensa.';
}

// ───────────────────────── Pontuação e créditos finais ─────────────────────────
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function computeScore(win) {
  const mins = elapsed / 60, par = mission.par || 4;
  const rows = [];
  const add = (label, v) => rows.push([label, Math.round(v)]);
  if (win) add('Missão cumprida', 100);
  if (win) add(`Tempo ${fmtTime(elapsed)} (meta ${Math.round(par * 0.75)} min)`, Math.max(0, 120 * (1 - Math.max(0, mins - par * 0.75) / (par * 0.75))));
  add(`Abates (${kills})`, Math.min(80, Math.floor(kills * 0.25)));
  const acc = stats.shots ? stats.hits / stats.shots : 0;
  add(`Precisão (${Math.round(acc * 100)}% de ${stats.shots} disparos)`, 60 * acc);
  add(`Nível alcançado (${level})`, (level - 1) * 3);
  if (stats.deaths) add(`Mortes (${stats.deaths})`, -25 * stats.deaths);
  if (stats.supplies) add(`Suprimentos usados (${stats.supplies})`, -6 * stats.supplies);
  if (stats.orbitals) add(`Orbitais usados (${stats.orbitals})`, -10 * stats.orbitals);
  const total = Math.max(0, rows.reduce((a, r) => a + r[1], 0));
  return { rows, total };
}
const rankOf = t => t >= 330 ? 'S' : t >= 270 ? 'A' : t >= 210 ? 'B' : t >= 140 ? 'C' : 'D';
function showResults(win) {
  const { rows, total } = computeScore(win);
  const credits = Math.round(total * 1.2 + kills * 0.5 + (win ? 40 : 0));
  save.credits += credits;
  const prev = save.best[mission.id];
  const record = win && (prev == null || total > prev);
  if (record) save.best[mission.id] = total;
  persist(); renderAll();
  $('resKicker').textContent = (win ? 'OPERAÇÃO CONCLUÍDA' : 'OPERAÇÃO FALHOU') + ' · ' + mission.title.toUpperCase();
  $('resTitle').textContent = win ? (mission.id === 'operation' ? 'Extração confirmada' : 'Missão cumprida') : 'Esquadrão perdido';
  $('resRows').innerHTML = rows.map((r, i) =>
    `<div class="res-row" style="animation-delay:${0.25 + i * 0.28}s"><span>${r[0]}</span><b class="${r[1] < 0 ? 'neg' : 'pos'}">${r[1] >= 0 ? '+' : ''}${r[1]}</b></div>`).join('');
  const t0 = 0.25 + rows.length * 0.28;
  document.querySelectorAll('.res-total').forEach(el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = `rowin .6s ${t0}s forwards`; });
  $('resScore').textContent = total;
  $('resRank').textContent = win ? rankOf(total) : '—';
  $('resCredits').textContent = `+${credits} créditos${record ? ' · NOVO RECORDE!' : ''}`;
  $('results').classList.add('on');
}

let selMission = 'operation', activeTab = 'ops';
const TABS = [['ops', 'OPERAÇÕES'], ['arsenal', 'ARSENAL'], ['upg', 'MELHORIAS'], ['keys', 'CONTROLES']];
const BIOME_NAME = { desert: 'Deserto', ice: 'Gelo', toxic: 'Pântano tóxico', volcanic: 'Vulcânico' };
const ENEMY_INFO = [
  ['Rastejador', 'Veloz e frágil. Ataca em bando, corpo a corpo.'], ['Cuspidor', 'Mantém distância e lança bolas de ácido.'],
  ['Bruto', 'Enorme e resistente. Cada golpe dói.'], ['Bombardeiro', 'Corre até você e explode. Atire de longe.'],
  ['Investidor', 'Avisa e investe em linha reta. Desvie com o dash.'], ['Rainha', 'Chefe da colmeia: rajadas, golpes e invocações.'],
];

function renderOps() {
  const m = MISSIONS.find(x => x.id === selMission);
  const best = save.best[m.id];
  const danger = '■'.repeat(m.danger) + '□'.repeat(5 - m.danger);
  $('pane-ops').innerHTML = `
    <h2 class="sec">Selecionar operação</h2>
    <div class="ops">
      <div class="op-list">${MISSIONS.map((x, i) => `
        <button class="op-item ${x.id === selMission ? 'on' : ''}" data-id="${x.id}">
          <i>${String(i + 1).padStart(2, '0')} · ${x.tag}</i><span>${save.best[x.id] != null ? 'MELHOR ' + save.best[x.id] : ''}</span>
          <b>${x.title}</b></button>`).join('')}</div>
      <div class="op-detail">
        <div class="op-banner" style="background:${BIOME_CSS[m.biome]}"><div class="tagrow">
          <span class="tag">${BIOME_NAME[m.biome]}</span><span class="tag hot">PERIGO ${danger}</span><span class="tag ok">${m.tag}</span><span class="tag">NÍVEL ${MISSIONS.indexOf(m) + 1}${MISSIONS.indexOf(m) === 0 ? ' · RELAX' : ''}</span></div></div>
        <div class="op-body">
          <h3>${m.title}</h3>
          <p>${m.desc}</p>
          <div class="phases">${m.phases.map((p, i) => `<span>${i + 1}. ${p}</span>`).join('')}</div>
          <div class="stats-row">
            <div><small>MELHOR PONTUAÇÃO</small><b>${best != null ? best : '—'}</b></div>
            <div><small>RANK</small><b>${best != null ? rankOf(best) : '—'}</b></div>
            <div><small>TEMPO-META</small><b>${Math.round(m.par * 0.75)} min</b></div>
          </div>
          <div class="op-foot"><button class="btn primary" id="deploy">Iniciar operação</button>
            <span style="color:var(--dim);font-size:12px">Pontos pela velocidade, abates, precisão, mortes, suprimentos e orbitais.</span></div>
        </div>
      </div>
    </div>`;
  document.querySelectorAll('.op-item').forEach(b => b.onclick = () => { selMission = b.dataset.id; renderOps(); });
  $('deploy').onclick = () => startMission(selMission);
}
function renderArsenal() {
  const maxOf = k => Math.max(...WEAPONS.map(w => k(w)));
  const bar = (label, v, mx, txt) => `<div class="stat"><span>${label}</span><div class="b"><i style="width:${Math.round(v / mx * 100)}%"></i></div><em>${txt}</em></div>`;
  $('pane-arsenal').innerHTML = `
    <h2 class="sec">Armas · troque com 1 / 2 / 3</h2>
    <div class="grid">${WEAPONS.map((w, i) => `
      <div class="card"><small class="k">ARMA ${i + 1}</small><h4>${w.name}</h4>
        <p>${w.id === 'smg' ? 'Automática. Cadência alta, boa para o enxame.' : w.id === 'shotgun' ? 'Nove projéteis por tiro. Devastadora de perto.' : 'Tiro único e preciso. Ótima contra cuspidores e brutos.'}</p>
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
    <h2 class="sec" style="margin-top:28px">Inimigos</h2>
    <div class="grid">${ENEMY_INFO.map(e => `<div class="card"><h4>${e[0]}</h4><p style="margin-bottom:0">${e[1]}</p></div>`).join('')}</div>`;
}
function renderUpgrades() {
  $('pane-upg').innerHTML = `
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
}
function renderKeys() {
  const rows = [
    ['W A S D', 'Mover em qualquer direção — a mira não muda'], ['MOUSE', 'Mirar'], ['CLIQUE', 'Atirar'], ['SHIFT', 'Correr rápido'],
    ['C', 'Andar devagar (pelotões te notam menos)'], ['R', 'Recarregar (também correndo)'], ['ESPAÇO', 'Dash / esquiva'],
    ['1 · 2 · 3 / RODA', 'Trocar de arma'], ['E', 'Chamar suprimentos'], ['Q', 'Ataque orbital'], ['ESC', 'Pausar'],
  ];
  $('pane-keys').innerHTML = `<h2 class="sec">Controles</h2><table class="keys">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <h2 class="sec" style="margin-top:28px">Nível e sorteio</h2>
    <table class="keys"><tr><td>XP</td><td>Cada inimigo dá XP; cada nível exige o dobro do anterior.</td></tr>
    <tr><td>SORTEIO</td><td>Ao subir de nível a sorte decide: pode vir ajuda... ou o enxame ficar mais forte. Ninguém sabe o que vem.</td></tr></table>`;
}
function renderAll() {
  $('credits').textContent = save.credits;
  renderOps(); renderArsenal(); renderUpgrades(); renderKeys();
}
function showTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + id));
}
function buildMenu() {
  $('tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab" data-tab="${id}">${label}</button>`).join('');
  $('view').innerHTML = TABS.map(([id]) => `<section class="pane" id="pane-${id}"></section>`).join('');
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('resume').onclick = () => { renderer.domElement.requestPointerLock(); };
  $('abort').onclick = abortMission;
  $('resBtn').onclick = () => { $('results').classList.remove('on'); $('menu').classList.remove('hidden'); $('sub').textContent = 'Pronto para o deploy.'; $('resume').style.display = 'none'; $('abort').style.display = 'none'; };
  renderAll(); showTab('ops');
}

// ───────────────────────── Entrada ─────────────────────────
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'playing') return;
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
addEventListener('wheel', e => { if (state === 'playing') switchWeapon((player.weapon + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length); });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || state !== 'playing') return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-0.6, Math.min(0.8, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && state === 'playing') {
    state = 'paused';
    $('sub').textContent = 'Pausado';
    $('resume').style.display = 'inline-block'; $('abort').style.display = 'inline-block';
    $('menu').classList.remove('hidden');
  } else if (locked && state === 'paused') {
    state = 'playing';
    $('menu').classList.add('hidden');
  }
});
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
function tryRoll() {
  if (player.rolling > 0 || player.rollCd > 0) return;
  const f = fwdOf(player.yaw), r = rightOf(player.yaw);
  const d = new THREE.Vector3();
  if (keys.KeyW) d.add(f);
  if (keys.KeyS) d.sub(f);
  if (keys.KeyD) d.add(r);
  if (keys.KeyA) d.sub(r);
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
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a7a3a }));
  box.position.y = 0.6;
  box.castShadow = true;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ce08a, transparent: true, opacity: 0.5 }));
  beam.position.y = 20;
  g.add(box, beam);
  g.position.copy(target);
  box.position.y = 30;
  scene.add(g);
  crates.push({ g, box, landed: false, t: 0 });
  player.supplyCd = SUPPLY_COOLDOWN;
  stats.supplies++;
  say('Suprimentos a caminho!', 1.5);
  beep(520, 0.2);
}

// Ataque orbital: marca o ponto mirado e, após alguns segundos, um raio devasta a área (também fere você)
function callStrike() {
  if (player.strikeCd > 0) { say(`Orbital em ${Math.ceil(player.strikeCd)}s`, 1.2); return; }
  const pos = aimGround(60);
  const line = op => new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 80, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: op }));
  const center = line(0.95); center.position.copy(pos).setY(40);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  dot.rotation.x = -Math.PI / 2; dot.position.copy(pos).setY(0.08);
  scene.add(center, dot);
  strikes.push({ pos, center, dot, outer: [], t: 0, base: rand(0, Math.PI * 2), line });
  player.strikeCd = Math.max(20, STRIKE_COOLDOWN - 2 * lvl('strike'));
  stats.orbitals++;
  say('Ataque orbital marcado — afaste-se!', 1.8); beep(300, 0.4, 0.1);
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
    const mv = new THREE.Vector3();
    if (keys.KeyW) mv.add(f);
    if (keys.KeyS) mv.sub(f);
    if (keys.KeyD) mv.add(r);
    if (keys.KeyA) mv.sub(r);
    if (mv.lengthSq() > 0) {
      mv.normalize();
      const mf = mv.dot(f), mr = mv.dot(r);
      const sprint = keys.ShiftLeft && mf > -0.35;           // correr rápido em qualquer direção, menos de costas
      const walk = keys.KeyC && !sprint;                     // C: andar devagar
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
  if (wantFire && document.pointerLockElement === renderer.domElement
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

function enemyTarget(e) {
  if (generator && generator.active && generator.hp > 0 && e.type !== 'spitter' && e.type !== 'queen') {
    const dg = Math.hypot(e.mesh.position.x - generator.x, e.mesh.position.z - generator.z);
    const dp = Math.hypot(e.mesh.position.x - player.pos.x, e.mesh.position.z - player.pos.z);
    if (dg < dp + 12) return { pos: new THREE.Vector3(generator.x, 0, generator.z), gen: true, rad: 2.6 };
  }
  return { pos: player.pos, gen: false, rad: 0 };
}

function spitAt(from, dir, speed, dmg, big) {
  const pm = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.45 : 0.28, 8, 6), new THREE.MeshBasicMaterial({ color: big ? 0xff40c0 : 0xa4ff6a }));
  pm.position.copy(from);
  scene.add(pm);
  projectiles.push({ m: pm, v: dir.clone().normalize().multiplyScalar(speed), life: 4, dmg: dmg * mods.edmg, big });
}
function patrolMove(e, dt) {
  const m = e.mesh, pl = e.pl;
  const goal = pl.anchor.clone().add(formationOffset(e.slot, pl.heading));
  const to = goal.sub(m.position).setY(0), d = to.length();
  e.phase += dt * 5; m.position.y = Math.abs(Math.sin(e.phase)) * 0.08;
  if (d > 0.5) {
    const sp = Math.min(e.t.speed * 0.7 * e.spd, 2.3 + d * 1.6);
    to.normalize(); m.position.addScaledVector(to, sp * dt);
    m.rotation.y = Math.atan2(-to.x, -to.z);
  } else m.rotation.y = Math.atan2(-Math.sin(pl.heading), -Math.cos(pl.heading));
}

function updateEnemies(dt) {
  for (const e of [...enemies]) {
    if (!enemies.includes(e)) continue;
    const m = e.mesh;
    if (e.pl && e.pl.state === 'patrol') { patrolMove(e, dt); resolveRocks(m.position, e.t.radius * 0.6); continue; }
    const tg = enemyTarget(e);
    const to = tg.pos.clone().sub(m.position).setY(0);
    const dist = Math.max(0, to.length() - tg.rad);
    const dir = to.normalize();
    const hurt = d => tg.gen ? damageGenerator(d * mods.edmg) : damagePlayer(d * mods.edmg);
    const walkTo = sp => { m.position.addScaledVector(dir, sp * dt * e.spd); };
    e.phase += dt * (e.type === 'crawler' || e.type === 'bomber' ? 14 : 7);
    m.position.y = Math.abs(Math.sin(e.phase)) * 0.12;
    m.rotation.y = Math.atan2(-dir.x, -dir.z);

    if (e.type === 'spitter') {
      const keep = 16;
      if (dist > keep + 3) walkTo(e.t.speed);
      else if (dist < keep - 4) walkTo(-e.t.speed);
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 38) {
        e.shootCd = rand(1.8, 3);
        const from = m.position.clone().setY(1.5);
        spitAt(from, player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(from), 18, e.t.dmg, false);
        beep(240, 0.12, 0.05);
      }
    } else if (e.type === 'bomber') {
      walkTo(e.t.speed);
      const s = 1 + 0.1 * Math.sin(e.phase * 2); m.scale.setScalar(s);
      if (dist < 2.2) killEnemy(e);                      // explode ao chegar perto
    } else if (e.type === 'charger') {
      e.stT -= dt;
      if (e.st === 'walk') {
        if (dist > 3) walkTo(e.t.speed);
        if (e.stT <= 0 && dist < 24 && dist > 7) { e.st = 'wind'; e.stT = 0.8; e.cdir = dir.clone(); noise(0.3, 0.12, 300); }
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
    } else if (e.type === 'queen') {
      e.atkCd -= dt; e.volleyCd -= dt; e.summonCd -= dt;
      const enraged = e.hp < e.maxHp * 0.5;
      if (dist > 5.5) walkTo(e.t.speed * (enraged ? 1.35 : 1));
      if (dist <= 6.5 && e.atkCd <= 0) { e.atkCd = enraged ? 1.3 : 1.8; hurt(e.t.dmg); burst(m.position.clone().setY(1.5), 0xff40c0, 12, 5); shake = Math.max(shake, 0.2); }
      if (e.volleyCd <= 0 && dist > 9) {
        e.volleyCd = enraged ? 3 : 4.5;
        const from = m.position.clone().setY(2.6);
        const base = player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(from);
        for (let i = -2; i <= 2; i++) {
          const v = base.clone(); const c = Math.cos(i * 0.16), sn = Math.sin(i * 0.16);
          const x = v.x * c - v.z * sn, z = v.x * sn + v.z * c; v.x = x; v.z = z;
          spitAt(from, v, 15, 14, true);
        }
        beep(180, 0.25, 0.08);
      }
      if (e.summonCd <= 0 && enemies.length < 18) {
        e.summonCd = enraged ? 10 : 14;
        say('A Rainha chama o enxame!', 2);
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
  }
}

function updateProjectiles(dt) {
  for (const p of [...projectiles]) {
    p.m.position.addScaledVector(p.v, dt);
    p.life -= dt;
    const hitPlayer = p.m.position.distanceTo(player.pos.clone().setY(1.1)) < (p.big ? 1.2 : 0.9);
    if (hitPlayer) { damagePlayer(p.dmg); p.life = 0; }
    if (p.life <= 0 || p.m.position.y < 0) {
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
    } else if (player.pos.distanceTo(c.g.position) < 2.4) {
      WEAPONS.forEach((w, i) => {
        if (i === player.weapon) { player.mag = w.mag; player.reserve = reserveCap(w); }
        else player.ammo[i] = { mag: w.mag, reserve: reserveCap(w) };
      });
      player.hp = Math.min(maxHp(), player.hp + 50);
      say('Suprimentos coletados', 1.5);
      beep(760, 0.2);
      scene.remove(c.g);
      crates.splice(crates.indexOf(c), 1);
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
      noise(0.7, 0.4, 500); shake = Math.max(shake, 0.9);
      alertNear(s.pos, 90);
      const R = 11;
      for (const e of [...enemies]) {
        const d = e.mesh.position.distanceTo(s.pos);
        if (d < R) damageEnemy(e, 320 * (1 - 0.5 * d / R));
      }
      const dp = Math.hypot(player.pos.x - s.pos.x, player.pos.z - s.pos.z);
      if (dp < 8) damagePlayer(45 * (1 - dp / 10));
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
    if (player.pos.distanceTo(d.m.position.clone().setY(0)) < 2.2) {
      if (d.type === 'hp') player.hp = Math.min(maxHp(), player.hp + 25);
      else player.reserve = Math.min(reserveCap(curW()), player.reserve + Math.ceil(curW().mag * 1.5));
      say(d.type === 'hp' ? '+ Vida' : '+ Munição', 1); beep(700, 0.1);
      d.t = 0;
    }
    if (d.t <= 0) { scene.remove(d.m); drops.splice(drops.indexOf(d), 1); }
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('on'); }
}

function updateHud() {
  const pct = Math.max(0, player.hp) / maxHp() * 100;
  $('hpBar').style.width = pct + '%';
  $('hpBar').style.background = pct > 50 ? '#4cd68a' : pct > 25 ? '#ffcf3f' : '#ff4d4d';
  $('wname').textContent = `[${player.weapon + 1}] ${curW().name}`;
  $('ammo').innerHTML = (player.reloading > 0 ? 'Recarregando' : player.mag) + ` <small>/ ${player.reserve}</small>`;
  $('oText').textContent = mission.text;
  $('oBar').style.width = Math.min(100, mission.progress * 100) + '%';
  const sup = player.supplyCd > 0 ? `${Math.ceil(player.supplyCd)}s` : 'pronto';
  const orb = player.strikeCd > 0 ? `${Math.ceil(player.strikeCd)}s` : 'pronto';
  $('cd').textContent = `Suprimentos (E): ${sup} · Orbital (Q): ${orb}`;
  if (mission.id === 'queen' && mission.boss) $('bossBar').style.width = Math.max(0, mission.boss.hp / mission.boss.maxHp * 100) + '%';
  $('xpBar').style.width = Math.min(100, xp / xpNeed * 100) + '%';
  $('lvl').textContent = `NV ${level} · XP ${Math.floor(xp)} / ${xpNeed}`;
  $('lives').innerHTML = mission.lives ? 'REFORÇOS ' + [...Array(mission.lives)].map((_, i) => `<span class="${i < mission.livesLeft ? 'on' : ''}">●</span>`).join(' ') : '';
  const wp = $('wp');
  if (waypoint) {
    const dx = waypoint.x - player.pos.x, dz = waypoint.z - player.pos.z;
    wp.style.display = 'block';
    $('arrow').style.transform = `rotate(${-(Math.atan2(-dx, -dz) - player.yaw)}rad)`;
    $('wpText').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
  } else wp.style.display = 'none';
}

function respawnPlayer() {
  mission.livesLeft--;
  player.hp = maxHp(); player.pos.copy(checkpoint); player.invuln = 4; player.hitT = 0;
  state = 'playing'; resetAnimation();
  say(`Reforço no campo! Restam ${mission.livesLeft}.`, 3); beep(660, 0.3, 0.1);
}

// ───────────────────────── Loop ─────────────────────────
let lastFrame = performance.now();
let cursorOn = null;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(); tick(Math.min(0.05, (now - lastFrame) / 1000)); lastFrame = now;
  const want = state === 'menu' || state === 'paused' || state === 'ended';
  if (want !== cursorOn) { cursorOn = want; window.__cursor && window.__cursor.show(want); }
  renderer.render(scene, camera);
}

let lastModSec = -1;
function tick(dt) {
  if (state === 'playing') {
    elapsed += dt;
    updatePlayer(dt);
    updateCamera();
    spawnLogic(dt);
    updatePlatoons(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateTurrets(dt);
    mission.update(dt);
    updateEffects(dt);
    updateHud();
    if (Math.floor(elapsed) !== lastModSec) { lastModSec = Math.floor(elapsed); refreshMods(); }
    sun.position.set(player.pos.x + 40, 60, player.pos.z + 20);
    sun.target.position.copy(player.pos);
  } else if (state === 'loot') {
    player.moving = false;
    animate(dt);
    updateCamera();
    updateLoot(dt);
  } else if (state === 'cinematic') {
    updateCinematic(dt);
    updateEffects(dt);
  } else if (state === 'dying') {
    animate(dt);
    updateCamera();
    updateProjectiles(dt);
    updateEffects(dt);
    dyingT -= dt;
    if (dyingT <= 0) { if (mission.livesLeft > 0) respawnPlayer(); else endMission(false); }
  } else {
    // Câmera lenta orbitando no menu
    const a = performance.now() / 8000;
    camera.position.set(Math.cos(a) * 30, 10, Math.sin(a) * 30);
    camera.lookAt(0, 2, 0);
  }
}

buildMenu();
loop();

// Gancho para testes automatizados e futuro multiplayer (estado serializável)
window.__freedivers = {
  player, keys, tick, startMission,
  get enemies() { return enemies; }, get state() { return state; }, get kills() { return kills; },
  get mission() { return mission; }, setMouse(v) { mouseDown = v; },
  get camPos() { return camPos; }, get generator() { return generator; }, get strikes() { return strikes; }, switchWeapon, callStrike, spawnEnemy, damageEnemy, get pods() { return pods; }, endMission, get save() { return save; }, get level() { return level; }, get mods() { return mods; }, addXp, get platoons() { return platoons; }, get plane() { return plane; }, get opLayout() { return opLayout; }, get stats() { return stats; }, get xpNeed() { return xpNeed; }, respawnPlayer, abortMission, computeScore, get checkpoint() { return checkpoint; }, get wts() { return wts; }, damage: n => damagePlayer(n), get beacons() { return beacons; }, get pad() { return pad; },
};
