'use strict';
// Servidor do Vampire-like online: serve o jogo (arquivos estáticos) e roda as salas por WebSocket em /ws.
//
// Modelo:
//  - o servidor roda a simulação INTEIRA da sala (inimigos, armas, chefes, XP) a 30 Hz com o mesmo game.js do modo solo;
//  - cada jogador manda a PRÓPRIA posição (~20x/s). O servidor limita a velocidade (antitrapaça) e usa essa posição na simulação;
//  - a cada 2 passos (15 Hz) o servidor manda um "snap" filtrado: só o que está perto da câmera daquele jogador;
//  - salas aleatórias, sem código, até 4 jogadores; entrada no meio da partida recebe "catch-up" (ver game.js: catchUpJoin).
//
// Cliente -> servidor: {t:'join', name, ch} · {t:'s', x, y, fx, fy, f, m, sp} · {t:'pick', i} · {t:'emo', k} · {t:'leave'}
// Servidor -> cliente: welcome · roster · snap · end · emo · full · err
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const WebSocket = require('ws');
const API = require('./game.js');
const D = require('./data.js');
const ART = require('./art.js');
const { Game, xpNeeded, SPR } = API;

const ROOT = __dirname;
const PORT = +process.env.PORT || 8780;
const MAXP = 4;
const MAX_ROOMS = +process.env.MAX_ROOMS || 6;
const TICK_MS = 33, SNAP_EVERY = 2;
const RESULTS_KEEP_MS = 30000;
const TIME_SCALE = +process.env.TIME_SCALE || 1;   // só para testes: 20 = o relógio do jogo anda 20x mais rápido
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- pele Pokémon no servidor (o raio de colisão depende do tamanho do sprite)
const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'pokemon_art.js'), 'utf8'), sb);
const POKE = sb.window.VS_POKE;
for (const id of Object.keys(ART.enemies)) { const a = ART.enemies[id], pk = POKE.enemies[id]; if (pk) { a.variants = pk.variants.map(v => v.frames); a.pk = pk.variants; } }
const pngSize = new Map();
Game.sizeOf = p => {
  let s = pngSize.get(p);
  if (s === undefined) {
    s = null;
    try { const fd = fs.openSync(path.join(ROOT, p), 'r'), b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); s = [b.readUInt32BE(16), b.readUInt32BE(20)]; } catch (e) { s = null; }
    pngSize.set(p, s);
  }
  if (!s) return null; const sc = POKE.scales[p];
  return sc ? [s[0] * sc / SPR, s[1] * sc / SPR] : s;
};
const ENEMY_IDS = Object.keys(D.enemies), ENEMY_IDX = {}; ENEMY_IDS.forEach((k, i) => { ENEMY_IDX[k] = i; });
const CHARS = Object.keys(D.characters);
const KINDS = ['blade', 'ember', 'frost', 'storm'];

