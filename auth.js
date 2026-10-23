// Contas do Multipunk: registro e login com usuário + senha (bcrypt), sessões em cookie HttpOnly, limites de taxa e bloqueio por tentativas.
//
// Defesas: bcrypt custo 12 · senha de 8 a 72 bytes (limite do bcrypt) · comparação sempre executa o bcrypt (sem vazar se o usuário existe pelo tempo)
// · limite por IP e por usuário · bloqueio de 15 min após 5 erros seguidos · token de sessão aleatório de 256 bits, guardado só em hash SHA-256
// · cookie HttpOnly + SameSite=Strict (+ Secure em HTTPS) · checagem de Origin em todo POST · corpo máximo de 2 KB com tempo limite.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COST = Math.min(14, Math.max(10, Number(process.env.BCRYPT_COST) || 12));
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
const COOKIE = 'mp_session';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);
const WEAK = new Set(['12345678', '123456789', '1234567890', 'password', 'senha123', 'senha1234', 'qwertyui', 'qwerty123', '11111111', 'abcd1234', 'iloveyou', 'multipunk', 'password1', 'brasil123']);

// ───────────── utilidades ─────────────
class RateLimiter {                                   // janela deslizante em memória
  constructor() { this.hits = new Map(); setInterval(() => this.sweep(), 60000).unref(); }
  hit(key, limit, windowMs) {
    const now = Date.now(), arr = (this.hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now); this.hits.set(key, arr);
    return arr.length <= limit ? 0 : Math.ceil((arr[0] + windowMs - now) / 1000);   // 0 = liberado; senão, segundos de espera
  }
  sweep() { const now = Date.now(); for (const [k, a] of this.hits) if (!a.length || now - a[a.length - 1] > 3600000) this.hits.delete(k); }
}
const limiter = new RateLimiter();

function clientIp(req) {
  if (TRUST_PROXY) {                                  // atrás do nginx/Caddy: o último valor é o que o NOSSO proxy acrescentou
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xf.length) return xf[xf.length - 1];
  }
  return req.socket.remoteAddress || '0.0.0.0';
}
const isHttps = req => !!(req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || process.env.COOKIE_SECURE === '1');
function parseCookies(req) {
  const out = {}; for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
const sha = t => crypto.createHash('sha256').update(t).digest();
const newToken = () => crypto.randomBytes(32).toString('base64url');
function setCookie(res, req, token, maxAgeSec) {
  const flags = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeSec}`]; if (isHttps(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${flags.join('; ')}`);
}

