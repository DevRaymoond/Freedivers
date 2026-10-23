// Teste de contas, limites e mundo compartilhado: node tools/test_auth.js
// Sobe o servidor com banco em memória (STORE=memory) numa porta de teste; não toca no banco real.
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const PORT = 18766, ORIGIN = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, HOST: '127.0.0.1', STORE: 'memory', DATABASE_URL: '', MIN_WIN_SECONDS: '1', BCRYPT_COST: '10' }, stdio: ['ignore', 'pipe', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra) => { console.log(ok ? 'OK   ' : 'FALHA', name, ok ? '' : (extra || '')); if (!ok) fails++; };

function req(method, path, body, { cookie, origin = ORIGIN, type = 'application/json', ipHeader } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const headers = {}; if (origin) headers.Origin = origin; if (cookie) headers.Cookie = cookie; if (data) { headers['Content-Type'] = type; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { /* texto */ } resolve({ status: res.statusCode, json: j, headers: res.headers, text: t }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const cookieOf = r => (r.headers['set-cookie'] || [])[0] ? r.headers['set-cookie'][0].split(';')[0] : null;
function openWs(cookie) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: ORIGIN } });
    ws.inbox = []; ws.on('message', d => ws.inbox.push(JSON.parse(d)));
    ws.on('open', () => resolve(ws)); ws.on('error', () => resolve(null)); ws.on('unexpected-response', () => resolve(null));
  });
}
const last = (ws, t) => [...ws.inbox].reverse().find(m => m.t === t);

