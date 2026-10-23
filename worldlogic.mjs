// Regras da guerra pelo continente, compartilhadas pelo servidor (mundo online) e pelo navegador (campanha local).
// Cada quadrado guarda a porcentagem de domínio das três forças: h (humanos), i (insetos), r (robôs); a soma é sempre 100.
// Sem dependências de DOM ou Node: só dados e funções puras (o sorteio é determinístico a partir de uma semente).

export const N = 24;
export const SCALE = 10000;                                      // 100% = 10000 pontos; 1 ponto de progresso = 0,01% do setor
export const pct2 = v => (v / 100).toFixed(2).replace('.', ',') + '%';
export const key = (c, r) => `${c},${r}`;
export const cellName = (c, r) => String.fromCharCode(65 + c) + (r + 1);
export const FACTION_NAME = { H: 'Jogadores', I: 'Insetos', R: 'Robôs' };

export function hash2(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0); }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// índice: quadrados por chave e vizinhos (8 direções) só entre quadrados de terra
export function makeIndex(cells) {
  const byKey = new Map(cells.map(o => [key(o.c, o.r), o]));
  const nbr = new Map();
  for (const o of cells) {
    const list = [];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if ((dc || dr) && byKey.has(key(o.c + dc, o.r + dr))) list.push(key(o.c + dc, o.r + dr));
    nbr.set(key(o.c, o.r), list);
  }
  return { cells, byKey, nbr };
}

// começo da campanha: o planeta é dos humanos; cada facção tem só um bloco de 2x2 quadrados, em lados opostos (insetos a oeste, robôs a leste)
export const SEEDS = { I: { c: 4, r: 10 }, R: { c: 19, r: 9 } };
export function seedSectors(idx) {
  const sec = new Map(idx.cells.map(o => [key(o.c, o.r), { h: SCALE, i: 0, r: 0 }]));
  for (const f of ['I', 'R']) {
    const sd = SEEDS[f], d = o => Math.hypot(o.c - (sd.c + 0.5), o.r - (sd.r + 0.5));
    for (const o of [...idx.cells].sort((x, y) => d(x) - d(y) || x.c - y.c || x.r - y.r).slice(0, 4)) sec.set(key(o.c, o.r), { h: 0, i: f === 'I' ? SCALE : 0, r: f === 'R' ? SCALE : 0 });
  }
  return sec;
}
// mundo salvo com o desenho antigo (facções dominando metade do mapa) é reiniciado
export const isOldLayout = init => !init || (init.i || 0) + (init.r || 0) > 10 * SCALE;
export function initTotals(sec) { const t = { i: 0, r: 0 }; for (const s of sec.values()) { t.i += s.i; t.r += s.r; } return t; }

export const HUMAN_MIN = 5000;                                  // 50% ou mais = quadrado dos humanos
export const isHuman = s => s.h >= HUMAN_MIN;
export function dominant(s) { return s.h > s.i && s.h > s.r ? 'H' : (s.i >= s.r ? 'I' : 'R'); }
export const enemyOf = s => (s.i >= s.r ? 'I' : 'R');           // quem defende o quadrado contra os humanos
export function humanCount(sec) { let n = 0; for (const s of sec.values()) if (isHuman(s)) n++; return n; }
export function totals(sec) { const t = { h: 0, i: 0, r: 0 }; for (const s of sec.values()) { t.h += s.h; t.i += s.i; t.r += s.r; } return t; }

// só dá para atacar quadrado que não é dos humanos e que encosta num que é (ou onde a batalha já começou)
// Estágios de um setor: DISPUTA (humanos abaixo de 50%), DOMINADO (50% ou mais, mas ainda restam inimigos: é preciso erradicá-los com mais missões)
// e FIXO (100% humano). Setor fixo só perde terreno se um vizinho inimigo o atacar, e resiste (o avanço inimigo cai pela metade).
export const stageOf = s => (s.h >= SCALE ? 'fixo' : s.h >= HUMAN_MIN ? 'dominado' : 'disputa');
export const STAGE_NAME = { disputa: 'Em disputa', dominado: 'Dominado', fixo: 'Fixo dos humanos' };
// atacável = ainda não é 100% humano e (já tem avanço humano ou encosta num setor dos humanos). Setor atrás de território dominado fica fora do alcance dos inimigos.
export function attackable(idx, sec, k) {
  const s = sec.get(k); if (!s || s.h >= SCALE) return false;
  return s.h > 0 || idx.nbr.get(k).some(n => isHuman(sec.get(n)));
}
// um setor dos humanos está "sob ataque" quando algum vizinho é dominado por inimigos
export const underPressure = (idx, sec, k) => sec.get(k).h < SCALE && idx.nbr.get(k).some(n => { const d = dominant(sec.get(n)); return d === 'I' || d === 'R'; });
// quanto mais uma facção perde, mais forte ela fica: os níveis baixos de ameaça deixam de estar disponíveis contra ela
export function lostFraction(sec, init, f) { const t = totals(sec), now = f === 'I' ? t.i : t.r, base = f === 'I' ? init.i : init.r; return Math.min(1, Math.max(0, 1 - now / Math.max(1, base))); }
export const minLevel = (sec, init, f, max = 20) => Math.min(max - 1, 1 + Math.floor(lostFraction(sec, init, f === 'I' ? 'I' : 'R') * 16));

