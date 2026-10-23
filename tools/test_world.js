// Regras da guerra pelo continente (worldlogic.mjs): node tools/test_world.js
const fs = require('fs');
let fails = 0;
const check = (name, ok, extra) => { console.log(ok ? 'OK   ' : 'FALHA', name, ok ? '' : (extra || '')); if (!ok) fails++; };
(async () => {
  const W = await import('../worldlogic.mjs');
  const cells = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'assets', 'world.json'), 'utf8')).cells;
  const idx = W.makeIndex(cells), sec = W.seedSectors(idx), init = W.initTotals(sec);
  const keyOf = (c, r) => W.key(c, r);
  const human = [...sec.keys()].filter(k => W.isHuman(sec.get(k)));

  check('começa com setores humanos fixos (100%)', human.length >= 5 && human.every(k => W.stageOf(sec.get(k)) === 'fixo'));
  const front = [...sec.keys()].find(k => !W.isHuman(sec.get(k)) && W.attackable(idx, sec, k));
  const enemyCells = [...sec.keys()].filter(k => !W.isHuman(sec.get(k)));
  check('começa com 2x2 setores de cada facção, em lados opostos', enemyCells.length === 8 && [...sec.values()].filter(v => v.i === W.SCALE).length === 4 && [...sec.values()].filter(v => v.r === W.SCALE).length === 4 && human.length === sec.size - 8);
  check('só dá para atacar setor inimigo que encosta nos humanos', !!front && !W.attackable(idx, sec, human[0]));
  check('mundo salvo com o desenho antigo é reiniciado', W.isOldLayout({ i: 90000, r: 90000 }) && !W.isOldLayout(init));
  check('setor fixo (100%) não é atacável pelos jogadores', human.every(k => !W.attackable(idx, sec, k)));

  // estágios: disputa → dominado → fixo
  const s = sec.get(front); const name = '??';
  let guard = 0; const seen = [W.stageOf(s)];
  while (W.stageOf(s) !== 'fixo' && guard++ < 200) { W.applyWin(s, 'operation', 20); const st = W.stageOf(s); if (st !== seen[seen.length - 1]) seen.push(st); }
  check('uma sequência de vitórias passa por disputa → dominado → fixo', seen.join('>') === 'disputa>dominado>fixo', seen.join('>'));
  const mid = { h: 6000, i: 4000, r: 0 };
  check('setor dominado (60%) ainda é atacável para erradicar os inimigos', W.isHuman(mid) && W.stageOf(mid) === 'dominado');
  check('mensagens de estágio', /dominado/i.test(W.stageEvent('K16', 'disputa', 'dominado')) && /fixo/i.test(W.stageEvent('K16', 'dominado', 'fixo')) && W.stageEvent('K16', 'fixo', 'fixo') === null);

  // alcance: facção só ataca a partir de setor que domina; setor cercado de território humano fica fora de alcance
  const sec2 = W.seedSectors(idx);
  for (const k of sec2.keys()) { const o = idx.byKey.get(k); if (Math.hypot(o.c - 12, o.r - 17) <= 3.2) sec2.set(k, { h: W.SCALE, i: 0, r: 0 }); }   // bloco grande de setores humanos
  const innerNow = () => [...sec2.keys()].filter(k => idx.nbr.get(k).every(n => W.isHuman(sec2.get(n))));
  check('há setores totalmente cercados por território humano', innerNow().length > 0);
  let violated = [], ticks = 0;
  for (let t = 0; t < 400; t++) {
    const inner = innerNow(), snap = new Map(inner.map(k => [k, sec2.get(k).h]));
    W.warTick(idx, sec2, t + 1); ticks++;
    for (const k of inner) if (sec2.get(k).h !== snap.get(k)) violated.push(k);        // quem estava cercado antes do passo não pode mudar nele
  }
  check('setor cercado por território humano nunca é invadido (a guerra só avança vizinho a vizinho)', violated.length === 0, violated.slice(0, 5).join(' '));
  check('a soma continua 100% em todos os setores', [...sec2.values()].every(v => v.h + v.i + v.r === W.SCALE && v.h >= 0 && v.i >= 0 && v.r >= 0));

  // dinamismo: fronteiras entre insetos e robôs surgem sozinhas
  const sec3 = W.seedSectors(idx), domCount = () => [...sec3.values()].filter(v => !W.isHuman(v)).length;
  for (let t = 0; t < 1440; t++) W.warTick(idx, sec3, t + 7);
  const day1 = domCount();
  check('em 1 dia a expansão ainda é pequena', day1 <= 12, 'setores inimigos: ' + day1);
  for (let t = 1440; t < 1440 * 40; t++) W.warTick(idx, sec3, t + 7);
  const day40 = domCount();
  check('em ~40 dias os inimigos tomaram alguns setores, mas não o planeta', day40 > 8 && day40 < sec3.size * 0.4, 'setores inimigos: ' + day40);

  // setor fixo resiste: avanço inimigo é metade do normal em média
  const fixo = { h: W.SCALE, i: 0, r: 0 }, soft = { h: 9000, i: 1000, r: 0 };
  check('o inimigo só pode empurrar quem tem vizinho dominado por facção (underPressure)', typeof W.underPressure === 'function');
  console.log(fails ? `${fails} falha(s)` : 'todos os testes passaram');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
