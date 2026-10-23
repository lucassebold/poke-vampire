// 10 min com bot (FLEE = raio de fuga; 90 = valentão, 190 = covarde). GAME=./game_base.js compara com a versão anterior.
const path = require('path'); const { Game } = require(path.resolve(process.env.GAME || './game.js'));
const FR = +process.env.FLEE || 90, SECS = +process.env.SECS || 600, chars = (process.env.CHARS || 'PORTA,ANTONIO,CAMILLO').split(','), REP = +process.env.REP || 3;
for (const ch of chars) {
  const rs = [];
  for (let k = 0; k < REP; k++) {
    const g = new Game(null, { mp: true }); g.W = 1280; g.H = 720; const P = g.addPlayer(ch, 'b'); P.netMove = true; let minHp = 1; const snap = {};
    for (let i = 0; i < SECS * 60 && !g.over; i++) {
      const p = P.p; let fx = 0, fy = 0;
      for (const e of g.enemies) { const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy); if (d < FR && d > 0) { const w = (FR - d) / FR; fx += dx / d * w; fy += dy / d * w; } }
      let gx = 0, gy = 0, bd = 1e9; for (const q of g.gems) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; gx = q.x - p.x; gy = q.y - p.y; } }
      if (bd < 400 && bd > 0) { fx += gx / bd * 0.7; fy += gy / bd * 0.7; } if (!fx && !fy) { fx = Math.cos(g.t * 0.7); fy = Math.sin(g.t * 0.7); }
      const l = Math.hypot(fx, fy) || 1; g.applyMove(P, fx / l, fy / l, 1 / 60); P.p.moving = true;
      if (P.choices) g.choose(Math.floor(Math.random() * P.choices.length)); g.update(1 / 60); g.ev.length = 0; minHp = Math.min(minHp, P.p.hp / P.S.maxHp);
      const s = Math.round(g.t); if (i % 60 === 59 && [60, 180, 300, 420, 600].includes(s)) snap[s] = [P.p.kills, P.p.level, g.enemies.length];
    }
    rs.push({ dead: g.over ? Math.round(g.t) : null, snap, minHp: Math.round(minHp * 100) });
  }
  const avg = (s, j) => Math.round(rs.reduce((a, r) => a + ((r.snap[s] || [0, 0, 0])[j]), 0) / rs.length);
  console.log(ch.padEnd(9), 'mortes:', rs.filter(r => r.dead).map(r => r.dead).join(',') || '-', '| vidaMin%', rs.map(r => r.minHp).join('/'), '| nivel 1/3/5/7/10min:', [60, 180, 300, 420, 600].map(s => avg(s, 1)).join('/'), '| inimigos vivos 1/3/5/10:', [60, 180, 300, 600].map(s => avg(s, 2)).join('/'));
}