// ───────────── missão de cada quadrado: muda sozinha a cada 15 minutos, igual para todos (depende só da hora, da temporada e do quadrado) ─────────────
export const MISSION_IDS = ['operation', 'purge', 'samples', 'beacon', 'defend', 'extract', 'queen'];
export const ROTATION_MS = 15 * 60 * 1000;
export const epochOf = now => Math.floor(now / ROTATION_MS);
export const nextRotation = now => (epochOf(now) + 1) * ROTATION_MS;
export const missionOf = (c, r, season, now) => MISSION_IDS[hash2(hash2(c, r) ^ (season * 977), epochOf(now) * 7919 + 13) % MISSION_IDS.length];
// fronteira: quadrado onde insetos e robôs aparecem juntos (10% ou mais cada); no mapa os dois lutam entre si e contra os jogadores
export const MIX_MIN = 1000;
export const mixOf = s => (s.i >= MIX_MIN && s.r >= MIX_MIN ? { i: s.i, r: s.r } : null);
export const minLevelSector = (sec, init, s, max = 20) => { const m = mixOf(s); return m ? Math.max(minLevel(sec, init, 'I', max), minLevel(sec, init, 'R', max)) : minLevel(sec, init, enemyOf(s), max); };

// Cada missão vale um progresso base; cada nível de ameaça soma +1 ponto. 1 ponto = 0,01% do setor (nível 20 da Operação Gerador = 1520 pontos = 15,20%).
export const MISSION_POINTS = { operation: 1500, purge: 600, samples: 500, beacon: 500, defend: 700, extract: 800, queen: 2000 };
export const missionGain = (id, level) => (MISSION_POINTS[id] || 500) + Math.max(1, Math.min(20, Math.round(level) || 1));
const move = (s, from, to, n) => { n = Math.min(n, s[from]); s[from] -= n; s[to] += n; return n; };
// vitória: os humanos tomam o progresso do defensor (e, se faltar, do outro lado). Derrota: o defensor recupera 40% do que a missão valeria.
export function applyWin(s, missionId, level) {
  const def = enemyOf(s), other = def === 'I' ? 'r' : 'i', d = def === 'I' ? 'i' : 'r', gain = missionGain(missionId, level);
  let got = move(s, d, 'h', gain); if (got < gain) got += move(s, other, 'h', gain - got);
  return got;
}
export function applyLoss(s, missionId, level) { const d = enemyOf(s) === 'I' ? 'i' : 'r'; return -move(s, 'h', d, Math.round(missionGain(missionId, level) * 0.4)); }

// Passo da guerra (a cada minuto): a expansão é lenta, na escala de dias. A cada minuto cada facção tem uma pequena chance de empurrar um quadrado vizinho
// (contra os humanos ou contra a outra facção); quanto mais quadrados domina, mais chance. Só ataca a partir de um setor que domina.
export const ATTACK_BASE = 0.005;
export const ENEMY_EDGE = 1.5;                                                 // vantagem do inimigo no progresso (os jogadores ganham `missionGain`; eles empurram 1,5x)
export function warTick(idx, sec, seed, minHumanSectors = 3) {
  const R = rng(seed), events = [], changed = new Set();
  for (const f of ['I', 'R']) {
    const fl = f.toLowerCase(), fronts = []; let dom = 0;
    for (const o of idx.cells) { const k = key(o.c, o.r); const sk = sec.get(k), dm = dominant(sk) === f;
      if (dm) dom++;
      if (dm || (!isHuman(sk) && sk[fl] >= MIX_MIN)) for (const n of idx.nbr.get(k)) if (dominant(sec.get(n)) !== f) fronts.push(n); }   // enquanto o setor não é dominado pelos humanos, a facção que tem presença nele pode avançar para os vizinhos
    if (!fronts.length || R() > Math.min(0.25, ATTACK_BASE * (1 + dom / 12))) continue;
    const tk = fronts[Math.floor(R() * fronts.length)], t = sec.get(tk), tc = idx.byKey.get(tk);
    const def = ['h', 'i', 'r'].filter(x => x !== fl).sort((x, y) => t[y] - t[x])[0];
    if (!t[def]) continue;
    let push = Math.round((80 + Math.floor(R() * 180)) * ENEMY_EDGE);            // 1,20% a 3,90% por ataque: avançar é mais fácil para eles do que para os jogadores
    if (def === 'h') {
      if (humanCount(sec) <= minHumanSectors && isHuman(t)) continue;           // o último reduto não cai
      if (t.h >= SCALE) push = Math.round(push * 0.5);                          // setor fixo resiste
    }
    const before = dominant(t), stBefore = stageOf(t), n = move(t, def, fl, push);
    if (!n) continue;
    changed.add(tk);
    const name = cellName(tc.c, tc.r);
    if (def === 'h' && stBefore === 'dominado' && stageOf(t) === 'disputa') events.push(`${FACTION_NAME[f]} retomaram o setor ${name}!`);
    else if (def === 'h' && stBefore === 'fixo') events.push(`${FACTION_NAME[f]} atacam o setor fixo ${name}.`);
    else if (dominant(t) !== before) events.push(`${FACTION_NAME[f]} tomaram o setor ${name} dos ${FACTION_NAME[before].toLowerCase()}.`);
  }
  return { events, changed: [...changed] };
}
export const campaignWon = sec => humanCount(sec) === sec.size;
export const stageEvent = (name, before, after) => (before === after ? null : after === 'fixo' ? `Setor ${name} erradicado: agora é fixo dos humanos!` : after === 'dominado' && before === 'disputa' ? `Setor ${name} dominado! Faltam missões para erradicar os inimigos.` : after === 'disputa' && before !== 'disputa' ? `Setor ${name} voltou a ser disputado.` : null);

// serialização: { "c,r": [h, i, r] }
export const packSectors = (sec, keys) => { const o = {}; for (const k of keys || sec.keys()) { const s = sec.get(k); o[k] = [s.h, s.i, s.r]; } return o; };
export const unpackSectors = obj => new Map(Object.entries(obj).map(([k, v]) => [k, { h: v[0], i: v[1], r: v[2] }]));
