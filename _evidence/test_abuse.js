// Abuso/limites do servidor real (porta 8780, sem TIME_SCALE): teleporte, nome ofensivo, personagem inválido, mensagem gigante, sala cheia, flood.
const WebSocket = require('../node_modules/ws'); const URL = 'ws://localhost:8780/ws';
let bad = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const conn = () => new Promise(res => { const ws = new WebSocket(URL); const c = { ws, msgs: [], closed: false }; ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('close', (code) => { c.closed = true; c.code = code; }); ws.on('open', () => res(c)); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const last = (c, t) => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].t === t) return c.msgs[i]; return null; };
(async () => {
  const a = await conn(); a.ws.send(JSON.stringify({ t: 'join', name: 'F u c k_er<script>', ch: 'NAO_EXISTE' })); await wait(800);
  const ro = last(a, 'roster'); check(ro && ro.players[0].nick.startsWith('Player'), 'apelido ofensivo vira "' + (ro && ro.players[0].nick) + '"'); check(ro.players[0].ch === 'PORTA', 'personagem inválido vira PORTA');
  const b = await conn(); b.ws.send(JSON.stringify({ t: 'join', name: 'Ok<b>Name_123456789', ch: 'LAMA' })); await wait(800);
  const rb = last(b, 'roster'); check(rb.players.some(p => p.nick === 'OkbName_1234'), 'apelido limpo/cortado: ' + JSON.stringify(rb.players.map(p => p.nick)));
  // teleporte: tenta ir para x=1e9
  const s0 = last(b, 'snap'); const x0 = s0.me.x; b.ws.send(JSON.stringify({ t: 's', x: 1e9, y: 1e9, fx: 1, fy: 0, f: 1, m: 1, sp: 0 })); await wait(400);
  const s1 = last(b, 'snap'); check(Math.abs(s1.me.x - x0) < 200, 'teleporte barrado: moveu ' + Math.abs(s1.me.x - x0) + ' px (limite pela velocidade)');
  // pick inválido não quebra
  b.ws.send(JSON.stringify({ t: 'pick', i: -5 })); b.ws.send(JSON.stringify({ t: 'pick', i: 99 })); b.ws.send('lixo{'); b.ws.send(JSON.stringify({ t: 'emo', k: 99 })); await wait(300); check(!b.closed, 'mensagens inválidas ignoradas sem derrubar');
  // mensagem gigante
  const g = await conn(); g.ws.send('x'.repeat(5000)); await wait(500); check(g.closed, 'mensagem de 5 KB derruba a conexão (código ' + g.code + ')');
  // flood
  const f = await conn(); f.ws.send(JSON.stringify({ t: 'join', name: 'Flood', ch: 'PORTA' })); await wait(300); for (let i = 0; i < 400; i++) f.ws.send(JSON.stringify({ t: 'emo', k: 1 })); await wait(600); check(f.closed, 'flood de 400 msgs/s derruba a conexão (código ' + f.code + ')');
  // sala cheia: 4 por sala (a, b, + 2) e o 5º cai em outra sala
  const c = await conn(); c.ws.send(JSON.stringify({ t: 'join', name: 'C', ch: 'CIRO' })); const d = await conn(); d.ws.send(JSON.stringify({ t: 'join', name: 'D', ch: 'CROCI' })); const e = await conn(); e.ws.send(JSON.stringify({ t: 'join', name: 'E', ch: 'GENNARO' })); await wait(900);
  const wa = last(a, 'welcome'), we = last(e, 'welcome'); check(wa.room !== we.room, 'o 5º jogador foi para outra sala (' + wa.room + ' vs ' + we.room + ')');
  const rr = last(a, 'roster'); check(rr.players.length === 4, 'sala 1 com 4 jogadores');
  // join duplicado rápido é ignorado
  const dup = await conn(); dup.ws.send(JSON.stringify({ t: 'join', name: 'Dup', ch: 'PORTA' })); dup.ws.send(JSON.stringify({ t: 'join', name: 'Dup2', ch: 'PORTA' })); await wait(600); check(dup.msgs.filter(m => m.t === 'welcome').length === 1, 'join duplicado em <1,5 s ignorado');
  for (const x of [a, b, c, d, e, dup, f, g]) try { x.ws.close(); } catch (er) { /* ignore */ }
  await wait(300); console.log(bad ? 'FALHOU ' + bad : 'TUDO OK'); process.exit(bad ? 1 : 0);
})();
