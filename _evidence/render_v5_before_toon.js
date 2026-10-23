'use strict';
// Render / UI / input / efeitos. Sprites e textos vêm do jogo instalado (assets/, art.js, text.js) — uso local.
(() => {
  const V = window.VS, D = window.VS_DATA, T = window.VS_TEXT, ART = window.ART, B = window.VS_BOSSES;
  const { Game, xpNeeded, describeLevel, SPR, ARCH, BASE_OF } = V;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const FONT = 'Dos, "Courier New", monospace';
  const FACE_RIGHT = true;                       // sprites do jogo olham para a direita (verificado visualmente)
  const PAL_NAMES = Object.keys(D.characters);
  let Z = 1, W = 1280, H = 720, state = 'loading', g = null, selIdx = 0, last = performance.now(), mouse = { x: -1, y: -1 }, click = null;
  const keys = {}, rects = [];

  // ---------- visual de xerife (Antonio) ----------
  let sheriff = true; try { const v = localStorage.getItem('vs_sheriff'); if (v !== null) sheriff = v === '1'; } catch (e) { }
  const SHERIFF_IDS = { ANTONIO: true };
  const charFrames = id => { const f = ART.chars[id]; return sheriff && SHERIFF_IDS[id] ? f.map(p => p.replace('assets/chars/', 'assets/chars_sheriff/')) : f; };
  const portraitOf = id => sheriff && SHERIFF_IDS[id] ? 'assets/portraits_sheriff/' + id + '.png' : ART.portraits[id];
  const charTitle = (id, c) => sheriff && SHERIFF_IDS[id] ? 'Sheriff ' + c.charName : c.charName + (c.surname ? ' ' + c.surname : '');
  const toggleSheriff = () => { sheriff = !sheriff; try { localStorage.setItem('vs_sheriff', sheriff ? '1' : '0'); } catch (e) { } };
  // ---------- imagens ----------
  const imgs = {};
  const img = p => { if (!p) return null; let i = imgs[p]; if (!i) { i = imgs[p] = new Image(); i.src = p; } return i.complete && i.naturalWidth ? i : null; };
  const U = n => 'assets/ui/' + n + '.png';
  Game.sizeOf = p => { const i = img(p); return i ? [i.naturalWidth, i.naturalHeight] : null; };
  function preload() {
    const list = ['assets/bg/forest.png', ...['frameB', 'frameB_gold', 'frameB10', 'frameB_sotn', 'frameB_red', 'frame5_c4', 'frameB9', 'button_c9_normal'].map(U)];
    const walk = o => { if (typeof o === 'string') list.push(o); else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    Object.keys(B.defs).forEach(k => list.push('assets/bosses/' + k + '.png')); walk(ART.chars); walk(ART.portraits); for (let i = 1; i <= 4; i++) list.push('assets/chars_sheriff/ANTONIO_' + i + '.png'); list.push('assets/portraits_sheriff/ANTONIO.png'); walk(Object.values(ART.enemies).map(e => e.variants)); walk(ART.icons); walk(ART.fx);
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
    if (!im) return; const w = im.naturalWidth * s, h = im.naturalHeight * s;
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
      else if (e.k === 'shield') { ps('w_shieldhit', { prio: true }); burst(e.x, e.y, 22, '#9dffa0', 260, 0.5, 4); shake(3); }
      else if (e.k === 'shieldup') { ps('w_shieldup', { prio: true }); ringP(e.x, e.y, 70, 18, '#9dffa0', 0.6); }
      else if (e.k === 'hurt') { ps('hurt', { prio: true, jitter: 0.06 }); burst(e.x, e.y, 10, '#ff4040', 170, 0.4, 4); shake(4); flashA = Math.max(flashA, 0.05); }
      else if (e.k === 'bossdie') { ps('boss_die', { prio: true, jitter: 0 }); ps('boss_boom', { prio: true, when: 0.15, jitter: 0 }); flashA = Math.max(flashA, 0.7); for (let i = 0; i < 120; i++) { const a = Math.random() * 6.283, s = rand(80, 520); sp(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.4), rand(3, 8), Math.random() < 0.5 ? e.col : `hsl(${Math.random() * 360 | 0},100%,70%)`, true, 0, 2); } }
    }
    ev.length = 0;
  }

  // ---------- fluxo ----------
  function start() { if (window.VSAudio) VSAudio.play('ui_start', { prio: true, jitter: 0 }); g = new Game(PAL_NAMES[selIdx]); g.W = W; g.H = H; g.wantEvents = true; state = 'play'; window.__game = g; P.length = 0; shakeA = 0; flashA = 0; cv.style.filter = 'none'; }
  const input = () => ({ x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) });
  function popupAdvance() { if (!g.popup) return; if (!g.popup.open) g.popup.open = true; else g.popup = null; }
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (state === 'select') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') selIdx = (selIdx + PAL_NAMES.length - 1) % PAL_NAMES.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') selIdx = (selIdx + 1) % PAL_NAMES.length;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') selIdx = (selIdx + PAL_NAMES.length - 3) % PAL_NAMES.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') selIdx = (selIdx + 3) % PAL_NAMES.length;
      const n = +e.key; if (n >= 1 && n <= PAL_NAMES.length) selIdx = n - 1;
      if (e.code === 'KeyK') toggleSheriff();
      if (e.code === 'Enter' || e.code === 'Space') start(); return;
    }
    if (state !== 'play') return;
    if (g.choices) { const n = +e.key; if (n >= 1 && n <= g.choices.length) { g.choose(n - 1); if (window.VSAudio) VSAudio.play('choose', { prio: true, jitter: 0 }); } return; }
    if (g.popup) { if (e.code === 'Enter' || e.code === 'Space') popupAdvance(); return; }
    if (g.over) { if (e.code === 'Enter' || e.code === 'KeyR') { state = 'select'; cv.style.filter = 'none'; } return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { g.paused = !g.paused; if (window.VSAudio) VSAudio.play(g.paused ? 'pause_in' : 'pause_out', { prio: true, jitter: 0 }); }
    else if (g.paused && e.code === 'Enter') g.paused = false;
    else if (g.paused && e.code === 'KeyQ') { state = 'select'; cv.style.filter = 'none'; }
  });
  addEventListener('keyup', e => keys[e.code] = false);
  cv.addEventListener('mousemove', e => { mouse = { x: e.clientX / Z, y: e.clientY / Z }; });
  cv.addEventListener('mousedown', e => { click = { x: e.clientX / Z, y: e.clientY / Z }; });

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
      const p = img(portraitOf(id)); if (p) spr(p, x + cell / 2, y + cell / 2, 4);
      if (sel) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, cell + 4, cell + 4); }
      if (hit('sel' + i)) { selIdx = i; }
    });
    const c = D.characters[PAL_NAMES[selIdx]][0], dx = gx + 3 * (cell + 10) + 40, dw = Math.min(640, W - dx - 30), dy = 150;
    const ph = 410; panel(dx, dy, dw, ph);
    const fr = charFrames(PAL_NAMES[selIdx]), f = img(fr[Math.floor(t * 6) % fr.length]); spr(f, dx + 100, dy + 105, 4);
    txt(charTitle(PAL_NAMES[selIdx], c), dx + 190, dy + 52, 32, '#fff');
    wrap(c.description, dx + 190, dy + 84, dw - 215, 16, '#cfe0ff', 20);
    const wd = D.weapons[c.startingWeapon][0], ic = iconOf(c.startingWeapon);
    nine(img(U('frameB')), dx + 24, dy + 186, 72, 72, 6, 3); spr(ic, dx + 60, dy + 222, 3);
    txt(wd.name, dx + 112, dy + 210, 16, '#ffd24a'); wrap(wd.description, dx + 112, dy + 232, dw - 140, 16, '#cfe0ff', 20);
    const stats = [['Max Health', c.maxHp], ['Armor', c.armor], ['Move Speed', Math.round(c.moveSpeed * 100) + '%'], ['Might', Math.round(c.power * 100) + '%'], ['Area', Math.round(c.area * 100) + '%'], ['Cooldown', Math.round(c.cooldown * 100) + '%'], ['Luck', Math.round(c.luck * 100) + '%'], ['Growth', Math.round(c.growth * 100) + '%']];
    stats.forEach(([k, v], i) => { const x = dx + 28 + (i % 2) * (dw / 2 - 10), y = dy + 296 + Math.floor(i / 2) * 22; txt(k, x, y, 16, '#9fb0c8', 'left', false); txt(String(v), x + dw / 2 - 50, y, 16, '#fff', 'right', false); });
    button(T.charConfirm_start, dx + dw - 190, dy + ph + 16, 170, 46, 'start', true);
    txt('WASD / Arrows: move  -  1-9 / click: choose  -  K: sheriff outfit ' + (sheriff ? 'ON' : 'OFF') + '  -  Enter: ' + T.charConfirm_start, W / 2, H - 26, 16, '#7f8fa8', 'center', false);
    if (hit('start')) start();
  }

  // ---------- mundo ----------
  const vis = (cx, cy, x, y, m) => x > cx - m && x < cx + W + m && y > cy - m && y < cy + H + m;
  function drawWorld(gm, t, dt) {
    const cx = gm.p.x - W / 2, cy = gm.p.y - H / 2, live = !gm.paused && !gm.choices && !gm.popup;
    const bg = img('assets/bg/forest.png'), T0 = 1024 * SPR;
    ctx.fillStyle = '#1f3a1b'; ctx.fillRect(0, 0, W, H);
    if (bg) { const ox = -(((cx % T0) + T0) % T0), oy = -(((cy % T0) + T0) % T0); for (let x = ox; x < W; x += T0) for (let y = oy; y < H; y += T0) ctx.drawImage(bg, x, y, T0, T0); }
    const sh = img(ART.fx.shadow);
    drawTele(gm, cx, cy, t);
    drawZones(gm, cx, cy, t, live);
    for (const gm2 of gm.gems) { if (!vis(cx, cy, gm2.x, gm2.y, 30)) continue; const im = gm2.t === 'COIN' ? img(ART.fx.coin) : img(gm2.v >= 25 ? ART.fx.gemr : gm2.v >= 5 ? ART.fx.gemg : ART.fx.gemb); spr(sh, gm2.x - cx, gm2.y - cy + 8, SPR * .8, false, 0, .5); spr(im, gm2.x - cx, gm2.y - cy + Math.sin(t * 4 + gm2.x) * 1.5, SPR); }
    for (const c of gm.chests) { spr(sh, c.x - cx, c.y - cy + 14, SPR * 2, false, 0, .5); ctx.globalCompositeOperation = 'lighter'; glow(c.x - cx, c.y - cy, 46 + Math.sin(t * 5) * 6, '#ffd24a', .55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; spr(img(ART.fx.chest1), c.x - cx, c.y - cy + Math.sin(t * 3) * 2, SPR * 1.2); }
    const ents = [];
    for (const e of gm.enemies) if (vis(cx, cy, e.x, e.y, 120)) ents.push(e);
    ents.push({ player: true, y: gm.p.y }); ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.player) { drawPlayer(gm, cx, cy, t, sh); continue; }
      if (e.bossId) { drawBoss(e, cx, cy, t, sh); continue; }
      const a = ART.enemies[e.id], vs = a && a.variants[e.variant % a.variants.length], im = vs && img(vs[Math.floor(t * 6 + e.seed) % vs.length]);
      const s = SPR * (e.scale || 1), ex = e.x - cx, ey = e.y - cy;
      spr(sh, ex, ey + e.r * .55, s * (e.r / 12) * .9, false, 0, .55);
      if (im) { const flip = (FACE_RIGHT ? (gm.p.x < e.x) : (gm.p.x > e.x)) && !e.swarm ? true : (e.swarm && e.vx < 0); spr(im, ex, ey, s, flip); if (e.flash > 0) spr(tintOf(im, '#ffffff'), ex, ey, s, flip, 0, .85); else if (e.slowT > 0) spr(tintOf(im, '#4aa8ff'), ex, ey, s, flip, 0, .45); }
      else { ctx.fillStyle = '#a44'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, 7); ctx.fill(); }
      if (e.boss && e.id !== 'BOSS_XLDEATH' && e.hp < e.max) { const bw = 44; ctx.fillStyle = '#000'; ctx.fillRect(ex - bw / 2 - 1, ey - e.r - 14, bw + 2, 6); ctx.fillStyle = '#d03030'; ctx.fillRect(ex - bw / 2, ey - e.r - 13, bw * Math.max(0, e.hp / e.max), 4); }
    }
    drawEShots(gm, cx, cy, t, live);
    drawWeapons(gm, cx, cy, t, live);
    drawPlayer(gm, cx, cy, t, null);
    if (live) updP(dt);
    drawP(cx, cy);
    for (const f of gm.floating) { const big = f.c === '#ffe45a'; ctx.globalAlpha = Math.min(1, f.life * 3); txt(f.t, f.x - cx, f.y - cy, big ? 24 : 16, f.c, 'center'); ctx.globalAlpha = 1; }
  }
  function drawPlayer(gm, cx, cy, t, sh) {
    const fr = charFrames(gm.charId), moving = gm.p.moving, im = img(fr[moving ? Math.floor(t * 9) % fr.length : 0]);
    const flicker = gm.p.iframes > 0 && Math.floor(t * 20) % 2, px = W / 2, py = H / 2;
    if (sh) spr(sh, px, py + 20, SPR * 1.6, false, 0, .6);
    if (gm.shieldCharges > 0) { ctx.globalCompositeOperation = 'lighter'; const R = (gm.weapons.find(w => ARCH[w.id] === 'shield') || {}).shR || 50; glow(px, py, R * 1.6 + Math.sin(t * 6) * 3, '#7dff9a', .65); ctx.globalAlpha = .6; ctx.strokeStyle = '#b8ffc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, R + 6, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (!flicker) spr(im, px, py, SPR, FACE_RIGHT ? gm.p.face < 0 : gm.p.face > 0);
    const bw = 50; ctx.fillStyle = '#000'; ctx.fillRect(px - bw / 2 - 2, py + 28, bw + 4, 8); ctx.fillStyle = '#5a0f0f'; ctx.fillRect(px - bw / 2, py + 30, bw, 4); ctx.fillStyle = '#e03a3a'; ctx.fillRect(px - bw / 2, py + 30, bw * Math.max(0, Math.min(1, gm.p.hp / gm.S.maxHp)), 4);
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
    const k = gm.tension; if (k < 0.01) { if (cv.style.filter !== 'none') cv.style.filter = 'none'; return; }
    cv.style.filter = `saturate(${(1 - 0.5 * k).toFixed(2)}) contrast(${(1 + 0.14 * k).toFixed(2)}) brightness(${(1 - 0.12 * k).toFixed(2)}) hue-rotate(${(-14 * k).toFixed(1)}deg)`;
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
        const px = gm.p.x - cx + q.side * (q.rw / 2 + q.off), life = q.life / .18, im = img(ART.fx.whip2), hh = q.rh * 2.6 * (0.9 + 0.1 * q.tier);
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
    for (const w of gm.weapons) {
      const tk = tierK(w.lvl, D.weapons[w.id][0].isEvolution), c0 = pal(w.id, t, 0), c1 = pal(w.id, t, 1), px = W / 2, py = H / 2;
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
    if (gm.reaper) txt('— DEATH IS HERE —', W / 2, H - 24, 16, '#ff5a5a', 'center');
    drawBossUI(gm, t);
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
    button(T.postGame_done, W / 2 - 80, y + h - 70, 160, 46, 'done', true); if (hit('done')) { state = 'select'; cv.style.filter = 'none'; }
  }
  function drawPause(gm) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H);
    const w = 380, h = 250, x = (W - w) / 2, y = (H - h) / 2; panel(x, y, w, h, 'frameB_gold');
    txt(D.stage.name, W / 2, y + 60, 32, '#ffd24a', 'center');
    button(T.pause_resume, W / 2 - 100, y + 100, 200, 46, 'resume', true); button(T.pause_quit, W / 2 - 100, y + 162, 200, 46, 'quit');
    if (hit('resume')) gm.paused = false; if (hit('quit')) { state = 'select'; cv.style.filter = 'none'; }
  }

  // ---------- áudio por estado ----------
  const BOSSMUS = { ELON: 'boss0', TRUMP: 'boss1', PEPE: 'boss2', DOGE: 'boss3', BULL: 'boss4' };
  function audioFrame(gm) {
    const A = window.VSAudio; if (!A) return;
    let key = 'forest', duck = 1;
    if (!gm) { A.setDuck(0.7); A.music('forest'); return; }
    if (gm.phase === 'boss' && gm.boss) key = BOSSMUS[gm.boss.bossId] || 'forest';
    if (gm.phase === 'warn') { A.preload(BOSSMUS[gm.bossKey]); key = undefined; duck = 0.3; }
    if (gm.over) { key = null; duck = 0.2; } else if (gm.paused || gm.choices || gm.popup) duck = Math.min(duck, 0.3);
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
    if (state === 'loading') { ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H); txt('Loading…', W / 2, H / 2, 32, '#ffd24a', 'center'); }
    else if (state === 'select') { drawSelect(t); audioFrame(null); drawAudioHint(); }
    else {
      if (g.W !== W) { g.W = W; g.H = H; }
      g.update(dt, input()); if (g.testWhip) for (const q of g.proj) if (q.k === 'rect') q.life = Math.max(q.life, .1);
      consumeEvents(g, t);
      ctx.save(); if (shakeA > 0.2) { ctx.translate(rand(-shakeA, shakeA), rand(-shakeA, shakeA)); shakeA *= Math.exp(-dt * 7); } else shakeA = 0;
      drawWorld(g, t, dt); ctx.restore();
      if (flashA > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flashA})`; ctx.fillRect(0, 0, W, H); flashA *= Math.exp(-dt * 5); }
      drawTension(g, t); drawHUD(g, t); audioFrame(g);
      if (g.choices) drawLevelUp(g); else if (g.popup) drawTreasure(g, t);
      if (g.paused) drawPause(g);
      if (g.over) drawOver(g);
      drawAudioHint();
    }
    click = null;
  }
  function loop(now) { try { frame(now); } catch (err) { window.__err = String(err.stack).slice(0, 700); document.title = 'ERR ' + window.__err; try { ctx.restore(); ctx.restore(); ctx.restore(); } catch (e2) { } } requestAnimationFrame(loop); }
  // benchmark (usado pelos testes headless): roda N frames síncronos de update + render
  window.__bench = (n) => { const t0 = performance.now(); let worst = 0; for (let i = 0; i < n; i++) { const a = performance.now(); if (g.choices) g.choose(0); if (g.popup) g.popup = null; frame(a + i * 16.7, 1 / 60); worst = Math.max(worst, performance.now() - a); } return { avg: (performance.now() - t0) / n, worst, particles: P.length, proj: g.proj.length, enemies: g.enemies.length, t: g.t }; };
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
    if (/play/.test(hs)) {
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
