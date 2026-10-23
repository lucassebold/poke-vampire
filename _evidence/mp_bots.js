// Bots de teste do servidor: conectam por WebSocket, andam, escolhem upgrades e registram o que recebem.
// uso: node mp_bots.js <porta> <n_bots> <segundos> [entrada_tardia_s]
const WebSocket = require('../node_modules/ws');
const port = +process.argv[2] || 8780, N = +process.argv[3] || 3, SECS = +process.argv[4] || 30, LATE = +process.argv[5] || 0;
const CH = ['PORTA', 'LAMA', 'CIRO', 'DOMMARIO', 'CROCI', 'ANTONIO'];
let ok = 0, bad = 0; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); c ? ok++ : bad++; };
const stats = { snaps: 0, bytes: 0, maxBytes: 0, ends: 0, welcome: 0, rosters: 0, emos: 0, maxEn: 0, evs: 0, errs: 0 };
function bot(i, delay) {
  return new Promise(res => {
    setTimeout(() => {
      const ws = new WebSocket('ws://localhost:' + port + '/ws'); const b = { i, x: 0, y: 0, ang: Math.random() * 6.28, last: null, end: null, me: null, roster: null, id: 0, hpMin: 1e9, late: false };
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Bot' + i, ch: CH[i % CH.length] })));
      ws.on('message', d => {
        const bytes = d.length; let m; try { m = JSON.parse(d); } catch (e) { stats.errs++; return; }
        if (m.t === 'welcome') { stats.welcome++; b.id = m.you; b.late = m.late; }
        else if (m.t === 'roster') { stats.rosters++; b.roster = m.players; }
        else if (m.t === 'snap') {
          stats.snaps++; stats.bytes += bytes; stats.maxBytes = Math.max(stats.maxBytes, bytes); stats.maxEn = Math.max(stats.maxEn, m.en.length); stats.evs += m.ev.length;
          if (!b.me) { b.x = m.me.x; b.y = m.me.y; } b.me = m.me; b.last = m; b.hpMin = Math.min(b.hpMin, m.me.hp);
          if (m.me.ch && Math.random() < 0.3) ws.send(JSON.stringify({ t: 'pick', i: 0 }));
          if (Math.hypot(m.me.x - b.x, m.me.y - b.y) > 250) { b.x = m.me.x; b.y = m.me.y; }   // rubber band
        } else if (m.t === 'end') { stats.ends++; b.end = m; }
        else if (m.t === 'emo') stats.emos++;
      });
      const iv = setInterval(() => {
        if (ws.readyState !== 1 || !b.me) return; if (Math.random() < 0.05) b.ang += (Math.random() - 0.5) * 3;
        const sp = b.me.spd || 100, st = 0.05; b.x += Math.cos(b.ang) * sp * st; b.y += Math.sin(b.ang) * sp * st;
        ws.send(JSON.stringify({ t: 's', x: b.x, y: b.y, fx: Math.cos(b.ang), fy: Math.sin(b.ang), f: Math.cos(b.ang) < 0 ? -1 : 1, m: 1, sp: 0 }));
      }, 50);
      b.ws = ws; b.stop = () => { clearInterval(iv); ws.close(); }; res(b);
    }, delay);
  });
}
(async () => {
  const bots = []; for (let i = 0; i < N; i++) bots.push(await bot(i, i * 200));
  let late = null; if (LATE) setTimeout(async () => { late = await bot(N, 0); bots.push(late); }, LATE * 1000);
  await new Promise(r => setTimeout(r, 1500));
  check(stats.welcome === N && bots.every(b => b.id), 'todos receberam welcome (' + stats.welcome + ')');
  check(bots[0].roster && bots[0].roster.length === Math.min(N, 4), 'roster com ' + (bots[0].roster || []).length + ' jogadores');
  bots[0].ws.send(JSON.stringify({ t: 'emo', k: 2 })); await new Promise(r => setTimeout(r, 300)); check(stats.emos >= Math.min(N, 4), 'emote chegou a todos (' + stats.emos + ')');
  const t0 = Date.now(); while (Date.now() - t0 < SECS * 1000 && !bots.some(b => b.end)) await new Promise(r => setTimeout(r, 500));
  const l = bots[0].last; console.log('estado: t=' + (l ? l.gt : '?') + ' fase=' + (l && l.ph) + ' jogadores=' + (l && l.pl.length + 1) + ' inimigos_vista=' + (l && l.en.length) + ' nivel=' + (l && l.me.lv));
  console.log('snaps=' + stats.snaps + ' media=' + Math.round(stats.bytes / Math.max(1, stats.snaps)) + 'B max=' + stats.maxBytes + 'B enemies_max=' + stats.maxEn + ' eventos=' + stats.evs + ' errs=' + stats.errs);
  check(stats.errs === 0, 'sem JSON invalido'); check(stats.snaps > 20, 'recebeu snapshots');
  if (late) { check(late.late === true || late.me, 'entrada tardia conectou (late=' + late.late + ', nivel ' + (late.me && late.me.lv) + ' vs ' + bots[0].me.lv + ')'); }
  const ended = bots.filter(b => b.end); if (ended.length) { const e = ended[0].end; console.log('FIM:', e.reason, 'em', e.time, 's;', JSON.stringify(e.results.map(r => [r.nick, r.lv, r.kills, r.alive]))); }
  bots.forEach(b => b.stop()); console.log(bad ? 'FALHOU ' + bad : 'TUDO OK'); process.exit(bad ? 1 : 0);
})();
