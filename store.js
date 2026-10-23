// Camada de dados do Multipunk: PostgreSQL (Neon) em produção, memória para testes/desenvolvimento (STORE=memory).
// Todas as consultas usam parâmetros ($1, $2…): nada de concatenar texto do usuário em SQL.
const { Pool } = require('pg');

// ───────────── PostgreSQL ─────────────
function pgStore(url) {
  const pool = new Pool({
    connectionString: url, max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,       // o Neon pode estar "dormindo": dá tempo de acordar
    statement_timeout: 8000, query_timeout: 10000,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
  });
  pool.on('error', e => console.error('[pg] erro no pool:', e.message));
  const q = (text, params) => pool.query(text, params);
  const user = r => r && { id: Number(r.id), username: r.username, hash: r.password_hash, failed: r.failed_logins, lockedUntil: r.locked_until ? new Date(r.locked_until).getTime() : 0 };
  return {
    kind: 'postgres',
    async init() {
      await q('select 1');
      // migração: o mundo guardava % inteiras (soma 100); agora são centésimos de % (soma 10000, 1 ponto = 0,01%)
      const old = await q('select 1 from world_sectors where human + insect + robot = 100 limit 1');
      if (old.rowCount) {
        const c = await pool.connect();
        try {
          await c.query('begin');
          await c.query(`do $$ declare k record; begin for k in select conname from pg_constraint where conrelid = 'world_sectors'::regclass and contype = 'c' loop execute format('alter table world_sectors drop constraint %I', k.conname); end loop; end $$`);
          await c.query('update world_sectors set human = human * 100, insect = insect * 100, robot = robot * 100');
          await c.query('alter table world_sectors add constraint ws_range check (human between 0 and 10000 and insect between 0 and 10000 and robot between 0 and 10000), add constraint ws_sum check (human + insect + robot = 10000)');
          await c.query(`update world_meta set value = jsonb_build_object('i', (value->>'i')::bigint * 100, 'r', (value->>'r')::bigint * 100) where key = 'init'`);
          await c.query('commit'); console.log('[db] mundo migrado para a escala de 0,01%.');
        } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
      }
    },
    async close() { await pool.end(); },
    // contas
    async createUser(username, hash) {
      try { const r = await q('insert into users (username, password_hash) values ($1, $2) returning id, username', [username, hash]); return { id: Number(r.rows[0].id), username: r.rows[0].username }; }
      catch (e) { if (e.code === '23505') return null; throw e; }                   // nome já existe
    },
    async getUser(username) { return user((await q('select * from users where lower(username) = lower($1)', [username])).rows[0]); },
    async getUserById(id) { return user((await q('select * from users where id = $1', [id])).rows[0]); },
    async failLogin(id, maxFails, lockMs) {
      const r = await q(`update users set failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end,
        locked_until = case when failed_logins + 1 >= $2 then now() + ($3 || ' milliseconds')::interval else locked_until end where id = $1 returning locked_until`, [id, maxFails, String(lockMs)]);
      return r.rows[0] && r.rows[0].locked_until ? new Date(r.rows[0].locked_until).getTime() : 0;
    },
    async okLogin(id) { await q('update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1', [id]); },
    // sessões (token em hash SHA-256)
    async createSession(userId, tokenHash, expiresAt, ip, ua) {
      await q('insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)', [userId, tokenHash, new Date(expiresAt), ip, (ua || '').slice(0, 200)]);
      await q('delete from sessions where user_id = $1 and id not in (select id from sessions where user_id = $1 order by id desc limit 5)', [userId]);
    },
    async getSession(tokenHash) {
      const r = await q('select s.user_id, s.expires_at, u.username from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()', [tokenHash]);
      return r.rows[0] ? { userId: Number(r.rows[0].user_id), username: r.rows[0].username, expiresAt: new Date(r.rows[0].expires_at).getTime() } : null;
    },
    async deleteSession(tokenHash) { await q('delete from sessions where token_hash = $1', [tokenHash]); },
    async purgeSessions() { await q('delete from sessions where expires_at < now()'); },
    // mundo
    async loadWorld() {
      const meta = {}; for (const r of (await q('select key, value from world_meta')).rows) meta[r.key] = r.value;
      const sectors = (await q('select gx, gy, biome, human, insect, robot from world_sectors')).rows.map(r => ({ c: r.gx, r: r.gy, b: r.biome, h: r.human, i: r.insect, rb: r.robot }));
      const events = (await q('select text, season, id from world_events order by id desc limit 14')).rows.map(r => ({ t: r.season, m: r.text }));
      return { meta, sectors, events };
    },
    async saveWorld(meta, changed, events, season, replaceAll) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        if (replaceAll) await c.query('delete from world_sectors');
        for (const s of changed) await c.query(`insert into world_sectors (gx, gy, biome, human, insect, robot) values ($1, $2, $3, $4, $5, $6)
          on conflict (gx, gy) do update set human = $4, insect = $5, robot = $6, updated_at = now()`, [s.c, s.r, s.b, s.h, s.i, s.rb]);
        for (const [k, v] of Object.entries(meta)) await c.query('insert into world_meta (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = $2::jsonb', [k, JSON.stringify(v)]);
        for (const m of events) await c.query('insert into world_events (season, text) values ($1, $2)', [season, m]);
        await c.query('commit');
      } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    },
    // amizades e bloqueios
    async friendLists(me) {
      const f = (await q(`select f.status, f.requester_id, u.id, u.username from friendships f
        join users u on u.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
        where f.requester_id = $1 or f.addressee_id = $1`, [me])).rows;
      const out = { friends: [], incoming: [], outgoing: [], blocked: [] };
      for (const r of f) { const o = { id: Number(r.id), name: r.username }; if (r.status === 'accepted') out.friends.push(o); else if (Number(r.requester_id) === me) out.outgoing.push(o); else out.incoming.push(o); }
      out.blocked = (await q('select u.id, u.username from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1', [me])).rows.map(r => ({ id: Number(r.id), name: r.username }));
      return out;
    },
    async isBlocked(a, b) { return (await q('select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1', [a, b])).rowCount > 0; },
    async blockedByMe(me, other) { return (await q('select 1 from blocks where blocker_id = $1 and blocked_id = $2', [me, other])).rowCount > 0; },
    async areFriends(a, b) { return (await q(`select 1 from friendships where status = 'accepted' and least(requester_id, addressee_id) = least($1::bigint, $2::bigint) and greatest(requester_id, addressee_id) = greatest($1::bigint, $2::bigint)`, [a, b])).rowCount > 0; },
    async countFriendships(me) { return Number((await q('select count(*) n from friendships where requester_id = $1 or addressee_id = $1', [me])).rows[0].n); },
    async requestFriend(from, to) {
      const r = (await q(`select id, status, requester_id from friendships where least(requester_id, addressee_id) = least($1::bigint, $2::bigint) and greatest(requester_id, addressee_id) = greatest($1::bigint, $2::bigint)`, [from, to])).rows[0];
      if (r) {
        if (r.status === 'accepted') return 'friends';
        if (Number(r.requester_id) === from) return 'pending';
        await q("update friendships set status = 'accepted' where id = $1", [r.id]); return 'accepted';      // os dois pediram: vira amizade
      }
      await q("insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')", [from, to]); return 'sent';
    },
    async acceptFriend(me, from) { return (await q("update friendships set status = 'accepted' where requester_id = $2 and addressee_id = $1 and status = 'pending'", [me, from])).rowCount > 0; },
    async deleteFriendship(a, b) { return (await q('delete from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)', [a, b])).rowCount > 0; },
    async blockUser(me, other) {
      await q('delete from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)', [me, other]);
      await q('insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [me, other]);
    },
    async unblockUser(me, other) { await q('delete from blocks where blocker_id = $1 and blocked_id = $2', [me, other]); },
    // batalhas
    async createBattle(b) {
      const r = await q('insert into battles (season, host_id, gx, gy, faction, level, party) values ($1, $2, $3, $4, $5, $6, $7) returning id', [b.season, b.hostId, b.gx, b.gy, b.faction, b.level, b.party]);
      return Number(r.rows[0].id);
    },
    async finishBattle(id, result, delta, members, season, points) {
      await q('update battles set ended_at = now(), result = $2, delta = $3 where id = $1 and ended_at is null', [id, result, delta]);
      for (const uid of members) {
        await q('insert into battle_members (battle_id, user_id) values ($1, $2) on conflict do nothing', [id, uid]);
        if (result === 'win') await q(`insert into contributions (season, user_id, points, battles_won) values ($1, $2, $3, 1)
          on conflict (season, user_id) do update set points = contributions.points + $3, battles_won = contributions.battles_won + 1`, [season, uid, points]);
      }
    },
  };
}

