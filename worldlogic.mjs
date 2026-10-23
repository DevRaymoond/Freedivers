// Regras da guerra pelo continente, compartilhadas pelo servidor (mundo online) e pelo navegador (campanha local).
// Cada quadrado guarda a porcentagem de domínio das três forças: h (humanos), i (insetos), r (robôs); a soma é sempre 100.
// Sem dependências de DOM ou Node: só dados e funções puras (o sorteio é determinístico a partir de uma semente).

export const N = 24;
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

// começo da campanha: cabeça de ponte dos humanos no sul; insetos a oeste e robôs a leste
export function seedSectors(idx) {
  const sec = new Map(), seedP = { c: 12, r: 17 }, seedI = { c: 5, r: 9 }, seedR = { c: 19, r: 8 };
  const d = (o, s) => Math.hypot(o.c - s.c, o.r - s.r);
  for (const o of idx.cells) {
    const jitter = (hash2(o.c, o.r) % 100) / 100 * 1.6 - 0.8;
    const f = d(o, seedP) <= 1.9 ? 'H' : (d(o, seedI) + jitter <= d(o, seedR) ? 'I' : 'R');
    sec.set(key(o.c, o.r), { h: f === 'H' ? 100 : 0, i: f === 'I' ? 100 : 0, r: f === 'R' ? 100 : 0 });
  }
  return sec;
}
export function initTotals(sec) { const t = { i: 0, r: 0 }; for (const s of sec.values()) { t.i += s.i; t.r += s.r; } return t; }

export const HUMAN_MIN = 50;                                    // 50% ou mais = quadrado dos humanos
export const isHuman = s => s.h >= HUMAN_MIN;
export function dominant(s) { return s.h > s.i && s.h > s.r ? 'H' : (s.i >= s.r ? 'I' : 'R'); }
export const enemyOf = s => (s.i >= s.r ? 'I' : 'R');           // quem defende o quadrado contra os humanos
export function humanCount(sec) { let n = 0; for (const s of sec.values()) if (isHuman(s)) n++; return n; }
export function totals(sec) { const t = { h: 0, i: 0, r: 0 }; for (const s of sec.values()) { t.h += s.h; t.i += s.i; t.r += s.r; } return t; }

// só dá para atacar quadrado que não é dos humanos e que encosta num que é (ou onde a batalha já começou)
export function attackable(idx, sec, k) {
  const s = sec.get(k); if (!s || isHuman(s)) return false;
  return s.h > 0 || idx.nbr.get(k).some(n => isHuman(sec.get(n)));
}
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
export const MIX_MIN = 10;
export const mixOf = s => (s.i >= MIX_MIN && s.r >= MIX_MIN ? { i: s.i, r: s.r } : null);
export const minLevelSector = (sec, init, s, max = 20) => { const m = mixOf(s); return m ? Math.max(minLevel(sec, init, 'I', max), minLevel(sec, init, 'R', max)) : minLevel(sec, init, enemyOf(s), max); };

export const battleGain = (level, party) => Math.max(10, Math.min(55, Math.round(12 + 1.6 * level + 3 * (party - 1))));
const move = (s, from, to, n) => { n = Math.min(n, s[from]); s[from] -= n; s[to] += n; return n; };
// vitória: os humanos tomam porcentagem do defensor (e, se faltar, do outro lado). Derrota: o defensor recupera um pouco.
export function applyWin(s, level, party) {
  const def = enemyOf(s), other = def === 'I' ? 'r' : 'i', d = def === 'I' ? 'i' : 'r', gain = battleGain(level, party);
  let got = move(s, d, 'h', gain); if (got < gain) got += move(s, other, 'h', gain - got);
  return got;
}
export function applyLoss(s) { const d = enemyOf(s) === 'I' ? 'i' : 'r'; return -move(s, 'h', d, 8); }

// passo da guerra: cada facção empurra um quadrado vizinho (contra a outra facção ou contra os humanos)
export function warTick(idx, sec, seed, minHumanSectors = 3) {
  const R = rng(seed), events = [], changed = new Set();
  const total = idx.cells.length;
  for (const f of ['I', 'R']) {
    const fl = f.toLowerCase(), pairs = [];
    for (const o of idx.cells) { const k = key(o.c, o.r); if (dominant(sec.get(k)) === f) for (const n of idx.nbr.get(k)) if (dominant(sec.get(n)) !== f) pairs.push(n); }
    if (!pairs.length) continue;
    const tk = pairs[Math.floor(R() * pairs.length)], t = sec.get(tk), tc = idx.byKey.get(tk);
    const others = ['h', 'i', 'r'].filter(x => x !== fl).sort((a, b) => t[b] - t[a]);
    const def = others[0];
    if (!t[def]) continue;
    if (def === 'h') {
      if (humanCount(sec) <= minHumanSectors && isHuman(t)) continue;         // o último reduto não cai
      if (R() > 0.3 + 0.4 * (humanCount(sec) / total)) continue;
    } else if (R() > 0.6) continue;
    const before = dominant(t), n = move(t, def, fl, 6 + Math.floor(R() * 8));
    if (!n) continue;
    changed.add(tk);
    if (dominant(t) !== before) events.push(`${FACTION_NAME[f]} tomaram o setor ${cellName(tc.c, tc.r)} dos ${FACTION_NAME[before].toLowerCase()}.`);
  }
  return { events, changed: [...changed] };
}
export const campaignWon = sec => humanCount(sec) === sec.size;

// serialização: { "c,r": [h, i, r] }
export const packSectors = (sec, keys) => { const o = {}; for (const k of keys || sec.keys()) { const s = sec.get(k); o[k] = [s.h, s.i, s.r]; } return o; };
export const unpackSectors = obj => new Map(Object.entries(obj).map(([k, v]) => [k, { h: v[0], i: v[1], r: v[2] }]));
