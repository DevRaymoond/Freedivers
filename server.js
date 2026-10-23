// Servidor do Multipunk: serve o jogo (arquivos estáticos), contas (login/senha), mundo compartilhado da campanha e o relé WebSocket das salas.
//   Salas: o host cria uma sala e recebe um CÓDIGO; só quem digitar o código entra (máx. 4 jogadores). O servidor não simula combate.
//   Contas e mundo: com DATABASE_URL (Neon/PostgreSQL) o login é obrigatório e a campanha é uma só para todos os jogadores.
//   Sem DATABASE_URL o jogo roda local, sem contas: só o treino, sem efeito no mundo.
//
//   Uso:  npm install && node server.js
//   Variáveis (veja deploy/.env.example): PORT, HOST, DATABASE_URL, TRUST_PROXY, ALLOWED_ORIGINS, DEV, BCRYPT_COST, SESSION_DAYS, WAR_TICK_MIN
try { process.loadEnvFile && require('fs').existsSync('.env') && process.loadEnvFile('.env'); } catch { /* sem .env */ }
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createStore } = require('./store');
const { createAuth, clientIp, limiter } = require('./auth');
const { createWorld } = require('./world');
const { createSocial } = require('./social');

const root = __dirname;
const port = Number(process.env.PORT) || 8765;
const bindHost = process.env.HOST || '0.0.0.0';
const DEV = !!process.env.DEV;
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_PLAYERS = 4;

// ───────────── arquivos estáticos (lista permitida: nada de node_modules, .git, server.js, .env…) ─────────────
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
};
const allowed = p => /^\/(index\.html|main\.js|net\.js|cursor\.js|bots\.js|worldlogic\.mjs|favicon\.ico|sw\.js|manifest\.webmanifest)$/.test(p) || /^\/(lib|assets)\/[\w./-]+$/.test(p) || (DEV && /^\/tools\/[\w./-]+$/.test(p));
const gzCache = new Map();
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data: ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const ext = path.extname(file);
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': /^\/(lib|assets)\//.test(file.slice(root.length).replace(/\\/g, '/')) ? 'public, max-age=3600' : 'no-cache' };
    const compressible = ['.html', '.js', '.mjs', '.json', '.glb'].includes(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (!compressible) { res.writeHead(200, headers); return fs.createReadStream(file).pipe(res); }
    const key = file + st.mtimeMs;
    const done = gz => { res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length }); res.end(gz); };
    if (gzCache.has(key)) return done(gzCache.get(key));
    fs.readFile(file, (e, buf) => { if (e) { res.writeHead(500); return res.end(); } zlib.gzip(buf, (e2, gz) => { if (e2) { res.writeHead(500); return res.end(); } gzCache.set(key, gz); done(gz); }); });
  });
}
// Versão = hash do conteúdo dos arquivos do jogo. Muda sozinha quando você atualiza o código na VPS.
const APP_FILES = ['index.html', 'main.js', 'net.js', 'cursor.js', 'bots.js', 'worldlogic.mjs', 'assets/character.glb', 'assets/robot.glb', 'assets/spider.glb', 'assets/titan.glb', 'assets/world.json', 'assets/worldmap.jpg'];
let verCache = { sig: '', hash: 'dev' };
function appVersion() {
  let sig = '';
  for (const f of APP_FILES) { try { const st = fs.statSync(path.join(root, f)); sig += `${f}:${st.size}:${st.mtimeMs};`; } catch { sig += f + '?;'; } }
  if (sig !== verCache.sig) {
    const h = crypto.createHash('md5');
    for (const f of APP_FILES) { try { h.update(fs.readFileSync(path.join(root, f))); } catch { /* arquivo ausente */ } }
    verCache = { sig, hash: h.digest('hex').slice(0, 10) };
  }
  return verCache.hash;
}
function sendIndex(req, res) {
  fs.readFile(path.join(root, 'index.html'), 'utf8', (err, html) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    const body = Buffer.from(html.replace('content="__VERSION__"', `content="${appVersion()}"`));
    const headers = { 'Content-Type': types['.html'], 'Cache-Control': 'no-cache' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) zlib.gzip(body, (e, gz) => { res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' }); res.end(e ? body : gz); });
    else { res.writeHead(200, headers); res.end(body); }
  });
}

// ───────────── contas e mundo (só com banco) ─────────────
const store = createStore();
let auth = null, world = null, social = null;
const authOn = () => !!auth;

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
  if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  let p; try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p === '/api/world' && req.method === 'GET') {                 // mapa público somente leitura (não exige login)
    if (!world) { res.writeHead(404); return res.end('404'); }
    if (limiter.hit(`world:${clientIp(req)}`, 60, 60000)) { res.writeHead(429, { 'Retry-After': '30' }); return res.end('429'); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(world.snapshot()));
  }
  if (p.startsWith('/api/')) {
    if (auth) return void auth.handle(req, res, p);
    if (p === '/api/config') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end('{"auth":false}'); }
    res.writeHead(404); return res.end('404');
  }
  if (p === '/' || p === '/index.html') return sendIndex(req, res);
  if (p === '/version.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ version: appVersion() })); }
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p.includes('..') || !allowed(p)) { res.writeHead(404); return res.end('404'); }
  sendFile(req, res, path.join(root, p));
});
server.headersTimeout = 15000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 60;