// ───────────── memória (testes e desenvolvimento sem banco) ─────────────
function memoryStore() {
  let uid = 0, bid = 0;
  const users = new Map(), sessions = new Map(), meta = {}, sectors = new Map(), events = [], battles = new Map(), contrib = new Map();
  const hex = b => Buffer.from(b).toString('hex');
  return {
    kind: 'memory',
    async init() {}, async close() {},
    async createUser(username, hash) {
      if ([...users.values()].some(u => u.username.toLowerCase() === username.toLowerCase())) return null;
      const u = { id: ++uid, username, hash, failed: 0, lockedUntil: 0 }; users.set(u.id, u); return { id: u.id, username };
    },
    async getUser(username) { return [...users.values()].find(u => u.username.toLowerCase() === username.toLowerCase()) || null; },
    async getUserById(id) { return users.get(id) || null; },
    async failLogin(id, maxFails, lockMs) {
      const u = users.get(id); u.failed++;
      if (u.failed >= maxFails) { u.failed = 0; u.lockedUntil = Date.now() + lockMs; }
      return u.lockedUntil;
    },
    async okLogin(id) { const u = users.get(id); u.failed = 0; u.lockedUntil = 0; },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(hex(tokenHash), { userId, expiresAt });
      const mine = [...sessions.entries()].filter(([, s]) => s.userId === userId);
      while (mine.length > 5) sessions.delete(mine.shift()[0]);
    },
    async getSession(tokenHash) {
      const s = sessions.get(hex(tokenHash)); if (!s || s.expiresAt <= Date.now()) return null;
      return { userId: s.userId, username: users.get(s.userId).username, expiresAt: s.expiresAt };
    },
    async deleteSession(tokenHash) { sessions.delete(hex(tokenHash)); },
    async purgeSessions() { for (const [k, s] of sessions) if (s.expiresAt <= Date.now()) sessions.delete(k); },
    async loadWorld() { return { meta: { ...meta }, sectors: [...sectors.values()], events: events.slice(0, 14) }; },
    async saveWorld(m, changed, evs, season, replaceAll) {
      if (replaceAll) sectors.clear();
      Object.assign(meta, m);
      for (const s of changed) sectors.set(`${s.c},${s.r}`, { ...s });
      for (const t of evs) events.unshift({ t: season, m: t });
    },
    // amizades e bloqueios
    _fr: [], _bl: [],
    async friendLists(me) {
      const out = { friends: [], incoming: [], outgoing: [], blocked: [] }, nm = id => ({ id, name: users.get(id).username });
      for (const f of this._fr) {
        if (f.a !== me && f.b !== me) continue;
        const other = f.a === me ? f.b : f.a;
        if (f.status === 'accepted') out.friends.push(nm(other)); else if (f.a === me) out.outgoing.push(nm(other)); else out.incoming.push(nm(other));
      }
      for (const b of this._bl) if (b.by === me) out.blocked.push(nm(b.to));
      return out;
    },
    async isBlocked(a, b) { return this._bl.some(x => (x.by === a && x.to === b) || (x.by === b && x.to === a)); },
    async blockedByMe(me, other) { return this._bl.some(x => x.by === me && x.to === other); },
    _find(a, b) { return this._fr.find(f => (f.a === a && f.b === b) || (f.a === b && f.b === a)); },
    async areFriends(a, b) { const f = this._find(a, b); return !!f && f.status === 'accepted'; },
    async countFriendships(me) { return this._fr.filter(f => f.a === me || f.b === me).length; },
    async requestFriend(from, to) {
      const f = this._find(from, to);
      if (f) { if (f.status === 'accepted') return 'friends'; if (f.a === from) return 'pending'; f.status = 'accepted'; return 'accepted'; }
      this._fr.push({ a: from, b: to, status: 'pending' }); return 'sent';
    },
    async acceptFriend(me, from) { const f = this._fr.find(x => x.a === from && x.b === me && x.status === 'pending'); if (!f) return false; f.status = 'accepted'; return true; },
    async deleteFriendship(a, b) { const f = this._find(a, b); if (!f) return false; this._fr.splice(this._fr.indexOf(f), 1); return true; },
    async blockUser(me, other) { await this.deleteFriendship(me, other); if (!this._bl.some(x => x.by === me && x.to === other)) this._bl.push({ by: me, to: other }); },
    async unblockUser(me, other) { this._bl = this._bl.filter(x => !(x.by === me && x.to === other)); },
    async createBattle(b) { const id = ++bid; battles.set(id, { ...b, id }); return id; },
    async finishBattle(id, result, delta, members, season, points) {
      const b = battles.get(id); if (b) { b.result = result; b.delta = delta; }
      if (result === 'win') for (const u of members) { const c = contrib.get(`${season}:${u}`) || { points: 0, won: 0 }; c.points += points; c.won++; contrib.set(`${season}:${u}`, c); }
    },
    _battles: battles, _contrib: contrib, _users: users,
  };
}

function createStore() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.STORE === 'memory') return memoryStore();
  if (url) return pgStore(url);
  return null;                                   // sem banco: jogo local, sem contas
}
module.exports = { createStore, memoryStore };
