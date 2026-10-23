// Amizades, bloqueios, convites e esquadrões abertos (tudo pelo WebSocket autenticado).
// O servidor é a autoridade: valida pedidos, bloqueios, vagas e política do esquadrão; o cliente só pede e mostra.
const crypto = require('crypto');
const { limiter } = require('./auth');

const MAX_RELATIONS = 120;                 // amigos + pedidos por conta
const INVITE_MS = 60000;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const cleanText = t => String(t == null ? '' : t).split('').map(c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ? ' ' : c).join('').replace(/\s+/g, ' ').trim().slice(0, 300);

function createSocial({ store, socketOf, rooms, send, joinRoom, memberCount, MAX_PLAYERS }) {
  const invites = new Map();               // inviteId -> { from, fromName, to, roomId, expires }
  setInterval(() => { const now = Date.now(); for (const [k, v] of invites) if (v.expires < now) invites.delete(k); }, 15000).unref();

  const roomById = id => { for (const r of rooms.values()) if (r.id === id) return r; return null; };
  const hostName = r => r.host.meta.name;

  // lista de amizades com presença (online / em qual esquadrão)
  async function listsFor(uid) {
    const L = await store.friendLists(uid);
    L.friends = L.friends.map(f => {
      const w = socketOf(f.id), room = w && w.meta.room;
      return { ...f, online: !!w, squad: room ? { id: room.id, host: hostName(room), members: memberCount(room), max: MAX_PLAYERS, sector: room.sector, policy: room.policy, locked: room.locked } : null };
    });
    return L;
  }
  async function push(uid) { const w = socketOf(uid); if (w) send(w, { t: 'f:lists', ...(await listsFor(uid)) }); }
  async function notify(uid, msg) { const w = socketOf(uid); if (w) send(w, msg); }
  const err = (ws, msg) => send(ws, { t: 'f:err', msg });

  async function presence(user, online) {            // avisa os amigos conectados quando alguém entra ou sai
    try { for (const f of (await store.friendLists(user.id)).friends) { const w = socketOf(f.id); if (w) send(w, { t: 'f:pres', id: user.id, name: user.name, online }); } } catch { /* ok */ }
  }

  // regras de entrada num esquadrão (usadas por squad:join, convite e lista)
  async function canJoin(user, room) {
    if (!room || room.host.readyState !== 1) return 'Esse esquadrão não existe mais.';
    if (room.locked) return 'Esse esquadrão está fechado.';
    if (memberCount(room) >= MAX_PLAYERS) return 'Esquadrão cheio (máx. 4).';
    const hostId = room.host.meta.user && room.host.meta.user.id;
    if (hostId && (await store.isBlocked(user.id, hostId))) return 'Não foi possível entrar nesse esquadrão.';
    for (const w of room.clients.values()) if (w.meta.user && (await store.blockedByMe(w.meta.user.id, user.id))) return 'Não foi possível entrar nesse esquadrão.';
    return null;
  }

  async function handle(ws, m) {
    const user = ws.meta.user; if (!user || typeof m.t !== 'string') return false;
    if (!/^(f|sq|chat):/.test(m.t)) return false;
    if (limiter.hit(`soc:${user.id}`, 40, 60000)) { err(ws, 'Calma: muitas ações seguidas.'); return true; }
    try {
      switch (m.t) {
        case 'f:list': send(ws, { t: 'f:lists', ...(await listsFor(user.id)) }); return true;

        case 'f:add': {
          const name = String(m.name || '').trim();
          if (!NAME_RE.test(name)) return err(ws, 'Digite o nome de usuário exato (3 a 20 letras, números ou _).'), true;
          if (limiter.hit(`fadd:${user.id}`, 12, 600000)) return err(ws, 'Muitos pedidos seguidos. Aguarde alguns minutos.'), true;
          const other = await store.getUser(name);
          if (!other || other.id === user.id) return err(ws, other ? 'Você não pode adicionar a si mesmo.' : 'Usuário não encontrado.'), true;
          if (await store.isBlocked(user.id, other.id)) return err(ws, (await store.blockedByMe(user.id, other.id)) ? 'Você bloqueou esse usuário. Desbloqueie para adicionar.' : 'Não foi possível enviar o pedido.'), true;
          if ((await store.countFriendships(user.id)) >= MAX_RELATIONS) return err(ws, 'Sua lista de amigos está cheia.'), true;
          if ((await store.countFriendships(other.id)) >= MAX_RELATIONS) return err(ws, 'Não foi possível enviar o pedido.'), true;
          const r = await store.requestFriend(user.id, other.id);
          if (r === 'friends') return err(ws, 'Vocês já são amigos.'), true;
          if (r === 'pending') return err(ws, 'Você já enviou um pedido para essa pessoa.'), true;
          send(ws, { t: 'f:ok', msg: r === 'accepted' ? `Agora você e ${other.username} são amigos!` : `Pedido enviado para ${other.username}.` });
          await notify(other.id, { t: 'f:notice', kind: r === 'accepted' ? 'accepted' : 'request', from: { id: user.id, name: user.name } });
          await push(user.id); await push(other.id); return true;
        }
        case 'f:accept': {
          const id = Number(m.id); if (!Number.isInteger(id)) return true;
          if (!(await store.acceptFriend(user.id, id))) return err(ws, 'Pedido não encontrado.'), true;
          await notify(id, { t: 'f:notice', kind: 'accepted', from: { id: user.id, name: user.name } });
          await push(user.id); await push(id); return true;
        }
        case 'f:decline': case 'f:cancel': case 'f:remove': {                 // todos apagam a relação; muda só a mensagem
          const id = Number(m.id); if (!Number.isInteger(id)) return true;
          await store.deleteFriendship(user.id, id);
          await push(user.id); await push(id); return true;
        }
        case 'f:block': {
          let id = Number(m.id);
          if (!Number.isInteger(id) && typeof m.name === 'string' && NAME_RE.test(m.name)) { const o = await store.getUser(m.name); id = o ? o.id : NaN; }
          if (!Number.isInteger(id) || id === user.id) return err(ws, 'Usuário não encontrado.'), true;
          await store.blockUser(user.id, id);
          send(ws, { t: 'f:ok', msg: 'Usuário bloqueado.' });
          await push(user.id); await push(id); return true;
        }
        case 'f:unblock': {
          const id = Number(m.id); if (!Number.isInteger(id)) return true;
          await store.unblockUser(user.id, id); await push(user.id); return true;
        }

        // ── esquadrões ──
        case 'sq:list': {                                                       // esquadrões jogando um setor, com vaga
          const key = String(m.key || '').slice(0, 8), out = [];
          for (const r of rooms.values()) {
            if (r.sector !== key || r.host === ws || r.policy === 'closed') continue;
            if (r.policy === 'friends' && !(await store.areFriends(user.id, r.host.meta.user.id))) continue;
            if (await canJoin(user, r)) continue;
            out.push({ id: r.id, host: hostName(r), members: memberCount(r), max: MAX_PLAYERS, level: r.level, mission: r.mission, secs: Math.round((Date.now() - r.startedAt) / 1000), friends: r.policy === 'friends' });
          }
          send(ws, { t: 'sq:list', key, squads: out.slice(0, 12) }); return true;
        }
        case 'sq:join': {
          const room = roomById(Number(m.room)); if (!room) return err(ws, 'Esse esquadrão não existe mais.'), true;
          if (room.host === ws || ws.meta.room === room) return true;
          const hostId = room.host.meta.user.id;
          if (room.policy === 'closed') return err(ws, 'Esse esquadrão está fechado.'), true;
          if (room.policy === 'friends' && !(await store.areFriends(user.id, hostId))) return err(ws, 'Esse esquadrão é só para amigos do host.'), true;
          const bad = await canJoin(user, room); if (bad) return err(ws, bad), true;
          const r = joinRoom(ws, room, String(m.ver || '')); if (r) err(ws, r); return true;
        }
        case 'sq:policy': {
          const room = ws.meta.room; if (!room || room.host !== ws) return true;
          if (['open', 'friends', 'closed'].includes(m.policy)) { room.policy = m.policy; send(ws, { t: 'sq:policy', policy: room.policy }); }
          return true;
        }
        case 'sq:invite': {
          const room = ws.meta.room, id = Number(m.id);
          if (!room) return err(ws, 'Você não está em um esquadrão.'), true;
          if (!Number.isInteger(id) || !(await store.areFriends(user.id, id))) return err(ws, 'Só dá para convidar amigos.'), true;
          const w = socketOf(id); if (!w) return err(ws, 'Seu amigo está offline.'), true;
          if (w.meta.room === room) return err(ws, 'Seu amigo já está no esquadrão.'), true;
          if (room.locked || memberCount(room) >= MAX_PLAYERS) return err(ws, 'O esquadrão está cheio ou fechado.'), true;
          if (await store.isBlocked(user.id, id)) return err(ws, 'Não foi possível convidar.'), true;
          if (limiter.hit(`inv:${user.id}:${id}`, 3, 60000)) return err(ws, 'Convite enviado há pouco. Aguarde.'), true;
          for (const v of invites.values()) if (v.from === user.id && v.to === id && v.roomId === room.id) return err(ws, 'Convite já enviado.'), true;
          const inviteId = crypto.randomBytes(8).toString('hex');
          invites.set(inviteId, { from: user.id, fromName: user.name, to: id, roomId: room.id, expires: Date.now() + INVITE_MS });
          send(w, { t: 'sq:invite', inviteId, from: user.name, sector: room.sector, members: memberCount(room), max: MAX_PLAYERS, secs: INVITE_MS / 1000 });
          send(ws, { t: 'f:ok', msg: 'Convite enviado.' }); return true;
        }
        case 'sq:accept': {
          const inv = invites.get(String(m.inviteId)); invites.delete(String(m.inviteId));
          if (!inv || inv.to !== user.id || inv.expires < Date.now()) return err(ws, 'O convite expirou.'), true;
          const room = roomById(inv.roomId); const bad = await canJoin(user, room); if (bad) return err(ws, bad), true;
          if (ws.meta.room === room) return true;
          const r = joinRoom(ws, room, String(m.ver || '')); if (r) err(ws, r); return true;
        }
        // ── chat: o servidor só repassa em memória; nada é gravado nem registrado (o histórico fica no aparelho de cada jogador) ──
        case 'chat:dm': {
          const id = Number(m.to), text = cleanText(m.text);
          if (!Number.isInteger(id) || !text) return true;
          if (limiter.hit(`chat:${user.id}`, 30, 60000)) return send(ws, { t: 'chat:err', to: id, msg: 'Calma: muitas mensagens seguidas.' }), true;
          if (!(await store.areFriends(user.id, id)) || (await store.isBlocked(user.id, id))) return send(ws, { t: 'chat:err', to: id, msg: 'Só dá para conversar com amigos.' }), true;
          const w = socketOf(id); if (!w) return send(ws, { t: 'chat:err', to: id, msg: 'Seu amigo está offline: a mensagem não foi entregue.' }), true;
          send(w, { t: 'chat:msg', kind: 'dm', from: { id: user.id, name: user.name }, text, at: Date.now() });
          send(ws, { t: 'chat:ok', to: id }); return true;
        }
        case 'chat:squad': {
          const room = ws.meta.room, text = cleanText(m.text);
          if (!room || !text) return true;
          if (limiter.hit(`chat:${user.id}`, 30, 60000)) return send(ws, { t: 'chat:err', to: 0, msg: 'Calma: muitas mensagens seguidas.' }), true;
          for (const w of [room.host, ...room.clients.values()]) {
            if (w === ws || w.readyState !== 1 || !w.meta.user) continue;
            if (await store.isBlocked(user.id, w.meta.user.id)) continue;
            send(w, { t: 'chat:msg', kind: 'squad', from: { id: user.id, name: user.name }, text, at: Date.now() });
          }
          return true;
        }
        case 'sq:decline': { const inv = invites.get(String(m.inviteId)); if (inv && inv.to === user.id) { invites.delete(String(m.inviteId)); await notify(inv.from, { t: 'f:ok', msg: `${user.name} recusou o convite.` }); } return true; }
      }
    } catch (e) { console.error('[social]', e.message); err(ws, 'Erro no servidor. Tente de novo.'); return true; }
    return false;
  }
  return { handle, presence, push, canJoin };
}
module.exports = { createSocial };
