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

// ---------------------------------------------------------------- salas pagas (mesmo esquema do Poke Run)
// "Play for prize": entrar é grátis; com >= PAID_MIN jogadores o lobby trava, o preço do pacote é dividido entre todos (fase 'pay');
// quando todos pagam, a partida começa; quem matar MAIS inimigos ao fim leva o pacote de cartas. Quem sai no meio perde (forfeit).
// Pagamento: PAYMENT_MODE=sim (padrão, só teste) ou solana (USDC; devnet por padrão, mainnet exige ALLOW_MAINNET=yes) - ver solana.mjs.
const envS = k => String(process.env[k] || '').trim().replace(/^["']+|["']+$/g, '').trim();
const PAYMENT_MODE = (envS('PAYMENT_MODE') || 'sim').toLowerCase();
const PAID_MIN = +process.env.PAID_MIN || 2, PAID_WAIT = +process.env.PAID_WAIT || 90, PAID_START = +process.env.PAID_START || 20, PAY_WINDOW = +process.env.PAY_WINDOW || 60, PAID_RESULTS = +process.env.PAID_RESULTS || 25;
const PACKS = [{ code: envS('PACK_CODE') || 'pokemon_25', usd: +envS('PACK_USD') || 25, label: envS('PACK_LABEL') || 'Starter Pack' }];
let FEE_PCT = +process.env.HOUSE_FEE_PCT || 0;   // taxa de serviço (%) somada ao preço do pacote (padrão 5% na mainnet)
const shareFor = (pack, n) => Math.ceil(pack.usd * (1 + FEE_PCT / 100) * 100 / n) / 100;   // preço do pacote (+ taxa) dividido entre n jogadores, arredondado para cima
const payOk = m => PAYMENT_MODE === 'sim' && typeof m.pay === 'string' && m.pay.startsWith('SIM:');
const PAID_ENABLED = !/^(no|0|false|off)$/i.test(String(process.env.PAID_ENABLED || 'yes').trim());   // interruptor: PAID_ENABLED=no pausa as salas pagas
const PRIZE_MODE = String(process.env.PRIZE_MODE || 'auto').trim().toLowerCase();                      // auto = compra o pacote; manual = só registra o vencedor (você entrega)
const MAX_PAID_ROOMS = +process.env.MAX_PAID_ROOMS || 2;
let SOL = null, OPERATIONAL = true;                                                                    // OPERATIONAL=false: SOL da casa baixo demais para pagar taxas
const friendlyErr = e => { const m = String(e && e.message || e); return /insufficient|0x1\b/i.test(m) ? 'Not enough USDC in your wallet' : /AccountNotFound|could not find account|InvalidAccountData|0xbc4/i.test(m) ? 'Your wallet has no USDC account yet' : /blockhash|expired/i.test(m) ? 'The payment expired, try again' : m.slice(0, 120); };
async function initPay() {
  if (PAYMENT_MODE !== 'solana') return;
  SOL = await import('./solana.mjs'); const si = await SOL.init(); if (si.real && !process.env.HOUSE_FEE_PCT) FEE_PCT = 5;
  log('SOLANA ' + si.network + ' | house ' + si.house + ' | SOL ' + si.sol + ' USDC ' + si.usdc + ' | gacha ' + si.gacha + ' | fee ' + FEE_PCT + '%');
  const chk = async () => { try { const b = await SOL.houseBalances(), ok = b.sol >= SOL.info().minSol; if (ok !== OPERATIONAL) log(ok ? 'casa abastecida: salas pagas liberadas' : 'ALERTA: SOL da casa baixo (' + b.sol + ') - salas pagas PAUSADAS'); OPERATIONAL = ok; } catch (e) { log('balance check failed:', e.message); } };
  await chk(); setInterval(chk, 30000);
}
let clientSeq = 0;

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
  constructor(pack) {
    this.pack = pack || null; this.paid = !!pack; this.phase = pack ? 'lobby' : 'play'; this.waitLeft = PAID_WAIT; this.startLeft = PAID_START; this.payLeft = 0; this.share = 0; this.winner = null; this.resultsLeft = 0; this.prizePending = false; this.starters = 0; this.payers = []; this.dead = false; this.lobbyAcc = 0;
    this.id = ++roomN; this.g = new Game(null, { mp: true }); this.g.W = 1280; this.g.H = 720; this.g.wantEvents = true; if (process.env.TEST_GOD) this.g.godMode = true;   // só para testes
    this.clients = new Set(); this.born = Date.now(); this.tick = 0; this.endedAt = 0; this.fxN = 0; this.zN = 0;
  }
  count() { return this.g.players.filter(P => !P.left).length; }
  humans() { return this.paid && (this.phase === 'lobby' || this.phase === 'pay') ? this.clients.size : this.count(); }
  destroy() { if (this.dead) return; this.dead = true; rooms.delete(this.id); log('sala', this.id, 'fechada'); }

  // ---- lobby / pagamento
  sendLobby() {
    const n = this.clients.size, stage = this.phase === 'pay' ? 'pay' : n >= PAID_MIN ? 'lock' : 'wait', players = [...this.clients].map(c => ({ id: c.id, nick: c.name, ch: c.ch, paid: !!c.paid }));
    for (const c of this.clients) send(c, { t: 'lobby', you: c.id, players, left: Math.max(0, stage === 'pay' ? this.payLeft : stage === 'lock' ? this.startLeft : this.waitLeft),
      paid: { stage, mode: PAYMENT_MODE, real: !!(SOL && SOL.info().real), fee: FEE_PCT, pack: this.pack, min: PAID_MIN, max: MAXP, n, est: n >= PAID_MIN ? shareFor(this.pack, n) : null, share: this.share, paidCount: [...this.clients].filter(x => x.paid).length, youPaid: !!c.paid } });
  }
  lockPay() {
    const n = this.clients.size; this.phase = 'pay'; this.share = shareFor(this.pack, n); this.payLeft = PAY_WINDOW;
    for (const c of this.clients) { c.paid = false; c.payExp = null; c.submitting = false; }
    log('sala', this.id, 'TRAVADA', n, 'jogadores,', this.pack.code, '$' + this.pack.usd, '-> $' + this.share, 'cada'); this.sendLobby();
  }
  onPay(c, m) {   // pagamento SIMULADO
    if (!this.paid || PAYMENT_MODE !== 'sim' || this.phase !== 'pay' || c.paid || !payOk(m)) return;
    c.paid = true; c.payRef = String(m.pay).slice(0, 64); c.amount = this.share;
    log('PAY sala', this.id + ':', c.name, 'pagou $' + this.share, '(sim) ref', c.payRef); this.afterPay();
  }
  afterPay() { if ([...this.clients].every(x => x.paid)) { log('sala', this.id, ': todos pagaram, começando'); this.startMatch(); } else this.sendLobby(); }
  onPayReq(c, m) {   // SOLANA: monta a transação para o jogador assinar
    if (!this.paid || PAYMENT_MODE !== 'solana' || !SOL || this.phase !== 'pay' || c.paid || c.submitting || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(m.wallet || ''))) return;
    c.wallet = String(m.wallet); const share = this.share;
    SOL.buildPayTx(c.wallet, share, 'VL:' + this.id + ':' + c.id).then(b => {
      if (this.dead || this.phase !== 'pay' || this.share !== share) return;
      c.payExp = { message: b.message, blockhash: b.blockhash, lastValidBlockHeight: b.lastValidBlockHeight, payer: c.wallet, share };
      send(c, { t: 'paytx', tx: b.tx, amount: share });
    }).catch(e => { log('sala', this.id, 'payreq falhou para', c.name + ':', e.message); send(c, { t: 'payfail', reason: friendlyErr(e) }); });
  }
  onPayTx(c, m) {   // SOLANA: recebe a transação assinada, confere e envia
    if (!this.paid || PAYMENT_MODE !== 'solana' || !SOL || this.phase !== 'pay' || c.paid || c.submitting || !c.payExp || typeof m.tx !== 'string' || m.tx.length > 4000) return;
    c.submitting = true; const exp = c.payExp;
    SOL.submitPayTx(m.tx, exp).then(sig => {
      c.submitting = false; c.payExp = null;
      if (this.dead || this.phase !== 'pay' || c.room !== this || this.share !== exp.share) {   // o dinheiro já saiu, mas a sala mudou: devolve
        log('sala', this.id, 'PAGAMENTO TARDIO de', c.name, exp.payer, '$' + exp.share, 'sig', sig, '- devolvendo'); c.amount = exp.share; this.refundClient(c, 'The lobby changed while you were paying', exp.payer); return;
      }
      c.paid = true; c.payRef = sig; c.amount = exp.share; log('PAY sala', this.id + ':', c.name, exp.payer, 'pagou $' + exp.share, '(solana) sig', sig); this.afterPay();
    }).catch(e => { c.submitting = false; c.payExp = null; log('sala', this.id, 'pagamento falhou para', c.name + ':', e.message); send(c, { t: 'payfail', reason: friendlyErr(e) }); });
  }
  refundClient(c, reason, wallet) { const amount = c.amount, to = wallet || c.wallet; c.paid = false; this.refundTo(c, c.name, to, amount, reason); }
  refundTo(c, name, to, amount, reason) {
    if (PAYMENT_MODE === 'solana' && SOL && to) {
      SOL.refund(to, amount, 'VL-refund:' + this.id + ':' + c.id).then(sig => { log('REFUND sala', this.id + ':', name, '$' + amount, '->', to, 'sig', sig, '-', reason); send(c, { t: 'refund', amount, reason, sig }); })
        .catch(e => log('REFUND FALHOU sala', this.id + ':', name, to, '$' + amount, '-', e.message, ' (devolver manualmente!)'));
    } else { send(c, { t: 'refund', amount, reason }); log('REFUND sala', this.id + ':', name, '$' + amount, '(' + PAYMENT_MODE + ') -', reason); }
  }
  relock(reason) {   // devolve o que já foi pago e reabre o lobby (o preço precisa ser recalculado)
    for (const c of this.clients) { c.payExp = null; if (c.paid) this.refundClient(c, reason); }
    this.phase = 'lobby'; this.startLeft = Math.min(PAID_START, 10); this.waitLeft = PAID_WAIT; this.payLeft = 0; this.sendLobby();
  }
  payTimeout() {
    for (const c of [...this.clients]) if (!c.paid) {
      log('sala', this.id + ':', c.name, 'não pagou a tempo - removido'); this.clients.delete(c); c.room = null; send(c, { t: 'kicked', reason: 'You did not pay in time' }); setTimeout(() => { try { c.ws.close(); } catch (e) { /* ignore */ } }, 300);
    }
    if (!this.clients.size) this.destroy(); else this.relock('Someone did not pay in time');
  }
  cancelPaid() {
    log('sala', this.id, 'cancelada (poucos jogadores)'); bcast(this, { t: 'cancel', reason: 'Not enough players joined' });
    for (const c of [...this.clients]) { c.room = null; setTimeout(() => { try { c.ws.close(); } catch (e) { /* ignore */ } }, 300); }
    this.destroy();
  }
  closePaid() {
    bcast(this, { t: 'closed' });
    for (const c of [...this.clients]) { c.room = null; setTimeout(() => { try { c.ws.close(); } catch (e) { /* ignore */ } }, 300); }
    this.destroy();
  }
  lobbyTick(dt) {
    this.lobbyAcc += dt; const tickSend = this.lobbyAcc >= 1; if (tickSend) this.lobbyAcc = 0;
    if (this.phase === 'pay') { this.payLeft -= dt; if (this.payLeft <= 0) this.payTimeout(); }
    else {
      const n = this.clients.size;
      if (n >= PAID_MIN) this.startLeft -= dt; else { this.startLeft = PAID_START; this.waitLeft -= dt; }
      if (n >= MAXP || (n >= PAID_MIN && this.startLeft <= 0)) this.lockPay(); else if (n < PAID_MIN && this.waitLeft <= 0) this.cancelPaid();
    }
    if (tickSend && !this.dead && this.clients.size) this.sendLobby();
  }
  // ---- partida paga: todos pagaram, cria os jogadores
  startMatch() {
    const g = this.g, cl = [...this.clients]; this.phase = 'play'; this.starters = cl.length; this.winner = null;
    this.payers = cl.map(c => ({ name: c.name, wallet: c.wallet, amount: c.amount, client: c }));
    cl.forEach((c, i) => { const P = g.addPlayer(c.ch, c.name, { late: false }); P.netMove = true; P.lastS = Date.now(); P.nick = c.name; P.client = c; P.p.x = (i - (cl.length - 1) / 2) * 70; P.tpAt = g.t; c.P = P; c.lastFx = 0; c.spec = 0; });
    for (const c of cl) send(c, { t: 'welcome', you: c.P.id, eids: ENEMY_IDS, room: this.id, late: false, paid: { pack: this.pack, share: this.share, n: this.starters } });
    bcast(this, roster(this)); log('sala', this.id, 'PARTIDA PAGA começou com', cl.length, 'jogadores');
  }
  // ---- fim: vence quem MATOU MAIS (desempate: mais dano); ninguém matou nada = reembolsa todos
  finishPaid() {
    const g = this.g; this.phase = 'results'; this.resultsLeft = PAID_RESULTS;
    const cands = g.players.filter(P => !P.left).sort((a, b) => (b.p.kills - a.p.kills) || (b.p.dmg - a.p.dmg)), top = cands[0];
    this.winner = top && top.p.kills > 0 ? top : null;
    bcast(this, { t: 'end', reason: g.endReason, time: Math.round(g.t), results: results(this), paid: { winner: this.winner ? { id: this.winner.id, nick: this.winner.nick } : null, pack: this.pack, share: this.share, n: this.starters, left: PAID_RESULTS } });
    if (this.winner) { log('RESULTADO PAGO sala', this.id + ': vencedor "' + this.winner.nick + '" (ref ' + (this.winner.client ? this.winner.client.payRef : '-') + ') com', this.winner.p.kills, 'abates leva', this.pack.code, '- pote', this.starters, 'x $' + this.share); this.awardPrize(); }
    else { log('RESULTADO PAGO sala', this.id + ': ninguém abateu nada - REEMBOLSA todos'); for (const c of this.clients) this.refundClient(c, 'Nobody scored a kill'); }
  }
  awardPrize() {
    const wp = this.winner, w = { name: wp.nick, id: wp.id, wallet: wp.client && wp.client.wallet }, pack = this.pack;
    if (PRIZE_MODE === 'manual') { log('PRIZE MANUAL sala', this.id + ': vencedor', w.name, 'carteira', w.wallet || '-', 'pacote', pack.code, '$' + pack.usd, '- ENTREGAR'); bcast(this, { t: 'prize', status: 'manual', winner: w.id }); return; }
    if (PAYMENT_MODE !== 'solana' || !SOL || !w.wallet) { log('PRIZE sala', this.id + ': entrega manual necessária (' + PAYMENT_MODE + ') vencedor', w.name, 'pacote', pack.code); return; }
    this.prizePending = true; bcast(this, { t: 'prize', status: 'buying', pack, winner: w.id }); log('PRIZE sala', this.id + ': comprando', pack.code, 'para', w.name, w.wallet);
    SOL.buyPack(pack.code, pack.usd, w.wallet).then(r => {
      log('PRIZE OK sala', this.id + ':', w.name, 'ganhou "' + r.name + '" (' + r.rarity + ', segurada $' + r.insured + ') nft', r.nft, 'entregue=' + r.delivered, 'memo', r.memo);
      bcast(this, { t: 'prize', status: 'done', winner: w.id, name: r.name, rarity: r.rarity, insured: r.insured, image: r.image, nft: r.nft, delivered: r.delivered });
    }).catch(e => {
      if (e && e.paid) {   // o pacote já foi pago, só falta abrir: continua tentando em segundo plano
        log('PRIZE ATRASADO sala', this.id + ': vencedor', w.name, w.wallet, 'memo', e.memo, '-', e.message, '; tentando em segundo plano'); bcast(this, { t: 'prize', status: 'delayed', winner: w.id });
        SOL.openLater(e.memo, w.wallet).then(r => log(r ? 'PRIZE OK (tarde) sala ' + this.id + ': ' + w.name + ' ganhou "' + r.name + '" nft ' + r.nft + ' entregue=' + r.delivered + ' memo ' + r.memo : 'PRIZE PERDIDO sala ' + this.id + ': memo ' + e.memo + ' vencedor ' + w.wallet + ' - a API reembolsa o pacote não aberto; devolver aos jogadores')).catch(() => {});
        return;
      }
      log('PRIZE FALHOU sala', this.id + ':', e.message, '- reembolsando todos'); bcast(this, { t: 'prize', status: 'refunded', winner: w.id });
      for (const p of this.payers) this.refundTo(p.client, p.name, p.wallet, p.amount, 'The prize pack could not be bought');
    }).finally(() => { this.prizePending = false; this.resultsLeft = Math.max(this.resultsLeft, 12); });
  }
}
function pickRoom() {
  const cands = [...rooms.values()].filter(r => !r.paid && !r.g.over && !r.endedAt && r.count() < MAXP);
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

function findPaidRoom(pack) {
  let best = null;
  for (const r of rooms.values()) if (r.paid && r.pack.code === pack.code && r.phase === 'lobby' && r.clients.size < MAXP && (!best || r.clients.size > best.clients.size)) best = r;
  if (best) return best;
  if (rooms.size >= MAX_ROOMS || [...rooms.values()].filter(r => r.paid).length >= MAX_PAID_ROOMS) return null;
  const r = new Room(pack); rooms.set(r.id, r); log('sala', r.id, 'PAGA criada', pack.code); return r;
}
function joinPaid(c, m) {
  const pack = PACKS.find(p => p.code === m.pack) || PACKS[0];
  if (!PAID_ENABLED || !OPERATIONAL) { send(c, { t: 'paidoff' }); return; }
  const room = findPaidRoom(pack); if (!room) return send(c, { t: 'full' });
  c.name = cleanName(m.name); c.ch = CHARS.includes(m.ch) ? m.ch : 'PORTA'; c.paid = false; c.room = room; c.P = null; room.clients.add(c);
  log('sala', room.id, '(paga) +', c.name, c.ch, 'no lobby:', room.clients.size); room.sendLobby();
}
function joinRoom(c, m) {
  if (c.room) leaveRoom(c);
  if (m.paid) return joinPaid(c, m);
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
  if (room.paid) {
    room.clients.delete(c); c.room = null;
    if (room.phase === 'lobby' || room.phase === 'pay') {
      log('sala', room.id, '(paga) -', c.name, 'saiu do lobby');
      if (room.phase === 'pay' && c.paid) room.refundClient(c, 'You left the lobby');
      if (!room.clients.size) room.destroy(); else if (room.phase === 'pay') room.relock(c.name + ' left'); else room.sendLobby();
    } else {   // partida em andamento: quem sai perde (forfeit) e não concorre ao prêmio
      if (c.P) room.g.removePlayer(c.P); log('sala', room.id, '(paga) -', c.name, 'saiu da partida (forfeit)');
      if (!room.clients.size && !room.prizePending) room.destroy(); else bcast(room, roster(room));
    }
    c.P = null; return;
  }
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
  const tombs = g.players.filter(Q => !Q.left && !Q.alive && Q.tomb).map(Q => [Q.id, r0(Q.tomb.x), r0(Q.tomb.y), Math.round(Math.min(1, Q.reviveT / 5) * 100) / 100]);
  const pp = me.p;
  if (process.env.SIZE_DEBUG && room.tick % 60 === 0) { const L = x => JSON.stringify(x).length; log('tam', 'en', L(en), 'bo', L(bo), 'pl', L(others), 'gm', L(gems), 'pj', L(proj), proj.length, 'zn', L(zones), zones.length, 'fx', L(fx), 'ep', L(eproj), 'ev', L(ev), ev.length, 'vw', L(visualWeapons(me))); }
  return {
    t: 'snap', n: room.tick, gt: Math.round(g.t * 100) / 100, ph: g.phase, pt: Math.round(g.phaseT * 100) / 100, tn: Math.round(g.tension * 100) / 100, bk: g.bossKey || null, rp: g.reaper ? 1 : 0, ov: g.over ? 1 : 0,
    me: { id: me.id, x: r0(pp.x), y: r0(pp.y), hp: Math.round(pp.hp), mhp: Math.round(me.S.maxHp), lv: pp.level, xp: Math.round(pp.xp * 10) / 10, need: xpNeeded(pp.level), gold: r0(pp.gold), kills: pp.kills, dmg: r0(pp.dmg), st: me.alive ? 0 : me.waiting ? 2 : 1, ifr: pp.iframes > 0 ? 1 : 0, sc: me.shieldCharges,
      ch: me.choices ? me.choices.map(o => [o.kind, o.id, o.lvl]) : null, ct: Math.round(me.choiceT * 10) / 10, pop: me.popup ? { title: me.popup.title, line: me.popup.line, icon: me.popup.icon || null } : null,
      w: me.weapons.map(w => [w.id, w.lvl]), ps: me.passives, vw: visualWeapons(me), spd: g.speedOf(me), tp: me.tpAt || 0 },
    pl: others, tb: tombs, en, bo, gm: gems, cs: chests, pj: proj, zn: zones, fx, ep: eproj, tl: tele, ev,
  };
}
function results(room) {
  const g = room.g;
  return g.players.filter(P => !P.left || P.p.level > 1 || P.p.kills > 0).map(P => ({ id: P.id, nick: P.nick, ch: P.charId, lv: P.p.level, kills: P.p.kills, dmg: r0(P.p.dmg), gold: r0(P.p.gold), diedAt: P.p.diedAt, alive: !!P.alive, left: !!P.left, w: P.weapons.map(w => [w.id, w.lvl]) }))
    .sort((a, b) => (a.left - b.left) || (b.kills - a.kills) || (b.dmg - a.dmg));   // ranking: quem matou mais primeiro
}

// ---------------------------------------------------------------- laço principal
let lastTick = Date.now(), slow = 0;
setInterval(() => {
  const now = Date.now(), realDt = Math.min(0.1, (now - lastTick) / 1000), dt = Math.min(0.06, (now - lastTick) / 1000) * TIME_SCALE; lastTick = now;
  const t0 = process.hrtime();
  for (const room of [...rooms.values()]) {
    const g = room.g;
    if (room.paid && (room.phase === 'lobby' || room.phase === 'pay')) { room.lobbyTick(realDt); continue; }
    if (room.paid && room.phase === 'results') {
      room.resultsLeft -= realDt; if (room.resultsLeft <= 0 && !room.prizePending) room.closePaid();
      continue;
    }
    if (!g.over) {
      let left = dt; while (left > 0) { const st = Math.min(0.05, left); g.update(st); left -= st; if (g.over) break; }
      if (g.over) { room.endedAt = now; log('sala', room.id, 'terminou:', g.endReason, 'em', Math.round(g.t), 's'); if (room.paid) room.finishPaid(); else bcast(room, { t: 'end', reason: g.endReason, time: Math.round(g.t), results: results(room) }); }
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
  if (rel === 'how') rel = 'how.html';   // página "How it works"
  if (rel === 'health') { res.writeHead(200); return res.end('ok'); }
  if (rel === 'stats') { res.writeHead(200, { 'Content-Type': 'application/json' }); let n = 0; for (const r of rooms.values()) n += r.count(); return res.end(JSON.stringify({ rooms: rooms.size, players: n })); }
  if (rel === 'paid/config') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); return res.end(JSON.stringify({ mode: PAYMENT_MODE, network: SOL ? SOL.info().network : null, real: !!(SOL && SOL.info().real), fee: FEE_PCT, paused: !PAID_ENABLED || !OPERATIONAL, prizeMode: PRIZE_MODE, min: PAID_MIN, max: MAXP, wait: PAID_WAIT, start: PAID_START, payWindow: PAY_WINDOW, packs: PACKS })); }
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
const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 } } });
const ipCount = new Map();
const ipOf = req => String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '?').trim();
const num = (v, lo, hi) => { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
wss.on('connection', (ws, req) => {
  const ip = ipOf(req), n = (ipCount.get(ip) || 0) + 1;
  if (n > 8) { ws.close(1008, 'too many connections'); return; }
  ipCount.set(ip, n);
  const c = { ws, ip, id: ++clientSeq, room: null, P: null, msgs: 0, mt: Date.now(), emoAt: 0, alive: true, joinAt: 0, name: '', ch: 'PORTA', paid: false, payRef: '', amount: 0, wallet: '', submitting: false, payExp: null };
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', data => {
    const now = Date.now(); if (now - c.mt > 1000) { c.mt = now; c.msgs = 0; } if (++c.msgs > 90) { if (c.msgs > 300) ws.close(1008, 'flood'); return; }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    c.alive = true;
    if (m.t === 'join') { if (now - c.joinAt < 1500) return; c.joinAt = now; joinRoom(c, m); return; }
    if (m.t === 'leave') { if (c.room) leaveRoom(c); return; }
    const room = c.room, P = c.P; if (!room) return;
    if (m.t === 'pay') return room.onPay(c, m); if (m.t === 'payreq') return room.onPayReq(c, m); if (m.t === 'paytx') return room.onPayTx(c, m);
    if (!P) return;
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
    } else if (m.t === 'dbg_kill' && process.env.TEST_DEBUG) {   // só para testes automatizados
      P.p.hp = 0;
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

initPay().then(() => server.listen(PORT, () => log('Vampire-like online em http://localhost:' + PORT + '  (salas máx ' + MAX_ROOMS + ', ' + MAXP + ' jogadores por sala; pagamento: ' + PAYMENT_MODE + ')'))).catch(e => { console.error('Falha ao iniciar o pagamento:', e && e.message || e); process.exit(1); });
