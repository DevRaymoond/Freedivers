// Camada de rede do Multipunk: WebSocket para o servidor (salas com código). Não conhece nada do jogo.
// Papéis: 'solo' (sem rede), 'host' (simula o mundo) e 'client' (renderiza o que o host manda).
export const net = {
  role: 'solo',        // 'solo' | 'host' | 'client'
  id: 0,               // id deste jogador na sala (host = 1); 0 em modo solo
  hostId: 1,
  code: '',
  roster: [],          // [{ id, name, host }]
  locked: false,
  connected: false,
  rtt: 0,
  version: '',         // versão do jogo carregada (o servidor recusa quem tem versão diferente da sala)
  onMessage: null,     // (fromId, dados) => void
  onRoster: null,      // () => void
  onLeft: null,        // (id) => void           (host: um cliente saiu)
  onClosed: null,      // (motivo) => void       (cliente: o host saiu / conexão caiu)
  user: null,          // { id, name } quando o servidor tem contas
  persist: false,      // mantém a conexão aberta (e reconecta) enquanto a pessoa está logada
  onWorld: null,       // (dados, completo) => void   mundo compartilhado da campanha
  onCamp: null,        // (msg) => void               campOk / campErr / campDone
  onConn: null,        // (conectado) => void
  onKicked: null,      // () => void                  login aberto em outro lugar
  onSocial: null,      // (msg) => void               amizades, convites e esquadrões (f:* e sq:*)
};

let ws = null;
let waiter = null;       // espera pela resposta do servidor a 'host' / 'join'
let pingTimer = null;
let retryT = null, retryN = 0;

function wsUrl() { return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`; }

function open() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === 1) return resolve();
    try { ws = new WebSocket(wsUrl()); } catch (e) { return reject(new Error('Servidor indisponível.')); }
    const sock = ws;
    sock.onopen = () => {
      net.connected = true; retryN = 0; net.onConn && net.onConn(true);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { net.t0 = performance.now(); send({ t: 'ping', n: 1 }); }, 4000);
      resolve();
    };
    sock.onerror = () => { if (!net.connected) reject(new Error('Não foi possível conectar ao servidor. Abra o jogo pelo endereço do servidor (não pelo arquivo).')); };
    sock.onclose = () => {
      const was = net.role;
      net.connected = false; clearInterval(pingTimer);
      if (waiter) { waiter.reject(new Error('Conexão encerrada.')); waiter = null; }
      if (sock === ws) {
        ws = null; net.onConn && net.onConn(false);
        if (was !== 'solo') { reset(); net.onClosed && net.onClosed('Conexão com o servidor perdida.'); }
        if (net.persist && !net.kicked) { clearTimeout(retryT); retryT = setTimeout(() => open().catch(() => {}), Math.min(15000, 1500 * 2 ** retryN++)); }
      }
    };
    sock.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case 'hosted': net.role = 'host'; net.id = m.id; net.hostId = m.id; net.code = m.code; waiter && waiter.resolve(m); waiter = null; break;
        case 'joined': net.role = 'client'; net.id = m.id; net.hostId = m.hostId; net.code = m.code; waiter && waiter.resolve(m); waiter = null; break;
        case 'err': if (waiter) { waiter.reject(new Error(m.msg)); waiter = null; } break;
        case 'players': net.roster = m.players; net.locked = !!m.locked; net.onRoster && net.onRoster(); break;
        case 'm': net.onMessage && net.onMessage(m.from, m.d); break;
        case 'left': net.onLeft && net.onLeft(m.id); break;
        case 'closed': reset(); net.onClosed && net.onClosed('O host encerrou a sala.'); break;
        case 'hello': net.user = m.user || null; if (m.world) net.onWorld && net.onWorld(m.world, true); break;
        case 'world': net.onWorld && net.onWorld(m.d, !!m.d.reset); break;
        case 'campOk': case 'campErr': case 'campDone': net.onCamp && net.onCamp(m); break;
        case 'f:lists': case 'f:notice': case 'f:ok': case 'f:err': case 'f:pres': case 'sq:list': case 'sq:invite': case 'sq:policy': net.onSocial && net.onSocial(m); break;
        case 'kicked': net.kicked = true; net.onKicked && net.onKicked(); break;
        case 'pong': net.rtt = Math.round(performance.now() - (net.t0 || performance.now())); break;
      }
    };
  });
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function reset() { net.role = 'solo'; net.id = 0; net.hostId = 1; net.code = ''; net.roster = []; net.locked = false; }
function ask(msg) {
  return new Promise((resolve, reject) => { waiter = { resolve, reject }; send(msg); setTimeout(() => { if (waiter) { waiter = null; reject(new Error('O servidor não respondeu.')); } }, 6000); });
}

net.host = async name => { await open(); return ask({ t: 'host', name, ver: net.version }); };
net.join = async (code, name) => { await open(); return ask({ t: 'join', code, name, ver: net.version }); };
net.leave = () => { send({ t: 'leave' }); reset(); };           // sai da sala mas mantém a conexão (login e mundo) aberta
net.connect = () => { net.persist = true; net.kicked = false; return open(); };
net.disconnect = () => { net.persist = false; clearTimeout(retryT); const s = ws; ws = null; reset(); net.user = null; try { s && s.close(); } catch { /* ok */ } };
net.send = o => send(o);
net.campStart = (key, level) => send({ t: 'campStart', key, level });
net.campEnd = (win, abort) => send({ t: 'campEnd', win: !!win, abort: !!abort });
net.lock = locked => { send({ t: 'lock', locked }); };
net.toHost = d => send({ t: 'to', to: 'host', d });          // cliente → host
net.to = (id, d) => send({ t: 'to', to: id, d });             // host → um cliente
net.all = d => { if (net.roster.length > 1) send({ t: 'to', to: 'all', d }); };   // host → todos os clientes
net.names = () => Object.fromEntries(net.roster.map(p => [p.id, p.name]));
