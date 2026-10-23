// Mundo compartilhado da campanha (servidor): estado dos quadrados em memória + persistência no banco + avanço da guerra.
// Uma operação de campanha é "reservada" no servidor ao começar (campStart) e só vale se terminar (campEnd) depois de um tempo mínimo.
const fs = require('fs');
const path = require('path');

const MIN_WIN_SECONDS = Number(process.env.MIN_WIN_SECONDS) || 60;       // vitória mais rápida que isso é descartada (antifraude)
const MIN_LOSS_SECONDS = 90;
const TICK_MS = (Number(process.env.WAR_TICK_MIN) || 5) * 60000;

async function createWorld(store, onChange) {
  const W = await import('./worldlogic.mjs');
  const cells = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'world.json'), 'utf8')).cells;
  const idx = W.makeIndex(cells);
  const biome = new Map(cells.map(o => [W.key(o.c, o.r), o.b]));
  let season = 1, turn = 0, init = null, sec = null, log = [];
  let chain = Promise.resolve();                                           // mutações em fila: nunca duas ao mesmo tempo
  const queue = fn => (chain = chain.then(fn, fn));

  const rowOf = k => { const [c, r] = k.split(',').map(Number), s = sec.get(k); return { c, r, b: biome.get(k), h: s.h, i: s.i, rb: s.r }; };
  const metaNow = () => ({ season, turn, init });

  async function seed(newSeason) {
    sec = W.seedSectors(idx); init = W.initTotals(sec); turn = 0; if (newSeason) season = newSeason;
    log = [];
    await store.saveWorld(metaNow(), [...sec.keys()].map(rowOf), ['Nova temporada: cabeça de ponte estabelecida. Insetos e robôs disputam o continente.'], season, true);
    log.unshift({ t: season, m: 'Nova temporada: cabeça de ponte estabelecida. Insetos e robôs disputam o continente.' });
  }
  async function load() {
    const d = await store.loadWorld();
    if (d.sectors.length !== cells.length || !d.meta.init) { await seed(d.meta.season ? d.meta.season : 1); return; }
    season = d.meta.season || 1; turn = d.meta.turn || 0; init = d.meta.init;
    sec = new Map(d.sectors.map(s => [W.key(s.c, s.r), { h: s.h, i: s.i, r: s.rb }]));
    log = d.events;
  }
  await load();

  const snapshot = () => ({ season, turn, init, sectors: W.packSectors(sec), log: log.slice(0, 14), won: false, now: Date.now() });
  async function commit(changedKeys, events) {
    for (const m of events) log.unshift({ t: season, m });
    log.length = Math.min(log.length, 14);
    await store.saveWorld(metaNow(), changedKeys.map(rowOf), events, season, false);
    onChange({ season, turn, init, sectors: W.packSectors(sec, changedKeys), log: log.slice(0, 14), now: Date.now() });
  }

  // ───────────── batalhas ─────────────
  async function startBattle(user, { key: k, level, party, members }) {
    return queue(async () => {
      const s = sec.get(k);
      if (!s || !W.attackable(idx, sec, k)) return { error: 'Esse setor não pode ser atacado agora.' };
      level = Math.round(Number(level));
      if (!(level >= 1 && level <= 20)) return { error: 'Nível inválido.' };
      const fac = W.enemyOf(s), min = W.minLevelSector(sec, init, s);
      if (level < min) return { error: `Neste setor só valem níveis ${min}+ agora.` };
      const [c, r] = k.split(',').map(Number);
      const id = await store.createBattle({ season, hostId: user.userId, gx: c, gy: r, faction: fac, level, party, started: Date.now() });
      return { id, key: k, level, faction: fac, party, members, startedAt: Date.now(), season, mission: W.missionOf(c, r, season, Date.now()), mix: W.mixOf(s), min };
    });
  }
  async function endBattle(b, win) {
    return queue(async () => {
      const secs = (Date.now() - b.startedAt) / 1000;
      const s = sec.get(b.key), [c, r] = b.key.split(',').map(Number), name = W.cellName(c, r);
      if (!s || b.season !== season) { await store.finishBattle(b.id, 'abort', 0, [], season, 0); return { ok: false, reason: 'temporada encerrada' }; }
      if (win && secs < MIN_WIN_SECONDS) { await store.finishBattle(b.id, 'abort', 0, [], season, 0); return { ok: false, reason: 'rápido demais' }; }
      if (!win && secs < MIN_LOSS_SECONDS) { await store.finishBattle(b.id, 'abort', 0, [], season, 0); return { ok: true, delta: 0 }; }
      const before = W.dominant(s);
      let delta, events = [];
      if (win) {
        delta = W.applyWin(s, b.level, b.party);
        events.push(W.isHuman(s) && before !== 'H' ? `Setor ${name} libertado dos ${W.FACTION_NAME[before].toLowerCase()}! (+${delta}% humanos)` : `Os jogadores avançaram ${delta}% em ${name}.`);
      } else {
        delta = W.applyLoss(s);
        events.push(`A operação em ${name} falhou. O inimigo recuperou ${-delta}% do setor.`);
      }
      await store.finishBattle(b.id, win ? 'win' : 'loss', delta, b.members, season, win ? delta : 0);
      turn++;
      let changed = [b.key];
      if (win && W.campaignWon(sec)) { events.push('O continente é dos jogadores! Nova temporada começa.'); await commit(changed, events); await seed(season + 1); onChange({ ...snapshot(), reset: true }); return { ok: true, delta, season: season }; }
      await commit(changed, events);
      return { ok: true, delta };
    });
  }

  // avanço da guerra com o tempo (inimigos brigam entre si e contra os humanos)
  const timer = setInterval(() => queue(async () => {
    turn++;
    const t = W.warTick(idx, sec, W.hash2(season, turn));
    if (t.changed.length) await commit(t.changed, t.events); else await store.saveWorld(metaNow(), [], [], season, false);
  }).catch(e => console.error('[world] tick:', e.message)), TICK_MS);
  timer.unref();

  return { snapshot, startBattle, endBattle, minLevelFor: f => W.minLevel(sec, init, f), idx, W, stop: () => clearInterval(timer) };
}
module.exports = { createWorld };