// ---------------------------------------------------------------- apelido
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'nigg', 'fagg', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'porn', 'sex', 'penis', 'vagina', 'retard', 'puta', 'caralho', 'merda', 'viado', 'buceta', 'porra'];
const squash = s => s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's').replace(/@/g, 'a').replace(/[^a-z]/g, '');
let anon = 0;
function cleanName(n) {
  n = String(n == null ? '' : n).replace(/[^A-Za-z0-9 _\-.!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  const q = squash(n);
  if (!n || BAD.some(w => q.includes(w))) return 'Player' + (100 + (anon++ % 900));
  return n;
}

// ---------------------------------------------------------------- salas
const rooms = new Map(); let roomN = 0;
class Room {
  constructor() {
    this.id = ++roomN; this.g = new Game(null, { mp: true }); this.g.W = 1280; this.g.H = 720; this.g.wantEvents = true; if (process.env.TEST_GOD) this.g.godMode = true;   // só para testes
    this.clients = new Set(); this.born = Date.now(); this.tick = 0; this.endedAt = 0; this.fxN = 0; this.zN = 0;
  }
  count() { return this.g.players.filter(P => !P.left).length; }
}
function pickRoom() {
  const cands = [...rooms.values()].filter(r => !r.g.over && !r.endedAt && r.count() < MAXP);
  const fresh = cands.filter(r => r.g.t < 90).sort((a, b) => b.count() - a.count());   // prefere salas que acabaram de começar (todos começam juntos)
  if (fresh.length) return fresh[0];
  const late = cands.filter(r => r.g.t < 1680 && r.count() > 0).sort((a, b) => b.count() - a.count());
  if (late.length) return late[0];
  if (rooms.size >= MAX_ROOMS) return null;
  const r = new Room(); rooms.set(r.id, r); log('sala', r.id, 'criada'); return r;
}
const send = (c, o) => { if (c.ws.readyState === 1) { try { c.ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } } };
const roster = room => ({ t: 'roster', players: room.g.players.filter(P => !P.left).map(P => ({ id: P.id, nick: P.nick, ch: P.charId })) });
const bcast = (room, o) => { const s = JSON.stringify(o); for (const c of room.clients) if (c.ws.readyState === 1) c.ws.send(s); };

function joinRoom(c, m) {
  if (c.room) leaveRoom(c);
  const ch = CHARS.includes(m.ch) ? m.ch : 'PORTA', name = cleanName(m.name), room = pickRoom();
  if (!room) return send(c, { t: 'full' });
  const g = room.g, late = g.t > 20 && room.count() > 0;
  const P = g.addPlayer(ch, name, { late }); P.netMove = true; P.lastS = Date.now(); P.nick = name;
  const others = g.players.filter(Q => Q !== P && Q.alive && !Q.left);
  if (!late && others.length) { P.p.x = others[0].p.x + (P.id % 2 ? 60 : -60); P.p.y = others[0].p.y + 40; P.tpAt = g.t; }
  if (!late && !others.length && room.count() > 1) { /* sala vazia reaproveitada */ }
  c.room = room; c.P = P; c.lastFx = 0; c.spec = 0; room.clients.add(c);
  log('sala', room.id, '+', name, ch, 'jogadores:', room.count(), late ? '(entrada tardia)' : '');
  send(c, { t: 'welcome', you: P.id, eids: ENEMY_IDS, room: room.id, late });
  bcast(room, roster(room));
}
function leaveRoom(c) {
  const room = c.room; if (!room) return;
  room.clients.delete(c); room.g.removePlayer(c.P); c.room = null;
  log('sala', room.id, '-', c.P.nick, 'jogadores:', room.count());
  if (!room.count()) { rooms.delete(room.id); log('sala', room.id, 'fechada (vazia)'); } else bcast(room, roster(room));
  c.P = null;
}

// ---------------------------------------------------------------- snapshots
const r0 = Math.round;
function prim(o, skip) {
  const r = {};
  for (const k in o) { if (skip && skip[k]) continue; const v = o[k], t = typeof v; if (t === 'number') r[k] = Math.round(v * 10) / 10; else if (t === 'string' || t === 'boolean') r[k] = v; }
  return r;
}
const SKIP_Q = { w: 1, own: 1, hit: 1, hitT: 1 };
function visualWeapons(P) {
  const out = [];
  for (const w of P.weapons) {
    const hasBooks = w.books && w.books.length, hasOrbs = w.orbs && w.orbs.length, sh = w.sh && w.sh.on;
    if (!(hasBooks || hasOrbs || sh || w.auraR)) continue;
    const o = { id: w.id, lvl: w.lvl };
    if (hasBooks) o.bk = w.books.map(b => [r0(b.x - P.p.x), r0(b.y - P.p.y), Math.round(b.a * 100) / 100, Math.round(b.r * 10) / 10]);
    if (hasOrbs) o.ob = w.orbs.map(b => [r0(b.x - P.p.x), r0(b.y - P.p.y), Math.round(b.a * 100) / 100, Math.round(b.r * 10) / 10, b.dir, b.ri, b.i, KINDS.indexOf(b.kind)]);
    if (w.field) o.fd = r0(w.field);
    if (sh) { o.sh = 1; o.shR = w.shR || 50; }
    if (w.auraR) o.au = r0(w.auraR);
    out.push(o);
  }
  return out;
}
function encode(room, c) {
  const g = room.g, me = c.P, HX = 1050, HY = 560;
  let vp = me.p; if (!me.alive) { const sp = g.players.find(Q => Q.id === c.spec && Q.alive && !Q.left) || g.players.find(Q => Q.alive && !Q.left); if (sp) vp = sp.p; }
  const vx = vp.x, vy = vp.y, inV = (x, y) => Math.abs(x - vx) < HX && Math.abs(y - vy) < HY;
  const en = [], bo = [];
  for (const e of g.enemies) {
    if (e.bossId) { const b = prim(e, { def: 1, dashAt: 1, seq: 1, cds: 1, hitT: 1, dashDir: 1 }); b.dd = e.dashDir; if (e.dashAt) b.dtl = e.dashAt.tele; bo.push(b); continue; }
    if (!inV(e.x, e.y) || en.length >= 420) continue;
    en.push([e.eid, ENEMY_IDX[e.id], r0(e.x), r0(e.y), (e.boss ? 1 : 0) | (e.flash > 0 ? 2 : 0) | (e.slowT > 0 ? 4 : 0) | (e.swarm ? 8 : 0), e.boss ? Math.max(0, r0(100 * e.hp / e.max)) : 0, e.swarm ? r0(e.vx) : 0, e.scale && e.scale !== 1 ? e.scale : 0]);
  }
  const gems = [], chests = [], proj = [], zones = [], fx = [], eproj = [], tele = [];
  for (const q of g.gems) if (gems.length < 140 && inV(q.x, q.y)) gems.push([r0(q.x), r0(q.y), r0(q.v), q.t === 'COIN' ? 1 : 0]);
  for (const q of g.chests) chests.push([r0(q.x), r0(q.y)]);
  for (const q of g.proj) if (proj.length < 260 && inV(q.x, q.y)) { const o = prim(q, SKIP_Q); if (q.own) { o.ox = r0(q.own.p.x); o.oy = r0(q.own.p.y); o.pid = q.own.id; } proj.push(o); }
  for (const z of g.zones) { if (!z._id) z._id = ++room.zN; if (zones.length < 80 && inV(z.x, z.y)) { const o = prim(z, SKIP_Q); o.zid = z._id; zones.push(o); } }
  for (const f of g.fx) { if (!f._id) f._id = ++room.fxN; if (f._id > c.lastFx && inV(f.x != null ? f.x : f.x1 || 0, f.y != null ? f.y : f.y1 || 0)) fx.push(prim(f, { pts: 1, br: 1 })); }
  if (g.fx.length) c.lastFx = Math.max(c.lastFx, g.fx[g.fx.length - 1]._id);
  for (const q of g.eproj) if (eproj.length < 120 && inV(q.x, q.y)) eproj.push(prim(q, SKIP_Q));
  for (const z of g.tele) if (inV(z.x, z.y)) tele.push(prim(z, { owner: 1 }));
  const ev = []; let nHit = 0, nKill = 0;
  for (const e of g.ev) {
    if (ev.length >= 80) break;
    if (e.k === 'hit' && ++nHit > 26) continue; if (e.k === 'kill' && ++nKill > 18) continue;   // efeitos só decoram: limitar mantém o pacote pequeno
    if (e.pid && e.pid !== me.id && (e.k === 'levelup' || e.k === 'pickup' || e.k === 'hurt' || e.k === 'shield' || e.k === 'shieldup' || e.k === 'chest' || e.k === 'evolve')) continue;
    if (e.x != null && !inV(e.x, e.y)) continue;
    ev.push(e);
  }
  const others = [];
  for (const P of g.players) {
    if (P === me || P.left) continue;
    const near = inV(P.p.x, P.p.y);
    others.push([P.id, r0(P.p.x), r0(P.p.y), P.p.face, P.p.moving ? 1 : 0, r0(P.p.hp), r0(P.S.maxHp), P.p.level, P.alive ? 0 : P.waiting ? 2 : 1, P.p.iframes > 0 ? 1 : 0, P.shieldCharges, near ? visualWeapons(P) : 0, P.p.kills]);
  }
  const pp = me.p;
  if (process.env.SIZE_DEBUG && room.tick % 60 === 0) { const L = x => JSON.stringify(x).length; log('tam', 'en', L(en), 'bo', L(bo), 'pl', L(others), 'gm', L(gems), 'pj', L(proj), proj.length, 'zn', L(zones), zones.length, 'fx', L(fx), 'ep', L(eproj), 'ev', L(ev), ev.length, 'vw', L(visualWeapons(me))); }
  return {
    t: 'snap', n: room.tick, gt: Math.round(g.t * 100) / 100, ph: g.phase, pt: Math.round(g.phaseT * 100) / 100, tn: Math.round(g.tension * 100) / 100, bk: g.bossKey || null, rp: g.reaper ? 1 : 0, ov: g.over ? 1 : 0,
    me: { id: me.id, x: r0(pp.x), y: r0(pp.y), hp: Math.round(pp.hp), mhp: Math.round(me.S.maxHp), lv: pp.level, xp: Math.round(pp.xp * 10) / 10, need: xpNeeded(pp.level), gold: r0(pp.gold), kills: pp.kills, dmg: r0(pp.dmg), st: me.alive ? 0 : me.waiting ? 2 : 1, ifr: pp.iframes > 0 ? 1 : 0, sc: me.shieldCharges,
      ch: me.choices ? me.choices.map(o => [o.kind, o.id, o.lvl]) : null, ct: Math.round(me.choiceT * 10) / 10, pop: me.popup ? { title: me.popup.title, line: me.popup.line, icon: me.popup.icon || null } : null,
      w: me.weapons.map(w => [w.id, w.lvl]), ps: me.passives, vw: visualWeapons(me), spd: g.speedOf(me), tp: me.tpAt || 0 },
    pl: others, en, bo, gm: gems, cs: chests, pj: proj, zn: zones, fx, ep: eproj, tl: tele, ev,
  };
}
function results(room) {
  const g = room.g;
  return g.players.filter(P => !P.left || P.p.level > 1 || P.p.kills > 0).map(P => ({ id: P.id, nick: P.nick, ch: P.charId, lv: P.p.level, kills: P.p.kills, dmg: r0(P.p.dmg), gold: r0(P.p.gold), diedAt: P.p.diedAt, alive: !!P.alive, w: P.weapons.map(w => [w.id, w.lvl]) }));
}

// ---------------------------------------------------------------- laço principal
let lastTick = Date.now(), slow = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.06, (now - lastTick) / 1000) * TIME_SCALE; lastTick = now;
  const t0 = process.hrtime();
  for (const room of rooms.values()) {
    const g = room.g;
    if (!g.over) {
      let left = dt; while (left > 0) { const st = Math.min(0.05, left); g.update(st); left -= st; if (g.over) break; }
      if (g.over) { room.endedAt = now; bcast(room, { t: 'end', reason: g.endReason, time: Math.round(g.t), results: results(room) }); log('sala', room.id, 'terminou:', g.endReason, 'em', Math.round(g.t), 's'); }
    } else if (now - room.endedAt > RESULTS_KEEP_MS) { for (const c of [...room.clients]) { c.room = null; c.P = null; } rooms.delete(room.id); log('sala', room.id, 'removida'); continue; }
    room.tick++;
    if (room.tick % SNAP_EVERY === 0) { for (const c of room.clients) if (c.P) send(c, encode(room, c)); g.ev.length = 0; }
    if (g.ev.length > 400) g.ev.length = 0;
  }
  const d = process.hrtime(t0), ms = d[0] * 1000 + d[1] / 1e6; if (ms > 25 && ++slow % 20 === 1) log('AVISO: passo lento', ms.toFixed(1), 'ms,', rooms.size, 'salas');
}, TICK_MS);

