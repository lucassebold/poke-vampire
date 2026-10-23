// Teste de lógica multi-jogador (sem rede): simulação rápida, pula tempo em vez de esperar 30 min.
const { Game } = require('../game.js');
let f = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) f++; };
const step = (g, secs, inp) => { for (let i = 0; i < secs * 60 && !g.over; i++) { for (const P of g.players) P.input = inp ? inp(P) : { x: 0, y: 0 }; g.update(1 / 60); } };
const mk = (...chars) => { const g = new Game(null, { mp: true }); g.W = 1280; g.H = 720; const ps = chars.map((c, i) => g.addPlayer(c, 'P' + (i + 1))); return { g, ps }; };

// 1) dois jogadores existem, cada um com estado próprio
{ const { g, ps } = mk('PORTA', 'CIRO');
  ok(g.players.length === 2 && ps[0].S !== ps[1].S && ps[0].weapons !== ps[1].weapons, 'jogadores com estado separado');
  ps[0].p.x = -400; ps[1].p.x = 400; g.cur = ps[1]; ok(g.p === ps[1].p, 'acessor this.p segue o jogador atual'); g.cur = ps[0]; }

// 2) simulação 5 min com 2 jogadores: ninguém NaN, ambos matam, XP individual
{ const { g, ps } = mk('PORTA', 'CIRO'); ps[1].p.x = 200; g.godMode = true; step(g, 300);
  ok(ps.every(P => isFinite(P.p.x + P.p.hp)), 'sem NaN');
  ok(ps[0].p.kills > 0 && ps[1].p.kills > 0, 'ambos abateram inimigos (' + ps.map(P => P.p.kills) + ')');
  ok(ps[0].p.level > 1 && ps[1].p.level > 1, 'ambos subiram de nível (' + ps.map(P => P.p.level) + ')');
  ok(g.players.every(P => !P.choices || P.choiceT > 0), 'escolhas têm temporizador'); }

// 3) escolha automática em 15 s, sem pausar o jogo
{ const { g, ps } = mk('PORTA', 'CIRO'); g.cur = ps[0]; g.openChoices(); g.cur = ps[0];
  ok(ps[0].choices && ps[0].choiceT === 15, 'cartões abertos com 15 s'); const t0 = g.t; step(g, 16);
  ok(g.t - t0 > 15.9, 'jogo NÃO pausou com cartões abertos'); ok(!ps[0].choices, 'escolha automática feita'); }

// 4) queda: sai até o fim; todos mortos => resultados (dead)
{ const { g, ps } = mk('PORTA', 'CIRO'); ps[0].p.hp = 0; step(g, 0.1);
  ok(!ps[0].alive && ps[1].alive && !g.over, 'um caiu, partida continua');
  ps[1].p.hp = 0; step(g, 0.1); ok(g.over && g.endReason === 'dead', 'todos mortos => resultados'); }

// 5) entrada tardia: catch-up ~60% do nível médio
{ const { g, ps } = mk('PORTA'); g.godMode = true; step(g, 420); const lv = ps[0].p.level;
  const L = g.addPlayer('LAMA', 'Late', { late: true });
  const alvo = Math.round(lv * 0.6);
  ok(lv >= 5 && Math.abs(L.p.level - alvo) <= 1, 'catch-up: amigo nv ' + lv + ' => novato nv ' + L.p.level + ' (alvo ' + alvo + ')');
  ok(L.weapons.length >= 2 && L.p.iframes > 5, 'novato recebeu armas e proteção'); }

// 6) Morte aos 30 min => resultados (pulando o tempo)
{ const { g, ps } = mk('PORTA', 'CIRO'); g.godMode = true; g.t = 29 * 60 + 50; step(g, 25);
  ok(g.reaper && g.over && g.endReason === 'reaper', 'Morte chegou e a partida terminou em resultados'); }

// 7) chefe com 2 jogadores aparece e quem entra durante o chefe espera
{ const { g, ps } = mk('PORTA', 'CIRO'); g.godMode = true; g.t = 4 * 60 + 58; step(g, 6);
  ok(g.phase === 'warn' || g.phase === 'boss', 'chefe iniciou (fase ' + g.phase + ')');
  const L = g.addPlayer('GENNARO', 'Late', { late: true });
  ok(L.waiting && !L.alive, 'novato espera durante o chefe'); }

// 8) escala: mais jogadores => mais vida de inimigo
{ const a = mk('PORTA').g, b = mk('PORTA', 'CIRO', 'LAMA').g; const ea = a.spawn('ZOMBIE', 50, 50), eb = b.spawn('ZOMBIE', 50, 50);
  ok(eb.hp > ea.hp * 1.4, 'vida escala com jogadores (' + Math.round(ea.hp) + ' -> ' + Math.round(eb.hp) + ')'); }

console.log(f ? 'FALHOU ' + f : 'TUDO OK'); process.exit(f ? 1 : 0);
