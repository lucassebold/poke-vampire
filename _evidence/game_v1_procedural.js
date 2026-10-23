'use strict';
// Reconstrução jogável. Números de balanceamento vêm de data.js (extraídos do resources.assets).
// Constantes marcadas [DESIGN] NÃO foram recuperadas do binário: são escolhas desta versão (ver README.md).
const D = (typeof window !== 'undefined' ? window.VS_DATA : require('./data.js'));

// ---------- [DESIGN] constantes de pixel/escala (vivem no código IL2CPP do original, não nos dados) ----------
const DMG_UNIT = 10;            // power (arma) e maxHp (inimigo) são multiplicados pela mesma unidade
const BASE_MOVE = 100;          // px/s, vezes stage.mods.PlayerPxSpeed (dado) e moveSpeed
const ENEMY_PX = 0.5;           // enemy.speed (dado, 80-200) * ENEMY_PX = px/s
const MAX_ENEMIES = 450;
const MAX_WEAPONS = 6, MAX_PASSIVES = 6;
const xpNeeded = lvl => 5 + 10 * (lvl - 1);   // [DESIGN] curva de XP não recuperada
const IFRAMES = 0.6;            // [DESIGN]
const END_MIN = D.stage.mods.TimeLimit / 60;   // 30 (dado)

const ARCH = { WHIP:'whip', VAMPIRICA:'whip', MAGIC_MISSILE:'aim', HOLY_MISSILE:'aim', KNIFE:'dir', THOUSAND:'dir',
  AXE:'lob', SCYTHE:'lob', CROSS:'boom', HEAVENSWORD:'boom', HOLYBOOK:'orbit', VESPERS:'orbit',
  GARLIC:'aura', VORTEX:'aura', FIREBALL:'rand', HELLFIRE:'rand', LIGHTNING:'strike', LOOP:'strike' };
const COLORS = { WHIP:'#d8c07a', MAGIC_MISSILE:'#6aa8ff', KNIFE:'#cfd6e6', AXE:'#c98b4a', CROSS:'#f4e27a', HOLYBOOK:'#7ad0ff',
  GARLIC:'#c9f5a0', FIREBALL:'#ff7a3a', LIGHTNING:'#b9a4ff' };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function weaponStats(id, lvl) {
  const defs = D.weapons[id], s = Object.assign({}, defs[0]);
  for (let i = 1; i < lvl && i < defs.length; i++)
    for (const [k, v] of Object.entries(defs[i])) if (typeof v === 'number') s[k] = (s[k] || 0) + v;
  return s;
}
const weaponMax = id => D.weapons[id].length;
const passiveMax = id => D.passives[id].length;
function deltaText(def) {
  const names = { power:'Dano', area:'Área', speed:'Vel. proj.', amount:'Qtd', interval:'Recarga ms', duration:'Duração ms', penetrating:'Perfura', repeatInterval:'Rep. ms', maxHp:'Vida', armor:'Armadura', cooldown:'Recarga', magnet:'Imã', growth:'XP', luck:'Sorte', regen:'Regen', moveSpeed:'Mov.' };
  return Object.entries(def).filter(([k, v]) => typeof v === 'number' && names[k] && k !== 'level').map(([k, v]) => `${names[k]} ${v > 0 ? '+' : ''}${v}`).join(', ') || 'Melhora geral';
}

