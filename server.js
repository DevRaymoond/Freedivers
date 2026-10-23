// Servidor do Multipunk: serve o jogo (arquivos estáticos) e faz o relé WebSocket das salas.
//   Salas: o host cria uma sala e recebe um CÓDIGO; só quem digitar o código entra (máx. 4 jogadores).
//   O servidor não simula nada: apenas repassa mensagens entre o host e os clientes.
//
//   Uso:  npm install && node server.js
//   Variáveis: PORT (padrão 8765), HOST (padrão 0.0.0.0; use 127.0.0.1 para jogo local), DEV=1 (libera /tools),
//              ALLOWED_ORIGINS (lista separada por vírgula; vazio = qualquer origem)
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const root = __dirname;
const port = Number(process.env.PORT) || 8765;
const bindHost = process.env.HOST || '0.0.0.0';
const DEV = !!process.env.DEV;
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_PLAYERS = 4;

// ───────────── arquivos estáticos (lista permitida: nada de node_modules, .git, server.js…) ─────────────
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.webp': 'image/webp',
};
const allowed = p => /^\/(index\.html|main\.js|net\.js|cursor\.js|favicon\.ico)$/.test(p) || /^\/(lib|assets)\/[\w./-]+$/.test(p) || (DEV && /^\/tools\/[\w./-]+$/.test(p));
const gzCache = new Map();
function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    const ext = path.extname(file);
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': /^\/(lib|assets)\//.test(file.slice(root.length).replace(/\\/g, '/')) ? 'public, max-age=3600' : 'no-cache' };
    const compressible = ['.html', '.js', '.json', '.glb'].includes(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (!compressible) { res.writeHead(200, headers); return fs.createReadStream(file).pipe(res); }
    const key = file + st.mtimeMs;
    const done = gz => { res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length }); res.end(gz); };
    if (gzCache.has(key)) return done(gzCache.get(key));
    fs.readFile(file, (e, buf) => { if (e) { res.writeHead(500); return res.end(); } zlib.gzip(buf, (e2, gz) => { if (e2) { res.writeHead(500); return res.end(); } gzCache.set(key, gz); done(gz); }); });
  });
}
// Versão = hash do conteúdo dos arquivos do jogo. Muda sozinha quando você atualiza o código na VPS.
const APP_FILES = ['index.html', 'main.js', 'net.js', 'cursor.js', 'assets/character.glb'];
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
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '/index.html') return sendIndex(req, res);
  if (p === '/version.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ version: appVersion() })); }
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p.includes('..') || !allowed(p)) { res.writeHead(404); return res.end('404'); }
  sendFile(req, res, path.join(root, p));
});

// ───────────── salas ─────────────
const rooms = new Map();        // código -> { code, host, clients: Map(id -> ws), locked }
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  for (let n = 0; n < 50; n++) {
    let c = ''; for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws, req) => {
  if (origins.length && !origins.includes(req.headers.origin || '')) return ws.close(1008, 'origem não permitida');
  ws.meta = { id: 0, name: 'Jogador', room: null, count: 0, t0: Date.now() };
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
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
      meta.name = cleanName(m.name); meta.id = 1;
      const room = { code, host: ws, clients: new Map(), locked: false, version: String(m.ver || '') };
      rooms.set(code, room); meta.room = room;
      send(ws, { t: 'hosted', code, id: 1 });
      broadcastRoster(room);
    } else if (m.t === 'join') {
      leave(ws);
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', msg: 'Código inválido ou sala encerrada.' });
      if (room.version && m.ver && room.version !== String(m.ver)) return send(ws, { t: 'err', msg: 'Seu jogo está em outra versão. Atualize a página (F5) e tente de novo.' });
      if (room.locked) return send(ws, { t: 'err', msg: 'Essa sala já iniciou a operação.' });
      if (room.clients.size + 1 >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'Sala cheia (máx. 4 jogadores).' });
      let id = 2; while (room.clients.has(id)) id++;
      meta.name = cleanName(m.name); meta.id = id; meta.room = room;
      room.clients.set(id, ws);
      send(ws, { t: 'joined', code: room.code, id, hostId: 1 });
      broadcastRoster(room);
    } else if (m.t === 'lock' && meta.room && meta.room.host === ws) {
      meta.room.locked = !!m.locked; broadcastRoster(meta.room);
    } else if (m.t === 'to' && meta.room) {
      const room = meta.room;
      const out = JSON.stringify({ t: 'm', from: meta.id, d: m.d });
      if (room.host === ws) {
        if (m.to === 'all') { for (const c of room.clients.values()) if (c.readyState === 1) c.send(out); }
        else { const c = room.clients.get(Number(m.to)); if (c && c.readyState === 1) c.send(out); }
      } else if (room.host.readyState === 1) room.host.send(out);        // clientes só falam com o host
    } else if (m.t === 'ping') send(ws, { t: 'pong', n: m.n });
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* ignora */ } }
}, 20000);

server.listen(port, bindHost, () => console.log(`Multipunk em http://${bindHost === '0.0.0.0' ? 'localhost' : bindHost}:${port}  (WebSocket em /ws)`));
