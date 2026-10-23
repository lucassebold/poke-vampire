// Salas pagas (pagamento SIMULADO) contra o servidor real. Rode o servidor com:
//   PAID_WAIT=4 PAID_START=3 PAY_WINDOW=6 PAID_RESULTS=3 TIME_SCALE=70 TEST_GOD=1 node server.js
const WebSocket = require('../node_modules/ws'); const URL = 'ws://localhost:8780/ws';
let bad = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
function bot(name, ch, paid) {
  return new Promise(res => { const ws = new WebSocket(URL), c = { ws, name, msgs: [], closed: false, x: 0, y: 0, spd: 100, id: 0 };
    ws.on('open', () => { ws.send(JSON.stringify(paid ? { t: 'join', name, ch, paid: true, pack: 'pokemon_25' } : { t: 'join', name, ch })); res(c); });
    ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'welcome') c.id = m.you; if (m.t === 'snap') { if (!c.me) { c.x = m.me.x; c.y = m.me.y; } c.me = m.me; c.spd = m.me.spd; if (m.me.ch) ws.send(JSON.stringify({ t: 'pick', i: 0 })); } });
    ws.on('close', () => { c.closed = true; });
    c.iv = setInterval(() => { if (ws.readyState === 1 && c.me) { c.x += 3; ws.send(JSON.stringify({ t: 's', x: c.x, y: c.y, fx: 1, fy: 0, f: 1, m: 1, sp: 0 })); } }, 50);
  });
}
const has = (c, t) => c.msgs.some(m => m.t === t), last = (c, t) => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].t === t) return c.msgs[i]; return null; };
(async () => {
  // A) um jogador sozinho: sala paga cancela
  const a = await bot('Solo', 'PORTA', true); await wait(500); check(has(a, 'lobby') && last(a, 'lobby').paid.stage === 'wait', 'A: lobby em espera (1/' + last(a, 'lobby').paid.min + ')');
  await wait(5200); check(has(a, 'cancel'), 'A: sem 2 jogadores a sala é cancelada'); await wait(500); check(a.closed, 'A: conexão encerrada');
  // B) dois jogadores: trava, divide o preço, pagam, jogam, vence quem mais matou
  const b1 = await bot('Ana', 'PORTA', true), b2 = await bot('Beto', 'LAMA', true); await wait(800);
  check(last(b1, 'lobby').players.length === 2, 'B: lobby com 2 jogadores'); check(last(b1, 'lobby').paid.est === 12.5, 'B: preço estimado $12.50 cada (25/2), veio ' + last(b1, 'lobby').paid.est);
  await wait(3500); const l = last(b1, 'lobby'); check(l.paid.stage === 'pay' && l.paid.share === 12.5, 'B: lobby travado em fase de pagamento (share ' + l.paid.share + ')');
  b1.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:aaa' })); await wait(400); check(last(b1, 'lobby').paid.youPaid && last(b1, 'lobby').paid.paidCount === 1, 'B: pagamento da Ana registrado (1/2)');
  b2.ws.send(JSON.stringify({ t: 'pay', pay: 'NAO-SIM' })); await wait(300); check(last(b2, 'lobby').paid.youPaid === false, 'B: pagamento inválido é recusado');
  b2.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:bbb' })); await wait(1500); check(has(b1, 'welcome') && last(b1, 'welcome').paid && last(b1, 'welcome').paid.n === 2, 'B: todos pagaram -> partida começou (welcome com paid)');
  const start = Date.now(); while (Date.now() - start < 60000 && !has(b1, 'end')) await wait(500);
  const e = last(b1, 'end'); check(e && e.paid && e.reason === 'win', 'B: fim por vitória aos 30:00 com bloco paid');
  const rows = e.results; check(rows.length === 2 && rows[0].kills >= rows[1].kills, 'B: ranking por abates (' + rows.map(r => r.nick + ':' + r.kills).join(', ') + ')');
  check(e.paid.winner && e.paid.winner.nick === rows[0].nick, 'B: vencedor = quem matou mais (' + (e.paid.winner && e.paid.winner.nick) + ')');
  await wait(4500); check(has(b1, 'closed'), 'B: sala fecha após os resultados');
  // C) um não paga a tempo -> removido; quem pagou é reembolsado e volta ao lobby
  const c1 = await bot('Caio', 'CIRO', true), c2 = await bot('Duda', 'CROCI', true); await wait(3800); check(last(c1, 'lobby').paid.stage === 'pay', 'C: travou para pagamento');
  c1.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:ccc' })); await wait(7500);
  check(has(c2, 'kicked') && c2.closed, 'C: quem não pagou foi removido'); check(has(c1, 'refund') && last(c1, 'refund').amount === 12.5, 'C: quem pagou foi reembolsado ($' + (last(c1, 'refund') && last(c1, 'refund').amount) + ')'); check(last(c1, 'lobby').paid.stage === 'wait', 'C: lobby reabriu (esperando jogadores)');
  c1.ws.close(); await wait(400);
  // D) sair durante o pagamento devolve o dinheiro e o preço é recalculado
  const d1 = await bot('Eva', 'PORTA', true), d2 = await bot('Fabio', 'LAMA', true), d3 = await bot('Gil', 'CIRO', true); await wait(3800); check(last(d1, 'lobby').paid.n === 3 && last(d1, 'lobby').paid.stage === 'pay', 'D: 3 jogadores travados (share ' + last(d1, 'lobby').paid.share + ')');
  d1.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:e' })); await wait(300); d3.ws.close(); await wait(500);
  check(has(d1, 'refund'), 'D: Gil saiu: Eva (que já pagou) foi reembolsada'); check(last(d1, 'lobby').paid.stage === 'lobby' || last(d1, 'lobby').paid.n === 2, 'D: lobby reabriu com 2 jogadores');
  // E) sala normal não cai na paga
  const n1 = await bot('Normal', 'PORTA', false); await wait(800); check(has(n1, 'welcome') && !last(n1, 'welcome').paid, 'E: PLAY normal entra em sala normal (nunca na paga)');
  for (const x of [a, b1, b2, c1, c2, d1, d2, d3, n1]) { clearInterval(x.iv); try { x.ws.close(); } catch (er) { /* ignore */ } }
  await wait(300); console.log(bad ? 'FALHOU ' + bad : 'TUDO OK'); process.exit(bad ? 1 : 0);
})();