class Game {
  constructor(charId, rngNoRender) {
    this.charId = charId;
    this.chr = D.characters[charId];
    this.reset();
  }
  reset() {
    const c = this.chr[0], m = D.stage.mods;
    this.t = 0; this.over = false; this.paused = false; this.won = false;
    this.p = { x: 0, y: 0, fx: 1, fy: 0, hp: c.maxHp, level: 1, xp: 0, gold: 0, kills: 0, iframes: 0, face: 1 };
    this.weapons = []; this.passives = {};
    this.enemies = []; this.proj = []; this.gems = []; this.fx = []; this.chests = [];
    this.pending = []; this.levelUps = 0; this.choices = null; this.msgs = [];
    this.spawnAcc = 0; this.waveIdx = -1; this.mods = m; this.floating = [];
    this.reaper = false;
    this.addWeapon(c.startingWeapon);
    this.recalc();
    this.p.hp = this.stat('maxHp');
    this.nextCharDelta = 0;
  }
  // ---- stats: base do personagem + soma dos passivos (+ deltas de nível do personagem, literais do JSON) ----
  recalc() {
    const base = this.chr[0], s = {};
    for (const k of ['maxHp','cooldown','armor','regen','moveSpeed','power','area','speed','duration','amount','luck','growth','greed','curse','magnet','revivals']) s[k] = base[k] || 0;
    for (const e of this.chr.slice(1)) if (e.level && e.level <= this.p.level) for (const [k, v] of Object.entries(e)) if (k !== 'level' && typeof v === 'number') s[k] = (s[k] || 0) + v;
    for (const [id, lv] of Object.entries(this.passives)) {
      const defs = D.passives[id];
      for (let i = 0; i < lv; i++) for (const [k, v] of Object.entries(defs[i])) if (typeof v === 'number' && k in s) s[k] += v;
    }
    // maxHp dos passivos é percentual (+20%): base * (1+soma)
    let hpPct = 0;
    for (const [id, lv] of Object.entries(this.passives)) for (let i = 0; i < lv; i++) if (D.passives[id][i].maxHp) hpPct += D.passives[id][i].maxHp;
    s.maxHp = base.maxHp * (1 + hpPct);
    s.cooldown = Math.max(0.1, s.cooldown);
    this.S = s;
  }
  stat(k) { return this.S[k]; }
  addWeapon(id) { this.weapons.push({ id, lvl: 1, cd: 0.4, queue: 0, qt: 0, side: 1, orbitOn: true, orbitT: 0, angle: 0 }); }
  has(id) { return this.weapons.find(w => w.id === id); }
  // ---- level up ----
  xpGain(v) {
    this.p.xp += v * this.stat('growth');
    while (this.p.xp >= xpNeeded(this.p.level)) { this.p.xp -= xpNeeded(this.p.level); this.p.level++; this.levelUps++; this.recalc(); }
    if (this.levelUps > 0 && !this.choices) this.openChoices();
  }
  openChoices() {
    const opts = [];
    for (const w of this.weapons) if (w.lvl < weaponMax(w.id) && !D.weapons[w.id][0].isEvolution) opts.push({ kind: 'w', id: w.id, lvl: w.lvl + 1 });
    for (const [id, lv] of Object.entries(this.passives)) if (lv < passiveMax(id)) opts.push({ kind: 'p', id, lvl: lv + 1 });
    if (this.weapons.length < MAX_WEAPONS) for (const id of Object.keys(D.weapons)) if (!D.weapons[id][0].isEvolution && !this.has(id)) opts.push({ kind: 'w', id, lvl: 1 });
    if (Object.keys(this.passives).length < MAX_PASSIVES) for (const id of Object.keys(D.passives)) if (!(id in this.passives)) opts.push({ kind: 'p', id, lvl: 1 });
    const n = this.stat('luck') > 1.2 ? 4 : 3, out = [];
    while (out.length < n && opts.length) out.push(opts.splice(Math.floor(Math.random() * opts.length), 1)[0]);
    if (!out.length) { this.p.gold += 25; this.levelUps = 0; this.msg('Tudo no máximo: +25 ouro'); return; }
    this.choices = out;
  }
  choose(i) {
    const o = this.choices && this.choices[i]; if (!o) return;
    this.applyUpgrade(o); this.levelUps--; this.choices = null;
    if (this.levelUps > 0) this.openChoices();
  }
  applyUpgrade(o) {
    if (o.kind === 'w') { const w = this.has(o.id); if (w) w.lvl = o.lvl; else this.addWeapon(o.id); }
    else { this.passives[o.id] = o.lvl; const old = this.S.maxHp; this.recalc(); this.p.hp += this.S.maxHp - old; }
  }
  // ---- chest / evolução (requires + evoSynergy vêm do JSON) ----
  openChest() {
    for (const w of this.weapons) {
      const def = D.weapons[w.id][0];
      if (def.isEvolution || w.lvl < weaponMax(w.id) || !def.evoInto || !D.weapons[def.evoInto]) continue;
      const need = D.weapons[def.evoInto][0].requires || def.evoSynergy || [];
      if (need.every(r => r in this.passives)) { this.msg(`EVOLUÇÃO: ${D.weapons[def.evoInto][0].name}!`); w.id = def.evoInto; w.lvl = 1; return; }
    }
    const ups = [];
    for (const w of this.weapons) if (w.lvl < weaponMax(w.id) && !D.weapons[w.id][0].isEvolution) ups.push({ kind: 'w', id: w.id, lvl: w.lvl + 1 });
    for (const [id, lv] of Object.entries(this.passives)) if (lv < passiveMax(id)) ups.push({ kind: 'p', id, lvl: lv + 1 });
    if (ups.length) { const o = pick(ups); this.applyUpgrade(o); this.msg(`Baú: ${(o.kind === 'w' ? D.weapons : D.passives)[o.id][0].name} nv ${o.lvl}`); }
    else { this.p.gold += 50; this.msg('Baú: +50 ouro'); }
  }
  msg(t) { this.msgs.push({ t, life: 3 }); }
  // ---- spawn ----
  viewR() { return Math.hypot(this.W || 1280, this.H || 720) / 2 + 40; }
  spawn(id, x, y, extra) {
    const d = D.enemies[id]; if (!d || this.enemies.length >= MAX_ENEMIES + 100) return null;
    const boss = id.startsWith('BOSS_') || id === 'BAT4' || id.startsWith('XL') && d.xp >= 3 && d.level >= 10;
    const e = Object.assign({ id, x, y, hp: d.maxHp * DMG_UNIT * this.mods.EnemyHealthMultiplier, max: d.maxHp * DMG_UNIT,
      spd: d.speed * ENEMY_PX * this.mods.EnemySpeed, pow: d.power, kb: d.knockback, xp: d.xp, r: 10 + Math.min(18, d.maxHp * 0.9 + (d.level > 1 ? 8 : 0)), vx: 0, vy: 0, kx: 0, ky: 0, hitT: {}, boss, fixed: false, flash: 0 }, extra || {});
    if (id === 'BOSS_XLDEATH') { e.r = 40; e.hp = 1e9; e.max = 1e9; }
    this.enemies.push(e); return e;
  }
  ring(id) { const a = rnd(0, 6.283), r = this.viewR(); return this.spawn(id, this.p.x + Math.cos(a) * r, this.p.y + Math.sin(a) * r); }
  waveFor(min) { const ws = D.stage.waves; return ws[Math.min(min, ws.length - 1)]; }
  runEvent(ev) {
    const t = ev.eventType;
    if (ev.chance != null && Math.random() * 100 > ev.chance) return;
    const reps = ev.repeat || 1;
    for (let r = 0; r < reps; r++) this.pending.push({ at: this.t + (ev.delay || 0) / 1000 + r * 2.5, t });
  }
  doEvent(t) {
    const px = this.p.x, py = this.p.y, R = this.viewR();
    if (t === 'BAT_SWARM' || t === 'GHOST_SWARM') {
      const id = t === 'BAT_SWARM' ? 'BAT1' : 'GHOST', a = rnd(0, 6.283), dx = Math.cos(a), dy = Math.sin(a);
      for (let i = 0; i < 28; i++) { const o = (i - 14) * 24; const e = this.spawn(id, px + dx * R - dy * o, py + dy * R + dx * o, { swarm: true }); if (e) { e.vx = -dx * e.spd * 1.8; e.vy = -dy * e.spd * 1.8; } }
    } else if (t === 'FLOWER_WALL') {
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283, e = this.spawn('FLOWER', px + Math.cos(a) * 420, py + Math.sin(a) * 420, { swarm: true }); if (e) { e.vx = -Math.cos(a) * 28; e.vy = -Math.sin(a) * 28; } }
    } else if (t === 'CYCLE_COMPLETE') { this.reaper = true; this.msg('A Morte chegou…'); }
  }
  // ---- main update ----
  update(dt, input) {
    if (this.over || this.paused || this.choices) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const p = this.p, S = this.S;
    // movimento
    let ix = input.x, iy = input.y; const l = Math.hypot(ix, iy);
    if (l > 0) { ix /= l; iy /= l; p.fx = ix; p.fy = iy; if (ix) p.face = ix > 0 ? 1 : -1; }
    const sp = BASE_MOVE * this.mods.PlayerPxSpeed * S.moveSpeed;
    p.x += ix * sp * dt; p.y += iy * sp * dt;
    p.hp = Math.min(S.maxHp, p.hp + S.regen * dt);
    p.iframes = Math.max(0, p.iframes - dt);
    // ondas
    const min = Math.floor(this.t / 60);
    if (min !== this.waveIdx) {
      this.waveIdx = min; const w = this.waveFor(min);
      for (const b of w.bosses || []) { const e = this.ring(b); if (e) e.boss = true; }
      for (const ev of w.events || []) this.runEvent(ev);
      if (min === 0) for (let i = 0; i < D.stage.startingSpawns; i++) this.ring(pick(w.enemies));
    }
    const w = this.waveFor(min);
    this.spawnAcc += dt * 1000;
    while (w.enemies.length && this.spawnAcc >= w.frequency) {
      this.spawnAcc -= w.frequency;
      const alive = this.enemies.filter(e => !e.swarm).length;   // [DESIGN] semântica de "minimum": piso de inimigos vivos
      const n = alive < w.minimum ? Math.min(12, Math.ceil((w.minimum - alive) / 3)) : 1;
      for (let i = 0; i < n && this.enemies.length < MAX_ENEMIES; i++) this.ring(pick(w.enemies));
    }
    if (!w.enemies.length) this.spawnAcc = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.t) { this.doEvent(this.pending[i].t); this.pending.splice(i, 1); }
    if (this.t >= D.stage.mods.TimeLimit && !this.won) { this.won = true; }
    this.buildGrid();
    this.updateEnemies(dt);
    for (const wp of this.weapons) this.updateWeapon(wp, dt);
    this.updateProj(dt);
    this.updatePickups(dt);
    for (const f of this.fx) f.life -= dt; this.fx = this.fx.filter(f => f.life > 0);
    for (const f of this.floating) { f.life -= dt; f.y -= 30 * dt; } this.floating = this.floating.filter(f => f.life > 0);
    for (const m of this.msgs) m.life -= dt; this.msgs = this.msgs.filter(m => m.life > 0);
    if (p.hp <= 0) { if ((this.revUsed || 0) < this.S.revivals) { this.revUsed = (this.revUsed || 0) + 1; p.hp = this.S.maxHp * 0.5; p.iframes = 3; this.msg('REVIVIDO!'); } else this.over = true; }
  }
  buildGrid() {
    this.grid = new Map();
    for (const e of this.enemies) { const k = ((e.x / 64) | 0) * 100003 + ((e.y / 64) | 0); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(e); }
  }
  near(x, y, r) {
    const out = [], c = Math.ceil((r + 30) / 64), cx = (x / 64) | 0, cy = (y / 64) | 0;
    for (let i = cx - c; i <= cx + c; i++) for (let j = cy - c; j <= cy + c; j++) { const a = this.grid.get(i * 100003 + j); if (a) for (const e of a) out.push(e); }
    return out;
  }
  nearest(x, y, maxD) {
    let b = null, bd = (maxD || 1e9) ** 2;
    for (const e of this.enemies) { const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; b = e; } }
    return b;
  }
  visible() { const hw = (this.W || 1280) / 2, hh = (this.H || 720) / 2; return this.enemies.filter(e => Math.abs(e.x - this.p.x) < hw && Math.abs(e.y - this.p.y) < hh); }
  updateEnemies(dt) {
    const p = this.p, S = this.S;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) { this.kill(e, i); continue; }
      e.flash = Math.max(0, e.flash - dt);
      let dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.swarm) { e.x += e.vx * dt; e.y += e.vy * dt; if (d > this.viewR() + 700) { this.enemies.splice(i, 1); continue; } }
      else {
        const sp = e.id === 'FLOWER' ? 0 : e.spd;   // FLOWER: speed 20 (dado) -> quase parada
        e.x += (dx / d * (e.id === 'FLOWER' ? e.spd : sp)) * dt + e.kx * dt; e.y += (dy / d * (e.id === 'FLOWER' ? e.spd : sp)) * dt + e.ky * dt;
        e.kx *= 0.9; e.ky *= 0.9;
        if (d > this.viewR() + 500 && !e.boss) { const a = rnd(0, 6.283); e.x = p.x + Math.cos(a) * this.viewR(); e.y = p.y + Math.sin(a) * this.viewR(); }
      }
      if (d < e.r + 12 && p.iframes <= 0) {
        const dmg = e.id === 'BOSS_XLDEATH' ? 1e9 : Math.max(1, e.pow - S.armor);
        p.hp -= dmg; p.iframes = IFRAMES; this.floating.push({ x: p.x, y: p.y - 20, t: String(Math.round(dmg)), life: 0.7, c: '#ff5555' });
      }
    }
    // separação leve entre inimigos (vizinhos de grid)
    for (const e of this.enemies) {
      if (e.swarm) continue;
      for (const o of this.near(e.x, e.y, e.r)) {
        if (o === e || o.swarm) continue; const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = e.r + o.r;
        if (d > 0 && d < m) { const f = (m - d) * 0.05; e.x += dx / d * f; e.y += dy / d * f; }
      }
    }
  }
  kill(e, i) {
    this.enemies.splice(i, 1); this.p.kills++;
    this.gems.push({ x: e.x, y: e.y, v: e.xp, t: 'GEM', pull: false });
    if (Math.random() < 0.08 * this.stat('greed')) this.gems.push({ x: e.x + 8, y: e.y, v: D.pickups.COIN.value, t: 'COIN', pull: false });
    if (e.boss && e.id !== 'BOSS_XLDEATH') this.chests.push({ x: e.x, y: e.y });
    this.fx.push({ x: e.x, y: e.y, r: e.r, life: 0.25, k: 'poof' });
  }
  hit(e, dmg, w, kbMul) {
    const S = this.S; let crit = false;
    if (w && w.critChance && Math.random() < w.critChance) { dmg *= w.critMul || 2; crit = true; }
    if (e.id === 'BOSS_XLDEATH') return;
    e.hp -= dmg; e.flash = 0.08;
    if (w && w.knockback !== 0 && e.kb > 0) { const dx = e.x - this.p.x, dy = e.y - this.p.y, d = Math.hypot(dx, dy) || 1, k = (w.knockback == null ? 0.5 : w.knockback) * e.kb * 220 * (kbMul || 1); e.kx += dx / d * k; e.ky += dy / d * k; }
    if (this.floating.length < 80) this.floating.push({ x: e.x, y: e.y - e.r, t: String(Math.round(dmg)), life: 0.5, c: crit ? '#ffe45a' : '#fff' });
  }
  dmgOf(w) { return w.power * this.S.power * DMG_UNIT; }
  // ---- armas ----
  updateWeapon(wp, dt) {
    const w = weaponStats(wp.id, wp.lvl), S = this.S, arch = ARCH[wp.id];
    wp.angle += dt;
    if (arch === 'orbit') return this.updateOrbit(wp, w, dt);
    if (arch === 'aura') return this.updateAura(wp, w, dt);
    wp.cd -= dt;
    if (wp.cd <= 0 && wp.queue <= 0) { wp.queue = Math.max(1, Math.round(w.amount + S.amount)); wp.qt = 0; wp.cd = Math.max(0.15, w.interval * S.cooldown / 1000); wp.shot = 0; wp.nT = null; }
    if (wp.queue > 0) {
      wp.qt -= dt;
      while (wp.queue > 0 && wp.qt <= 0) { this.fire(wp, w, wp.shot++); wp.queue--; wp.qt += Math.max(0.02, (w.repeatInterval || 100) / 1000); }
    }
  }
  fire(wp, w, n) {
    const p = this.p, S = this.S, arch = ARCH[wp.id], dmg = this.dmgOf(w), area = w.area * S.area, spd = w.speed * S.speed * this.mods.ProjectileSpeed;
    const base = { w, dmg, hits: new Set(), pen: Math.max(1, w.penetrating || 1), from: wp.id, col: COLORS[wp.id] || (D.weapons[wp.id][0].evolvesFrom && COLORS[D.weapons[wp.id][0].evolvesFrom[0]]) || '#fff' };
    if (arch === 'whip') {
      const side = (n % 2 === 0 ? 1 : -1) * p.face, row = Math.ceil(n / 2) * 0;
      this.proj.push(Object.assign(base, { k: 'rect', x: p.x, y: p.y - 6 - Math.floor(n / 2) * 26, rw: 150 * area, rh: 30 * area, side, life: 0.18, off: 18 }));
    } else if (arch === 'aim') {
      const t = this.nearest(p.x, p.y, 700), a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 420 * spd, vy: Math.sin(a) * 420 * spd, r: 7 * area, life: 2 }));
    } else if (arch === 'dir') {
      const a = Math.atan2(p.fy, p.fx), off = (n - ((w.amount + S.amount - 1) / 2)) * 12;
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off, vx: Math.cos(a) * 620 * spd, vy: Math.sin(a) * 620 * spd, r: 6 * area, life: 1.4, blade: a }));
    } else if (arch === 'lob') {
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: rnd(-120, 120) * spd, vy: -420 * spd, g: 760, r: 20 * area, life: 3, spin: true }));
    } else if (arch === 'boom') {
      const t = this.nearest(p.x, p.y, 700), a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 360 * spd, vy: Math.sin(a) * 360 * spd, r: 14 * area, life: 2.4, boom: true, pen: 1e9, spin: true, rehit: 0.4 }));
    } else if (arch === 'rand') {
      const vis = this.visible(), t = vis.length ? pick(vis) : null, a = t ? Math.atan2(t.y - p.y, t.x - p.x) : rnd(0, 6.283);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 380 * spd, vy: Math.sin(a) * 380 * spd, r: 9 * area, life: 2, explode: 38 * area, pen: 1 }));
    } else if (arch === 'strike') {
      const vis = this.visible(); if (!vis.length) return; const t = pick(vis);
      this.fx.push({ x: t.x, y: t.y, r: 40 * area, life: 0.3, k: 'bolt', col: base.col });
      for (const e of this.near(t.x, t.y, 40 * area)) if (Math.hypot(e.x - t.x, e.y - t.y) < 40 * area + e.r) this.hit(e, dmg, w, 0.5);
    }
  }
  updateOrbit(wp, w, dt) {
    const S = this.S, perm = wp.id === 'VESPERS', dur = (w.duration * S.duration) / 1000, cd = (w.interval * S.cooldown) / 1000;
    wp.orbitT += dt;
    if (!perm) { if (wp.orbitOn && wp.orbitT >= dur) { wp.orbitOn = false; wp.orbitT = 0; } else if (!wp.orbitOn && wp.orbitT >= cd * 0.6) { wp.orbitOn = true; wp.orbitT = 0; } }
    if (!wp.orbitOn) { wp.books = []; return; }
    const n = Math.max(1, Math.round(w.amount + S.amount)), area = w.area * S.area, R = 85 * Math.sqrt(area), sp = 3.2 * w.speed * S.speed * this.mods.ProjectileSpeed;
    wp.books = [];
    for (let i = 0; i < n; i++) {
      const a = wp.angle * sp + i / n * 6.283, x = this.p.x + Math.cos(a) * R, y = this.p.y + Math.sin(a) * R, r = 15 * area; wp.books.push({ x, y, r });
      for (const e of this.near(x, y, r)) {
        if (Math.hypot(e.x - x, e.y - y) > r + e.r) continue; const last = e.hitT[wp.id + i] || -9;
        if (this.t - last >= Math.max(0.25, (w.hitBoxDelay || 1000) / 1000 * 0.5)) { e.hitT[wp.id + i] = this.t; this.hit(e, this.dmgOf(w), w, 1.5); }
      }
    }
  }
  updateAura(wp, w, dt) {
    const S = this.S, area = w.area * S.area, R = 70 * area; wp.auraR = R; wp.cd -= dt;
    if (wp.cd <= 0) {
      wp.cd = Math.max(0.2, w.interval * S.cooldown / 1000 * 0.6);   // [DESIGN] fator 0.6
      for (const e of this.near(this.p.x, this.p.y, R)) if (Math.hypot(e.x - this.p.x, e.y - this.p.y) < R + e.r) this.hit(e, this.dmgOf(w), { knockback: 0 });
      this.fx.push({ x: this.p.x, y: this.p.y, r: R, life: 0.2, k: 'aura', col: COLORS.GARLIC });
    }
  }
  updateProj(dt) {
    const p = this.p;
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const q = this.proj[i]; q.life -= dt;
      if (q.life <= 0) { if (q.explode) this.explode(q); this.proj.splice(i, 1); continue; }
      if (q.k === 'rect') {
        const cx = p.x + q.side * (q.rw / 2 + q.off); 
        for (const e of this.near(cx, q.y, q.rw)) if (!q.hits.has(e) && Math.abs(e.x - cx) < q.rw / 2 + e.r && Math.abs(e.y - q.y) < q.rh / 2 + e.r) { q.hits.add(e); this.hit(e, q.dmg, q.w, 1); }
        continue;
      }
      if (q.g) q.vy += q.g * dt;
      if (q.boom) { q.vx -= q.vx * 1.4 * dt * 0 + 0; const t = 2.4 - q.life; if (t > 0.6 && !q.turned) { q.turned = true; } if (q.turned) { const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1; q.vx += dx / d * 1800 * dt; q.vy += dy / d * 1800 * dt; } else { q.vx *= 1 - 1.6 * dt; q.vy *= 1 - 1.6 * dt; } }
      q.x += q.vx * dt; q.y += q.vy * dt;
      for (const e of this.near(q.x, q.y, q.r)) {
        if (Math.hypot(e.x - q.x, e.y - q.y) > q.r + e.r) continue;
        if (q.rehit) { const last = q.hitsT && q.hitsT.get(e); if (last != null && q.life > last - q.rehit) continue; (q.hitsT || (q.hitsT = new Map())).set(e, q.life); }
        else if (q.hits.has(e)) continue;
        q.hits.add(e); this.hit(e, q.dmg, q.w, 1);
        if (q.explode) { this.explode(q); q.life = 0; break; }
        if (!q.rehit && --q.pen <= 0) { q.life = 0; break; }
      }
    }
  }
  explode(q) {
    this.fx.push({ x: q.x, y: q.y, r: q.explode, life: 0.25, k: 'aura', col: '#ff7a3a' });
    for (const e of this.near(q.x, q.y, q.explode)) if (Math.hypot(e.x - q.x, e.y - q.y) < q.explode + e.r) this.hit(e, q.dmg * 0.5, q.w, 1);
    q.explode = 0;
  }
  updatePickups(dt) {
    const p = this.p, R = 60 * (1 + this.S.magnet);
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i], dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
      if (d < R) g.pull = true;
      if (g.pull) { const s = 420; g.x += dx / d * s * dt; g.y += dy / d * s * dt; }
      if (d < 14) { if (g.t === 'GEM') this.xpGain(g.v); else p.gold += g.v * this.stat('greed'); this.gems.splice(i, 1); }
    }
    for (let i = this.chests.length - 1; i >= 0; i--) { const c = this.chests[i]; if (Math.hypot(p.x - c.x, p.y - c.y) < 28) { this.openChest(); this.chests.splice(i, 1); } }
  }
}

