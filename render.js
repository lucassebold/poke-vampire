'use strict';
// Render / UI / input / efeitos. Sprites e textos vêm do jogo instalado (assets/, art.js, text.js) — uso local.
(() => {
  const V = window.VS, D = window.VS_DATA, T = window.VS_TEXT, ART = window.ART, B = window.VS_BOSSES;
  const { Game, xpNeeded, describeLevel, SPR, ARCH, BASE_OF } = V;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const FONT = 'Dos, "Courier New", monospace';
  const BASE_FILTER = 'saturate(1.3) contrast(1.06)';   // cores mais vivas (estilo cartoon)
  const FACE_RIGHT = true;                       // sprites do jogo olham para a direita (verificado visualmente)
  const PAL_NAMES = Object.keys(D.characters);
  let Z = 1, W = 1280, H = 720, state = 'loading', g = null, selIdx = 0, last = performance.now(), mouse = { x: -1, y: -1 }, click = null;
  const keys = {}, rects = [];

  // ---------- visual de xerife (Antonio) ----------
  const SKINS = ['pokemon', 'sheriff', 'original']; let skin = 'pokemon';
  try { const v = localStorage.getItem('vs_skin'); if (SKINS.includes(v)) skin = v; } catch (e) { }
  const POKE = window.VS_POKE || { chars: {}, enemies: {}, scales: {} }, SHERIFF_IDS = { ANTONIO: true };
  const facesRight = () => skin !== 'pokemon';   // sprites Pokémon (frente) olham para a esquerda; os originais para a direita
  const isPk = id => skin === 'pokemon' && POKE.chars[id];
  const charFrames = id => { if (isPk(id)) return POKE.chars[id].frames; const f = ART.chars[id]; return skin === 'sheriff' && SHERIFF_IDS[id] ? f.map(p => p.replace('assets/chars/', 'assets/chars_sheriff/')) : f; };
  const charScale = id => isPk(id) ? POKE.chars[id].s : SPR;
  const portraitOf = id => isPk(id) ? POKE.chars[id].portrait : skin === 'sheriff' && SHERIFF_IDS[id] ? 'assets/portraits_sheriff/' + id + '.png' : ART.portraits[id];
  const portraitScale = id => isPk(id) ? POKE.chars[id].ps : 4;
  const charTitle = (id, c) => isPk(id) ? POKE.chars[id].name : skin === 'sheriff' && SHERIFF_IDS[id] ? 'Sheriff ' + c.charName : c.charName + (c.surname ? ' ' + c.surname : '');
  const ENEMY_ORIG = {}; for (const [k, v] of Object.entries(ART.enemies)) ENEMY_ORIG[k] = v.variants;
  function warmOutlines() {   // cria os contornos antes (evita engasgo na 1ª vez que cada inimigo aparece)
    for (const [id, a] of Object.entries(ART.enemies)) a.variants.forEach((fr, vi) => { const pkv = a.pk && a.pk[vi]; for (const sc of [1, a.scale || 1]) { const s = pkv ? pkv.s0 * sc : SPR * sc, ol = Math.max(1, Math.round(2 / s)); fr.forEach(pth => { const im = img(pth); if (im) { outlined(im, '#5a0820', ol); outlined(im, '#ff2a4a', ol); tintOf(im, '#ffffff'); tintOf(im, '#4aa8ff'); } }); } });
    for (const id of Object.keys(ART.chars)) { const sc = charScale(id), ol = Math.max(1, Math.round(2 / sc)); charFrames(id).forEach(pth => { const im = img(pth); if (im) outlined(im, '#e8ffe0', ol); }); }
  }
  function applyEnemySkin() { for (const [id, a] of Object.entries(ART.enemies)) { const pk = skin === 'pokemon' && POKE.enemies[id]; a.variants = pk ? pk.variants.map(v => v.frames) : ENEMY_ORIG[id]; a.pk = pk ? pk.variants : null; } }
  const cycleSkin = () => { skin = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]; try { localStorage.setItem('vs_skin', skin); } catch (e) { } };
  // ---------- imagens ----------
  const imgs = {};
  const img = p => { if (!p) return null; let i = imgs[p]; if (!i) { i = imgs[p] = new Image(); i.src = p; } return i.complete && i.naturalWidth ? i : null; };
  const U = n => 'assets/ui/' + n + '.png';
  Game.sizeOf = p => { const i = img(p); if (!i) return null; const sc = POKE.scales[p]; return sc ? [i.naturalWidth * sc / SPR, i.naturalHeight * sc / SPR] : [i.naturalWidth, i.naturalHeight]; };
  function preload() {
    const list = ['assets/bg/forest.png', ...['frameB', 'frameB_gold', 'frameB10', 'frameB_sotn', 'frameB_red', 'frame5_c4', 'frameB9', 'button_c9_normal'].map(U)];
    const walk = o => { if (typeof o === 'string') list.push(o); else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    Object.keys(B.defs).forEach(k => list.push('assets/bosses/' + k + '.png')); for (let i = 0; i < 10; i++) list.push('assets/props/p' + i + '.png'); walk(ART.chars); walk(ART.portraits); for (let i = 1; i <= 4; i++) list.push('assets/chars_sheriff/ANTONIO_' + i + '.png'); list.push('assets/portraits_sheriff/ANTONIO.png'); walk(Object.values(ART.enemies).map(e => e.variants)); walk(Object.values(POKE.chars).map(c => [c.frames, c.portrait])); walk(Object.values(POKE.enemies).map(e => e.variants.map(v => v.frames))); walk(ART.icons); walk(ART.fx);
    const ps = list.map(p => new Promise(r => { const i = imgs[p] = new Image(); i.onload = i.onerror = () => r(); i.src = p; }));
    ps.push(Promise.race([document.fonts.load('16px Dos'), new Promise(r => setTimeout(r, 4000))]).catch(() => {}));
    return Promise.all(ps);
  }
  function layout() {
    cv.width = innerWidth; cv.height = innerHeight; Z = cv.height / 720; H = 720; W = cv.width / Z;
    if (g) { g.W = W; g.H = H; }
  }
  addEventListener('resize', layout); layout();

  // ---------- helpers de desenho ----------
  function spr(im, x, y, s = SPR, flip = false, rot = 0, alpha = 1) {
    if (!im) return; const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, w = iw * s, h = ih * s;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1); if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
  }
  function txt(t, x, y, size, col, al, outline) {
    ctx.font = `${size}px ${FONT}`; ctx.textAlign = al || 'left'; ctx.textBaseline = 'alphabetic';
    if (outline !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); }
    ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y);
  }
  function wrap(t, x, y, maxW, size, col, lh) {
    ctx.font = `${size}px ${FONT}`; let line = '', yy = y;
    for (const para of String(t).split('\n')) {
      for (const w of para.split(' ')) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { txt(line, x, yy, size, col, 'left', false); yy += lh; line = w; } else line = test; }
      if (line) { txt(line, x, yy, size, col, 'left', false); yy += lh; line = ''; }
    }
    return yy;
  }
  function nine(im, x, y, w, h, sl, s) {
    if (!im) { ctx.fillStyle = '#223'; ctx.fillRect(x, y, w, h); return; }
    const iw = im.naturalWidth, ih = im.naturalHeight, d = sl * s;
    const xs = [0, sl, iw - sl, iw], ys = [0, sl, ih - sl, ih], dx = [x, x + d, x + w - d, x + w], dy = [y, y + d, y + h - d, y + h];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.drawImage(im, xs[c], ys[r], xs[c + 1] - xs[c], ys[r + 1] - ys[r], dx[c], dy[r], dx[c + 1] - dx[c], dy[r + 1] - dy[r]);
  }
  const panel = (x, y, w, h, fr) => { ctx.fillStyle = 'rgba(8,10,28,.94)'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8); nine(img(U(fr || 'frameB_gold')), x, y, w, h, 6, 2); };
  const button = (label, x, y, w, h, id, hot) => {
    rects.push({ x, y, w, h, id }); const over = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    nine(img(U('button_c9_normal')), x, y, w, h, 8, 2); if (over || hot) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8); }
    txt(label, x + w / 2, y + h / 2 + 6, 16, '#fff', 'center');
  };
  const hit = id => click && rects.find(r => r.id === id && click.x >= r.x && click.x <= r.x + r.w && click.y >= r.y && click.y <= r.y + r.h);
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const iconOf = id => img(ART.icons[id]);
  const itemDef = (kind, id) => (kind === 'w' ? D.weapons : D.passives)[id];
  const rand = (a, b) => a + Math.random() * (b - a);

  // ================= EFEITOS: brilho aditivo, partículas, tremor, flash =================
  const glows = {};
  function glowImg(col) {
    let c = glows[col]; if (c) return c;
    c = glows[col] = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = col; x.fillRect(0, 0, 64, 64); x.globalCompositeOperation = 'destination-in';
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.4, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
  }
  function glow(x, y, r, col, a) { ctx.globalAlpha = a; ctx.drawImage(glowImg(col), x - r, y - r, r * 2, r * 2); }
  const PAL = { WHIP: ['#ffe9a0', '#ff9a40'], VAMPIRICA: ['#ff4060', '#ffb0c0'], MAGIC_MISSILE: ['#6ab8ff', '#d0f0ff'], HOLY_MISSILE: ['#fff0a0', '#a0e8ff'], KNIFE: ['#e8f0ff', '#8aa8ff'], THOUSAND: 'rainbow',
    AXE: ['#ffb060', '#ff5020'], SCYTHE: ['#c070ff', '#ff60d0'], CROSS: ['#ffe870', '#ffffff'], HEAVENSWORD: 'rainbow', HOLYBOOK: ['#80d8ff', '#ffffff'], VESPERS: ['#ff4a6a', '#a040ff'],
    FIREBALL: ['#ff7a30', '#ffd060'], HELLFIRE: ['#ff3020', '#ffa030'], GARLIC: ['#c0ff90', '#fffbb0'], VORTEX: ['#80ffb0', '#a0e0ff'], LIGHTNING: ['#c0b0ff', '#ffffff'], LOOP: 'rainbow',
    HOLYWATER: ['#40c8ff', '#b0f0ff'], BORA: ['#40ffd0', '#ffffff'], DIAMOND: 'rainbow', ROCHER: ['#ff50c0', '#ffe060'], SILF: ['#fff0c0', '#ff9ad0'], SILF2: ['#b070ff', '#40e0ff'], SILF3: 'rainbow',
    SONG: ['#ff7ac8', '#c0a0ff'], MANNAGGIA: ['#ff40a0', '#8040ff'], PENTAGRAM: ['#c070ff', '#ffffff'], SIRE: ['#ffe070', '#ffffff'], LAUREL: ['#8aff8a', '#e0ffc0'], HALO: ['#bfe8ff', '#ffffff'], CROWN: 'rainbow', EMBER: ['#ff8a30', '#ffd060'], SOLAR: ['#ffcf40', '#ff4a20'], FROST: ['#70e0ff', '#e0ffff'], GLACIER: ['#a0f0ff', '#6a8aff'], STORM: ['#c0a0ff', '#ffffff'], THUNDER: 'rainbow' };
  function pal(id, t, i = 0) { const p = PAL[id] || ['#ffffff', '#cccccc']; if (p === 'rainbow') return `hsl(${Math.round(((t * 180 + i * 47) % 360) / 30) * 30},100%,66%)`; return p[i % 2]; }
  const tierK = (tier, evo) => 1 + 0.06 * ((tier || 1) - 1) + (evo ? 0.3 : 0);   // escala visual por nível da arma

  const P = [], MAXP = 2400, puffs = [];
  function sp(x, y, vx, vy, life, size, col, add, g2, d) { if (P.length < MAXP) P.push({ x, y, vx, vy, l: life, m: life, s: size, c: col, a: add !== false, g: g2 || 0, d: d || 0 }); }
  function burst(x, y, n, col, speed, life, size, add) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = speed * (0.35 + Math.random() * 0.65); sp(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, col, add, 0, 2.2); } }
  function ringP(x, y, r, n, col, life) { for (let i = 0; i < n; i++) { const a = i / n * 6.283; sp(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2, life, 4, col, true, 0, 3.5); } }
  function updP(dt) { for (let i = puffs.length - 1; i >= 0; i--) { puffs[i].l -= dt; if (puffs[i].l <= 0) puffs.splice(i, 1); } for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.l -= dt; if (q.l <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; } const k = 1 - q.d * dt; q.vx *= k; q.vy = q.vy * k + q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; } }
  function drawP(cx, cy) {
    for (const add of [false, true]) {
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      for (const q of P) { if (q.a !== add) continue; const k = q.l / q.m; ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = q.c; const s = Math.max(1, Math.round(q.s * (0.35 + 0.65 * k))); ctx.fillRect(Math.round(q.x - cx - s / 2), Math.round(q.y - cy - s / 2), s, s); }
    }
    ctx.globalCompositeOperation = 'lighter'; for (const q of puffs) { const k = q.l / q.m; glow(q.x - cx, q.y - cy, q.r * (1.5 - 0.5 * k), '#fff4d0', k * 0.8); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  let shakeA = 0, flashA = 0, hitStop = 0;
  const shake = a => { if (isFinite(a)) shakeA = Math.min(14, Math.max(shakeA, a)); };
  function consumeEvents(gm, t) {
    const ev = gm.ev; if (ev.length > 160) ev.splice(0, ev.length - 160);
    let bud = 46; const nb = n => { const k = Math.min(n, bud); bud -= k; return k; };
    const A = window.VSAudio, pn = x => Math.max(-0.7, Math.min(0.7, (x - gm.p.x) / (W / 2))), ps = (k, o) => A && A.play(k, o);
    const FS = { MAGIC_MISSILE: 'w_wand', HOLY_MISSILE: 'w_holy', KNIFE: 'w_knife', THOUSAND: 'w_knife', AXE: 'w_axe', SCYTHE: 'w_scythe', CROSS: 'w_cross', HEAVENSWORD: 'w_cross', FIREBALL: 'w_fire', HELLFIRE: 'w_fire', DIAMOND: 'w_holy', ROCHER: 'w_holy', SILF: 'w_birds', SILF2: 'w_birds', SILF3: 'w_birds', SONG: 'w_song', MANNAGGIA: 'w_song' };
    for (const e of ev) {
      if (e.k === 'hit') { ps('hit', { pan: pn(e.x), rate: e.crit ? 1.3 : 1, vol: e.crit ? 1.4 : 1 }); }
      else if (e.k === 'kill') { ps('kill', { pan: pn(e.x) }); }
      else if (e.k === 'pickup') { ps(e.t === 'COIN' ? 'coin' : 'gem', { jitter: 0.25 }); }
      else if (e.k === 'levelup') { ps('levelup', { prio: true, jitter: 0 }); }
      else if (e.k === 'chest') { ps('chest', { prio: true, jitter: 0 }); }
      else if (e.k === 'bossWarn') { ps('warn_gong', { prio: true, jitter: 0 }); for (let i = 0; i < 4; i++) ps('warn_alarm', { when: 0.4 + i * 0.55, prio: true, jitter: 0 }); }
      else if (e.k === 'bossShot') ps('boss_shot'); else if (e.k === 'bossDash') ps('boss_dash', { prio: true }); else if (e.k === 'bossLand') ps('boss_land', { prio: true });
      else if (e.k === 'fire') { const k = FS[e.id]; if (k) ps(k); }
      else if (e.k === 'whip') ps('w_whip'); else if (e.k === 'nova') ps('w_nova', { prio: true, jitter: 0 }); else if (e.k === 'orbit') ps('w_orbit'); else if (e.k === 'reaper') ps('reaper', { prio: true, jitter: 0 }); else if (e.k === 'gameover') ps('gameover', { prio: true, jitter: 0 });
      if (e.k === 'hit') { const c0 = pal(e.id, t, 0), c1 = pal(e.id, t, 1); burst(e.x, e.y, nb(e.crit ? 10 : 5), c0, e.crit ? 230 : 150, 0.4, e.crit ? 5 : 4); if (bud > 8 && Math.random() < 0.15) ringP(e.x, e.y, 24, 6, c1, 0.3); if (e.crit || e.big) { burst(e.x, e.y, nb(4), c1, 90, 0.4, 5); shake(e.crit ? 2.2 : 1.5); } }
      else if (e.k === 'kill') { burst(e.x, e.y, nb(5), '#ffe9b0', 140, 0.3, 3); if (puffs.length < 40) puffs.push({ x: e.x, y: e.y, r: e.r * 2.2, l: 0.2, m: 0.2 }); }
      else if (e.k === 'boom') { ps(e.boss ? 'boss_shock' : 'w_fireboom', { pan: pn(e.x), prio: !!e.boss }); ringP(e.x, e.y, Math.min(e.r, 160), Math.min(22, 8 + (e.r / 8 | 0)), e.col || '#ffb060', 0.45); burst(e.x, e.y, 12, e.col || '#ffd060', 220, 0.5, 4); shake(Math.min(6, e.r / 30)); }
      else if (e.k === 'zap') { ps('w_lightning', { pan: pn(e.x), vol: 0.45 }); burst(e.x, e.y, nb(5), '#d8d0ff', 140, 0.3, 3); }
      else if (e.k === 'bounce') { ps('w_bounce', { pan: pn(e.x) }); burst(e.x, e.y, 10, e.col || '#fff', 200, 0.4, 4); }
      else if (e.k === 'bolt') { ps('w_lightning', { pan: pn(e.x) }); burst(e.x, e.y, 10, '#d8d0ff', 230, 0.35, 4); flashA = Math.max(flashA, 0.10); shake(2.5); }
      else if (e.k === 'shake') shake(e.a);
      else if (e.k === 'flash') flashA = Math.max(flashA, e.a);
      else if (e.k === 'evolve') { ps('evolve', { prio: true, jitter: 0 }); flashA = Math.max(flashA, 0.6); shake(8); for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, s = rand(120, 460); sp(gm.p.x, gm.p.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.1), rand(3, 7), `hsl(${Math.random() * 360 | 0},100%,70%)`, true, 0, 2.2); } }
      else if (e.k === 'revive') { ps('levelup', { prio: true, jitter: 0 }); ringP(e.x, e.y, 90, 20, '#9dffa0', 0.7); burst(e.x, e.y, 24, '#c8ffd8', 240, 0.6, 4); flashA = Math.max(flashA, 0.15); }
      else if (e.k === 'shield') { ps('w_shieldhit', { prio: true }); burst(e.x, e.y, 22, '#9dffa0', 260, 0.5, 4); shake(3); }
      else if (e.k === 'shieldup') { ps('w_shieldup', { prio: true }); ringP(e.x, e.y, 70, 18, '#9dffa0', 0.6); }
      else if (e.k === 'hurt') { ps('hurt', { prio: true, jitter: 0.06 }); burst(e.x, e.y, 10, '#ff4040', 170, 0.4, 4); shake(4); flashA = Math.max(flashA, 0.05); }
      else if (e.k === 'bossdie') { ps('boss_die', { prio: true, jitter: 0 }); ps('boss_boom', { prio: true, when: 0.15, jitter: 0 }); flashA = Math.max(flashA, 0.7); for (let i = 0; i < 120; i++) { const a = Math.random() * 6.283, s = rand(80, 520); sp(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.4), rand(3, 8), Math.random() < 0.5 ? e.col : `hsl(${Math.random() * 360 | 0},100%,70%)`, true, 0, 2); } }
    }
    ev.length = 0;
  }

  // ---------- fluxo ----------
  function start() { if (window.VSAudio) VSAudio.play('ui_start', { prio: true, jitter: 0 }); applyEnemySkin(); warmOutlines(); g = new Game(PAL_NAMES[selIdx]); g.W = W; g.H = H; g.wantEvents = true; state = 'play'; window.__game = g; P.length = 0; shakeA = 0; flashA = 0; cv.style.filter = BASE_FILTER; }
  function startOnline(paid) {
    if (location.protocol === 'file:') { menuMsg = 'Online needs the server - open the game with online.bat'; menuMsgT = 4; return; }
    const name = (nickEl.value || '').trim(); try { localStorage.setItem('vs_nick', name); } catch (e) { }
    skin = 'pokemon'; if (window.VSAudio) VSAudio.play('ui_start', { prio: true, jitter: 0 }); applyEnemySkin(); warmOutlines();
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    g = new window.VSNet.RemoteGame(url, { name, ch: PAL_NAMES[selIdx], paid: !!paid, pack: paid ? PAYCFG.packs[0].code : undefined }, { onPayTx: signAndReturn }); g.W = W; g.H = H; state = 'play'; window.__game = g; P.length = 0; shakeA = 0; flashA = 0; cv.style.filter = BASE_FILTER; nickEl.blur();
  }
  // ---------- salas pagas: configuração, carteira Solana (Phantom), pagamento ----------
  let PAYCFG = { mode: 'sim', min: 2, max: 4, packs: [{ code: 'pokemon_25', usd: 25, label: 'Starter Pack' }] }, prizeIntro = false;
  fetch('/paid/config').then(r => r.json()).then(c => { PAYCFG = c; }).catch(() => { });
  const WALLET = { provider: null, pubkey: null }; let web3Promise = null, walletMsg = '';
  const usd = v => '$' + (+v).toFixed(2);
  function ensureWeb3() {   // biblioteca da Solana carregada só quando precisa
    if (window.solanaWeb3) return Promise.resolve(window.solanaWeb3);
    if (!web3Promise) web3Promise = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js'; sc.onload = () => res(window.solanaWeb3); sc.onerror = () => { web3Promise = null; rej(new Error('Could not load the Solana library')); }; document.head.appendChild(sc); });
    return web3Promise;
  }
  async function getWalletProvider() {
    if (window.__testWalletSecret) { const w3 = await ensureWeb3(), kp = w3.Keypair.fromSecretKey(Uint8Array.from(window.__testWalletSecret)); return { publicKey: kp.publicKey, connect: async () => ({ publicKey: kp.publicKey }), signTransaction: async tx => { tx.partialSign(kp); return tx; } }; }   // gancho de teste
    const p = (window.phantom && window.phantom.solana) || window.solana; if (!p) throw new Error('No Solana wallet found - install Phantom (phantom.app)'); return p;
  }
  async function connectWallet() {
    try { const p = await getWalletProvider(), r = await p.connect(); WALLET.provider = p; WALLET.pubkey = String((r && r.publicKey) || p.publicKey); walletMsg = ''; }
    catch (e) { const m = String(e && e.message || e); walletMsg = /reject|denied|cancel|closed/i.test(m) ? 'Wallet connection cancelled' : m.slice(0, 80); }
  }
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0)), bytesToB64 = u => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
  async function signAndReturn(b64) {   // o servidor monta a transação, o jogador assina na carteira, devolvemos
    try { const w3 = await ensureWeb3(), tx = w3.Transaction.from(b64ToBytes(b64)), signed = await WALLET.provider.signTransaction(tx); g.send({ t: 'paytx', tx: bytesToB64(signed.serialize({ requireAllSignatures: false })) }); g.payMsg = 'Sending the payment...'; }
    catch (e) { g.payError = /reject|denied|cancel/i.test(String(e && e.message)) ? 'You cancelled the payment' : String(e && e.message || e).slice(0, 100); g.payBusy = false; g.payMsg = ''; }
  }
  function drawPrizeIntro(t) {
    const cfg = PAYCFG, real = cfg.mode === 'solana', pk = cfg.packs[0], w = 700, h = real ? 470 : 420, x = (W - w) / 2, y = (H - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, W, H); panel(x, y, w, h, 'frameB_gold');
    txt('PLAY FOR PRIZE', W / 2, y + 52, 32, '#ffd24a', 'center'); txt('Prize: ' + pk.label + '  (' + usd(pk.usd) + ')', W / 2, y + 86, 16, '#fff', 'center');
    let yy = wrap('Joining is free. When at least ' + cfg.min + ' players are in the lobby it locks, and the pack price' + (cfg.fee ? ' (+ ' + cfg.fee + '% service fee)' : '') + ' is split between everyone (more players = cheaper).', x + 40, y + 124, w - 80, 16, '#cfe0ff', 22);
    yy = wrap('Real players only. When the match ends, the player who KILLED THE MOST enemies wins the card pack' + (real ? ', sent straight to their wallet. You pay in USDC from your wallet (no SOL needed). The card is random: it can be worth more or less than the pack price.' : '.'), x + 40, yy + 8, w - 80, 16, '#cfe0ff', 22);
    yy = wrap('If you leave a prize match before it ends, you forfeit.', x + 40, yy + 8, w - 80, 16, '#ff9a9a', 22);
    txt(real ? (cfg.network === 'devnet' ? 'Solana DEVNET - test network, fake money, no real cost' : 'REAL MONEY - you pay real USDC') : 'TEST MODE - no real money is charged', W / 2, yy + 26, 16, real && cfg.network !== 'devnet' ? '#ffb74d' : '#9dffa0', 'center');
    if (real) { button(WALLET.pubkey ? 'Wallet: ' + WALLET.pubkey.slice(0, 4) + '...' + WALLET.pubkey.slice(-4) : 'CONNECT WALLET', W / 2 - 130, y + h - 150, 260, 46, 'wallet', !WALLET.pubkey); if (walletMsg) txt(walletMsg, W / 2, y + h - 90, 16, '#ff9a9a', 'center'); if (hit('wallet')) connectWallet(); }
    const ok = !cfg.paused && (!real || WALLET.pubkey);
    button(cfg.paused ? 'PAUSED' : 'FIND A PRIZE MATCH', W / 2 - 330, y + h - 66, 280, 46, 'findprize', ok); button('How it works', W / 2 - 30, y + h - 66, 180, 46, 'prizehow'); button('Back', W / 2 + 170, y + h - 66, 160, 46, 'prizeback'); if (hit('prizehow')) window.open('/how', '_blank');
    if (hit('findprize') && ok) { prizeIntro = false; startOnline(true); } else if (hit('prizeback')) prizeIntro = false;
  }
  function drawLobby(gm, t) {
    const bg = img('assets/bg/forest.png'); ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, W, H); if (bg) { ctx.globalAlpha = .35; ctx.drawImage(bg, 0, 0, 1024, 1024, 0, 0, 2048, 2048); ctx.globalAlpha = 1; } ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    const L = gm.lobby, p = L.paid, real = p.mode === 'solana', w = 720, h = 520, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h, 'frameB_gold');
    txt('PRIZE MATCH LOBBY', W / 2, y + 50, 32, '#ffd24a', 'center'); txt('Prize: ' + p.pack.label + ' (' + usd(p.pack.usd) + ')   -   most kills wins', W / 2, y + 80, 16, '#fff', 'center');
    L.players.forEach((q, i) => { const yy = y + 108 + i * 50, me = q.id === L.you; ctx.fillStyle = me ? 'rgba(255,210,74,.14)' : 'rgba(255,255,255,.06)'; ctx.fillRect(x + 40, yy, w - 80, 44); const pi = img(portraitOf(q.ch)); if (pi) spr(pi, x + 70, yy + 22, portraitScale(q.ch) * 0.5); txt(q.nick, x + 110, yy + 28, 16, me ? '#ffd24a' : '#fff', 'left'); if (q.paid) txt('PAID', x + w - 56, yy + 28, 16, '#7dff9a', 'right'); });
    for (let i = L.players.length; i < p.max; i++) { const yy = y + 108 + i * 50; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([6, 6]); ctx.strokeRect(x + 40, yy, w - 80, 44); ctx.setLineDash([]); txt('waiting for a player...', x + 110, yy + 28, 16, '#6f7f98', 'left', false); }
    const by = y + 322, left = Math.max(0, Math.ceil(p.stage === 'pay' ? L.left - 0 : L.left));
    if (p.stage === 'wait') { txt('Waiting for players: ' + p.n + '/' + p.min + ' minimum', W / 2, by, 16, '#fff', 'center'); txt('The match is cancelled in ' + left + 's if nobody else joins', W / 2, by + 24, 16, '#9fb0c8', 'center'); }
    else if (p.stage === 'lock') { txt(p.n + ' players ready. The lobby locks in ' + left + 's (more players can still join)', W / 2, by, 16, '#fff', 'center'); txt('Estimated price: ' + usd(p.est) + ' each' + (real ? ' (USDC)' : ''), W / 2, by + 28, 32, '#ffd24a', 'center'); }
    else if (p.youPaid) { txt('Payment received', W / 2, by, 32, '#7dff9a', 'center'); txt(p.paidCount + '/' + p.n + ' paid - waiting for the others (' + left + 's)', W / 2, by + 30, 16, '#fff', 'center'); }
    else {
      txt('Lobby locked - ' + p.n + ' players.  Your share' + (p.fee ? ' (includes a ' + p.fee + '% service fee)' : '') + ':', W / 2, by - 6, 16, '#fff', 'center'); txt(usd(p.share) + (real ? ' USDC' : ''), W / 2, by + 30, 32, '#ffd24a', 'center');
      const need = real && !WALLET.pubkey; button(gm.payBusy ? 'PAYING...' : 'PAY ' + usd(p.share), W / 2 - 110, by + 48, 220, 46, 'paynow', !gm.payBusy);
      if (need) { button(WALLET.pubkey ? 'Wallet connected' : 'CONNECT WALLET', W / 2 + 130, by + 48, 220, 46, 'wallet2', true); if (hit('wallet2')) connectWallet(); }
      if (hit('paynow') && !gm.payBusy) { if (need) { gm.payError = 'Connect your wallet first'; } else { gm.payBusy = true; gm.payError = ''; gm.payMsg = 'Preparing the payment...'; if (real) gm.send({ t: 'payreq', wallet: WALLET.pubkey }); else gm.send({ t: 'pay', pay: 'SIM:' + Math.random().toString(36).slice(2, 10) }); } }
      txt('Time left to pay: ' + left + 's', W / 2, by + 118, 16, '#9fb0c8', 'center');
      if (gm.payError) txt(gm.payError, W / 2, by + 142, 16, '#ff9a9a', 'center'); else if (gm.payMsg) txt(gm.payMsg, W / 2, by + 142, 16, '#cfd8ff', 'center');
    }
    txt(real ? (p.real ? 'REAL MONEY - you are paying real USDC' : 'TEST NETWORK (devnet) - fake money, no real cost') : 'TEST MODE - no real money is charged', W / 2, y + h - 56, 16, real && p.real ? '#ffb74d' : '#9dffa0', 'center');
    button('Leave', x + w - 150, y + h - 46, 120, 36, 'leavelobby'); if (hit('leavelobby')) leaveOnline();
    if (gm.toast) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(W / 2 - 330, H - 80, 660, 40); txt(gm.toast.text, W / 2, H - 54, 16, '#7dd3ff', 'center'); }
  }
  function leaveOnline() { if (g && g.close) g.close(); state = 'select'; cv.style.filter = BASE_FILTER; }
  let menuMsg = '', menuMsgT = 0;
  const nickEl = document.createElement('input'); nickEl.maxLength = 12; nickEl.placeholder = 'Your nickname'; nickEl.autocomplete = 'off'; nickEl.spellcheck = false;
  nickEl.style.cssText = 'position:fixed;display:none;box-sizing:border-box;background:#0b1030;color:#fff;border:3px solid #ffd24a;font-family:Dos,"Courier New",monospace;padding:0 10px;outline:none;z-index:5';
  try { nickEl.value = localStorage.getItem('vs_nick') || ''; } catch (e) { } document.body.appendChild(nickEl);
  const input = () => ({ x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) });
  function popupAdvance() { if (!g.popup) return; if (!g.popup.open) g.popup.open = true; else g.popup = null; }
  addEventListener('keydown', e => {
    if (document.activeElement === nickEl) { if (e.code === 'Enter' && state === 'select' && !prizeIntro) startOnline(false); return; }
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (state === 'select') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') selIdx = (selIdx + PAL_NAMES.length - 1) % PAL_NAMES.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') selIdx = (selIdx + 1) % PAL_NAMES.length;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') selIdx = (selIdx + PAL_NAMES.length - 3) % PAL_NAMES.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') selIdx = (selIdx + 3) % PAL_NAMES.length;
      const n = +e.key; if (n >= 1 && n <= PAL_NAMES.length) selIdx = n - 1;
      if (prizeIntro) { if (e.code === 'Escape') prizeIntro = false; return; }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyO') startOnline(false); return;
    }
    if (state !== 'play') return;
    if (g.online) {
      const em = EMO_KEYS.indexOf(e.code); if (em >= 0 && !e.repeat) { g.emote(em); return; }
      if (g.leaveAsk) { if (e.code === 'Enter' || e.code === 'KeyQ') leaveOnline(); else if (e.code === 'Escape') g.leaveAsk = false; return; }
      if (g.error || g.over) { if (e.code === 'Enter') leaveOnline(); return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { g.leaveAsk = true; return; }
      if ((g.dead || g.waiting) && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { g.cycleSpec(e.code === 'ArrowRight' ? 1 : -1); return; }
      if (g.choices) { const n = +e.key; if (n >= 1 && n <= g.choices.length) { g.choose(n - 1); if (window.VSAudio) VSAudio.play('choose', { prio: true, jitter: 0 }); } }
      return;
    }
    if (g.choices) { const n = +e.key; if (n >= 1 && n <= g.choices.length) { g.choose(n - 1); if (window.VSAudio) VSAudio.play('choose', { prio: true, jitter: 0 }); } return; }
    if (g.popup) { if (e.code === 'Enter' || e.code === 'Space') popupAdvance(); return; }
    if (g.over) { if (e.code === 'Enter' || e.code === 'KeyR') { state = 'select'; cv.style.filter = BASE_FILTER; } return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { g.paused = !g.paused; if (window.VSAudio) VSAudio.play(g.paused ? 'pause_in' : 'pause_out', { prio: true, jitter: 0 }); }
    else if (g.paused && e.code === 'Enter') g.paused = false;
    else if (g.paused && e.code === 'KeyQ') { state = 'select'; cv.style.filter = BASE_FILTER; }
  });
  addEventListener('keyup', e => keys[e.code] = false);
  cv.addEventListener('mousemove', e => { mouse = { x: e.clientX / Z, y: e.clientY / Z }; });
  cv.addEventListener('mousedown', e => { nickEl.blur(); click = { x: e.clientX / Z, y: e.clientY / Z }; });

  // ---------- seleção de personagem ----------
  function drawSelect(t) {
    const bg = img('assets/bg/forest.png'); ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, W, H);
    if (bg) { ctx.globalAlpha = .35; ctx.drawImage(bg, 0, 0, 1024, 1024, 0, 0, 2048, 2048); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    txt(T.character_select_character_setup.trim(), W / 2, 62, 32, '#ffd24a', 'center');
    txt(D.stage.name, W / 2, 92, 16, '#9fb0c8', 'center');
    const cell = 92, gx = Math.max(40, W / 2 - 560), gy = 150;
    PAL_NAMES.forEach((id, i) => {
      const x = gx + (i % 3) * (cell + 10), y = gy + Math.floor(i / 3) * (cell + 10), sel = i === selIdx;
      rects.push({ x, y, w: cell, h: cell, id: 'sel' + i });
      panel(x, y, cell, cell, sel ? 'frameB_gold' : 'frameB');
      const p = img(portraitOf(id)); if (p) spr(p, x + cell / 2, y + cell / 2, portraitScale(id));
      if (sel) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, cell + 4, cell + 4); }
      if (!prizeIntro && hit('sel' + i)) { selIdx = i; }
    });
    const c = D.characters[PAL_NAMES[selIdx]][0], dx = gx + 3 * (cell + 10) + 40, dw = Math.min(640, W - dx - 30), dy = 150;
    const ph = 410; panel(dx, dy, dw, ph);
    const fr = charFrames(PAL_NAMES[selIdx]), f = img(fr[Math.floor(t * 6) % fr.length]); spr(f, dx + 100, dy + 105, isPk(PAL_NAMES[selIdx]) ? charScale(PAL_NAMES[selIdx]) * 2.3 : 4, isPk(PAL_NAMES[selIdx]));
    txt(charTitle(PAL_NAMES[selIdx], c), dx + 190, dy + 52, 32, '#fff');
    wrap(c.description, dx + 190, dy + 84, dw - 215, 16, '#cfe0ff', 20);
    const wd = D.weapons[c.startingWeapon][0], ic = iconOf(c.startingWeapon);
    nine(img(U('frameB')), dx + 24, dy + 186, 72, 72, 6, 3); spr(ic, dx + 60, dy + 222, 3);
    txt(wd.name, dx + 112, dy + 210, 16, '#ffd24a'); wrap(wd.description, dx + 112, dy + 232, dw - 140, 16, '#cfe0ff', 20);
    const stats = [['Max Health', c.maxHp], ['Armor', c.armor], ['Move Speed', Math.round(c.moveSpeed * 100) + '%'], ['Might', Math.round(c.power * 100) + '%'], ['Area', Math.round(c.area * 100) + '%'], ['Cooldown', Math.round(c.cooldown * 100) + '%'], ['Luck', Math.round(c.luck * 100) + '%'], ['Growth', Math.round(c.growth * 100) + '%']];
    stats.forEach(([k, v], i) => { const x = dx + 28 + (i % 2) * (dw / 2 - 10), y = dy + 296 + Math.floor(i / 2) * 22; txt(k, x, y, 16, '#9fb0c8', 'left', false); txt(String(v), x + dw / 2 - 50, y, 16, '#fff', 'right', false); });
    button('HOW IT WORKS', dx, dy + ph + 16, 190, 46, 'how'); if (!prizeIntro && hit('how')) window.open('/how', '_blank');
    button('PLAY', dx + dw - 410, dy + ph + 16, 170, 46, 'online', true); button('PLAY FOR PRIZE', dx + dw - 230, dy + ph + 16, 210, 46, 'prize', true);
    txt('Nickname (shown to other players)', gx, 478, 16, '#9fb0c8', 'left', false);
    nickEl.style.display = prizeIntro ? 'none' : 'block'; nickEl.style.left = Math.round(gx * Z) + 'px'; nickEl.style.top = Math.round(488 * Z) + 'px'; nickEl.style.width = Math.round(296 * Z) + 'px'; nickEl.style.height = Math.round(38 * Z) + 'px'; nickEl.style.fontSize = Math.round(16 * Z) + 'px';
    if (menuMsgT > 0) { menuMsgT -= 1 / 60; txt(menuMsg, W / 2, H - 56, 16, '#ff9a6a', 'center'); }
    txt('WASD / Arrows: choose character  -  Enter: PLAY  (alone? you just play solo until friends join)', W / 2, H - 26, 16, '#7f8fa8', 'center', false);
    if (prizeIntro) { drawPrizeIntro(t); return; }
    if (hit('online')) startOnline(false); if (hit('prize')) prizeIntro = true;
  }

  // ================= ESTILO CARTOON: contorno, chão pintado, luz =================
  const outCache = new Map(), outId = new WeakMap(); let outN = 0;
  function outlined(im, col, px) {   // sprite com contorno grosso (cacheado)
    if (!im) return im; if (!outId.has(im)) outId.set(im, ++outN); const k = outId.get(im) + col + px; let c = outCache.get(k); if (c) return c;
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, sil = tintOf(im, col); c = document.createElement('canvas'); c.width = w + px * 2; c.height = h + px * 2; const x = c.getContext('2d');
    for (let dx = -px; dx <= px; dx++) for (let dy = -px; dy <= px; dy++) if (dx || dy) x.drawImage(sil, px + dx, px + dy);
    x.drawImage(im, px, px); if (outCache.size > 700) outCache.clear(); outCache.set(k, c); return c;
  }
  const TILE = 96, NT = 8; let floorTiles = null;
  const hh = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  function buildFloor() {
    floorTiles = []; let s0 = 7; const rr = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
    const pals = [['#3a4a6e', '#29344f'], ['#44406c', '#2f2c4e'], ['#36566a', '#263d4d'], ['#4a4070', '#332c52'], ['#3a5272', '#28384f'], ['#403a66', '#2d284b'], ['#365a66', '#274149'], ['#463e68', '#30294b']];
    for (let v = 0; v < NT; v++) {
      const c = document.createElement('canvas'); c.width = c.height = TILE; const x = c.getContext('2d'), [a, b] = pals[v];
      const gr = x.createLinearGradient(0, 0, TILE, TILE); gr.addColorStop(0, a); gr.addColorStop(1, b); x.fillStyle = gr; x.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(255,255,255,${0.03 + rr() * 0.06})`; x.beginPath(); x.ellipse(rr() * TILE, rr() * TILE, 6 + rr() * 18, 4 + rr() * 12, rr() * 3, 0, 7); x.fill(); x.fillStyle = `rgba(0,0,0,${0.04 + rr() * 0.08})`; x.beginPath(); x.ellipse(rr() * TILE, rr() * TILE, 6 + rr() * 18, 4 + rr() * 12, rr() * 3, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(12,4,28,.6)'; x.lineWidth = 2; x.lineCap = 'round'; for (let i = 0; i < 2; i++) { x.beginPath(); let px = rr() * TILE, py = rr() * TILE; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rr() - 0.5) * 30; py += (rr() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,.24)'; x.fillRect(0, 0, TILE, 4); x.fillRect(0, 0, 4, TILE); x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(0, TILE - 5, TILE, 5); x.fillRect(TILE - 5, 0, 5, TILE);
      x.strokeStyle = '#160a26'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
      x.fillStyle = 'rgba(80,200,110,.30)'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(rr() < 0.5 ? rr() * 14 : TILE - rr() * 14, rr() < 0.5 ? rr() * 14 : TILE - rr() * 14, 2 + rr() * 4, 0, 7); x.fill(); }
      floorTiles.push(c);
    }
  }
  const RUNE = ['#58ff9a', '#ff4ad0', '#4ad8ff', '#ffd24a'];
  function drawFloor(cx, cy, t) {
    if (!floorTiles) buildFloor();
    const gx0 = Math.floor(cx / TILE), gy0 = Math.floor(cy / TILE), gx1 = Math.floor((cx + W) / TILE), gy1 = Math.floor((cy + H) / TILE);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) ctx.drawImage(floorTiles[hh(gx, gy) % NT], Math.round(gx * TILE - cx), Math.round(gy * TILE - cy));
    for (let gy = gy0 - 1; gy <= gy1 + 1; gy++) for (let gx = gx0 - 1; gx <= gx1 + 1; gx++) {
      const h = hh(gx + 91, gy - 17), x = gx * TILE - cx + TILE / 2, y = gy * TILE - cy + TILE / 2;
      if (h % 19 === 0) {   // runa pulsante no chão
        const col = RUNE[(h >>> 8) % 4], p = 0.55 + 0.45 * Math.sin(t * 2.2 + (h % 100)); ctx.globalCompositeOperation = 'lighter'; glow(x, y, 54, col, 0.30 * p);
        ctx.globalAlpha = 0.65 * p; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.stroke(); ctx.beginPath();
        for (let i = 0; i <= 5; i++) { const a = i * 4 * Math.PI / 5 - Math.PI / 2; if (i) ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); else ctx.moveTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); } ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else if (h % 4 === 0) {   // adereço colorido (plantas com frutas, flores, caveira, tronco)
        const im = img('assets/props/p' + ((h >>> 5) % 10) + '.png'); if (im) spr(im, x + ((h >>> 12) % 40) - 20, y + ((h >>> 18) % 40) - 20, SPR, (h & 1) === 1);
      }
    }
  }
  let vigCv = null, vigKey = '';
  function drawVignette() {
    const k = W + 'x' + H; if (vigKey !== k) { vigKey = k; vigCv = document.createElement('canvas'); vigCv.width = Math.ceil(W); vigCv.height = Math.ceil(H); const x = vigCv.getContext('2d'), g2 = x.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.56); g2.addColorStop(0, 'rgba(20,6,40,0)'); g2.addColorStop(1, 'rgba(20,6,44,.62)'); x.fillStyle = g2; x.fillRect(0, 0, W, H); }
    ctx.drawImage(vigCv, 0, 0);
  }
  // ---------- mundo ----------
  const vis = (cx, cy, x, y, m) => x > cx - m && x < cx + W + m && y > cy - m && y < cy + H + m;
  function drawWorld(gm, t, dt) {
    const cm = gm.cam || gm.p, cx = cm.x - W / 2, cy = cm.y - H / 2, live = !gm.paused && (gm.online || (!gm.choices && !gm.popup));
    drawFloor(cx, cy, t);
    ctx.globalCompositeOperation = 'lighter'; glow(W / 2, H / 2 + 8, 330, '#ffd9a0', 0.22); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;   // luz quente em volta do herói
    const sh = img(ART.fx.shadow);
    drawTele(gm, cx, cy, t);
    drawZones(gm, cx, cy, t, live);
    if (gm.tombs) for (const q of gm.tombs) drawTomb(gm, q, cx, cy, t);
    for (const gm2 of gm.gems) { if (!vis(cx, cy, gm2.x, gm2.y, 30)) continue; const im = gm2.t === 'COIN' ? img(ART.fx.coin) : img(gm2.v >= 25 ? ART.fx.gemr : gm2.v >= 5 ? ART.fx.gemg : ART.fx.gemb); spr(sh, gm2.x - cx, gm2.y - cy + 8, SPR * .8, false, 0, .5); ctx.globalCompositeOperation = 'lighter'; glow(gm2.x - cx, gm2.y - cy, 15, gm2.t === 'COIN' ? '#ffd24a' : gm2.v >= 25 ? '#ff5a6a' : gm2.v >= 5 ? '#5aff8a' : '#4ab8ff', 0.55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; spr(im, gm2.x - cx, gm2.y - cy + Math.sin(t * 4 + gm2.x) * 1.5, SPR); }
    for (const c of gm.chests) { spr(sh, c.x - cx, c.y - cy + 14, SPR * 2, false, 0, .5); ctx.globalCompositeOperation = 'lighter'; glow(c.x - cx, c.y - cy, 46 + Math.sin(t * 5) * 6, '#ffd24a', .55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; spr(img(ART.fx.chest1), c.x - cx, c.y - cy + Math.sin(t * 3) * 2, SPR * 1.2); }
    const ents = [];
    for (const e of gm.enemies) if (vis(cx, cy, e.x, e.y, 120)) ents.push(e);
    ents.push({ player: true, y: gm.p.y }); if (gm.others) for (const o of gm.others) if (o.st === 0) ents.push({ other: o, y: o.y }); ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.player) { drawPlayer(gm, cx, cy, t, sh); continue; }
      if (e.other) { drawOther(gm, e.other, cx, cy, t, true, false); continue; }
      if (e.bossId) { drawBoss(e, cx, cy, t, sh); continue; }
      const a = ART.enemies[e.id], vi = a ? e.variant % a.variants.length : 0, vs = a && a.variants[vi], im = vs && img(vs[Math.floor(t * 6 + e.seed) % vs.length]);
      const pkv = a && a.pk && a.pk[vi], s = pkv ? pkv.s0 * (e.scale || 1) : SPR * (e.scale || 1), ex = e.x - cx, ey = e.y - cy, ol = Math.max(1, Math.round(2 / s));
      const feet = im ? ey + (im.naturalHeight * s) / 2 - 3 : ey + e.r * .55, rw = Math.max(10, im ? im.naturalWidth * s * 0.4 : e.r);
      ctx.save(); ctx.globalAlpha = e.boss ? 0.9 : 0.62; ctx.fillStyle = 'rgba(255,30,60,.22)'; ctx.strokeStyle = e.boss ? '#ff2a4a' : '#ff3355'; ctx.lineWidth = e.boss ? 3 : 2; ctx.beginPath(); ctx.ellipse(ex, feet, rw, rw * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();   // anel vermelho = INIMIGO
      if (im) { const fr2 = facesRight(), flip = (fr2 ? (gm.p.x < e.x) : (gm.p.x > e.x)) && !e.swarm ? true : (e.swarm && (fr2 ? e.vx < 0 : e.vx > 0)); spr(outlined(im, e.boss ? '#ff2a4a' : '#5a0820', ol), ex, ey, s, flip); if (e.flash > 0) spr(tintOf(im, '#ffffff'), ex, ey, s, flip, 0, .85); else if (e.slowT > 0) spr(tintOf(im, '#4aa8ff'), ex, ey, s, flip, 0, .45); }
      else { ctx.fillStyle = '#a44'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, 7); ctx.fill(); }
      if (e.boss && e.id !== 'BOSS_XLDEATH' && e.hp < e.max) { const bw = 44; ctx.fillStyle = '#000'; ctx.fillRect(ex - bw / 2 - 1, ey - e.r - 14, bw + 2, 6); ctx.fillStyle = '#d03030'; ctx.fillRect(ex - bw / 2, ey - e.r - 13, bw * Math.max(0, e.hp / e.max), 4); }
    }
    drawEShots(gm, cx, cy, t, live);
    drawWeapons(gm, cx, cy, t, live);
    if (gm.others) for (const o of gm.others) if (o.st === 0) drawOther(gm, o, cx, cy, t, false, true);
    drawPlayer(gm, cx, cy, t, null);
    if (gm.tombs) for (const q of gm.tombs) drawTomb(gm, q, cx, cy, t, true);
    if (live) updP(dt);
    drawP(cx, cy);
    for (const f of gm.floating) { const big = f.c === '#ffe45a'; ctx.globalAlpha = Math.min(1, f.life * 3); txt(f.t, f.x - cx, f.y - cy, big ? 24 : 16, f.c, 'center'); ctx.globalAlpha = 1; }
  }
  function drawPlayer(gm, cx, cy, t, sh) {
    if (gm.dead || gm.waiting) return;
    const fr = charFrames(gm.charId), moving = gm.p.moving, im = img(fr[moving ? Math.floor(t * 9) % fr.length : 0]);
    const flicker = gm.p.iframes > 0 && Math.floor(t * 20) % 2, px = gm.p.x - cx, py = gm.p.y - cy, sc = charScale(gm.charId), ol = Math.max(1, Math.round(2 / sc));
    const ph = im ? im.naturalHeight * sc : 68, feet = py + ph / 2 - 8, rw = Math.max(26, im ? im.naturalWidth * sc * 0.62 : 30);
    if (sh) { ctx.save(); ctx.fillStyle = 'rgba(80,255,150,.20)'; ctx.strokeStyle = '#5dff9a'; ctx.globalAlpha = 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, feet + 3, rw, rw * 0.30, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }   // anel verde = JOGADOR (aliado)
    if (gm.shieldCharges > 0) { ctx.globalCompositeOperation = 'lighter'; const R = (gm.weapons.find(w => ARCH[w.id] === 'shield') || {}).shR || 50; glow(px, py, R * 1.6 + Math.sin(t * 6) * 3, '#7dff9a', .65); ctx.globalAlpha = .6; ctx.strokeStyle = '#b8ffc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, R + 6, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (!flicker) spr(outlined(im, '#e8ffe0', ol), px, py, sc, facesRight() ? gm.p.face < 0 : gm.p.face > 0);
    const bw = 50, by = feet + 6; ctx.fillStyle = '#000'; ctx.fillRect(px - bw / 2 - 2, by - 2, bw + 4, 8); ctx.fillStyle = '#5a0f0f'; ctx.fillRect(px - bw / 2, by, bw, 4); ctx.fillStyle = '#e03a3a'; ctx.fillRect(px - bw / 2, by, bw * Math.max(0, Math.min(1, gm.p.hp / gm.S.maxHp)), 4);
    if (gm.online && sh) { const my = py - ph / 2 - 12 + Math.sin(t * 5) * 2; ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 7, my - 9); ctx.lineTo(px + 7, my - 9); ctx.lineTo(px, my); ctx.closePath(); ctx.fill(); ctx.stroke(); drawBubbles(gm, gm.myId, px, py - ph / 2 - 44); }   // seta dourada = VOCÊ
  }
  // ---------- outros jogadores (aliados): anel VERDE + apelido; inimigos têm anel VERMELHO ----------
  const EMOTES = ['Help!', 'Thanks!', 'Nice!', 'Watch out!', 'Follow me!', 'GG'], EMO_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];
  function drawBubbles(gm, id, x, y) {
    const em = (gm.emotes || []).filter(q => q.id === id); if (!em.length) return; const q = em[em.length - 1], a = Math.min(1, q.t * 2.5); ctx.save(); ctx.globalAlpha = a; ctx.font = `16px ${FONT}`; const w = ctx.measureText(EMOTES[q.k]).width + 20;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y + 10); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x, y + 20); ctx.closePath(); ctx.fill(); ctx.fillRect(x - w / 2, y - 14, w, 26); ctx.strokeRect(x - w / 2, y - 14, w, 26); ctx.fillRect(x - 5, y + 9, 10, 3); ctx.restore(); ctx.globalAlpha = a; txt(EMOTES[q.k], x, y + 6, 16, '#111', 'center', false); ctx.globalAlpha = 1;
  }
  function drawTomb(gm, q, cx, cy, t, top) {
    const x = q.x - cx, y = q.y - cy; if (!vis(0, 0, x, y, 80)) return; const me = q.id === gm.myId, nick = me ? 'You' : gm.nameOf(q.id), pulse = 0.5 + 0.5 * Math.sin(t * 3);
    if (top) { drawTombLabel(gm, q, x, y, me, nick); return; }
    ctx.save(); ctx.strokeStyle = '#7dff9a'; ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, y, 55, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();   // área de ressurreição
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 18, 22, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8c93a6'; ctx.strokeStyle = '#1a1d2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 17, y + 18); ctx.lineTo(x - 17, y - 12); ctx.arc(x, y - 12, 17, Math.PI, 0); ctx.lineTo(x + 17, y + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a5066'; ctx.fillRect(x - 3, y - 14, 6, 22); ctx.fillRect(x - 9, y - 8, 18, 5);
    ctx.globalCompositeOperation = 'lighter'; glow(x, y - 6, 46, '#9dffa0', 0.18 + 0.12 * pulse); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawTombLabel(gm, q, x, y, me, nick) {
    txt(nick, x, y - 40, 16, me ? '#ffd24a' : '#c8ffd8', 'center');
    if (q.pr > 0) { const bw = 56; ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2 - 2, y + 26, bw + 4, 10); ctx.fillStyle = '#4be06a'; ctx.fillRect(x - bw / 2, y + 28, bw * q.pr, 6); txt('REVIVING', x, y + 52, 16, '#9dffa0', 'center'); ctx.strokeStyle = '#9dffa0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y - 4, 62, -Math.PI / 2, -Math.PI / 2 + 6.283 * q.pr); ctx.stroke(); }
  }
  function drawOther(gm, o, cx, cy, t, ring, top) {
    const fr = charFrames(o.ch), im = img(fr[o.moving ? Math.floor(t * 9) % fr.length : 0]), sc = charScale(o.ch), ol = Math.max(1, Math.round(2 / sc)), x = o.x - cx, y = o.y - cy;
    const ph = im ? im.naturalHeight * sc : 68, feet = y + ph / 2 - 8, rw = Math.max(26, im ? im.naturalWidth * sc * 0.62 : 30);
    if (ring) { ctx.save(); ctx.fillStyle = 'rgba(80,255,150,.20)'; ctx.strokeStyle = '#5dff9a'; ctx.globalAlpha = 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, feet + 3, rw, rw * 0.30, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
    if (o.sc > 0) { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 80, '#7dff9a', .5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (!(o.ifr && Math.floor(t * 20) % 2)) spr(outlined(im, '#e8ffe0', ol), x, y, sc, facesRight() ? o.face < 0 : o.face > 0);
    if (top) return;
    const bw = 50, by = feet + 6; ctx.fillStyle = '#000'; ctx.fillRect(x - bw / 2 - 2, by - 2, bw + 4, 8); ctx.fillStyle = '#0f4a1c'; ctx.fillRect(x - bw / 2, by, bw, 4); ctx.fillStyle = '#4be06a'; ctx.fillRect(x - bw / 2, by, bw * Math.max(0, Math.min(1, o.hp / Math.max(1, o.mhp))), 4);
    txt(o.nick + '  LV ' + o.lv, x, y - ph / 2 - 8, 16, '#c8ffd8', 'center'); drawBubbles(gm, o.id, x, y - ph / 2 - 44);
  }

  // ---------- chefes ----------
  function drawBoss(e, cx, cy, t, sh) {
    const x = e.x - cx, y = e.y - cy, im = img('assets/bosses/' + e.bossId + '.png'), px = e.def.px || 190;
    let cvs = im, w, h;
    if (im) { h = px * (1 + Math.sin(t * 5) * 0.025); w = im.naturalWidth * (px / im.naturalHeight); } else { cvs = window.BossArt.get(e.bossId); h = cvs.height * 3.2; w = cvs.width * 3.2; }
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(x, y + h * 0.46, w * 0.34, h * 0.07, 0, 0, 7); ctx.fill();
    if (e.state === 'tele') { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(e.dashDir[1], e.dashDir[0])); const k = 1 - e.st / e.dashAt.tele; ctx.fillStyle = `rgba(255,40,40,${.12 + .25 * k})`; ctx.fillRect(0, -34, 760, 68); ctx.strokeStyle = `rgba(255,120,120,${.5 + .5 * k})`; ctx.lineWidth = 2; ctx.strokeRect(0, -34, 760, 68); ctx.restore(); }
    ctx.save(); ctx.translate(x, y - (e.z || 0)); ctx.rotate(Math.sin(t * 3 + e.seed) * 0.035);
    if (e.dashing) { ctx.globalCompositeOperation = 'lighter'; glow(0, 0, 130, e.def.col, .7); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    ctx.drawImage(cvs, -w / 2, -h / 2, w, h); if (e.flash > 0) { ctx.globalAlpha = .28 * Math.min(1, e.flash / 0.08); ctx.drawImage(tintOf(cvs, '#ffffff'), -w / 2, -h / 2, w, h); ctx.globalAlpha = 1; } ctx.restore();
    if (e.state === 'cast') { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 110 + Math.sin(t * 20) * 10, e.def.col, .55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  }
  function drawTele(gm, cx, cy, t) {
    for (const z of gm.tele) {
      if (z.t < 0) continue; const k = Math.min(1, z.t / z.dur), x = z.x - cx, y = z.y - cy;
      ctx.fillStyle = `rgba(255,50,50,${.12 + .22 * k})`; ctx.beginPath(); ctx.arc(x, y, z.r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,140,120,${.5 + .5 * k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, z.r, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x, y, z.r * k, 0, 7); ctx.stroke();
    }
  }
  function drawEShots(gm, cx, cy, t, live) {
    for (const q of gm.eproj) {
      const x = q.x - cx, y = q.y - cy; if (!vis(0, 0, x, y, 40)) continue;
      ctx.globalCompositeOperation = 'lighter'; glow(x, y, 22, q.col || '#ff6060', .8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(q.ang || 0);
      if (q.spr === 'rocket') { ctx.fillStyle = '#e8e8f0'; ctx.fillRect(-9, -3, 16, 6); ctx.fillStyle = '#e04040'; ctx.fillRect(7, -3, 4, 6); ctx.fillStyle = '#c03030'; ctx.fillRect(-9, -6, 4, 3); ctx.fillRect(-9, 3, 4, 3); if (live && Math.random() < .7) sp(q.x - Math.cos(q.ang) * 10, q.y - Math.sin(q.ang) * 10, rand(-20, 20), rand(-20, 20), .3, 4, '#ffb030', true); }
      else if (q.spr === 'tie') { ctx.fillStyle = '#d82828'; ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(9, 0); ctx.lineTo(-9, 4); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
      else if (q.spr === 'coin') { ctx.scale(Math.abs(Math.cos(t * 9 + q.x * 0.05)) * 0.9 + 0.1, 1); ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#c8960e'; ctx.fillRect(-1, -5, 2, 10); }
      else if (q.spr === 'candle') { const red = (q.x * 7 | 0) % 2 === 0; ctx.fillStyle = red ? '#e03030' : '#30c050'; ctx.fillRect(-4, -9, 8, 18); ctx.fillRect(-1, -14, 2, 5); ctx.fillRect(-1, 9, 2, 5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-4, -9, 8, 18); }
      else { ctx.fillStyle = '#4dff6a'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#145a22'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  }
  function drawBossUI(gm, t) {
    const b = gm.boss;
    if (gm.phase === 'warn') {
      const k = Math.min(1, gm.phaseT / 0.5), bar = 70 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      const flash = Math.floor(t * 6) % 2 ? '#ff3030' : '#ffd0d0'; txt('WARNING', W / 2, H / 2 - 20, 64, flash, 'center'); txt(B.defs[gm.bossKey].name + ' APPROACHES', W / 2, H / 2 + 30, 32, '#ffffff', 'center');
    }
    if (b && gm.phase === 'boss') {
      const bw = Math.min(560, W - 200), x = (W - bw) / 2, y = 108; ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, bw + 6, 22); ctx.fillStyle = '#4a0c0c'; ctx.fillRect(x, y, bw, 16);
      const k = Math.max(0, b.hp / b.max); ctx.fillStyle = b.def.col; ctx.fillRect(x, y, bw * k, 16); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, bw * k, 5);
      txt(b.def.name, W / 2, y - 8, 16, '#fff', 'center');
    }
  }
  function drawTension(gm, t) {
    const k = gm.tension; if (k < 0.01) { if (cv.style.filter !== BASE_FILTER) cv.style.filter = BASE_FILTER; return; }
    cv.style.filter = `saturate(${(1.3 * (1 - 0.5 * k)).toFixed(2)}) contrast(${(1.06 + 0.14 * k).toFixed(2)}) brightness(${(1 - 0.12 * k).toFixed(2)}) hue-rotate(${(-14 * k).toFixed(1)}deg)`;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2), gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.98);
    gr.addColorStop(0, 'rgba(90,0,30,0)'); gr.addColorStop(1, `rgba(120,0,40,${(0.5 + 0.2 * pulse) * k})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(60,0,70,${0.10 * k})`; ctx.fillRect(0, 0, W, H);
  }

  // ---------- armas (visual por tier) ----------
  function drawZones(gm, cx, cy, t, live) {
    for (const z of gm.zones) {
      const x = z.x - cx, y = z.y - cy;
      if (z.delay > 0) { const k = z.delay / (z.from === 'BORA' ? .15 : .3); spr(img(ART.fx.bottle), x, y - 150 * k, SPR * 1.3, false, (1 - k) * 8); continue; }
      if (!z.seen) { z.seen = true; burst(z.x, z.y, 16, pal(z.from, t, 0), 220, 0.5, 4); shake(2); }
      const R = z.rr || z.r, fade = Math.min(1, z.life / 0.5), c0 = pal(z.from, t, 0), c1 = pal(z.from, t, 1);
      ctx.globalCompositeOperation = 'lighter'; glow(x, y, R * 1.25, c0, .5 * fade); glow(x, y, R * .7, c1, .3 * fade);
      for (let i = 0; i < 3; i++) { const k = ((t * .9 + i / 3) % 1); ctx.globalAlpha = (1 - k) * .55 * fade; ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * (.25 + .75 * k), 0, 7); ctx.stroke(); }
      ctx.globalAlpha = .7 * fade; ctx.strokeStyle = c0; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (live && Math.random() < 0.5 + 0.1 * z.tier) { const a = rand(0, 6.283), d = rand(0, R); sp(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, rand(-10, 10), rand(-70, -30), rand(.5, 1), rand(3, 6), Math.random() < .5 ? c0 : c1, true); }
    }
  }
  function drawNova(f, cx, cy, t) {
    const p = 1 - f.life / 1.3, e = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3), R = f.r * e, x = f.x - cx, y = f.y - cy, a = Math.max(0, 1 - Math.max(0, p - 0.55) / 0.45), gold = f.id === 'SIRE', c0 = gold ? '#ffd24a' : '#c070ff', c1 = '#ffffff';
    ctx.globalCompositeOperation = 'lighter'; glow(x, y, R * 1.15, c0, .45 * a);
    const ang = t * (gold ? 0.5 : -0.7);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = a; ctx.strokeStyle = c0; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = c1; ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, 7); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = c0; ctx.beginPath(); for (let i = 0; i <= 5; i++) { const aa = i * 4 * Math.PI / 5 - Math.PI / 2; const px = Math.cos(aa) * R * 0.93, py = Math.sin(aa) * R * 0.93; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
    for (let i = 0; i < 24; i++) { const aa = i / 24 * 6.283; ctx.fillStyle = c1; ctx.fillRect(Math.cos(aa) * R * 1.04 - 2, Math.sin(aa) * R * 1.04 - 2, 4, 4); }
    const mc = img(ART.fx.magiccircle); if (mc) { ctx.globalAlpha = a * .8; ctx.drawImage(mc, -R, -R, R * 2, R * 2); }
    ctx.restore(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawBolt(f, cx, cy, t) {
    if (!f.pts) { const pts = []; let px = f.x, py = f.y - 460; const br = []; pts.push([px, py]); while (py < f.y - 12) { py += rand(26, 44); px = f.x + rand(-18, 18) * (1 - (py - (f.y - 460)) / 460) * 1.5; pts.push([px, Math.min(py, f.y)]); if (Math.random() < 0.18 + 0.03 * f.tier) br.push([pts.length - 1, rand(-60, 60), rand(30, 90)]); } f.pts = pts; f.br = br; f.rb = f.id === 'LOOP'; }
    const a = Math.min(1, f.life / 0.3 * 1.4), th = (1 + 0.15 * f.tier) * (f.id === 'LOOP' ? 1.6 : 1), c0 = f.rb ? `hsl(${(t * 400) % 360 | 0},100%,70%)` : '#9a8aff';
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.globalAlpha = a;
    for (const [w, col] of [[11 * th, c0], [5 * th, '#d8d0ff'], [2.2 * th, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); f.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x - cx, y - cy); else ctx.moveTo(x - cx, y - cy); }); ctx.stroke(); }
    ctx.lineWidth = 2.5 * th; ctx.strokeStyle = '#e8e4ff'; for (const [i, dx, dy] of f.br) { const [x, y] = f.pts[i]; ctx.beginPath(); ctx.moveTo(x - cx, y - cy); ctx.lineTo(x - cx + dx, y - cy + dy * 0.5); ctx.lineTo(x - cx + dx * 1.4, y - cy + dy); ctx.stroke(); }
    glow(f.x - cx, f.y - cy, 60 * th, c0, a); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawNote(x, y, s, col, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 6 * s, 4.5 * s, -0.4, 0, 7); ctx.fill(); ctx.fillRect(4.6 * s, -18 * s, 2.4 * s, 18 * s); ctx.beginPath(); ctx.moveTo(7 * s, -18 * s); ctx.quadraticCurveTo(15 * s, -14 * s, 12 * s, -6 * s); ctx.lineTo(7 * s, -9 * s); ctx.fill(); ctx.restore(); }
  function drawWeapons(gm, cx, cy, t, live) {
    ctx.globalCompositeOperation = 'source-over';
    for (const f of gm.fx) {
      const a = Math.max(0, f.life / (f.k === 'bolt' ? 0.3 : f.k === 'nova' ? 1.3 : 0.25)), x = f.x - cx, y = f.y - cy;
      if (f.k === 'nova') { drawNova(f, cx, cy, t); continue; }
      if (f.k === 'bolt') { drawBolt(f, cx, cy, t); continue; }
      if (f.k === 'zap') {
        if (!f.pts) { const n = 6, pts = []; for (let i = 0; i <= n; i++) { const k = i / n, jx = i && i < n ? rand(-12, 12) : 0, jy = i && i < n ? rand(-12, 12) : 0; pts.push([f.x1 + (f.x2 - f.x1) * k + jx, f.y1 + (f.y2 - f.y1) * k + jy]); } f.pts = pts; f.rb = f.id === 'THUNDER'; }
        const za = Math.min(1, f.life / 0.2 * 1.5); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = za; ctx.lineJoin = 'round';
        for (const [w2, col] of [[7, f.rb ? `hsl(${(t * 400) % 360 | 0},100%,70%)` : '#9a8aff'], [2.4, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = w2; ctx.beginPath(); f.pts.forEach(([px, py], i) => { if (i) ctx.lineTo(px - cx, py - cy); else ctx.moveTo(px - cx, py - cy); }); ctx.stroke(); }
        glow(f.x2 - cx, f.y2 - cy, 26, '#d8d0ff', za * 0.8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; continue;
      }
      ctx.globalAlpha = a;
      if (f.k === 'poof') spr(img(ART.fx.hit), x, y, SPR * Math.max(.8, f.r / 12) * (1.6 - a * .6), false, a * 3);
      else { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = f.col || '#fff'; ctx.globalAlpha = a * .3; ctx.beginPath(); ctx.arc(x, y, f.r, 0, 7); ctx.fill(); ctx.globalAlpha = a; ctx.strokeStyle = f.col || '#fff'; ctx.lineWidth = 3; ctx.stroke(); glow(x, y, f.r * 1.2, f.col || '#fff', a * .5); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }
    for (const q of gm.proj) {
      const x = q.x - cx, y = q.y - cy, id = q.from, tk = tierK(q.tier, q.evo), c0 = pal(id, t, 0), c1 = pal(id, t, 1);
      if (q.k === 'rect') {
        const px = (q.ox !== undefined ? q.ox : gm.p.x) - cx + q.side * (q.rw / 2 + q.off), life = q.life / .18, im = img(ART.fx.whip2), hh = q.rh * 2.6 * (0.9 + 0.1 * q.tier);
        ctx.save(); ctx.translate(px, q.y - cy); if (q.side < 0) ctx.scale(-1, 1);
        ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createLinearGradient(-q.rw / 2, 0, q.rw / 2, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, c0); ctx.globalAlpha = Math.min(1, life * 1.4) * .5; ctx.fillStyle = gr; ctx.fillRect(-q.rw / 2, -q.rh * .7, q.rw, q.rh * 1.4);
        glow(0, 0, q.rw * .75, c1, Math.min(1, life) * .35);
        if (im) { ctx.globalAlpha = Math.min(1, life * 1.6); ctx.drawImage(im, -q.rw / 2, -hh / 2, q.rw, hh); ctx.globalAlpha = Math.min(1, life * 1.3) * .8; ctx.save(); ctx.scale(1.12, 1.18); ctx.drawImage(glowTint(im, c0), -q.rw / 2, -hh / 2, q.rw, hh); ctx.restore(); }
        ctx.restore(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (live && life > .5) for (let i = 0; i < 1 + q.tier * .6; i++) sp(gm.p.x + q.side * rand(20, q.rw), q.y + rand(-q.rh, q.rh), rand(-40, 40) + q.side * 60, rand(-60, 20), rand(.3, .6), rand(2, 5), Math.random() < .5 ? c0 : c1, true, 0, 2);
        continue;
      }
      if (q.k === 'vrect') {
        const life = q.life / q.dur, x0 = q.x - cx, h2 = q.rh / 2, gr = ctx.createLinearGradient(x0 - q.rw / 2, 0, x0 + q.rw / 2, 0);
        ctx.globalCompositeOperation = 'lighter'; gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, c0); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = Math.min(1, life * 1.8) * .55; ctx.fillStyle = gr; ctx.fillRect(x0 - q.rw / 2, y - h2, q.rw, q.rh);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, life * 2);
        for (let i = 0; i < 9 + q.tier; i++) { const k = ((t * 1.3 + i * .37) % 1), dir = i % 2 ? 1 : -1, ny = y + dir * (20 + k * 260), nx = x0 + Math.sin(t * 5 + i * 2.1) * q.rw * .35; ctx.globalAlpha = Math.min(1, life * 2) * (1 - k); drawNote(nx, ny, 1.1 * tk * (.8 + .2 * Math.sin(i)), i % 2 ? c0 : c1, Math.sin(t * 4 + i) * .4); }
        ctx.globalAlpha = 1; continue;
      }
      if (q.k === 'bird') {
        const key = id === 'SILF3' ? 'silf3' : id === 'SILF2' ? 'silf2' : 'silf1', im = img(ART.fx[key]), s = SPR * 1.0 * Math.pow(q.am, 0.3) * (1 + 0.03 * q.tier);
        ctx.globalCompositeOperation = 'lighter'; glow(x, y, 20 * tk, c0, .5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (im) { const flip = Math.cos(q.ang) < 0; ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(flip ? q.ang + Math.PI : q.ang); if (flip) ctx.scale(1, -1); ctx.drawImage(im, -im.naturalWidth * s / 2, -im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s); ctx.restore(); }
        if (live && Math.random() < 0.16) { sp(q.x, q.y, rand(-15, 15), rand(-15, 15), rand(.3, .5), rand(2, 3), pal(id, t, 1), true, 0, 1.5); }
        continue;
      }
      const key = { MAGIC_MISSILE: 'wand', HOLY_MISSILE: 'wand2', KNIFE: 'knife', THOUSAND: 'knife2', AXE: 'axe', SCYTHE: 'scythe', CROSS: 'cross', HEAVENSWORD: 'sword', FIREBALL: 'fire', HELLFIRE: 'hellfire', DIAMOND: 'spin', ROCHER: 'spin' }[id], im = key && img(ART.fx[key]);
      if (!im) continue;
      const s = SPR * 1.5 * (q.am || 1) * (id === 'FIREBALL' || id === 'HELLFIRE' ? .75 : 1) * tk;
      ctx.globalCompositeOperation = 'lighter'; glow(x, y, (24 + 6 * (q.tier || 1)) * Math.sqrt(q.am || 1) * (q.evo ? 1.5 : 1), c0, .85); glow(x, y, 8 * s, c1, .55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (q.spin) spr(im, x, y, s, false, t * 14); else spr(im, x, y, s, false, Math.atan2(q.vy, q.vx));
      if (live) { const n = 1 + (q.tier || 1) * 0.35 + (q.evo ? 2 : 0); for (let i = 0; i < n; i++) if (Math.random() < Math.min(1, n - i)) sp(q.x + rand(-4, 4), q.y + rand(-4, 4), -(q.vx || 0) * .08 + rand(-30, 30), -(q.vy || 0) * .08 + rand(-30, 30), rand(.25, .55), rand(2, 5) * (q.evo ? 1.4 : 1), Math.random() < .5 ? c0 : c1, true, 0, 2); }
    }
    drawWeaponVis(gm, cx, cy, t, live);
    if (gm.others) for (const o of gm.others) if (o.st === 0 && o.vis && o.vis.length) drawWeaponVis({ p: o, weapons: o.vis }, cx, cy, t, live);
  }
  function drawWeaponVis(gm, cx, cy, t, live) {
    for (const w of gm.weapons) {
      const tk = tierK(w.lvl, D.weapons[w.id][0].isEvolution), c0 = pal(w.id, t, 0), c1 = pal(w.id, t, 1), px = gm.p.x - cx, py = gm.p.y - cy;
      if (w.books) {
        const R = w.books.length ? Math.hypot(w.books[0].x - gm.p.x, w.books[0].y - gm.p.y) : 0;
        if (R) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .25 + .05 * w.lvl; ctx.strokeStyle = c0; ctx.lineWidth = 2 + w.lvl * .3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
        for (const b of w.books) {
          ctx.globalCompositeOperation = 'lighter'; glow(b.x - cx, b.y - cy, 24 * tk, c0, .6); glow(b.x - cx, b.y - cy, 12 * tk, c1, .4); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          spr(img(ART.fx[w.id === 'VESPERS' ? 'unholybook' : 'book']), b.x - cx, b.y - cy, SPR * 1.25 * Math.sqrt(b.r / 15) * Math.min(tk, 1.3), false, Math.sin(t * 3 + b.a) * .25);
          if (live && Math.random() < .6) sp(b.x + rand(-5, 5), b.y + rand(-5, 5), rand(-20, 20), rand(-20, 20), rand(.3, .6), rand(2, 5), Math.random() < .5 ? c0 : c1, true, 0, 1.5);
        }
      }
      if (w.orbs && w.orbs.length) {
        const radii = {}; for (const o of w.orbs) radii[o.ri] = Math.hypot(o.x - gm.p.x, o.y - gm.p.y);
        ctx.globalCompositeOperation = 'lighter'; ctx.setLineDash([8, 10]); ctx.lineDashOffset = -t * 36; ctx.lineWidth = 2;
        for (const R of Object.values(radii)) { ctx.globalAlpha = 0.16 + 0.03 * w.lvl; ctx.strokeStyle = c0; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.stroke(); }
        ctx.setLineDash([]); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (w.field) { ctx.globalCompositeOperation = 'lighter'; glow(px, py, w.field * 1.25, c0, 0.2 + 0.05 * Math.sin(t * 3)); ctx.globalAlpha = 0.45; ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, w.field, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; if (live && Math.random() < 0.5) { const a2 = rand(0, 6.283), d2 = rand(0.3, 1) * w.field; sp(gm.p.x + Math.cos(a2) * d2, gm.p.y + Math.sin(a2) * d2, rand(-12, 12), rand(10, 40), rand(0.7, 1.2), rand(2, 4), '#e8ffff', true); } }
        for (const o of w.orbs) {
          const x = o.x - cx, y = o.y - cy, tang = o.a + o.dir * Math.PI / 2, k = Math.sqrt(o.r / 14) * tk;
          ctx.globalCompositeOperation = 'lighter'; glow(x, y, (o.kind === 'ember' ? 34 : 26) * k, c0, 0.75); glow(x, y, 13 * k, c1, 0.5); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          if (o.kind === 'blade') { spr(img(ART.fx.sword), x, y, SPR * 0.95 * k, false, tang); if (live && Math.random() < 0.5) sp(o.x - Math.cos(tang) * 10, o.y - Math.sin(tang) * 10, rand(-15, 15), rand(-15, 15), rand(0.25, 0.5), rand(2, 4), Math.random() < 0.5 ? c0 : c1, true, 0, 2); }
          else if (o.kind === 'ember') { spr(img(ART.fx.fire), x, y, SPR * 0.7 * k, false, tang); if (live) { sp(o.x + rand(-6, 6), o.y + rand(-6, 6), rand(-20, 20), rand(-60, -20), rand(0.35, 0.7), rand(3, 6), Math.random() < 0.5 ? c0 : c1, true, 0, 1.2); } }
          else if (o.kind === 'frost') { const im = img(ART.fx.diamond); if (im) spr(glowTint(im, c0), x, y, SPR * 1.0 * k, false, t * 2 + o.i); if (live && Math.random() < 0.35) sp(o.x, o.y, rand(-14, 14), rand(5, 30), rand(0.4, 0.8), rand(2, 3), '#e8ffff', true); }
          else if (o.kind === 'storm') { ctx.globalCompositeOperation = 'lighter'; glow(x, y, 20 * k * (1 + 0.25 * Math.sin(t * 18 + o.i * 2)), '#ffffff', 0.7); ctx.strokeStyle = c1; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8; for (let q = 0; q < 3; q++) { const aa = t * 9 + q * 2.1 + o.i, l2 = rand(8, 16) * k; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(aa) * l2, y + Math.sin(aa) * l2); ctx.stroke(); } ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
        }
      }
      if (w.sh && w.sh.on) {
        const n = 4 + w.lvl, R = w.shR || 50;
        ctx.globalCompositeOperation = 'lighter'; glow(px, py, R * 1.9, '#7dff9a', .25); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        for (let i = 0; i < n; i++) { const a = t * 2.6 + i / n * 6.283; spr(img(ART.fx.laurel), px + Math.cos(a) * R, py + Math.sin(a) * R, SPR * 1.5, false, a + 1.4); if (live && Math.random() < .25) sp(gm.p.x + Math.cos(a) * R, gm.p.y + Math.sin(a) * R, rand(-20, 20), rand(-30, 0), .5, 3, '#9dffa0', true); }
      }
      if (w.auraR) {
        const pulse = .5 + .5 * Math.sin(t * 5), R = w.auraR; ctx.globalCompositeOperation = 'lighter';
        glow(px, py, R * 1.35, c0, .25 + .1 * pulse); for (let i = 0; i < 2; i++) { const k = (t * .8 + i * .5) % 1; ctx.globalAlpha = (1 - k) * .55; ctx.strokeStyle = c1; ctx.lineWidth = 2 + w.lvl * .25; ctx.beginPath(); ctx.arc(px, py, R * (.5 + .55 * k), 0, 7); ctx.stroke(); }
        ctx.globalAlpha = .6; ctx.strokeStyle = c0; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (live && Math.random() < .5 + .05 * w.lvl) { const a = rand(0, 6.283), d = rand(.3, 1) * R; sp(gm.p.x + Math.cos(a) * d, gm.p.y + Math.sin(a) * d, rand(-15, 15), rand(-60, -20), rand(.5, 1), rand(3, 6), Math.random() < .5 ? c0 : c1, true); }
      }
    }
  }
  const tintCache = new Map(), tintId = new WeakMap(); let tintN = 0;
  function tintOf(im, col) { if (!tintId.has(im)) tintId.set(im, ++tintN); const k = tintId.get(im) + col; let c = tintCache.get(k); if (c) return c; c = document.createElement('canvas'); c.width = im.width || im.naturalWidth; c.height = im.height || im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); if (tintCache.size > 400) tintCache.clear(); tintCache.set(k, c); return c; }
  function glowTint(im, col) { const k = im.src + col; let c = tintCache.get(k); if (c) return c; c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); if (tintCache.size > 60) tintCache.clear(); tintCache.set(k, c); return c; }

  // ---------- HUD / telas ----------
  function slotRow(items, x, y, kind) {
    items.forEach(([id, lvl], i) => {
      const sx = x + i * 56; nine(img(U('frameB')), sx, y, 52, 52, 6, 2); spr(iconOf(id), sx + 26, y + 26, 2);
      txt(String(lvl), sx + 46, y + 48, 16, lvl >= (kind === 'w' ? V.weaponMax(id) : V.passiveMax(id)) ? '#ffd24a' : '#ffffff', 'right');
    });
  }
  function drawHUD(gm, t) {
    const need = xpNeeded(gm.p.level), fillW = W * Math.min(1, gm.p.xp / need);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 22); ctx.fillStyle = '#0b1c4a'; ctx.fillRect(2, 2, W - 4, 18); ctx.fillStyle = '#2f7bff'; ctx.fillRect(2, 2, Math.max(0, fillW - 4), 18); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(2, 2, Math.max(0, fillW - 4), 6);
    txt('LV ' + gm.p.level, W - 10, 17, 16, '#fff', 'right');
    txt(fmt(gm.t), W / 2, 64, 32, '#fff', 'center');
    slotRow(gm.weapons.map(w => [w.id, w.lvl]), 10, 30, 'w');
    slotRow(Object.entries(gm.passives), 10, 88, 'p');
    spr(img(ART.fx.coin), W - 120, 46, 2.5); txt(String(Math.floor(gm.p.gold)), W - 20, 52, 16, '#ffd24a', 'right');
    txt('KILLS ' + gm.p.kills, W - 20, 76, 16, '#fff', 'right');
    gm.msgs.forEach((m, i) => txt(m.t, W / 2, 140 + i * 22, 16, '#ffe9a0', 'center'));
    if (gm.reaper) txt(gm.online ? '— YOU SURVIVED! —' : '— DEATH IS HERE —', W / 2, H - 24, 16, gm.online ? '#7dff9a' : '#ff5a5a', 'center');
    drawBossUI(gm, t);
    if (gm.online) drawOnlineHUD(gm, t);
  }
  function drawOnlineHUD(gm, t) {
    const rs = gm.roster || [], rowH = 30, y0 = H - 44 - rs.length * rowH;
    rs.forEach((q, i) => {
      const me = q.id === gm.myId, o = me ? null : (gm.others || []).find(z => z.id === q.id), y = y0 + i * rowH, hp = me ? gm.p.hp : o ? o.hp : 0, mh = me ? gm.S.maxHp : o ? o.mhp : 1, lv = me ? gm.p.level : o ? o.lv : '?', st = me ? (gm.dead ? 1 : gm.waiting ? 2 : 0) : o ? o.st : 1;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(10, y, 300, rowH - 4); ctx.fillStyle = '#5dff9a'; ctx.fillRect(10, y, 4, rowH - 4);
      txt(q.nick, 22, y + 15, 16, me ? '#ffd24a' : '#fff', 'left', false); txt('LV ' + lv, 306, y + 15, 16, '#9fb0c8', 'right', false); txt('K ' + (me ? gm.p.kills : o ? o.kills : 0), 250, y + 15, 16, '#ffd24a', 'right', false);
      ctx.fillStyle = '#000'; ctx.fillRect(22, y + 19, 150, 4); ctx.fillStyle = st === 0 ? '#4be06a' : '#555'; ctx.fillRect(22, y + 19, 150 * Math.max(0, Math.min(1, hp / Math.max(1, mh))), 4);
      if (st === 1) txt('FALLEN', 135, y + 15, 16, '#ff6a6a', 'left', false); else if (st === 2) txt('WAITING', 135, y + 15, 16, '#ffd24a', 'left', false);
    });
    if (gm.waiting) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, H / 2 - 60, W, 100); txt('A boss fight is on', W / 2, H / 2 - 18, 32, '#ffd24a', 'center'); txt('You join your friends as soon as it ends', W / 2, H / 2 + 16, 16, '#fff', 'center'); }
    else if (gm.dead && !gm.over) { const so = (gm.others || []).find(z => z.id === gm.specId); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H - 96, W, 60); txt('YOU FELL', W / 2, H - 66, 32, '#ff6a6a', 'center'); txt(gm.reviving ? 'A friend is reviving you...' : so ? 'A friend can revive you: stay close to your gravestone.  Watching ' + so.nick + ' (Left / Right)' : 'Waiting for a friend to revive you', W / 2, H - 44, 16, gm.reviving ? '#9dffa0' : '#fff', 'center'); }
    txt(gm.paidInfo ? 'PRIZE MATCH - MOST KILLS WINS  (survive until 30:00)' : 'SURVIVE UNTIL 30:00', W / 2, 84, 16, gm.paidInfo ? '#ffb74d' : '#ffd24a', 'center');
    if (gm.late && gm.t < 40 && !gm.dead) txt('You joined a match in progress - catching up!', W / 2, 190, 16, '#9dffa0', 'center');
    if (gm.popup && gm.popup.line) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(W / 2 - 230, 150, 460, 56); txt(gm.popup.title, W / 2, 174, 16, '#ffd24a', 'center'); txt(gm.popup.line, W / 2, 196, 16, '#fff', 'center'); }
    txt('Z X C V B N: quick chat', W - 10, H - 8, 16, '#6f7f98', 'right', false);
    if (gm.leaveAsk) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H); panel(W / 2 - 200, H / 2 - 80, 400, 160, 'frameB_gold'); txt('Leave this match?', W / 2, H / 2 - 20, 32, '#ffd24a', 'center'); txt('Enter: leave     Esc: stay', W / 2, H / 2 + 30, 16, '#fff', 'center'); if (gm.paidInfo) txt('Leaving a prize match = you forfeit the prize', W / 2, H / 2 + 56, 16, '#ff9a9a', 'center'); }
  }
  // level-up online: cartões num canto, o jogo NÃO pausa; sem escolha em 15 s o jogo escolhe por você
  function drawLevelUpMini(gm) {
    const n = gm.choices.length, cw = 330, ch = 84, x = W - cw - 12, y0 = 118;
    txt('LEVEL UP!  press 1-' + n + ' or click', x + cw / 2, y0 - 8, 16, '#ffd24a', 'center');
    gm.choices.forEach((o, i) => {
      const y = y0 + i * (ch + 6), def = itemDef(o.kind, o.id), over = mouse.x >= x && mouse.x <= x + cw && mouse.y >= y && mouse.y <= y + ch;
      rects.push({ x, y, w: cw, h: ch, id: 'ch' + i }); ctx.fillStyle = over ? 'rgba(60,80,170,.92)' : 'rgba(14,20,56,.92)'; ctx.fillRect(x, y, cw, ch); nine(img(U('frameB')), x, y, cw, ch, 6, 2);
      spr(iconOf(o.id), x + 36, y + 42, 2.4); txt(def[0].name, x + 72, y + 24, 16, '#fff'); txt(String(i + 1), x + cw - 12, y + 22, 16, '#7f8fa8', 'right', false);
      if (o.lvl === 1) txt(T.genericPopup_new, x + cw - 12, y + 44, 16, '#ffd24a', 'right'); else txt('LV ' + o.lvl, x + cw - 12, y + 44, 16, '#7fe3ff', 'right');
      const desc = o.lvl === 1 ? def[0].description : (o.kind === 'p' ? def[0].description : describeLevel(def[o.lvl - 1])); ctx.save(); ctx.beginPath(); ctx.rect(x + 66, y + 4, cw - 74, ch - 8); ctx.clip(); wrap(desc, x + 72, y + 44, cw - 150, 16, '#c9d7ff', 16); ctx.restore();
      if (hit('ch' + i)) { gm.choose(i); if (window.VSAudio) VSAudio.play('choose', { prio: true, jitter: 0 }); }
    });
    const k = Math.max(0, Math.min(1, gm.choiceT / 15)), by = y0 + n * (ch + 6); ctx.fillStyle = '#000'; ctx.fillRect(x, by, cw, 8); ctx.fillStyle = k > 0.3 ? '#2f7bff' : '#ff6a3a'; ctx.fillRect(x + 1, by + 1, (cw - 2) * k, 6);
  }
  function drawPrizeInfo(gm, x, y, w) {   // vencedor + estado do prêmio (comprando -> entregue)
    const pd = gm.paidEnd, pz = gm.prize, mine = pd.winner && pd.winner.id === gm.myId;
    if (!pd.winner) { txt('Nobody scored a kill - everyone is refunded', x + w / 2, y + 20, 32, '#ff9a9a', 'center'); return; }
    txt((mine ? 'YOU WON' : pd.winner.nick + ' WINS') + ' THE ' + pd.pack.label.toUpperCase() + '!', x + w / 2, y + 20, 32, '#ffd24a', 'center');
    const real = PAYCFG.mode === 'solana'; txt(real ? (PAYCFG.network === 'devnet' ? 'Test network - this is a test card, no real money' : '') : 'Test mode - no real pack was bought', x + w / 2, y + 44, 16, '#9fb0c8', 'center', false);
    let line = '';
    if (pz && pz.status === 'buying') line = 'Buying the prize pack...'; else if (pz && pz.status === 'refunded') line = 'The prize pack could not be bought - everyone is being refunded automatically.';
    else if (pz && pz.status === 'delayed') line = 'The prize is taking longer than usual - it will arrive in the winner\'s wallet shortly.'; else if (pz && pz.status === 'manual') line = 'The host will deliver the prize pack to the winner\'s wallet soon.';
    else if (pz && pz.status === 'done') line = pz.name + (pz.rarity ? '  -  ' + pz.rarity : '') + (pz.insured ? '  -  insured value $' + pz.insured : '') + (mine ? '  -  sent to YOUR wallet!' : '  -  sent to the winner\'s wallet');
    if (line) txt(line, x + w / 2, y + 72, 16, pz && pz.status === 'done' ? '#7dff9a' : '#cfd8ff', 'center');
    if (pz && pz.status === 'done' && pz.image) { const im = img(pz.image); if (im) { const hh = 96, ww = im.naturalWidth * hh / im.naturalHeight; ctx.drawImage(im, x + 36, y - 8, ww, hh); } }
  }
  function drawOverOnline(gm) {
    ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(0, 0, W, H); const rs = gm.results || [], pd = gm.paidEnd, extra = pd ? 100 : 0, w = 760, h = 250 + extra + rs.length * 40, x = (W - w) / 2, y = Math.max(8, (H - h) / 2); panel(x, y, w, h, 'frameB_gold');
    const won = gm.endReason === 'win'; txt(won ? 'VICTORY!' : 'GAME OVER', W / 2, y + 52, 32, won ? '#7dff9a' : '#ff6a6a', 'center'); txt(won ? 'The team survived the full 30 minutes!' : 'The whole team fell after ' + fmt(gm.endTime), W / 2, y + 80, 16, won ? '#c8ffd8' : '#ff9a9a', 'center');
    if (pd) drawPrizeInfo(gm, x, y + 108, w);
    const oy = y + extra;
    ['PLAYER', 'KILLS', 'LV', 'DAMAGE', 'RESULT'].forEach((k, i) => txt(k, [x + 110, x + 350, x + 430, x + 540, x + 730][i], oy + 118, 16, '#9fb0c8', i === 0 ? 'left' : 'right', false));
    rs.forEach((q, i) => { const yy = oy + 150 + i * 40, me = q.id === gm.myId, win = pd && pd.winner && pd.winner.id === q.id; if (me || win) { ctx.fillStyle = win ? 'rgba(255,210,74,.2)' : 'rgba(255,255,255,.08)'; ctx.fillRect(x + 20, yy - 24, w - 40, 36); } const pi = img(portraitOf(q.ch)); if (pi) spr(pi, x + 60, yy - 4, portraitScale(q.ch) * 0.42);
      txt((i + 1) + '. ' + q.nick + (win ? '  (WINNER)' : '') + (q.left ? '  (left)' : ''), x + 110 - 40, yy, 16, me ? '#ffd24a' : '#fff', 'left'); txt(String(q.kills), x + 350, yy, 16, '#fff', 'right'); txt(String(q.lv), x + 430, yy, 16, '#fff', 'right'); txt(String(q.dmg), x + 540, yy, 16, '#fff', 'right'); txt(q.alive ? 'SURVIVED' : 'FALLEN ' + fmt(q.diedAt || 0), x + 730, yy, 16, q.alive ? '#7dff9a' : '#ff8a8a', 'right'); });
    if (pd && gm.endAt) txt('Back to the menu in ' + Math.max(0, Math.ceil((gm.endAt - performance.now()) / 1000)) + 's', W / 2, y + h - 78, 16, '#9fb0c8', 'center', false);
    button('Back to menu', W / 2 - 100, y + h - 62, 200, 46, 'done', true); if (hit('done')) leaveOnline();
  }
  function drawLevelUp(gm) {
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H);
    const n = gm.choices.length, rw = Math.min(600, W - 40), rh = 96, gap = 10, total = n * rh + (n - 1) * gap, x = (W - rw) / 2, y0 = (H - total) / 2 + 20;
    panel(x - 16, y0 - 80, rw + 32, total + 140, 'frameB_gold');
    txt(T.levelup_header, W / 2, y0 - 30, 32, '#ffd24a', 'center');
    gm.choices.forEach((o, i) => {
      const y = y0 + i * (rh + gap), def = itemDef(o.kind, o.id), over = mouse.x >= x && mouse.x <= x + rw && mouse.y >= y && mouse.y <= y + rh;
      rects.push({ x, y, w: rw, h: rh, id: 'ch' + i });
      ctx.fillStyle = over ? 'rgba(60,80,170,.9)' : 'rgba(20,28,70,.95)'; ctx.fillRect(x, y, rw, rh); nine(img(U('frameB')), x, y, rw, rh, 6, 2);
      nine(img(U('frameB')), x + 12, y + 12, 72, 72, 6, 3); spr(iconOf(o.id), x + 48, y + 48, 3);
      txt(def[0].name, x + 100, y + 32, 16, '#fff');
      txt(`${i + 1}`, x + rw - 14, y + 24, 16, '#7f8fa8', 'right', false);
      if (o.lvl === 1) txt(T.genericPopup_new, x + rw - 14, y + 48, 16, '#ffd24a', 'right');
      else txt('LV ' + o.lvl, x + rw - 14, y + 48, 16, '#7fe3ff', 'right');
      const desc = o.lvl === 1 ? def[0].description : (o.kind === 'p' ? def[0].description : describeLevel(def[o.lvl - 1]));
      wrap(desc, x + 100, y + 56, rw - 190, 16, '#c9d7ff', 18);
      if (hit('ch' + i)) { gm.choose(i); if (window.VSAudio) VSAudio.play('choose', { prio: true, jitter: 0 }); }
    });
    txt(T.levelup_footer.replace(/\n+/g, ' '), W / 2, y0 + total + 36, 16, '#8aa0c8', 'center', false);
  }
  function drawTreasure(gm, t) {
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
    const p = gm.popup, w = 460, h = 340, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h, 'frameB_gold');
    txt(p.title, W / 2, y + 56, 32, '#ffd24a', 'center');
    if (!p.open) { spr(img(ART.fx.chest1), W / 2, y + 150 + Math.sin(t * 3) * 4, 5); button(T.treasure_open, W / 2 - 80, y + h - 76, 160, 46, 'popup', true); }
    else { nine(img(U('frameB')), W / 2 - 44, y + 100, 88, 88, 6, 3.6); if (p.icon) spr(img(p.icon), W / 2, y + 144, 4); txt(p.line, W / 2, y + 226, 16, '#fff', 'center'); button(T.postGame_done, W / 2 - 80, y + h - 76, 160, 46, 'popup', true); }
    if (hit('popup')) popupAdvance();
  }
  function drawOver(gm) {
    ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(0, 0, W, H);
    const w = 520, h = 360, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h, 'frameB_gold');
    txt(T.postGame_header, W / 2, y + 60, 32, '#ffd24a', 'center');
    const rows = [[T.postGame_survived, fmt(gm.t)], [T.postGame_levelReached, gm.p.level], [T.postGame_enemiesDefeated, gm.p.kills], [T.postGame_goldEarned, Math.floor(gm.p.gold)]];
    rows.forEach(([k, v], i) => { txt(k, x + 40, y + 120 + i * 34, 16, '#9fb0c8', 'left', false); txt(String(v), x + w - 40, y + 120 + i * 34, 16, '#fff', 'right', false); });
    gm.weapons.forEach((wp, i) => spr(iconOf(wp.id), x + 62 + i * 70, y + 268, 3));
    button(T.postGame_done, W / 2 - 80, y + h - 70, 160, 46, 'done', true); if (hit('done')) { state = 'select'; cv.style.filter = BASE_FILTER; }
  }
  function drawPause(gm) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H);
    const w = 380, h = 250, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h, 'frameB_gold');
    txt(D.stage.name, W / 2, y + 60, 32, '#ffd24a', 'center');
    button(T.pause_resume, W / 2 - 100, y + 100, 200, 46, 'resume', true); button(T.pause_quit, W / 2 - 100, y + 162, 200, 46, 'quit');
    if (hit('resume')) gm.paused = false; if (hit('quit')) { state = 'select'; cv.style.filter = BASE_FILTER; }
  }

  // ---------- áudio por estado ----------
  const BOSSMUS = { ELON: 'boss0', TRUMP: 'boss1', PEPE: 'boss2', DOGE: 'boss3', BULL: 'boss4' };
  function audioFrame(gm) {
    const A = window.VSAudio; if (!A) return;
    let key = 'forest', duck = 1;
    if (!gm) { A.setDuck(0.7); A.music('forest'); return; }
    if (gm.phase === 'boss' && gm.boss) key = BOSSMUS[gm.boss.bossId] || 'forest';
    if (gm.phase === 'warn') { A.preload(BOSSMUS[gm.bossKey]); key = undefined; duck = 0.3; }
    if (gm.over) { key = null; duck = 0.2; } else if (gm.paused || (!gm.online && (gm.choices || gm.popup))) duck = Math.min(duck, 0.3);
    A.setDuck(duck); if (key !== undefined) A.music(key, { fade: key && key.startsWith('boss') ? 0.8 : 1.6 });
  }
  function drawAudioHint() {
    const A = window.VSAudio; if (!A) return; txt(A.label, 10, H - 8, 16, '#6f7f98', 'left', false);
    const t = A.toast; if (t) txt(t, W / 2, H - 60, 32, '#ffd24a', 'center');
  }
  // ---------- loop ----------
  let benchMs = 0;
  function frame(now, fixedDt) {
    const dt = fixedDt || Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; const t = now / 1000;
    ctx.setTransform(Z, 0, 0, Z, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H); rects.length = 0;
    if (state !== 'select') nickEl.style.display = 'none';
    if (state === 'loading') { ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H); txt('Loading…', W / 2, H / 2, 32, '#ffd24a', 'center'); }
    else if (state === 'select') { drawSelect(t); audioFrame(null); drawAudioHint(); }
    else if (g.online && g.closedByServer) { leaveOnline(); }
    else if (g.online && (!g.gotSnap || g.error) && !g.over) {
      nickEl.style.display = 'none'; g.update(dt, { x: 0, y: 0 });
      if (g.lobby && !g.error) { drawLobby(g, t); drawAudioHint(); }
      else { ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, W, H);
      if (g.error) { txt(g.error, W / 2, H / 2 - 10, 32, '#ff9a6a', 'center'); button('Back to menu', W / 2 - 100, H / 2 + 20, 200, 46, 'done', true); if (hit('done')) leaveOnline(); }
      else txt('Finding a room' + '.'.repeat(1 + Math.floor(t * 2) % 3), W / 2, H / 2, 32, '#ffd24a', 'center');
      drawAudioHint(); }
    }
    else {
      nickEl.style.display = 'none';
      if (g.W !== W) { g.W = W; g.H = H; }
      g.update(dt, input()); if (g.testWhip) for (const q of g.proj) if (q.k === 'rect') q.life = Math.max(q.life, .1);
      consumeEvents(g, t);
      ctx.save(); if (shakeA > 0.2) { ctx.translate(rand(-shakeA, shakeA), rand(-shakeA, shakeA)); shakeA *= Math.exp(-dt * 7); } else shakeA = 0;
      drawWorld(g, t, dt); ctx.restore();
      if (flashA > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flashA})`; ctx.fillRect(0, 0, W, H); flashA *= Math.exp(-dt * 5); }
      drawVignette(); drawTension(g, t); drawHUD(g, t); audioFrame(g);
      if (g.online) { if (g.choices && !g.over) drawLevelUpMini(g); }
      else if (g.choices) drawLevelUp(g); else if (g.popup) drawTreasure(g, t);
      if (g.paused) drawPause(g);
      if (g.over) { if (g.online) drawOverOnline(g); else drawOver(g); }
      drawAudioHint();
    }
    click = null;
  }
  function loop(now) { try { frame(now); } catch (err) { window.__err = String(err.stack).slice(0, 700); document.title = 'ERR ' + window.__err; try { ctx.restore(); ctx.restore(); ctx.restore(); } catch (e2) { } } requestAnimationFrame(loop); }
  // benchmark (usado pelos testes headless): roda N frames síncronos de update + render
  window.__bench = (n) => { const t0 = performance.now(); let worst = 0; const ts = []; for (let i = 0; i < n; i++) { const a = performance.now(); if (g.choices) g.choose(0); if (g.popup) g.popup = null; frame(a + i * 16.7, 1 / 60); const d = performance.now() - a; ts.push(d); worst = Math.max(worst, d); } ts.sort((x, y) => x - y); return { avg: (performance.now() - t0) / n, p95: ts[Math.floor(n * 0.95)], p99: ts[Math.floor(n * 0.99)], worst, particles: P.length, proj: g.proj.length, enemies: g.enemies.length, t: g.t }; };
  cv.style.filter = BASE_FILTER;
  preload().then(() => {
    state = 'select';
    if (/audiotest/.test(location.hash) && window.VSAudio) {
      const A = window.VSAudio, errs = []; window.addEventListener('error', e => errs.push(String(e.message)));
      A.unlock(); const t0 = performance.now(); let played = 0, phase = 0;
      const iv = setInterval(() => {
        const s = A.status();
        if (phase === 0 && s.sfx.split('/')[0] === s.sfx.split('/')[1] && s.bgm.includes('forest')) { phase = 1; A.music('forest', { fade: 0.2 }); A.preload('boss0'); A.preload('boss3'); Object.keys(window.VS_SFX).forEach((k, i) => setTimeout(() => { A.play(k, { prio: true, jitter: 0 }); played++; }, i * 40)); }
        document.title = 'AUDIO ' + JSON.stringify(Object.assign({ played, errs: errs.length, ms: Math.round(performance.now() - t0), keys: Object.keys(window.VS_SFX).length }, s));
      }, 200);
    }
    const hs = location.hash;
    window.__ui = id => { const r = rects.find(q => q.id === id); return r ? { x: (r.x + r.w / 2) * Z, y: (r.y + r.h / 2) * Z } : null; };   // gancho de teste: centro de um botão
    if (/online|prize/.test(hs)) { const m0 = hs.match(/play=(\d+)/); if (m0) selIdx = Math.max(0, Math.min(PAL_NAMES.length - 1, +m0[1] - 1)); const nm = hs.match(/name=([A-Za-z0-9_]+)/); if (nm) nickEl.value = nm[1]; startOnline(/prize/.test(hs)); }
    else if (/play/.test(hs)) {
      const m = hs.match(/play=(\d+)/); if (m) selIdx = Math.max(0, Math.min(PAL_NAMES.length - 1, +m[1] - 1)); start();
      if (/god/.test(hs)) g.godMode = true;
      const tm = hs.match(/[&#]t=(\d+)/); if (tm) { g.t = +tm[1]; g.waveIdx = Math.floor(g.t / 60) - 1; }
      const wm0 = hs.match(/weap=([A-Z_0-9,]+)/); if (wm0) { g.weapons = []; wm0[1].split(',').forEach(id => { g.addWeapon(id); }); const lv = hs.match(/lv=(\d+)/); g.weapons.forEach(w => { w.lvl = lv ? Math.min(+lv[1], V.weaponMax(w.id)) : 1; w.cd = 0.1; }); g.recalc(); }
      const am = hs.match(/pass=([A-Z_,]+)/); if (am) { am[1].split(',').forEach(id => g.passives[id] = 3); g.recalc(); }
      const wm = hs.match(/warp=(\d+)/); if (wm) for (let i = 0; i < +wm[1] * 60 && !g.over; i++) { if (g.godMode) g.p.hp = g.S.maxHp; if (g.choices) g.choose(0); if (g.popup) g.popup = null; g.update(1 / 60, { x: Math.cos(i / 90), y: Math.sin(i / 90) }); g.ev.length = 0; }
      if (/whip/.test(hs)) { g.testWhip = true; const w0 = g.weapons[0]; for (let n = 0; n < 2; n++) g.fire(w0, V.weaponStats(w0.id, w0.lvl), n); g.proj.forEach(q => q.life = .12); }
      if (/lvl/.test(hs)) { g.levelUps = 1; g.openChoices(); }
      if (/chest/.test(hs)) { g.openChest(); }
      const bm = hs.match(/bench=(\d+)/); if (bm) { const r = window.__bench(+bm[1]); document.title = 'BENCH ' + JSON.stringify(r); document.body.setAttribute('data-bench', JSON.stringify(r)); }
      window.__diag = () => JSON.stringify({ shakeA, flashA, pa: ctx.globalAlpha, co: ctx.globalCompositeOperation, tr: String(ctx.getTransform()), p: [g.p.x, g.p.y], tension: g.tension, phase: g.phase, W, H, Z, fil: cv.style.filter, parts: P.length });
      const fm = hs.match(/frames=(\d+)/); if (fm) { try { for (let i = 0; i < +fm[1]; i++) { if (g.choices) g.choose(0); if (g.popup) g.popup = null; frame(performance.now() + i * 16.7, 1 / 60); } last = performance.now(); } catch (err) { document.title = 'ERR ' + String(err.stack).slice(0, 500); return; } if (/diag/.test(hs)) { document.title = window.__diag(); setInterval(() => { document.title = window.__diag() + ' t=' + g.t.toFixed(1) + ' en=' + g.enemies.length + ' over=' + g.over + ' ph=' + g.phase + ' hp=' + Math.round(g.p.hp); }, 500); } }
    }
  });
  requestAnimationFrame(loop);
})();
