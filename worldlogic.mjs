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

// Ritmo do jogo: o inimigo avança 0,0015% por segundo em cada setor atacado (9 pontos por minuto; 100% em 18 h 31 min).
// A vitória de uma missão vale o mesmo ritmo aplicado ao tempo-meta dela (partida de 5 min = 0,45%); o tempo só serve para calcular, não corre na partida.
// 1 ponto = 0,01% do setor. Cada nível de ameaça soma +1 ponto.
export const ENEMY_PTS_PER_MIN = 9;
export const MISSION_PAR = { operation: 16, purge: 6, samples: 5, beacon: 5, defend: 4, extract: 5, queen: 6 };       // minutos (tempo-meta de cada missão)
export const MISSION_POINTS = Object.fromEntries(Object.entries(MISSION_PAR).map(([id, m]) => [id, m * ENEMY_PTS_PER_MIN]));
export const missionGain = (id, level) => (MISSION_POINTS[id] || 5 * ENEMY_PTS_PER_MIN) + Math.max(1, Math.min(20, Math.round(level) || 1));
const move = (s, from, to, n) => { n = Math.min(n, s[from]); s[from] -= n; s[to] += n; return n; };
// vitória: os humanos tomam o progresso do defensor (e, se faltar, do outro lado). Derrota: o defensor recupera 25% do que a missão valeria.
export function applyWin(s, missionId, level) {
  const def = enemyOf(s), other = def === 'I' ? 'r' : 'i', d = def === 'I' ? 'i' : 'r', gain = missionGain(missionId, level);
  let got = move(s, d, 'h', gain); if (got < gain) got += move(s, other, 'h', gain - got);
  return got;
}
export const LOSS_RATIO = 0.25;                                          // derrota: os humanos perdem 1/4 do que a vitória renderia e o inimigo ganha o mesmo tanto
export function applyLoss(s, missionId, level) { const d = enemyOf(s) === 'I' ? 'i' : 'r'; return -move(s, 'h', d, Math.round(missionGain(missionId, level) * LOSS_RATIO)); }

// Passo da guerra (a cada minuto): avanço contínuo e fixo. Cada facção empurra, ENEMY_PTS_PER_MIN pontos por minuto, todo setor vizinho de um setor
// que ela já tem com 50% ou mais (dominado). Setores atrás de território humano ficam fora de alcance. Os jogadores seguram o avanço vencendo missões.
export function warTick(idx, sec, seed, minHumanSectors = 3, pts = ENEMY_PTS_PER_MIN) {
  const events = [], changed = new Set();
  for (const f of ['I', 'R']) {
    const fl = f.toLowerCase(), targets = new Set();
    for (const o of idx.cells) { const k = key(o.c, o.r); if (sec.get(k)[fl] >= HUMAN_MIN) for (const n of idx.nbr.get(k)) if (sec.get(n)[fl] < HUMAN_MIN) targets.add(n); }
    for (const tk of targets) {
      const t = sec.get(tk), tc = idx.byKey.get(tk);
      const def = ['h', 'i', 'r'].filter(x => x !== fl).sort((x, y) => t[y] - t[x])[0];
      if (!t[def]) continue;
      if (def === 'h' && humanCount(sec) <= minHumanSectors && isHuman(t)) continue;      // o último reduto não cai
      const before = dominant(t), stBefore = stageOf(t), n = move(t, def, fl, pts);
      if (!n) continue;
      changed.add(tk);
      const name = cellName(tc.c, tc.r);
      if (def === 'h' && stBefore === 'dominado' && stageOf(t) === 'disputa') events.push(`${FACTION_NAME[f]} retomaram o setor ${name}!`);
      else if (def === 'h' && stBefore === 'fixo') events.push(`${FACTION_NAME[f]} atacam o setor fixo ${name}.`);
      else if (dominant(t) !== before) events.push(`${FACTION_NAME[f]} tomaram o setor ${name} dos ${FACTION_NAME[before].toLowerCase()}.`);
    }
  }
  return { events, changed: [...changed] };
}
export const campaignWon = sec => humanCount(sec) === sec.size;
export const stageEvent = (name, before, after) => (before === after ? null : after === 'fixo' ? `Setor ${name} erradicado: agora é fixo dos humanos!` : after === 'dominado' && before === 'disputa' ? `Setor ${name} dominado! Faltam missões para erradicar os inimigos.` : after === 'disputa' && before !== 'disputa' ? `Setor ${name} voltou a ser disputado.` : null);

// serialização: { "c,r": [h, i, r] }
export const packSectors = (sec, keys) => { const o = {}; for (const k of keys || sec.keys()) { const s = sec.get(k); o[k] = [s.h, s.i, s.r]; } return o; };
export const unpackSectors = obj => new Map(Object.entries(obj).map(([k, v]) => [k, { h: v[0], i: v[1], r: v[2] }]));