// =========================== RENDER / INPUT (somente no navegador) ===========================
if (typeof window !== 'undefined') {
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let g = null, state = 'select', selIdx = 0, last = performance.now();
  const PAL = ['#e0b070','#d06090','#70a0e0','#e0804a','#b090f0','#a0c060','#90e0c0','#e0d070','#c0c0d0'];
  const keys = {}, charIds = Object.keys(D.characters);
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; if (g) { g.W = cv.width; g.H = cv.height; } };
  addEventListener('resize', size); size();
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state === 'select') { if (e.code === 'ArrowLeft' || e.code === 'KeyA') selIdx = (selIdx + charIds.length - 1) % charIds.length; if (e.code === 'ArrowRight' || e.code === 'KeyD') selIdx = (selIdx + 1) % charIds.length; if (e.code === 'Enter' || e.code === 'Space') start(); const n = +e.key; if (n >= 1 && n <= charIds.length) { selIdx = n - 1; start(); } return; }
    if (g.choices) { const n = +e.key; if (n >= 1 && n <= g.choices.length) g.choose(n - 1); }
    if (e.code === 'KeyP' || e.code === 'Escape') g.paused = !g.paused;
    if (g.over && (e.code === 'KeyR' || e.code === 'Enter')) { state = 'select'; }
  });
  addEventListener('keyup', e => keys[e.code] = false);
  cv.addEventListener('click', e => {
    if (state === 'select') { const i = Math.floor(e.clientX / (cv.width / charIds.length)); selIdx = clamp(i, 0, charIds.length - 1); start(); return; }
    if (g.choices) { const n = g.choices.length, bw = 300, gap = 20, x0 = cv.width / 2 - (n * bw + (n - 1) * gap) / 2; for (let i = 0; i < n; i++) { const x = x0 + i * (bw + gap); if (e.clientX >= x && e.clientX <= x + bw && e.clientY > cv.height / 2 - 110 && e.clientY < cv.height / 2 + 110) g.choose(i); } }
  });
  function start() { g = new Game(charIds[selIdx]); g.W = cv.width; g.H = cv.height; state = 'play'; window.__game = g; }
  const input = () => ({ x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) });
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const txt = (t, x, y, sz, col, al) => { ctx.font = `${sz}px system-ui,Segoe UI,sans-serif`; ctx.fillStyle = col || '#fff'; ctx.textAlign = al || 'left'; ctx.fillText(t, x, y); };

  function enemyColor(id) { return { BAT1:'#7a5aa8', BAT2:'#8a4a9a', BAT3:'#a04a8a', BAT4:'#c0405a', BAT5:'#c0405a', ZOMBIE:'#5a8a4a', SKELETON:'#d8d8c0', GHOST:'#bfd4ee', MUDMAN1:'#8a6a3a', MUDMAN2:'#7a5a2a', FLOWER:'#e060a0', WEREWOLF:'#7a5a40' }[id] || (id.startsWith('XL') ? '#c0a040' : id.startsWith('BOSS') ? '#d04040' : '#a0a0a0'); }
  function drawEnemy(e, cx, cy) {
    const x = e.x - cx, y = e.y - cy, r = e.r, c = e.flash > 0 ? '#fff' : enemyColor(e.id);
    ctx.fillStyle = c;
    if (e.id.startsWith('BAT') && !e.id.startsWith('BAT_')) { ctx.beginPath(); ctx.moveTo(x - r * 1.4, y - r * 0.6); ctx.lineTo(x, y + r * 0.2); ctx.lineTo(x + r * 1.4, y - r * 0.6); ctx.lineTo(x + r * 0.5, y + r * 0.6); ctx.lineTo(x - r * 0.5, y + r * 0.6); ctx.fill(); }
    else if (e.id === 'GHOST') { ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(x, y - 2, r, Math.PI, 0); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.fill(); ctx.globalAlpha = 1; }
    else if (e.id === 'FLOWER') { for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.047) * r * 0.6, y + Math.sin(i * 1.047) * r * 0.6, r * 0.45, 0, 7); ctx.fill(); } ctx.fillStyle = '#ffe070'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#000'; ctx.fillRect(x - r * 0.45, y - r * 0.25, 3, 3); ctx.fillRect(x + r * 0.2, y - r * 0.25, 3, 3);
    if (e.boss && e.id !== 'BOSS_XLDEATH') { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); const b = D.enemies[e.id].bName; }
    if (e.id === 'BOSS_XLDEATH') { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 3; ctx.stroke(); txt('MORTE', x, y - r - 8, 14, '#ff4a4a', 'center'); }
  }
  function render() {
    const W = cv.width, H = cv.height;
    if (state === 'select') {
      ctx.fillStyle = '#12121c'; ctx.fillRect(0, 0, W, H);
      txt('SURVIVORS-LIKE — reconstrução', W / 2, 80, 34, '#ffd24a', 'center');
      txt(`Palco: ${D.stage.name}   |   ← → / 1-3 / clique para escolher`, W / 2, 118, 16, '#9aa', 'center');
      charIds.forEach((id, i) => {
        const c = D.characters[id][0], x = W / charIds.length * (i + 0.5), y = H / 2, sel = i === selIdx;
        const cw = Math.min(300, W / charIds.length - 12), hw = cw / 2, cols = Math.floor(cw / 8); ctx.fillStyle = sel ? '#262640' : '#171724'; ctx.fillRect(x - hw, y - 150, cw, 300); ctx.strokeStyle = sel ? '#ffd24a' : '#333'; ctx.lineWidth = 2; ctx.strokeRect(x - hw, y - 150, cw, 300);
        ctx.fillStyle = PAL[i % PAL.length]; ctx.beginPath(); ctx.arc(x, y - 70, 28, 0, 7); ctx.fill();
        txt(`${i + 1}. ${c.charName}`, x, y - 10, 18, '#fff', 'center'); txt(`Arma: ${D.weapons[c.startingWeapon][0].name}`, x, y + 16, 15, '#cfd', 'center');
        txt(`Vida ${c.maxHp}  Arm. ${c.armor}`, x, y + 38, 13, '#aab', 'center');
        const words = c.description.split(' '); let line = '', yy = y + 70; for (const w of words) { if ((line + w).length > cols) { txt(line, x, yy, 12, '#889', 'center'); yy += 17; line = ''; } line += w + ' '; } txt(line, x, yy, 12, '#889', 'center');
      });
      return;
    }
    const cx = g.p.x - W / 2, cy = g.p.y - H / 2;
    ctx.fillStyle = '#16301f'; ctx.fillRect(0, 0, W, H);
    const T = 96, ox = -((cx % T) + T) % T, oy = -((cy % T) + T) % T;
    for (let x = ox - T; x < W + T; x += T) for (let y = oy - T; y < H + T; y += T) {
      const gx = Math.floor((x + cx) / T), gy = Math.floor((y + cy) / T), h = (gx * 73856093 ^ gy * 19349663) >>> 0;
      ctx.fillStyle = h % 5 === 0 ? '#1d3a26' : '#183623'; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      if (h % 7 === 0) { ctx.fillStyle = '#0f2418'; ctx.beginPath(); ctx.arc(x + (h % 60) + 20, y + ((h >> 8) % 60) + 20, 6, 0, 7); ctx.fill(); }
    }
    for (const gm of g.gems) { ctx.fillStyle = gm.t === 'GEM' ? '#4ad0ff' : '#ffd24a'; ctx.beginPath(); ctx.arc(gm.x - cx, gm.y - cy, gm.t === 'GEM' ? 4 : 5, 0, 7); ctx.fill(); }
    for (const c of g.chests) { ctx.fillStyle = '#c8902a'; ctx.fillRect(c.x - cx - 12, c.y - cy - 9, 24, 18); ctx.strokeStyle = '#fff'; ctx.strokeRect(c.x - cx - 12, c.y - cy - 9, 24, 18); }
    for (const e of g.enemies) if (e.x > cx - 60 && e.x < cx + W + 60 && e.y > cy - 60 && e.y < cy + H + 60) drawEnemy(e, cx, cy);
    for (const f of g.fx) { const a = f.life / (f.k === 'bolt' ? 0.3 : 0.25); ctx.globalAlpha = Math.max(0, a); if (f.k === 'poof') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x - cx, f.y - cy, f.r * (2 - a), 0, 7); ctx.fill(); } else if (f.k === 'bolt') { ctx.strokeStyle = f.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(f.x - cx, f.y - cy - 400); ctx.lineTo(f.x - cx + 8, f.y - cy - 200); ctx.lineTo(f.x - cx - 8, f.y - cy - 100); ctx.lineTo(f.x - cx, f.y - cy); ctx.stroke(); } else { ctx.strokeStyle = f.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x - cx, f.y - cy, f.r, 0, 7); ctx.stroke(); } ctx.globalAlpha = 1; }
    for (const q of g.proj) {
      ctx.fillStyle = q.col; ctx.strokeStyle = q.col;
      if (q.k === 'rect') { const x = g.p.x + q.side * (q.rw / 2 + q.off); ctx.globalAlpha = 0.75; ctx.fillRect(x - q.rw / 2 - cx, q.y - q.rh / 2 - cy, q.rw, q.rh); ctx.globalAlpha = 1; }
      else if (q.spin) { ctx.save(); ctx.translate(q.x - cx, q.y - cy); ctx.rotate(g.t * 12); ctx.fillRect(-q.r, -q.r / 3, q.r * 2, q.r * 0.66); ctx.fillRect(-q.r / 3, -q.r, q.r * 0.66, q.r * 2); ctx.restore(); }
      else if (q.blade != null) { ctx.save(); ctx.translate(q.x - cx, q.y - cy); ctx.rotate(q.blade); ctx.fillRect(-q.r * 1.6, -2, q.r * 3.2, 4); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x - cx, q.y - cy, q.r, 0, 7); ctx.fill(); }
    }
    for (const w of g.weapons) { if (w.books) for (const b of w.books) { ctx.fillStyle = '#7ad0ff'; ctx.fillRect(b.x - cx - b.r, b.y - cy - b.r, b.r * 2, b.r * 2); ctx.strokeStyle = '#fff'; ctx.strokeRect(b.x - cx - b.r, b.y - cy - b.r, b.r * 2, b.r * 2); } if (w.auraR) { ctx.strokeStyle = 'rgba(201,245,160,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, H / 2, w.auraR, 0, 7); ctx.stroke(); } }
    // jogador
    const flick = g.p.iframes > 0 && Math.floor(g.t * 20) % 2; if (!flick) { ctx.fillStyle = PAL[charIds.indexOf(g.charId) % PAL.length]; ctx.beginPath(); ctx.arc(W / 2, H / 2, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(W / 2 + g.p.face * 4 - 2, H / 2 - 4, 3, 3); }
    for (const f of g.floating) { ctx.globalAlpha = Math.min(1, f.life * 2); txt(f.t, f.x - cx, f.y - cy, 13, f.c, 'center'); ctx.globalAlpha = 1; }
    // HUD
    const need = xpNeeded(g.p.level); ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, 18); ctx.fillStyle = '#2a6fd0'; ctx.fillRect(0, 0, W * g.p.xp / need, 18); txt(`LV ${g.p.level}`, W - 70, 14, 13);
    txt(fmt(g.t), W / 2, 48, 28, '#fff', 'center'); txt(`Ouro ${Math.floor(g.p.gold)}   Abates ${g.p.kills}`, W - 16, 48, 15, '#ffd24a', 'right');
    const hpW = 60; ctx.fillStyle = '#400'; ctx.fillRect(W / 2 - hpW / 2, H / 2 + 22, hpW, 6); ctx.fillStyle = '#e03030'; ctx.fillRect(W / 2 - hpW / 2, H / 2 + 22, hpW * clamp(g.p.hp / g.S.maxHp, 0, 1), 6);
    let ix = 8; g.weapons.forEach(w => { const d = D.weapons[w.id][0]; ctx.fillStyle = '#000a'; ctx.fillRect(ix, 26, 38, 38); ctx.fillStyle = COLORS[w.id] || (d.isEvolution ? '#ffd24a' : '#bbb'); ctx.fillRect(ix + 6, 32, 26, 26); txt(d.name.slice(0, 5), ix + 19, 78, 10, '#ccc', 'center'); txt(d.isEvolution ? 'EVO' : 'L' + w.lvl, ix + 19, 54, 11, '#000', 'center'); ix += 42; });
    ix = 8; Object.entries(g.passives).forEach(([id, lv]) => { ctx.fillStyle = '#000a'; ctx.fillRect(ix, 92, 32, 32); ctx.fillStyle = '#7a9'; ctx.fillRect(ix + 5, 97, 22, 22); txt('L' + lv, ix + 16, 112, 11, '#000', 'center'); txt(D.passives[id][0].name.slice(0, 5), ix + 16, 138, 9, '#ccc', 'center'); ix += 36; });
    g.msgs.forEach((m, i) => txt(m.t, W / 2, 90 + i * 22, 18, '#ffe9a0', 'center'));
    if (g.t > D.stage.mods.TimeLimit - 0.5 || g.reaper) txt('A MORTE CHEGOU — sobreviva', W / 2, H - 30, 18, '#ff5a5a', 'center');
    if (g.choices) {
      ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, W, H); txt('NÍVEL ' + g.p.level + ' — escolha (1-' + g.choices.length + ' ou clique)', W / 2, H / 2 - 140, 22, '#ffd24a', 'center');
      const n = g.choices.length, bw = 300, gap = 20, x0 = W / 2 - (n * bw + (n - 1) * gap) / 2;
      g.choices.forEach((o, i) => { const x = x0 + i * (bw + gap), y = H / 2 - 110, defs = (o.kind === 'w' ? D.weapons : D.passives)[o.id]; ctx.fillStyle = '#1c1c30'; ctx.fillRect(x, y, bw, 220); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, 220);
        txt(`${i + 1}. ${defs[0].name}`, x + 14, y + 32, 19, '#fff'); txt((o.kind === 'w' ? 'Arma' : 'Passivo') + ` — nível ${o.lvl}`, x + 14, y + 56, 13, '#9ab');
        const desc = o.lvl === 1 ? defs[0].description : deltaText(defs[o.lvl - 1]); const words = desc.split(' '); let line = '', yy = y + 90; for (const w of words) { if ((line + w).length > 36) { txt(line, x + 14, yy, 14, '#cde'); yy += 20; line = ''; } line += w + ' '; } txt(line, x + 14, yy, 14, '#cde'); });
    }
    if (g.paused) { ctx.fillStyle = '#0008'; ctx.fillRect(0, 0, W, H); txt('PAUSADO (P)', W / 2, H / 2, 36, '#fff', 'center'); }
    if (g.over) { ctx.fillStyle = '#000c'; ctx.fillRect(0, 0, W, H); txt(g.reaper && g.t >= D.stage.mods.TimeLimit ? 'A MORTE TE ALCANÇOU' : 'VOCÊ MORREU', W / 2, H / 2 - 40, 40, '#ff5a5a', 'center'); txt(`Tempo ${fmt(g.t)}  |  Nível ${g.p.level}  |  Abates ${g.p.kills}  |  Ouro ${Math.floor(g.p.gold)}`, W / 2, H / 2 + 10, 20, '#fff', 'center'); txt('R / Enter para voltar', W / 2, H / 2 + 50, 16, '#9ab', 'center'); }
  }
  function loop(now) { const dt = (now - last) / 1000; last = now; if (state === 'play') g.update(dt, input()); render(); requestAnimationFrame(loop); }
  if (/play/.test(location.hash)) { const m = location.hash.match(/play=(\d+)/); if (m) selIdx = clamp(+m[1] - 1, 0, charIds.length - 1); start(); const wm = location.hash.match(/warp=(\d+)/); if (wm) { for (let i = 0; i < +wm[1] * 60 && !g.over; i++) { if (g.choices) g.choose(0); g.update(1 / 60, { x: Math.cos(i / 90), y: Math.sin(i / 90) }); } } }
  requestAnimationFrame(loop);
} else { module.exports = { Game, weaponStats, ARCH, xpNeeded }; }