function validUsername(u) { return typeof u === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(u); }
function passwordProblem(p, username) {
  if (typeof p !== 'string') return 'Senha inválida.';
  const bytes = Buffer.byteLength(p, 'utf8');
  if (p.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (bytes > 72) return 'A senha pode ter no máximo 72 bytes.';
  if (WEAK.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return 'Essa senha é fraca demais. Escolha outra.';
  if (username && p.toLowerCase() === username.toLowerCase()) return 'A senha não pode ser igual ao usuário.';
  return null;
}

// ───────────── HTTP ─────────────
function readJson(req, max = 2048, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return reject({ status: 415, msg: 'Conteúdo inválido.' });
    let size = 0; const chunks = [];
    const timer = setTimeout(() => { reject({ status: 408, msg: 'Tempo esgotado.' }); req.destroy(); }, timeoutMs);
    req.on('data', c => { size += c.length; if (size > max) { clearTimeout(timer); reject({ status: 413, msg: 'Pedido grande demais.' }); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { clearTimeout(timer); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject({ status: 400, msg: 'JSON inválido.' }); } });
    req.on('error', () => { clearTimeout(timer); reject({ status: 400, msg: 'Erro de leitura.' }); });
  });
}
function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}
function sameOrigin(req, allowed) {
  const o = req.headers.origin; if (!o) return false;
  if (allowed.length) return allowed.includes(o);
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

function createAuth(store, { origins = [] } = {}) {
  async function startSession(req, res, user) {
    const token = newToken(), expires = Date.now() + SESSION_DAYS * 86400000;
    await store.createSession(user.id, sha(token), expires, clientIp(req), req.headers['user-agent']);
    setCookie(res, req, token, SESSION_DAYS * 86400);
  }
  async function sessionOf(req) {                      // usado também no upgrade do WebSocket
    const t = parseCookies(req)[COOKIE]; if (!t || t.length > 64) return null;
    return store.getSession(sha(t));
  }

  async function handle(req, res, path) {
    if (!path.startsWith('/api/')) return false;
    try {
      if (req.method === 'GET' && path === '/api/config') return send(res, 200, { auth: true }), true;
      if (req.method === 'GET' && path === '/api/me') {
        const s = await sessionOf(req);
        return s ? send(res, 200, { user: { id: s.userId, name: s.username } }) : send(res, 401, { error: 'Sem sessão.' }), true;
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' }), true;
      if (!sameOrigin(req, origins)) return send(res, 403, { error: 'Origem não permitida.' }), true;
      const ip = clientIp(req);

      if (path === '/api/logout') {
        const t = parseCookies(req)[COOKIE]; if (t && t.length <= 64) await store.deleteSession(sha(t));
        setCookie(res, req, '', 0); return send(res, 200, { ok: true }), true;
      }

      if (path === '/api/register') {
        const w0 = limiter.hit(`regtry:${ip}`, 40, 600000);              // teto geral de tentativas (inclui erros de digitação)
        if (w0) return send(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'Retry-After': w0 }), true;
        const b = await readJson(req);
        if (!validUsername(b.username)) return send(res, 400, { error: 'Usuário: 3 a 20 letras, números ou _.' }), true;
        if (b.password !== b.confirm) return send(res, 400, { error: 'A confirmação da senha não confere.' }), true;
        const bad = passwordProblem(b.password, b.username); if (bad) return send(res, 400, { error: bad }), true;
        const wait = limiter.hit(`reg:${ip}`, 5, 3600000);               // contas novas por IP: 5 por hora
        if (wait) return send(res, 429, { error: `Muitos cadastros deste endereço. Tente em ${Math.ceil(wait / 60)} min.` }, { 'Retry-After': wait }), true;
        const hash = await bcrypt.hash(b.password, COST);
        const user = await store.createUser(b.username, hash);
        if (!user) return send(res, 409, { error: 'Esse usuário já existe.' }), true;
        await startSession(req, res, user);
        return send(res, 201, { user: { id: user.id, name: user.username } }), true;
      }

      if (path === '/api/login') {
        const wait = limiter.hit(`login:${ip}`, 15, 600000);
        if (wait) return send(res, 429, { error: `Muitas tentativas. Tente em ${Math.ceil(wait / 60)} min.` }, { 'Retry-After': wait }), true;
        const b = await readJson(req);
        if (typeof b.username !== 'string' || typeof b.password !== 'string' || b.username.length > 40 || b.password.length > 200) return send(res, 400, { error: 'Dados inválidos.' }), true;
        const waitU = limiter.hit(`loginu:${b.username.toLowerCase()}`, 10, 600000);
        if (waitU) return send(res, 429, { error: `Muitas tentativas para este usuário. Tente em ${Math.ceil(waitU / 60)} min.` }, { 'Retry-After': waitU }), true;
        const user = validUsername(b.username) ? await store.getUser(b.username) : null;
        const locked = user && user.lockedUntil > Date.now();
        const ok = await bcrypt.compare(b.password, user ? user.hash : DUMMY_HASH);       // sempre roda o bcrypt (tempo constante)
        if (locked) return send(res, 429, { error: `Conta bloqueada por tentativas erradas. Tente em ${Math.ceil((user.lockedUntil - Date.now()) / 60000)} min.` }), true;
        if (!user || !ok) {
          if (user) await store.failLogin(user.id, MAX_FAILS, LOCK_MS);
          return send(res, 401, { error: 'Usuário ou senha inválidos.' }), true;
        }
        await store.okLogin(user.id);
        await startSession(req, res, user);
        return send(res, 200, { user: { id: user.id, name: user.username } }), true;
      }
      return send(res, 404, { error: 'Não encontrado.' }), true;
    } catch (e) {
      if (e && e.status) return send(res, e.status, { error: e.msg }), true;
      console.error('[auth] erro:', e && e.message);
      return send(res, 500, { error: 'Erro interno. Tente de novo.' }), true;
    }
  }
  return { handle, sessionOf, clientIp, limiter };
}

module.exports = { createAuth, clientIp, limiter, validUsername, passwordProblem, COOKIE };
