// Começo do jogo (3 min) com um bot que FOGE dos inimigos e COLETA gemas. Mede: abates, nível, inimigos na tela, vida mínima e quando morre.
// uso: node sim_early2.js [personagens separados por vírgula] [repetições]
const { Game } = require(process.env.GAME || '../game.js');
const FR = +process.env.FLEE || 190;
const chars = (process.argv[2] || 'PORTA,ANTONIO,CIRO,IMELDA,GENNARO,LAMA,CAMILLO,DOMMARIO,CROCI').split(','), REP = +process.argv[3] || 3, SECS = +process.env.SECS || 180;
function run(ch) {
  const g = new Game(null, { mp: true }); g.W = 1280; g.H = 720; const P = g.addPlayer(ch, 'bot'); P.netMove = true;
  const rec = {}, enSum = [], minHp = { v: 1 }; let dead = null;
  for (let i = 0; i < SECS * 60 && !g.over; i++) {
    const p = P.p; let fx = 0, fy = 0, near = 0;
    for (const e of g.enemies) { const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy); if (d < FR && d > 0) { const w = (FR - d) / FR; fx += dx / d * w; fy += dy / d * w; near++; } }
    let gx = 0, gy = 0, bd = 1e9; for (const q of g.gems) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; gx = q.x - p.x; gy = q.y - p.y; } }
    if (bd < 400 && bd > 0) { fx += gx / bd * 0.7; fy += gy / bd * 0.7; }
    if (!fx && !fy) { const a = g.t * 0.7; fx = Math.cos(a); fy = Math.sin(a); }
    const l = Math.hypot(fx, fy) || 1; g.applyMove(P, fx / l, fy / l, 1 / 60); P.p.moving = true;
    if (P.choices) g.choose(Math.floor(Math.random() * P.choices.length));
    g.update(1 / 60); g.ev.length = 0; minHp.v = Math.min(minHp.v, P.p.hp / P.S.maxHp);
    if (i % 60 === 59) { const s = Math.round(g.t); enSum.push(g.enemies.length); if (s === 60 || s === 120 || s === 180 || s === 300 || s === 420 || s === 600) rec[s] = [P.p.kills, P.p.level]; }
  }
  if (g.over) dead = Math.round(g.t);
  return { rec, avgEn60: Math.round(enSum.slice(20, 60).reduce((a, b) => a + b, 0) / Math.max(1, enSum.slice(20, 60).length)), minHp: Math.round(minHp.v * 100), dead };
}
const tot = { k60: 0, k120: 0, k180: 0, l60: 0, l180: 0, en: 0, dead: 0, n: 0, surv: 0 };
for (const ch of chars) {
  const rs = []; for (let k = 0; k < REP; k++) rs.push(run(ch));
  const f = (s, j) => Math.round(rs.reduce((a, r) => a + ((r.rec[s] || [0, 0])[j]), 0) / rs.length);
  const dead = rs.filter(r => r.dead).length; tot.k60 += f(60, 0); tot.k120 += f(120, 0); tot.k180 += f(180, 0); tot.l60 += f(60, 1); tot.l180 += f(180, 1); tot.en += rs.reduce((a, r) => a + r.avgEn60, 0) / rs.length; tot.dead += dead; tot.n++; tot.surv += rs.length;
  console.log(ch.padEnd(9), 'abates 1/2/3min:', f(60, 0), f(120, 0), f(180, 0), '| nivel 1/3min:', f(60, 1), f(180, 1), '| inimigos(20-60s):', Math.round(rs.reduce((a, r) => a + r.avgEn60, 0) / rs.length), '| vidaMin%:', Math.min(...rs.map(r => r.minHp)), '| morreu antes de 3min:', dead + '/' + rs.length);
}
const n = tot.n; console.log('MEDIA   abates 1/2/3min:', Math.round(tot.k60 / n), Math.round(tot.k120 / n), Math.round(tot.k180 / n), '| nivel 1/3min:', Math.round(tot.l60 / n), Math.round(tot.l180 / n), '| inimigos:', Math.round(tot.en / n), '| mortes:', tot.dead + '/' + tot.surv);