// ---------------------------------------------------------------- HTTP estático
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.css': 'text/css', '.ico': 'image/x-icon' };
const GZ = new Set(['.html', '.js', '.json']); const gzCache = new Map();
const NOT_PUBLIC = new Set(['server.js', 'package.json', 'package-lock.json']);
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel === 'health') { res.writeHead(200); return res.end('ok'); }
  if (rel === 'stats') { res.writeHead(200, { 'Content-Type': 'application/json' }); let n = 0; for (const r of rooms.values()) n += r.count(); return res.end(JSON.stringify({ rooms: rooms.size, players: n })); }
  if (rel === 'favicon.ico') { res.writeHead(204); return res.end(); }
  const parts = rel.split('/'), ext = path.extname(rel).toLowerCase();
  const ok = !rel.includes('..') && !rel.includes('\\') && MIME[ext] && ((parts.length === 1 && !NOT_PUBLIC.has(rel) && /\.(html|js)$/.test(rel)) || parts[0] === 'assets');
  if (!ok) { res.writeHead(404); return res.end('not found'); }
  const file = path.join(ROOT, rel);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const h = { 'Content-Type': MIME[ext], 'Cache-Control': parts[0] === 'assets' ? 'public, max-age=86400' : 'no-cache' };
    const wantGz = GZ.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (!wantGz) { res.writeHead(200, h); return fs.createReadStream(file).pipe(res); }
    const c = gzCache.get(rel);
    if (c && c.m === st.mtimeMs) { h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); return res.end(c.b); }
    fs.readFile(file, (e2, buf) => { if (e2) { res.writeHead(500); return res.end(); } zlib.gzip(buf, (e3, z) => { if (e3) { res.writeHead(500); return res.end(); } gzCache.set(rel, { m: st.mtimeMs, b: z }); h['Content-Encoding'] = 'gzip'; res.writeHead(200, h); res.end(z); }); });
  });
}
const server = http.createServer(serveStatic);

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 1024, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 } } });
const ipCount = new Map();
const ipOf = req => String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '?').trim();
const num = (v, lo, hi) => { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
wss.on('connection', (ws, req) => {
  const ip = ipOf(req), n = (ipCount.get(ip) || 0) + 1;
  if (n > 8) { ws.close(1008, 'too many connections'); return; }
  ipCount.set(ip, n);
  const c = { ws, ip, room: null, P: null, msgs: 0, mt: Date.now(), emoAt: 0, alive: true, joinAt: 0 };
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', data => {
    const now = Date.now(); if (now - c.mt > 1000) { c.mt = now; c.msgs = 0; } if (++c.msgs > 90) { if (c.msgs > 300) ws.close(1008, 'flood'); return; }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    c.alive = true;
    if (m.t === 'join') { if (now - c.joinAt < 1500) return; c.joinAt = now; joinRoom(c, m); return; }
    if (m.t === 'leave') { if (c.room) leaveRoom(c); return; }
    const room = c.room, P = c.P; if (!room || !P) return;
    const g = room.g;
    if (m.t === 's') {   // posição do próprio jogador (confiança limitada: velocidade máxima + proteção após teleporte)
      if (!P.alive || g.over || g.t - (P.tpAt || -9) < 0.45) { P.lastS = now; return; }
      const dtS = Math.min(0.5, (now - P.lastS) / 1000); P.lastS = now;
      const tx = num(m.x, -1e6, 1e6), ty = num(m.y, -1e6, 1e6), maxD = g.speedOf(P) * (dtS + 0.08) * Math.max(1, TIME_SCALE) + 6;
      let dx = tx - P.p.x, dy = ty - P.p.y; const d = Math.hypot(dx, dy);
      if (d > maxD) { dx *= maxD / d; dy *= maxD / d; }
      P.p.x += dx; P.p.y += dy;
      const fx = num(m.fx, -1, 1), fy = num(m.fy, -1, 1); if (fx || fy) { P.p.fx = fx; P.p.fy = fy; }
      P.p.face = m.f < 0 ? -1 : 1; P.p.moving = !!m.m; c.spec = num(m.sp, 0, 1e6) | 0;
    } else if (m.t === 'pick') {
      const i = m.i | 0; if (P.choices && i >= 0 && i < P.choices.length) { g.cur = P; g.choose(i); g.cur = g.players[0]; }
    } else if (m.t === 'emo') {
      const k = m.k | 0; if (k >= 0 && k < 6 && now - c.emoAt > 1200) { c.emoAt = now; bcast(room, { t: 'emo', id: P.id, k }); }
    }
  });
  ws.on('close', () => { leaveRoom(c); const k = (ipCount.get(ip) || 1) - 1; if (k <= 0) ipCount.delete(ip); else ipCount.set(ip, k); });
  ws.on('error', () => { });
});
// detecta conexões mortas: ping a cada 20 s; sem resposta por 2 ciclos = derruba
const hb = new WeakMap();
setInterval(() => {
  for (const ws of wss.clients) { const k = (hb.get(ws) || 0); if (k >= 2) { ws.terminate(); continue; } hb.set(ws, k + 1); try { ws.ping(); } catch (e) { /* ignore */ } }
}, 20000);
wss.on('connection', ws => { ws.on('pong', () => hb.set(ws, 0)); ws.on('message', () => hb.set(ws, 0)); });

server.listen(PORT, () => log('Vampire-like online em http://localhost:' + PORT + '  (salas máx ' + MAX_ROOMS + ', ' + MAXP + ' jogadores por sala)'));
