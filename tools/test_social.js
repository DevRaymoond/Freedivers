// Teste de amizades, bloqueios, convites e esquadrões: node tools/test_social.js (banco em memória)
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const PORT = 18767, ORIGIN = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, HOST: '127.0.0.1', STORE: 'memory', DATABASE_URL: '', MIN_WIN_SECONDS: '1', BCRYPT_COST: '10', REG_PER_HOUR: '50' }, stdio: ['ignore', 'pipe', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra) => { console.log(ok ? 'OK   ' : 'FALHA', name, ok ? '' : (extra || '')); if (!ok) fails++; };
function post(path, body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path, headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => resolve({ status: res.statusCode, cookie: (res.headers['set-cookie'] || [''])[0].split(';')[0], json: JSON.parse(t || '{}') }));
    }); r.on('error', reject); r.write(d); r.end();
  });
}
async function user(name) {
  const r = await post('/api/register', { username: name, password: 'senhaforte1', confirm: 'senhaforte1' });
  const ws = await new Promise(res => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: r.cookie, Origin: ORIGIN } }); w.inbox = []; w.on('message', d => w.inbox.push(JSON.parse(d))); w.on('open', () => res(w)); w.on('error', () => res(null)); });
  ws.name = name; ws.id = r.json.user.id; return ws;
}
const send = (ws, o) => ws.send(JSON.stringify(o));
const last = (ws, t) => [...ws.inbox].reverse().find(m => m.t === t);
const clear = (...ws) => ws.forEach(w => { w.inbox.length = 0; });