// ───────────── salas ─────────────
const rooms = new Map();        // código -> { id, code, host, clients: Map(id -> ws), locked, policy, sector… }
let roomSeq = 0;
const memberCount = room => 1 + room.clients.size;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  for (let n = 0; n < 50; n++) {
    let c = ''; for (let i = 0; i < 5; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Jogador';
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function roster(room) {
  const list = [{ id: room.host.meta.id, name: room.host.meta.name, host: true }];
  for (const [id, c] of room.clients) list.push({ id, name: c.meta.name, host: false });
  return list;
}
function broadcastRoster(room) {
  const msg = { t: 'players', players: roster(room), locked: room.locked };
  send(room.host, msg); for (const c of room.clients.values()) send(c, msg);
}
function leave(ws) {
  const room = ws.meta && ws.meta.room;
  if (!room) return;
  ws.meta.room = null;
  if (room.host === ws) {
    for (const c of room.clients.values()) { send(c, { t: 'closed' }); c.meta.room = null; }
    rooms.delete(room.code);
  } else {
    room.clients.delete(ws.meta.id);
    send(room.host, { t: 'left', id: ws.meta.id });
    broadcastRoster(room);
  }
}
const roomUserIds = room => [room.host, ...room.clients.values()].map(w => w.meta.user && w.meta.user.id).filter(Boolean);

// entra numa sala (as regras de vaga/bloqueio/política já foram checadas); devolve texto de erro ou null
function joinRoom(ws, room, ver) {
  leave(ws);
  if (room.version && ver && room.version !== ver) return 'Seu jogo está em outra versão. Atualize a página (F5) e tente de novo.';
  if (memberCount(room) >= MAX_PLAYERS) return 'Sala cheia (máx. 4 jogadores).';
  let id = 2; while (room.clients.has(id)) id++;
  ws.meta.name = ws.meta.user ? ws.meta.user.name : ws.meta.name; ws.meta.id = id; ws.meta.room = room;
  room.clients.set(id, ws);
  send(ws, { t: 'joined', code: room.code, id, hostId: 1 });
  broadcastRoster(room);
  return null;
}

// ───────────── WebSocket (autenticado quando há banco) ─────────────
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const socketsByUser = new Map(), socketsByIp = new Map();
function reject(socket, code, msg) { socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); socket.destroy(); }
server.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => {});
  if (!/^\/ws(\?|$)/.test(req.url || '')) return reject(socket, 404, 'Not Found');
  const o = req.headers.origin;
  if (origins.length ? !origins.includes(o || '') : (o && (() => { try { return new URL(o).host !== req.headers.host; } catch { return true; } })())) return reject(socket, 403, 'Forbidden');
  const ip = clientIp(req);
  if (limiter.hit(`ws:${ip}`, 30, 60000)) return reject(socket, 429, 'Too Many Requests');
  if ((socketsByIp.get(ip) || 0) >= 8) return reject(socket, 429, 'Too Many Requests');
  let user = null;
  if (auth) {
    try { const s = await auth.sessionOf(req); if (!s) return reject(socket, 401, 'Unauthorized'); user = { id: s.userId, name: s.username }; }
    catch (e) { console.error('[ws] sessão:', e.message); return reject(socket, 503, 'Service Unavailable'); }
  }
  wss.handleUpgrade(req, socket, head, ws => { ws.ip = ip; ws.user = user; wss.emit('connection', ws, req); });
});