(async () => {
  await wait(1200);
  let r = await req('GET', '/api/config'); check('servidor informa que há contas', r.status === 200 && r.json.auth === true);
  r = await req('GET', '/api/me'); check('sem sessão: /api/me é 401', r.status === 401);
  r = await req('GET', '/api/world'); check('mapa público somente leitura não exige login', r.status === 200 && Object.keys(r.json.sectors).length > 300 && r.json.season >= 1);

  r = await req('POST', '/api/register', { username: 'ab', password: 'senhaforte1', confirm: 'senhaforte1' }); check('usuário curto é recusado', r.status === 400);
  r = await req('POST', '/api/register', { username: 'ana_01', password: 'senhaforte1', confirm: 'outra-senha' }); check('confirmação diferente é recusada', r.status === 400 && /confirma/i.test(r.json.error));
  r = await req('POST', '/api/register', { username: 'ana_01', password: '12345678', confirm: '12345678' }); check('senha fraca é recusada', r.status === 400);
  r = await req('POST', '/api/register', { username: 'ana_01', password: 'curta', confirm: 'curta' }); check('senha curta é recusada', r.status === 400);
  r = await req('POST', '/api/register', { username: 'ana_01', password: 'x'.repeat(80), confirm: 'x'.repeat(80) }); check('senha acima de 72 bytes é recusada', r.status === 400);
  r = await req('POST', '/api/register', { username: 'ana_01', password: 'senhaforte1', confirm: 'senhaforte1' }, { origin: null }); check('POST sem Origin é recusado (CSRF)', r.status === 403);
  r = await req('POST', '/api/register', { username: 'ana_01', password: 'senhaforte1', confirm: 'senhaforte1' }, { origin: 'http://evil.example' }); check('POST de outra origem é recusado', r.status === 403);
  r = await req('POST', '/api/register', '{"username":"ana_01"}', { type: 'text/plain' }); check('Content-Type errado é recusado', r.status === 415);
  let big; try { big = await req('POST', '/api/register', 'x'.repeat(5000)); } catch { big = { status: 0 }; } check('corpo grande demais é recusado', big.status === 413 || big.status === 400 || big.status === 0);

  r = await req('POST', '/api/register', { username: 'ana_01', password: 'senhaforte1', confirm: 'senhaforte1' });
  const cookieAna = cookieOf(r);
  check('registro válido cria conta e sessão', r.status === 201 && r.json.user.name === 'ana_01' && !!cookieAna);
  const sc = r.headers['set-cookie'][0]; check('cookie é HttpOnly + SameSite=Strict', /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc));
  check('a senha não aparece na resposta', !JSON.stringify(r.json).includes('senhaforte1') && !r.text.includes('hash'));
  r = await req('POST', '/api/register', { username: 'ANA_01', password: 'senhaforte1', confirm: 'senhaforte1' }); check('usuário repetido (sem diferenciar maiúsculas) é recusado', r.status === 409);
  r = await req('GET', '/api/me', undefined, { cookie: cookieAna }); check('com cookie: /api/me devolve o usuário', r.status === 200 && r.json.user.name === 'ana_01');

  r = await req('POST', '/api/login', { username: 'ana_01', password: 'errada-errada' }); const msgUser = r.json.error;
  check('senha errada: 401 genérico', r.status === 401);
  r = await req('POST', '/api/login', { username: 'nao_existe', password: 'errada-errada' }); check('usuário inexistente: mesma mensagem (não vaza se existe)', r.status === 401 && r.json.error === msgUser);
  r = await req('POST', '/api/login', { username: 'ana_01', password: 'senhaforte1' }); check('login correto funciona', r.status === 200 && !!cookieOf(r));
  const cookieLogin = cookieOf(r);
  for (let i = 0; i < 5; i++) r = await req('POST', '/api/login', { username: 'ana_01', password: 'errada-' + i });
  r = await req('POST', '/api/login', { username: 'ana_01', password: 'senhaforte1' }); check('após 5 erros a conta é bloqueada (até com a senha certa)', r.status === 429);

  // limite de cadastros por IP (5 por hora; já foram 3 válidas+inválidas que passaram pelo limite)
  let blocked = false; for (let i = 0; i < 8 && !blocked; i++) { r = await req('POST', '/api/register', { username: 'user_' + i, password: 'senhaforte1', confirm: 'senhaforte1' }); blocked = r.status === 429; }
  check('limite de cadastros por IP', blocked);

  // WebSocket
  let ws = await openWs(null); check('WebSocket sem sessão é recusado', ws === null);
  ws = await openWs(cookieLogin); await wait(200);
  check('WebSocket com sessão recebe hello com o mundo', !!ws && !!last(ws, 'hello') && last(ws, 'hello').user.name === 'ana_01' && Object.keys(last(ws, 'hello').world.sectors).length > 300);
  const w0 = last(ws, 'hello').world;
  const humanKeys = Object.keys(w0.sectors).filter(k => w0.sectors[k][0] >= 5000);
  check('começa quase tudo humano, com 8 setores inimigos', humanKeys.length === Object.keys(w0.sectors).length - 8, humanKeys.length);
  const target = Object.keys(w0.sectors).find(k => w0.sectors[k][0] === 0 && [-1, 0, 1].some(dc => [-1, 0, 1].some(dr => (dc || dr) && humanKeys.includes(`${+k.split(',')[0] + dc},${+k.split(',')[1] + dr}`))));
  ws.send(JSON.stringify({ t: 'campStart', key: '0,0', level: 3 })); await wait(150);
  check('setor fora de alcance é recusado', !!last(ws, 'campErr'));
  ws.inbox.length = 0; await wait(3100);
  ws.send(JSON.stringify({ t: 'campStart', key: target, level: 3 })); await wait(200);
  check('setor atacável é aceito', !!last(ws, 'campOk'), JSON.stringify(ws.inbox));
  check('o servidor escolhe a missão do setor (sorteada a cada 15 min)', !!last(ws, 'campOk') && ['operation', 'purge', 'samples', 'beacon', 'defend', 'extract', 'queen'].includes(last(ws, 'campOk').mission));
  ws.send(JSON.stringify({ t: 'campEnd', win: true })); await wait(200);
  check('vitória rápida demais é descartada', last(ws, 'campDone') && last(ws, 'campDone').ok === false);
  ws.inbox.length = 0; await wait(3100);
  ws.send(JSON.stringify({ t: 'campStart', key: target, level: 5 })); await wait(200); await wait(1200);
  ws.send(JSON.stringify({ t: 'campEnd', win: true })); await wait(300);
  const done = last(ws, 'campDone'), wm = last(ws, 'world');
  check('vitória válida aumenta a porcentagem humana', done && done.ok && done.delta > 0 && wm && wm.d.sectors[target][0] === done.delta, JSON.stringify(done));
  // login novo derruba o socket antigo
  r = await req('POST', '/api/register', { username: 'bia_02', password: 'senhaforte2', confirm: 'senhaforte2' }); const ck2 = cookieOf(r);
  check('nova conta (outro IP lógico) — ou limite por IP', r.status === 201 || r.status === 429);
  r = await req('POST', '/api/logout', {}, { cookie: cookieLogin }); r = await req('GET', '/api/me', undefined, { cookie: cookieLogin });
  check('logout invalida a sessão', r.status === 401);
  console.log(fails ? `${fails} falha(s)` : 'todos os testes passaram');
  if (ws) ws.close();
  srv.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
