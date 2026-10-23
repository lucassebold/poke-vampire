const WebSocket = require('../node_modules/ws');
const mk = (name, ch) => new Promise(res => { const ws = new WebSocket('ws://localhost:8780/ws'), c = { ws, name, me: null, x: 0, msgs: [] };
  ws.on('open', () => { ws.send(JSON.stringify({ t: 'join', name, ch, paid: true, pack: 'pokemon_25' })); res(c); });
  ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m.t); if (m.t === 'snap') { c.me = m.me; if (m.me.ch) ws.send(JSON.stringify({ t: 'pick', i: 0 })); } });
  ws.on('close', (code, reason) => { console.log(name, 'CLOSE', code, String(reason), 'em', Math.round((Date.now() - T0) / 1000), 's; ultimas msgs:', c.msgs.slice(-4).join(',')); });
  setInterval(() => { if (ws.readyState === 1 && c.me) { c.x += 3; ws.send(JSON.stringify({ t: 's', x: c.x, y: 0, fx: 1, fy: 0, f: 1, m: 1, sp: 0 })); } }, 50); });
const T0 = Date.now();
(async () => { const a = await mk('Ana', 'PORTA'), b = await mk('Beto', 'LAMA'); await new Promise(r => setTimeout(r, 4200)); a.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:a' })); b.ws.send(JSON.stringify({ t: 'pay', pay: 'SIM:b' })); await new Promise(r => setTimeout(r, 70000)); process.exit(0); })();