wss.on('connection', ws => {
  const user = ws.user;
  ws.meta = { id: 0, name: user ? user.name : 'Jogador', user, room: null, count: 0, t0: Date.now(), battle: null, lastCamp: 0 };
  ws.alive = true;
  socketsByIp.set(ws.ip, (socketsByIp.get(ws.ip) || 0) + 1);
  if (user) {                                                       // um login = uma conexão: a mais nova derruba a antiga
    const old = socketsByUser.get(user.id); if (old && old !== ws) { send(old, { t: 'kicked' }); old.close(4000, 'outra sessão'); }
    socketsByUser.set(user.id, ws);
  }
  ws.on('pong', () => { ws.alive = true; });
  if (user && social) social.presence(user, true);
  if (user && world) send(ws, { t: 'hello', user, world: world.snapshot() }); else send(ws, { t: 'hello', user: null });

  ws.on('message', raw => {
    // limite simples de mensagens por segundo
    const now = Date.now();
    if (now - ws.meta.t0 > 1000) { ws.meta.t0 = now; ws.meta.count = 0; }
    if (++ws.meta.count > 240) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const meta = ws.meta;

    if (m.t === 'host') {
      leave(ws);
      const code = newCode();
      if (!code) return send(ws, { t: 'err', msg: 'Servidor cheio. Tente de novo.' });
      meta.name = user ? user.name : cleanName(m.name); meta.id = 1;
      const room = { id: ++roomSeq, code, host: ws, clients: new Map(), locked: false, policy: 'closed', sector: null, level: 0, mission: '', startedAt: 0, version: String(m.ver || '') };
      rooms.set(code, room); meta.room = room;
      send(ws, { t: 'hosted', code, id: 1 });
      broadcastRoster(room);
    } else if (m.t === 'join') {
      leave(ws);
      if (limiter.hit(`join:${ws.ip}`, 20, 60000)) return send(ws, { t: 'err', msg: 'Muitas tentativas. Aguarde um minuto.' });   // contra adivinhar códigos
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', msg: 'Código inválido ou sala encerrada.' });
      meta.name = user ? user.name : cleanName(m.name);
      if (!(social && user)) {                                    // sem contas: checagem síncrona (ordem de entrada previsível)
        const bad = room.locked ? 'Essa sala está fechada.' : memberCount(room) >= MAX_PLAYERS ? 'Sala cheia (máx. 4 jogadores).' : null;
        if (bad) return send(ws, { t: 'err', msg: bad });
        const r = joinRoom(ws, room, String(m.ver || '')); if (r) send(ws, { t: 'err', msg: r }); return;
      }
      (async () => {
        const bad = await social.canJoin(user, room);
        if (bad) return send(ws, { t: 'err', msg: bad });
        const r = joinRoom(ws, room, String(m.ver || '')); if (r) send(ws, { t: 'err', msg: r });
      })().catch(e => { console.error('[join]', e.message); send(ws, { t: 'err', msg: 'Erro no servidor.' }); });
    } else if (m.t === 'leave') {
      leave(ws);
    } else if (social && /^(f|sq|chat):/.test(m.t)) {
      social.handle(ws, m);
    } else if (m.t === 'lock' && meta.room && meta.room.host === ws) {
      meta.room.locked = !!m.locked; broadcastRoster(meta.room);
    } else if (m.t === 'to' && meta.room) {
      const room = meta.room;
      const out = JSON.stringify({ t: 'm', from: meta.id, d: m.d });
      if (room.host === ws) {
        if (m.to === 'all') { for (const c of room.clients.values()) if (c.readyState === 1) c.send(out); }
        else { const c = room.clients.get(Number(m.to)); if (c && c.readyState === 1) c.send(out); }
      } else if (room.host.readyState === 1) room.host.send(out);        // clientes só falam com o host
    } else if (m.t === 'campStart' && world && user) {
      // reserva a batalha no servidor: só quem é host (ou joga sozinho) abre; o servidor decide se o setor pode ser atacado
      if (meta.room && meta.room.host !== ws) return send(ws, { t: 'campErr', msg: 'Só o host inicia operações.' });
      if (now - meta.lastCamp < 3000) return send(ws, { t: 'campErr', msg: 'Calma: aguarde alguns segundos.' });
      meta.lastCamp = now; meta.battle = null; if (meta.room) meta.room.sector = null;
      const members = meta.room ? roomUserIds(meta.room) : [user.id];
      world.startBattle({ userId: user.id }, { key: String(m.key || '').slice(0, 8), level: m.level, party: members.length, members })
        .then(b => { if (b.error) return send(ws, { t: 'campErr', msg: b.error }); meta.battle = b; if (meta.room) Object.assign(meta.room, { sector: b.key, level: b.level, mission: b.mission, startedAt: Date.now() }); send(ws, { t: 'campOk', id: b.id, faction: b.faction, level: b.level, party: b.party, mission: b.mission, mix: b.mix }); })
        .catch(e => { console.error('[camp]', e.message); send(ws, { t: 'campErr', msg: 'Erro no servidor. Tente de novo.' }); });
    } else if (m.t === 'campEnd' && world && user && meta.battle) {
      const b = meta.battle; meta.battle = null;
      if (meta.room) { b.members = roomUserIds(meta.room); b.party = Math.max(b.party, b.members.length); meta.room.sector = null; }
      world.endBattle(b, !!m.win && !m.abort).then(r => send(ws, { t: 'campDone', ...r })).catch(e => console.error('[camp]', e.message));
    } else if (m.t === 'ping') send(ws, { t: 'pong', n: m.n });
  });
  const gone = () => {
    leave(ws);
    if (ws.dropped) return; ws.dropped = true;
    socketsByIp.set(ws.ip, Math.max(0, (socketsByIp.get(ws.ip) || 1) - 1));
    if (user && socketsByUser.get(user.id) === ws) { socketsByUser.delete(user.id); if (social) social.presence(user, false); }
  };
  ws.on('close', gone); ws.on('error', gone);
});
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* ignora */ } }
}, 20000);

function broadcastWorld(d) {
  const msg = JSON.stringify({ t: 'world', d });
  for (const ws of wss.clients) if (ws.readyState === 1 && ws.meta && ws.meta.user) ws.send(msg);
}

(async () => {
  if (store) {
    await store.init();
    auth = createAuth(store, { origins });
    world = await createWorld(store, broadcastWorld);
    social = createSocial({ store, socketOf: id => { const w = socketsByUser.get(id); return w && w.readyState === 1 ? w : null; }, rooms, send, joinRoom, memberCount, MAX_PLAYERS });
    setInterval(() => store.purgeSessions().catch(() => {}), 3600000).unref();
    console.log(`Contas e mundo compartilhado ativos (${store.kind}).`);
  } else console.log('Sem DATABASE_URL: jogo local, sem contas (só treino, sem mundo online).');
  server.listen(port, bindHost, () => console.log(`Multipunk em http://${bindHost === '0.0.0.0' ? 'localhost' : bindHost}:${port}  (WebSocket em /ws)`));
})().catch(e => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