(async () => {
  await wait(1200);
  const A = await user('ana_a'), B = await user('beto_b'), C = await user('caio_c'), D = await user('dani_d'), E = await user('edu_e'), F = await user('fabi_f');
  await wait(200);
  const world = C.inbox.find(m => m.t === 'hello').world;               // mundo inicial (guardado antes de limpar a caixa)

  // ── amizades ──
  clear(A, B);
  send(A, { t: 'f:add', name: 'inexistente' }); await wait(150); check('pedido para usuário inexistente falha', !!last(A, 'f:err'));
  clear(A); send(A, { t: 'f:add', name: 'ana_a' }); await wait(150); check('não dá para adicionar a si mesmo', !!last(A, 'f:err'));
  clear(A); send(A, { t: 'f:add', name: 'beto_b' }); await wait(200);
  check('pedido enviado: B é avisado', !!last(B, 'f:notice') && last(B, 'f:notice').kind === 'request' && last(B, 'f:notice').from.name === 'ana_a');
  check('lista de B mostra o pedido recebido e a de A o enviado', last(B, 'f:lists').incoming.some(x => x.name === 'ana_a') && last(A, 'f:lists').outgoing.some(x => x.name === 'beto_b'));
  clear(A); send(A, { t: 'f:add', name: 'beto_b' }); await wait(150); check('pedido repetido é recusado', !!last(A, 'f:err'));
  clear(A, B); send(B, { t: 'f:accept', id: A.id }); await wait(200);
  check('aceitar vira amizade para os dois, com presença', last(A, 'f:lists').friends.some(f => f.name === 'beto_b' && f.online) && last(B, 'f:lists').friends.some(f => f.name === 'ana_a' && f.online));
  clear(A); send(A, { t: 'f:add', name: 'beto_b' }); await wait(150); check('já são amigos', !!last(A, 'f:err'));
  send(C, { t: 'f:add', name: 'dani_d' }); await wait(150); clear(C, D); send(D, { t: 'f:add', name: 'caio_c' }); await wait(200);
  check('pedidos cruzados viram amizade', last(C, 'f:lists').friends.some(f => f.name === 'dani_d'));
  send(E, { t: 'f:add', name: 'fabi_f' }); await wait(150); clear(E, F); send(F, { t: 'f:decline', id: E.id }); await wait(200);
  check('recusar apaga o pedido', last(E, 'f:lists').outgoing.length === 0 && last(F, 'f:lists').incoming.length === 0);

  // ── convite para esquadrão ──
  clear(A, B); send(A, { t: 'host', name: 'x' }); await wait(150);
  send(A, { t: 'sq:invite', id: C.id }); await wait(150); check('só dá para convidar amigos', !!last(A, 'f:err'));
  clear(A); send(A, { t: 'sq:invite', id: B.id }); await wait(200);
  const inv = last(B, 'sq:invite'); check('amigo recebe o convite', !!inv && inv.from === 'ana_a');
  send(B, { t: 'sq:accept', inviteId: inv.inviteId }); await wait(250);
  check('aceitar o convite coloca B no esquadrão de A', !!last(B, 'joined') && last(A, 'players').players.length === 2);
  clear(B); send(B, { t: 'sq:accept', inviteId: inv.inviteId }); await wait(150); check('convite só vale uma vez', !!last(B, 'f:err'));

  // ── chat (o servidor só repassa; nada é gravado) ──
  clear(A, B, C); send(A, { t: 'chat:dm', to: B.id, text: 'oi   beto!' }); await wait(200);
  check('mensagem direta chega ao amigo (texto limpo) e o remetente recebe confirmação', !!last(B, 'chat:msg') && last(B, 'chat:msg').text === 'oi beto !' && last(B, 'chat:msg').from.name === 'ana_a' && !!last(A, 'chat:ok'));
  send(A, { t: 'chat:dm', to: C.id, text: 'oi' }); await wait(150); check('não dá para conversar com quem não é amigo', !!last(A, 'chat:err') && !last(C, 'chat:msg'));
  clear(B); send(A, { t: 'chat:dm', to: B.id, text: 'x'.repeat(900) }); await wait(150); check('mensagem é limitada a 300 caracteres', last(B, 'chat:msg').text.length === 300);
  clear(A, B); send(A, { t: 'chat:squad', text: 'bora atacar' }); await wait(150); check('chat do esquadrão chega aos outros membros', last(B, 'chat:msg') && last(B, 'chat:msg').kind === 'squad' && last(B, 'chat:msg').text === 'bora atacar' && !last(A, 'chat:msg'));
  send(B, { t: 'leave' }); await wait(100); clear(A);
  // ── bloqueio ──
  send(B, { t: 'leave' }); await wait(150);
  clear(A, B); send(A, { t: 'f:block', id: B.id }); await wait(250);
  check('bloquear remove a amizade e lista o bloqueado', last(A, 'f:lists').blocked.some(x => x.name === 'beto_b') && !last(A, 'f:lists').friends.some(x => x.name === 'beto_b'));
  clear(B); send(B, { t: 'f:add', name: 'ana_a' }); await wait(150); check('bloqueado não consegue pedir amizade', !!last(B, 'f:err'));
  clear(A, B); send(B, { t: 'chat:dm', to: A.id, text: 'oi' }); await wait(150); check('bloqueado não consegue mandar mensagem', !!last(B, 'chat:err') && !last(A, 'chat:msg'));

  // ── esquadrões abertos num setor ──
  clear(A, B, C, D, E, F);
  const sec = world.sectors, human = Object.keys(sec).filter(k => sec[k][0] >= 5000);
  const target = Object.keys(sec).find(k => sec[k][0] === 0 && [-1, 0, 1].some(dc => [-1, 0, 1].some(dr => (dc || dr) && human.includes(`${+k.split(',')[0] + dc},${+k.split(',')[1] + dr}`))));
  send(A, { t: 'sq:policy', policy: 'open' }); await wait(100);
  send(A, { t: 'campStart', key: target, level: 3 }); await wait(250);
  check('host abre a batalha no setor', !!last(A, 'campOk'), JSON.stringify(A.inbox.slice(-3)));
  clear(C); send(C, { t: 'sq:list', key: target }); await wait(150);
  const lst = last(C, 'sq:list'); check('esquadrão aberto aparece na lista do setor', lst && lst.squads.length === 1 && lst.squads[0].host === 'ana_a' && lst.squads[0].members === 1);
  clear(B); send(B, { t: 'sq:list', key: target }); await wait(150); check('quem o host bloqueou não vê o esquadrão', last(B, 'sq:list').squads.length === 0);
  clear(B); send(B, { t: 'sq:join', room: lst.squads[0].id }); await wait(150); check('bloqueado não entra no esquadrão', !!last(B, 'f:err') && !last(B, 'joined'));
  clear(C, A); send(C, { t: 'sq:join', room: lst.squads[0].id }); await wait(250);
  check('entra no esquadrão em andamento (vaga livre)', !!last(C, 'joined') && last(A, 'players').players.length === 2);
  send(D, { t: 'sq:join', room: lst.squads[0].id }); send(E, { t: 'sq:join', room: lst.squads[0].id }); await wait(300);
  check('esquadrão aceita até 4', !!last(D, 'joined') && !!last(E, 'joined') && last(A, 'players').players.length === 4);
  clear(F); send(F, { t: 'sq:join', room: lst.squads[0].id }); await wait(150); check('quinto jogador é recusado', !!last(F, 'f:err') && !last(F, 'joined'));
  clear(F); send(F, { t: 'sq:list', key: target }); await wait(150); check('esquadrão cheio some da lista', last(F, 'sq:list').squads.length === 0);
  send(E, { t: 'leave' }); await wait(100); send(A, { t: 'sq:policy', policy: 'closed' }); await wait(100);
  clear(F); send(F, { t: 'sq:list', key: target }); await wait(150); check('esquadrão fechado não aparece', last(F, 'sq:list').squads.length === 0);
  clear(F); send(F, { t: 'sq:join', room: lst.squads[0].id }); await wait(150); check('entrar num esquadrão fechado falha', !!last(F, 'f:err'));
  send(A, { t: 'sq:policy', policy: 'friends' }); await wait(100);
  clear(F); send(F, { t: 'sq:list', key: target }); await wait(150); check('política "só amigos" esconde de quem não é amigo', last(F, 'sq:list').squads.length === 0);
  await wait(1100); send(A, { t: 'campEnd', win: false, abort: true }); await wait(200);
  send(A, { t: 'sq:policy', policy: 'open' }); await wait(100);
  clear(F); send(F, { t: 'sq:list', key: target }); await wait(150); check('sem batalha ativa não há esquadrão no setor', last(F, 'sq:list').squads.length === 0);

  console.log(fails ? `${fails} falha(s)` : 'todos os testes passaram');
  for (const x of [A, B, C, D, E, F]) x && x.close();
  srv.kill(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
