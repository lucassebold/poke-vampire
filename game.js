'use strict';
// Reconstrução jogável. Números de balanceamento vêm de data.js (extraídos do resources.assets).
// Constantes marcadas [DESIGN] NÃO foram recuperadas do binário: são escolhas desta versão (ver README.md).
const D = (typeof window !== 'undefined' ? window.VS_DATA : require('./data.js'));
const T = (typeof window !== 'undefined' ? window.VS_TEXT : require('./text.js'));
const ART = (typeof window !== 'undefined' ? window.ART : require('./art.js'));
const BOSSES = (typeof window !== 'undefined' ? window.VS_BOSSES : require('./bosses.js'));
const SPR = 2;   // [DESIGN] escala dos sprites pixel-art

// ---------- [DESIGN] constantes de pixel/escala (vivem no código IL2CPP do original, não nos dados) ----------
const DMG_UNIT = 10;            // power (arma) e maxHp (inimigo) são multiplicados pela mesma unidade
const BASE_MOVE = 100;          // px/s, vezes stage.mods.PlayerPxSpeed (dado) e moveSpeed
const ENEMY_PX = 0.5;           // enemy.speed (dado, 80-200) * ENEMY_PX = px/s
const MAX_ENEMIES = 450;
const MAX_WEAPONS = 6, MAX_PASSIVES = 6;
const xpNeeded = lvl => Math.round((5 + 10 * (lvl - 1)) * Math.min(1, EARLY_XP + 0.05 * (lvl - 1)));   // [DESIGN] curva de XP não recuperada
const REVIVE_SECS = 5, REVIVE_R = 55;   // [DESIGN] ressurreição no multiplayer
// [DESIGN] começo mais caótico: mais inimigos (e mais fracos) que vão voltando ao normal; níveis iniciais mais rápidos; orbital já no início
const EARLY_SPAWN = 1.5, EARLY_HP = 0.7, EARLY_SECS = 420, EARLY_XP = 0.5;
const STARTER_ORBIT = { PORTA: 'STORM', ANTONIO: 'HALO', CIRO: 'EMBER', IMELDA: 'HALO', GENNARO: 'FROST', LAMA: 'EMBER', CAMILLO: 'FROST', DOMMARIO: 'STORM', CROCI: 'HALO' };
const EARLY_EVENTS = [[18, 'BAT_SWARM'], [50, 'BAT_SWARM'], [95, 'FLOWER_WALL'], [140, 'BAT_SWARM']];
const IFRAMES = 0.6;            // [DESIGN]
const END_MIN = D.stage.mods.TimeLimit / 60;   // 30 (dado)

const ARCH = { WHIP:'whip', VAMPIRICA:'whip', MAGIC_MISSILE:'aim', HOLY_MISSILE:'aim', KNIFE:'dir', THOUSAND:'dir',
  AXE:'lob', SCYTHE:'lob', CROSS:'boom', HEAVENSWORD:'boom', HOLYBOOK:'orbit', VESPERS:'orbit',
  GARLIC:'aura', VORTEX:'aura', FIREBALL:'rand', HELLFIRE:'rand', LIGHTNING:'strike', LOOP:'strike',
  HOLYWATER:'zone', BORA:'zone', DIAMOND:'bounce', ROCHER:'bounce', SILF:'circle', SILF2:'circle', SILF3:'circle',
  SONG:'vert', MANNAGGIA:'vert', PENTAGRAM:'nova', SIRE:'nova', LAUREL:'shield' };
const COLORS = { WHIP:'#d8c07a', MAGIC_MISSILE:'#6aa8ff', KNIFE:'#cfd6e6', AXE:'#c98b4a', CROSS:'#f4e27a', HOLYBOOK:'#7ad0ff',
  GARLIC:'#c9f5a0', FIREBALL:'#ff7a3a', LIGHTNING:'#b9a4ff', HOLYWATER:'#5ad0ff', DIAMOND:'#ff6ad0', SILF:'#fff2c0', SILF2:'#b070ff',
  SONG:'#ff7ac8', PENTAGRAM:'#c070ff', LAUREL:'#8aff8a' };
const ORB = (typeof window !== 'undefined' ? window.VS_ORB : require('./orbitals.js'));
Object.assign(ARCH, ORB.arch); Object.assign(COLORS, ORB.colors);
const BASE_OF = id => { const d = D.weapons[id] && D.weapons[id][0]; return d && d.evolvesFrom ? d.evolvesFrom[0] : id; };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function weaponStats(id, lvl) {
  const defs = D.weapons[id], s = Object.assign({}, defs[0]);
  for (let i = 1; i < lvl && i < defs.length; i++)
    for (const [k, v] of Object.entries(defs[i])) if (typeof v === 'number') s[k] = (s[k] || 0) + v;
  s.id = id;
  return s;
}
const weaponMax = id => D.weapons[id].length;
const passiveMax = id => D.passives[id].length;
// Texto de level-up: chaves e frases oficiais (lang/weaponLevelUp_*, resources.assets). O mapeamento campo->chave é inferência;
// 'power' x10 foi confirmado pelo próprio texto do jogo (Whip nv3: power +0.5 => "Base Damage up by 5.").
function fmtT(key, v) { return (T[key] || key).replace('%0', String(+(+v).toFixed(2).replace(/\.?0+$/, '') || v)); }
function describeLevel(def) {
  const out = [];
  if (def.power) out.push(fmtT('weaponLevelUp_damage', def.power * DMG_UNIT));
  if (def.area) out.push(fmtT('weaponLevelUp_area', Math.round(def.area * 100)));
  if (def.speed) out.push(fmtT('weaponLevelUp_speed', Math.round(def.speed * 100)));
  if (def.amount) out.push(fmtT(def.amount === 1 ? 'weaponLevelUp_projectile' : 'weaponLevelUp_projectiles', def.amount));
  if (def.interval) out.push(fmtT(def.interval < 0 ? 'weaponLevelUp_cooldown' : 'weaponLevelUp_cooldownIncreased', Math.abs(def.interval) / 1000));
  if (def.duration) out.push(fmtT('weaponLevelUp_effect', def.duration / 1000));
  if (def.penetrating) out.push(fmtT(def.penetrating === 1 ? 'weaponLevelUp_enemy' : 'weaponLevelUp_enemies', def.penetrating));
  if (def.charges) out.push(fmtT(def.charges === 1 ? 'weaponLevelUp_charge' : 'weaponLevelUp_charges', def.charges));
  if (def.critChance) out.push(fmtT('weaponLevelUp_critChance', Math.round(def.critChance * 100)));
  if (def.critMul) out.push(fmtT('weaponLevelUp_critMul', Math.round(def.critMul * 100)));
  return out.join(' ').trim();
}

class Game {
  constructor(charId, opts) { this.opts = opts || {}; this.mp = !!this.opts.mp; this.players = []; this.cur = null; this.reset(charId); }
  static radiusOf(id) { const a = ART.enemies[id]; if (a && Game.sizeOf) { const sz = Game.sizeOf(a.variants[0][0]); if (sz) return Math.max(8, Math.max(sz[0], sz[1]) * SPR * (a.scale || 1) * 0.3); } return 12; }
  reset(charId) {
    const m = D.stage.mods;
    this.t = 0; this.over = false; this.paused = false; this.won = false; this.endReason = null; this.endAt = 0;
    this.enemies = []; this.proj = []; this.gems = []; this.fx = []; this.chests = []; this.zones = [];
    this.eproj = []; this.tele = [];
    this.pending = []; this.msgs = [];
    this.spawnAcc = 0; this.waveIdx = -1; this.mods = m; this.floating = [];
    this.reaper = false;
    this.phase = 'normal'; this.phaseT = 0; this.boss = null; this.queuedBoss = null; this.bossesDone = 0; this.tension = 0;
    this.dmgLog = []; this.ev = []; this.wantEvents = false;
    this.eidN = 0; this.earlyIdx = 0; this.nextPid = 1; this.players = []; this.cur = null; this.liveP = [];
    if (charId) this.addPlayer(charId, 'Player');
  }
  // ---- jogadores: cada um com vida, nível, XP, armas e passivos próprios ----
  addPlayer(charId, nick, o) {
    o = o || {}; const chr = D.characters[charId], c = chr[0];
    const P = { id: this.nextPid++, nick: nick || 'Player', charId, chr, alive: true, waiting: false, left: false, netMove: false, input: { x: 0, y: 0 }, moveBudget: 0.5, ackSeq: 0, catchUp: false, choiceT: 0, popupT: 0,
      p: { x: 0, y: 0, fx: 1, fy: 0, hp: c.maxHp, level: 1, xp: 0, gold: 0, kills: 0, iframes: 0, face: 1, moving: false, dmg: 0, diedAt: null },
      S: null, weapons: [], passives: {}, choices: null, popup: null, levelUps: 0, shieldCharges: 0, revUsed: 0 };
    this.players.push(P); const prev = this.cur; this.cur = P;
    this.addWeapon(c.startingWeapon);
    const orb = STARTER_ORBIT[charId]; if (orb && !this.has(orb) && D.weapons[orb]) { this.addWeapon(orb); const ow = this.has(orb); if (ow) ow.lvl = 2; }   // poder que orbita desde o começo
    this.recalc(); P.p.hp = P.S.maxHp;
    this.cur = prev || P;
    if (o.late) this.catchUpJoin(P);
    this.liveP = this.players.filter(Q => Q.alive && !Q.left);
    return P;
  }
  removePlayer(P) { P.left = true; P.alive = false; P.waiting = false; this.liveP = this.players.filter(Q => Q.alive && !Q.left); }
  anchor() { const live = this.players.filter(P => P.alive && !P.left); const P = live.length ? live[Math.floor(Math.random() * live.length)] : this.players[0]; return P.p; }
  nActive() { return Math.max(1, this.players.filter(P => !P.left).length); }
  earlyBoost() { const d = Math.max(0, 1 - this.t / EARLY_SECS); return 1 + EARLY_SPAWN * d / Math.sqrt(this.nActive()); }
  earlyHp() { return EARLY_HP + (1 - EARLY_HP) * Math.min(1, this.t / EARLY_SECS); }
  curseMul() { let m = 1; for (const P of this.players) if (P.alive && P.S) m = Math.max(m, P.S.curse); return m; }
  applyMove(P, ix, iy, dt) {
    const p = P.p, l = Math.hypot(ix, iy);
    if (l > 0) { ix /= l; iy /= l; p.fx = ix; p.fy = iy; if (ix) p.face = ix > 0 ? 1 : -1; }
    const sp = BASE_MOVE * this.mods.PlayerPxSpeed * P.S.moveSpeed;
    p.x += ix * sp * dt; p.y += iy * sp * dt; p.moving = l > 0;
  }
  // quem entra no meio recebe um "catch-up": ~60% do nível médio dos amigos, com armas/itens escolhidos automaticamente
  catchUpJoin(P) {
    const others = this.players.filter(Q => Q !== P && Q.alive && !Q.left); if (!others.length || this.t < 30) return;
    const avg = others.reduce((s, Q) => s + Q.p.level, 0) / others.length, target = Math.max(1, Math.round(avg * 0.6)), prev = this.cur;
    this.cur = P;
    for (let lv = 1; lv < target; lv++) { P.p.level = lv + 1; this.autoPick(); }
    P.p.level = target; this.recalc(); P.p.hp = P.S.maxHp; P.catchUp = true; P.p.iframes = 10; P.tpAt = this.t;
    const A = pick(others).p; P.p.x = A.x + rnd(-90, 90); P.p.y = A.y + rnd(-90, 90); P.tpAt = this.t;
    this.cur = prev || P;
    if (this.phase !== 'normal') { P.alive = false; P.waiting = true; }   // durante aviso/luta de chefe: espera acabar
  }
  activate(P) { P.waiting = false; P.alive = true; const others = this.players.filter(Q => Q !== P && Q.alive && !Q.left); if (others.length) { const A = pick(others).p; P.p.x = A.x + rnd(-90, 90); P.p.y = A.y + rnd(-90, 90); } P.p.iframes = 10; P.tpAt = this.t; this.liveP = this.players.filter(Q => Q.alive && !Q.left); }
  autoPick() {
    const opts = this.buildOptions(); if (!opts.length) return;
    const wc = this.weapons.length, pc = Object.keys(this.passives).length;
    const wts = opts.map(o => o.kind === 'w' ? (o.lvl > 1 ? 4 : (wc < 4 ? 3 : 0.3)) : (o.lvl > 1 ? 2 : (pc < 4 ? 1.5 : 0.2)));
    let r = Math.random() * wts.reduce((a, b) => a + b, 0), i = 0; for (; i < opts.length - 1; i++) { r -= wts[i]; if (r <= 0) break; }
    this.applyUpgrade(opts[i]);
  }
  giveXp(P, v) {   // XP para um jogador específico (catch-up dobra o ganho até alcançar os amigos)
    const prev = this.cur; this.cur = P; let m = 1;
    if (P.catchUp) { m = 2; const o = this.players.filter(Q => Q !== P && Q.alive && !Q.left), avg = o.length ? o.reduce((s, Q) => s + Q.p.level, 0) / o.length : 0; if (P.p.level >= avg - 3) P.catchUp = false; }
    this.xpGain(v * m); this.cur = prev;
  }
  emit(o) { if (this.wantEvents) { o.pid = this.cur ? this.cur.id : 0; this.ev.push(o); } }
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
  addWeapon(id) { this.weapons.push({ id, lvl: 1, cd: ARCH[id] === 'nova' ? 20 : 0.4, queue: 0, qt: 0, side: 1, orbitOn: true, orbitT: 0, angle: 0, sh: { on: false, t: 0, charges: 0 } }); }
  has(id) { return this.weapons.find(w => w.id === id); }
  // ---- level up ----
  xpGain(v) {
    this.p.xp += v * this.stat('growth');
    while (this.p.xp >= xpNeeded(this.p.level)) { this.p.xp -= xpNeeded(this.p.level); this.p.level++; this.levelUps++; this.recalc(); this.emit({ k: 'levelup' }); }
    if (this.levelUps > 0 && !this.choices) this.openChoices();
  }
  buildOptions() {
    const opts = [];
    for (const w of this.weapons) if (w.lvl < weaponMax(w.id) && !D.weapons[w.id][0].isEvolution) opts.push({ kind: 'w', id: w.id, lvl: w.lvl + 1 });
    for (const [id, lv] of Object.entries(this.passives)) if (lv < passiveMax(id)) opts.push({ kind: 'p', id, lvl: lv + 1 });
    if (this.weapons.length < MAX_WEAPONS) for (const id of Object.keys(D.weapons)) if (!D.weapons[id][0].isEvolution && !this.has(id)) opts.push({ kind: 'w', id, lvl: 1 });
    if (Object.keys(this.passives).length < MAX_PASSIVES) for (const id of Object.keys(D.passives)) if (!(id in this.passives)) opts.push({ kind: 'p', id, lvl: 1 });
    return opts;
  }
  openChoices() {
    const opts = this.buildOptions();
    const n = this.stat('luck') > 1.2 ? 4 : 3, out = [];
    while (out.length < n && opts.length) out.push(opts.splice(Math.floor(Math.random() * opts.length), 1)[0]);
    if (!out.length) { this.p.gold += 25; this.levelUps = 0; this.msg('Everything is maxed out: +25 gold'); return; }
    this.choices = out; if (this.mp) this.cur.choiceT = 15;   // multiplayer: não pausa; escolha automática em 15 s
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
  // ---- chest / evolução (requires/evoSynergy/requiresMax/evolvesFrom vêm do JSON) ----
  evoReady(w) {
    const def = D.weapons[w.id][0], evo = def.evoInto && D.weapons[def.evoInto];
    if (def.isEvolution || w.lvl < weaponMax(w.id) || !evo) return null;
    const e0 = evo[0], need = e0.requires || def.evoSynergy || [];
    const ok = need.every(r => (r in this.passives) || (this.has(r) && this.has(r).lvl >= weaponMax(r)));
    const okMax = (e0.requiresMax || []).every(r => r === w.id || (this.has(r) && this.has(r).lvl >= weaponMax(r)));
    return ok && okMax ? def.evoInto : null;
  }
  openChest() {
    this.emit({ k: 'chest' });
    for (const w of this.weapons) {
      const into = this.evoReady(w); if (!into) continue;
      const e0 = D.weapons[into][0];
      this.popup = { title: T.treasure_header, line: 'Evolution: ' + e0.name, icon: ART.icons[into] };
      const from = e0.evolvesFrom || [w.id];
      w.id = into; w.lvl = 1; w.cd = 0.5;
      this.weapons = this.weapons.filter(x => x === w || !from.includes(x.id));
      this.emit({ k: 'evolve', id: into });
      return;
    }
    const ups = [];
    for (const w of this.weapons) if (w.lvl < weaponMax(w.id) && !D.weapons[w.id][0].isEvolution) ups.push({ kind: 'w', id: w.id, lvl: w.lvl + 1 });
    for (const [id, lv] of Object.entries(this.passives)) if (lv < passiveMax(id)) ups.push({ kind: 'p', id, lvl: lv + 1 });
    if (ups.length) { const o = pick(ups), df = (o.kind === 'w' ? D.weapons : D.passives)[o.id]; this.applyUpgrade(o); this.popup = { title: T.treasure_header, line: df[0].name + ' — Level ' + o.lvl, icon: ART.icons[o.id] }; }
    else { this.p.gold += 50; this.popup = { title: T.treasure_header, line: '+50 gold' }; }
  }
  msg(t) { this.msgs.push({ t, life: 3 }); if (this.wantEvents) this.ev.push({ k: 'msg', t, pid: 0 }); }
  speedOf(P) { return BASE_MOVE * this.mods.PlayerPxSpeed * P.S.moveSpeed; }
  // ---- spawn ----
  viewR() { return Math.hypot(this.W || 1280, this.H || 720) / 2 + 40; }
  spawn(id, x, y, extra) {
    const d = D.enemies[id]; if (!d || this.enemies.length >= MAX_ENEMIES + 100 + (this.mp ? 120 * (this.nActive() - 1) : 0)) return null;
    const boss = id.startsWith('BOSS_') || id === 'BAT4' || id.startsWith('XL') && d.xp >= 3 && d.level >= 10, cu = this.curseMul(), hpm = this.mp ? 1 + 0.25 * (this.nActive() - 1) : 1, eid = ++this.eidN;
    const e = Object.assign({ id, x, y, eid, hp: d.maxHp * DMG_UNIT * this.mods.EnemyHealthMultiplier * cu * hpm * this.earlyHp(), max: d.maxHp * DMG_UNIT * hpm * this.earlyHp(),
      spd: d.speed * ENEMY_PX * this.mods.EnemySpeed * cu, pow: d.power, kb: d.knockback, xp: d.xp, r: Game.radiusOf(id), variant: eid % ((ART.enemies[id] && ART.enemies[id].variants.length) || 1), scale: (ART.enemies[id] && ART.enemies[id].scale) || 1, seed: ((eid * 0.6180339) % 1) * 10, vx: 0, vy: 0, kx: 0, ky: 0, hitT: {}, boss, fixed: false, flash: 0, slowT: 0 }, extra || {});
    if (id === 'BOSS_XLDEATH') { e.r = 40; e.hp = 1e9; e.max = 1e9; }
    this.enemies.push(e); return e;
  }
  ring(id) { const A = this.anchor(), a = rnd(0, 6.283), r = this.viewR(); return this.spawn(id, A.x + Math.cos(a) * r, A.y + Math.sin(a) * r); }
  waveFor(min) { const ws = D.stage.waves; return ws[Math.min(min, ws.length - 1)]; }
  runEvent(ev) {
    const t = ev.eventType;
    if (ev.chance != null && Math.random() * 100 > ev.chance) return;
    const reps = ev.repeat || 1;
    for (let r = 0; r < reps; r++) this.pending.push({ at: this.t + (ev.delay || 0) / 1000 + r * 2.5, t });
  }
  doEvent(t) {
    const A = this.anchor(), px = A.x, py = A.y, R = this.viewR();
    if (t === 'BAT_SWARM' || t === 'GHOST_SWARM') {
      const id = t === 'BAT_SWARM' ? 'BAT1' : 'GHOST', a = rnd(0, 6.283), dx = Math.cos(a), dy = Math.sin(a);
      for (let i = 0; i < 28; i++) { const o = (i - 14) * 24; const e = this.spawn(id, px + dx * R - dy * o, py + dy * R + dx * o, { swarm: true }); if (e) { e.vx = -dx * e.spd * 1.8; e.vy = -dy * e.spd * 1.8; } }
    } else if (t === 'FLOWER_WALL') {
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283, e = this.spawn('FLOWER', px + Math.cos(a) * 420, py + Math.sin(a) * 420, { swarm: true }); if (e) { e.vx = -Math.cos(a) * 28; e.vy = -Math.sin(a) * 28; } }
    } else if (t === 'CYCLE_COMPLETE') {
      if (this.boss) { this.boss.hp = 0; this.boss.silent = true; }
      this.eproj.length = 0; this.tele.length = 0; this.phase = 'normal'; this.queuedBoss = null;
      this.reaper = true; this.msg(this.mp ? 'You survived 30 minutes!' : 'Death has arrived…'); this.emit({ k: 'reaper' }); if (this.mp) this.endAt = this.t + 4;   // multiplayer: a Morte chega e a partida termina nos resultados
    }
  }
  // ---- dano no jogador (escudo do Laurel absorve) ----
  hurt(dmg) {
    const p = this.p; if (p.iframes > 0) return;
    if (this.shieldCharges > 0) {
      this.shieldCharges--; p.iframes = 0.35; this.emit({ k: 'shield', x: p.x, y: p.y });
      for (const w of this.weapons) if (ARCH[w.id] === 'shield') w.sh.charges = this.shieldCharges;
      return;
    }
    p.hp -= dmg; p.iframes = IFRAMES; this.floating.push({ x: p.x, y: p.y - 20, t: String(Math.round(dmg)), life: 0.7, c: '#ff5555' });
    this.emit({ k: 'hurt', x: p.x, y: p.y });
  }
  // ---- chefes ----
  dps() { const t = this.t; this.dmgLog = this.dmgLog.filter(d => t - d[0] < 20); let s = 0; for (const d of this.dmgLog) s += d[1]; return s / 20; }
  clearEnemies() {
    for (const e of this.enemies) { if (e.bossId) continue; this.gems.push({ x: e.x, y: e.y, v: e.xp, t: 'GEM', pull: false }); this.fx.push({ x: e.x, y: e.y, r: e.r, life: 0.3, k: 'poof' }); }
    this.enemies = this.enemies.filter(e => e.bossId);
    this.pending.length = 0;
  }
  startWarn(min) {
    this.phase = 'warn'; this.phaseT = 0; this.bossKey = BOSSES.schedule[min]; this.queuedBoss = null;
    this.clearEnemies(); this.emit({ k: 'bossWarn', key: this.bossKey }); this.emit({ k: 'shake', a: 8, t: 0.6 });
  }
  spawnBoss() {
    const def = BOSSES.defs[this.bossKey], a = rnd(-0.6, 0.6) - Math.PI / 2, r = 330, A = this.anchor();
    const dps = Math.max(40, this.dps()), hp = clamp(dps * BOSSES.TARGET_SECONDS, def.hpMin, def.hpMin * 4);
    const e = { id: 'BOSS_' + this.bossKey, bossId: this.bossKey, def, x: A.x + Math.cos(a) * r, y: A.y + Math.sin(a) * r, hp, max: hp, spd: def.speed, pow: def.pow, kb: 0, xp: 0,
      r: def.r, variant: 0, scale: def.scale, seed: 0, vx: 0, vy: 0, kx: 0, ky: 0, hitT: {}, boss: true, flash: 0, slowT: 0, state: 'move', st: 0, age: 0, aim: 0, dashDir: [1, 0], z: 0,
      cds: def.attacks.map((at, i) => 1.5 + i * 1.2), seq: [] };
    this.enemies.push(e); this.boss = e; this.phase = 'boss'; this.phaseT = 0; this.reinf = false;
    this.emit({ k: 'shake', a: 10, t: 0.5 }); this.msg(def.name);
  }
  bossDefeated(e) {
    this.boss = null; this.phase = 'outro'; this.phaseT = 0; this.bossesDone++; this.reinf = false;
    this.eproj.length = 0; this.tele.length = 0;
    const n = 1 + (this.bossesDone >= 3 ? 1 : 0) + (this.bossesDone >= 5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.chests.push({ x: e.x + (i - (n - 1) / 2) * 60, y: e.y + 10 });
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, d = 30 + (i % 4) * 22; this.gems.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, v: 3 + this.bossesDone, t: 'GEM', pull: false }); }
    for (let i = 0; i < 6; i++) this.gems.push({ x: e.x + rnd(-60, 60), y: e.y + rnd(-40, 40), v: D.pickups.COIN.value, t: 'COIN', pull: false });
    this.p.kills++;
    this.emit({ k: 'bossdie', x: e.x, y: e.y, col: e.def.col }); this.emit({ k: 'shake', a: 14, t: 0.8 }); this.msg(e.def.name + ' defeated!');
  }
  bossShoot(e, ang, speed, at, spread) {
    this.emit({ k: 'bossShot' });
    this.eproj.push({ x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: at.spr === 'rocket' ? 9 : 8, dmg: at.dmg, life: 6, spr: at.spr || 'orb', col: e.def.col, ang });
  }
  bossAttack(e, at) {
    const p = this.p, a0 = Math.atan2(p.y - e.y, p.x - e.x);
    if (at.k === 'fan') { for (let i = 0; i < at.n; i++) this.bossShoot(e, a0 + (at.n === 1 ? 0 : (i / (at.n - 1) - 0.5) * at.spread), at.speed, at); }
    else if (at.k === 'ring') { const o = rnd(0, 6.28); for (let i = 0; i < at.n; i++) this.bossShoot(e, o + i / at.n * 6.283, at.speed, at); }
    else if (at.k === 'spiral') { e.seq.push({ left: at.n, t: 0, ang: rnd(0, 6.28), at }); }
    else if (at.k === 'rain') { for (let i = 0; i < at.n; i++) this.tele.push({ x: p.x + rnd(-230, 230), y: p.y + rnd(-170, 170), r: at.r, t: -i * 0.09, dur: at.tele, dmg: at.dmg, kind: 'circle', col: e.def.col, spr: at.spr }); }
    else if (at.k === 'shock') { e.state = 'cast'; e.st = at.tele; e.after = 'move'; this.tele.push({ x: e.x, y: e.y, r: at.r, t: 0, dur: at.tele, dmg: at.dmg, kind: 'circle', col: e.def.col, owner: e }); }
    else if (at.k === 'hop') { e.state = 'hop'; e.st = 0; e.hopDur = at.tele; e.hopFrom = [e.x, e.y]; e.hopTo = [p.x, p.y]; this.tele.push({ x: p.x, y: p.y, r: at.r, t: 0, dur: at.tele, dmg: at.dmg, kind: 'circle', col: e.def.col }); }
    else if (at.k === 'dash') { e.state = 'tele'; e.st = at.tele; e.dashDir = [Math.cos(a0), Math.sin(a0)]; e.dashAt = at; }
  }
  updateBoss(e, dt) {
    const p = this.p, def = e.def; e.age += dt; e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.face = dx >= 0 ? 1 : -1;
    for (let i = e.seq.length - 1; i >= 0; i--) {
      const s = e.seq[i]; s.t -= dt;
      if (s.t <= 0) { this.bossShoot(e, s.ang, s.at.speed, s.at); s.ang += 0.55; s.left--; s.t = 0.08; if (s.left <= 0) e.seq.splice(i, 1); }
    }
    if (e.state === 'move') {
      e.x += dx / d * e.spd * dt; e.y += dy / d * e.spd * dt; e.dashing = false;
      def.attacks.forEach((at, i) => { e.cds[i] -= dt; if (e.cds[i] <= 0 && e.state === 'move') { this.bossAttack(e, at); e.cds[i] = at.cd * rnd(0.9, 1.15); } });
    } else if (e.state === 'tele') { e.st -= dt; if (e.st <= 0) { e.state = 'dash'; e.st = e.dashAt.dur; this.emit({ k: 'shake', a: 4, t: 0.2 }); this.emit({ k: 'bossDash' }); } }
    else if (e.state === 'dash') { e.dashing = true; e.x += e.dashDir[0] * e.dashAt.speed * dt; e.y += e.dashDir[1] * e.dashAt.speed * dt; e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.dashing = false; } }
    else if (e.state === 'cast') { e.st -= dt; if (e.st <= 0) e.state = e.after || 'move'; }
    else if (e.state === 'hop') {
      e.st += dt; const k = Math.min(1, e.st / e.hopDur);
      e.x = e.hopFrom[0] + (e.hopTo[0] - e.hopFrom[0]) * k; e.y = e.hopFrom[1] + (e.hopTo[1] - e.hopFrom[1]) * k; e.z = Math.sin(k * Math.PI) * 90;
      if (k >= 1) { e.z = 0; e.state = 'move'; this.emit({ k: 'shake', a: 7, t: 0.3 }); this.emit({ k: 'bossLand' }); }
    }
    return d;
  }
  updateEnemyShots(dt) {
    const live = this.liveP;
    for (let i = this.eproj.length - 1; i >= 0; i--) {
      const q = this.eproj[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
      if (q.life <= 0) { this.eproj.splice(i, 1); continue; }
      let hit = false;
      for (const P of live) if (Math.hypot(P.p.x - q.x, P.p.y - q.y) < q.r + 10) { this.cur = P; this.hurt(Math.max(1, q.dmg - P.S.armor)); hit = true; break; }
      if (hit) this.eproj.splice(i, 1);
    }
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const z = this.tele[i]; z.t += dt;
      if (z.owner && z.owner.hp > 0) { z.x = z.owner.x; z.y = z.owner.y; }
      if (z.t >= z.dur) {
        for (const P of live) if (Math.hypot(P.p.x - z.x, P.p.y - z.y) < z.r + 8) { this.cur = P; this.hurt(Math.max(1, z.dmg - P.S.armor)); }
        this.emit({ k: 'boom', x: z.x, y: z.y, r: z.r, col: z.col, spr: z.spr, boss: true }); this.tele.splice(i, 1);
      }
    }
  }
  // ---- main update ----
  update(dt, input) {
    if (input && this.players[0]) this.players[0].input = input;
    if (this.over || this.paused) return;
    if (!this.mp && this.players.some(P => P.choices || P.popup)) return;   // 1 jogador: menus pausam como antes
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const live = this.liveP = this.players.filter(P => P.alive && !P.left);
    // por jogador: movimento (no servidor o movimento chega pela rede), regeneração, escolha automática
    for (const P of live) {
      this.cur = P; const p = P.p, S = P.S;
      if (!P.netMove) this.applyMove(P, P.input.x, P.input.y, dt);
      p.hp = Math.min(S.maxHp, p.hp + S.regen * dt); if (this.godMode) p.hp = S.maxHp;   // godMode: só para testes
      p.iframes = Math.max(0, p.iframes - dt); P.moveBudget = Math.min(0.5, P.moveBudget + dt);
      if (this.mp && P.choices) { P.choiceT -= dt; if (P.choiceT <= 0) this.choose(Math.floor(Math.random() * P.choices.length)); }
    }
    if (this.mp) for (const P of this.players) { if (P.popup) { if (!P.popupT) P.popupT = 3.5; P.popupT -= dt; if (P.popupT <= 0) { P.popup = null; P.popupT = 0; } } else P.popupT = 0; }
    this.cur = live[0] || this.players[0];
    // ondas
    const min = Math.floor(this.t / 60), bossMin = BOSSES.schedule[min] && min > 0;
    if (min !== this.waveIdx) {
      this.waveIdx = min; const w = this.waveFor(min);
      if (bossMin) this.queuedBoss = min;
      else { for (const b of w.bosses || []) { if (this.phase === 'normal') { const e = this.ring(b); if (e) e.boss = true; } } for (const ev of w.events || []) this.runEvent(ev); }
      if (min === 0) for (let i = 0; i < D.stage.startingSpawns * 2 * (this.mp ? 1 + 0.6 * (this.nActive() - 1) : 1); i++) this.ring(pick(w.enemies));
    }
    // fases do chefe
    this.phaseT += dt;
    if (this.phase === 'normal' && this.queuedBoss) this.startWarn(this.queuedBoss);
    else if (this.phase === 'warn' && this.phaseT >= 2.2) this.spawnBoss();
    else if (this.phase === 'outro' && this.phaseT >= 1.8) { this.phase = 'normal'; this.phaseT = 0; const w2 = this.waveFor(min); if (w2.enemies.length) for (let i = 0; i < 8; i++) this.ring(pick(w2.enemies)); }
    if (this.phase === 'boss' && this.phaseT > 90 && !this.reinf) { this.reinf = true; this.msg('Reinforcements!'); }
    if (this.phase === 'normal') for (const P of this.players) if (P.waiting && !P.left) this.activate(P);   // quem esperava o chefe entra agora
    if (this.phase === 'normal') while (this.earlyIdx < EARLY_EVENTS.length && this.t >= EARLY_EVENTS[this.earlyIdx][0]) this.doEvent(EARLY_EVENTS[this.earlyIdx++][1]);   // levas extras no começo
    this.tension += ((this.phase === 'warn' || this.phase === 'boss' ? 1 : 0) - this.tension) * Math.min(1, dt * 1.8);
    const w = this.waveFor(min);
    if (this.phase === 'normal' || this.reinf) {
      const cu = this.curseMul(), nq = this.mp ? 1 + 0.6 * (this.nActive() - 1) : 1, cap = MAX_ENEMIES + (this.mp ? 120 * (this.nActive() - 1) : 0);
      const eb = this.earlyBoost(); this.spawnAcc += dt * 1000 * cu * nq * eb;
      while (w.enemies.length && this.spawnAcc >= w.frequency) {
        this.spawnAcc -= w.frequency;
        const alive = this.enemies.filter(e => !e.swarm).length, floor = w.minimum * nq * eb;   // [DESIGN] semântica de "minimum": piso de inimigos vivos
        const n = Math.ceil((alive < floor ? Math.min(12, Math.ceil((floor - alive) / 3)) : 1) * cu);
        for (let i = 0; i < n && this.enemies.length < cap; i++) this.ring(pick(w.enemies));
      }
      if (!w.enemies.length) this.spawnAcc = 0;
      for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.t) { this.doEvent(this.pending[i].t); this.pending.splice(i, 1); }
    } else for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].t === 'CYCLE_COMPLETE' && this.pending[i].at <= this.t) { this.doEvent('CYCLE_COMPLETE'); this.pending.splice(i, 1); }
    if (this.t >= D.stage.mods.TimeLimit && !this.won) { this.won = true; }
    this.buildGrid();
    this.updateEnemies(dt);
    this.updateEnemyShots(dt);
    for (const P of live) { this.cur = P; for (const wp of this.weapons) this.updateWeapon(wp, dt); }
    this.updateProj(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    for (const f of this.fx) f.life -= dt; this.fx = this.fx.filter(f => f.life > 0);
    for (const f of this.floating) { f.life -= dt; f.y -= 30 * dt; } this.floating = this.floating.filter(f => f.life > 0);
    for (const m of this.msgs) m.life -= dt; this.msgs = this.msgs.filter(m => m.life > 0);
    // quedas: revive (Krochi) ou fica fora até o fim da partida
    for (const P of live) {
      if (this.godMode && P.p.hp <= 0) P.p.hp = P.S.maxHp;   // godMode: só para testes
      if (P.p.hp > 0) continue; this.cur = P;
      if ((P.revUsed || 0) < P.S.revivals) { P.revUsed = (P.revUsed || 0) + 1; P.p.hp = P.S.maxHp * 0.5; P.p.iframes = 3; this.msg('REVIVED!'); }
      else { P.alive = false; P.p.diedAt = this.t; P.tomb = { x: P.p.x, y: P.p.y }; P.reviveT = 0; P.choices = null; P.levelUps = 0; P.popup = null; this.emit({ k: 'playerdown', x: P.p.x, y: P.p.y }); }
    }
    this.liveP = this.players.filter(P => P.alive && !P.left);
    for (const P of this.players) {   // ressurreição: um amigo vivo fica perto da lápide por REVIVE_SECS (a barra recua se ele se afastar)
      if (P.alive || P.waiting || P.left || !P.tomb) continue;
      const near = this.liveP.some(Q => Math.hypot(Q.p.x - P.tomb.x, Q.p.y - P.tomb.y) < REVIVE_R);
      P.reviveT = near ? P.reviveT + dt : Math.max(0, P.reviveT - dt * 2);
      if (P.reviveT >= REVIVE_SECS) {
        P.alive = true; P.p.hp = P.S.maxHp * 0.5; P.p.iframes = 10; P.p.x = P.tomb.x; P.p.y = P.tomb.y; P.p.diedAt = null; P.tpAt = this.t; P.tomb = null; P.reviveT = 0;
        this.liveP = this.players.filter(Q => Q.alive && !Q.left); this.cur = P; this.emit({ k: 'revive', x: P.p.x, y: P.p.y }); this.msg(P.nick + ' is back!');
      }
    }
    if (!this.over && !this.players.some(P => (P.alive || P.waiting) && !P.left)) { this.over = true; this.endReason = 'dead'; this.cur = this.players[0]; this.emit({ k: 'gameover' }); }
    if (!this.over && this.endAt && this.t >= this.endAt) { this.over = true; this.endReason = 'win'; this.emit({ k: 'gameover' }); }   // multiplayer: aguentar 30 min = VITÓRIA
    this.cur = this.players[0] || this.cur;
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
    const live = this.liveP; if (!live.length) return;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) { this.kill(e, i); continue; }
      e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt);
      let P = live[0], bd = Infinity; for (const Q of live) { const dd = (Q.p.x - e.x) ** 2 + (Q.p.y - e.y) ** 2; if (dd < bd) { bd = dd; P = Q; } }
      this.cur = P; const p = P.p, S = P.S;
      let dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.bossId) { d = this.updateBoss(e, dt); }
      else if (e.swarm) { e.x += e.vx * dt; e.y += e.vy * dt; if (d > this.viewR() + 700) { this.enemies.splice(i, 1); continue; } }
      else {
        const sl = e.slowT > 0 ? 0.5 : 1, sp = e.spd * sl;   // FLOWER: speed 20 (dado) -> quase parada
        e.x += (dx / d * sp) * dt + e.kx * dt; e.y += (dy / d * sp) * dt + e.ky * dt;
        e.kx *= 0.9; e.ky *= 0.9;
        if (d > this.viewR() + 500 && !e.boss) { const a = rnd(0, 6.283); e.x = p.x + Math.cos(a) * this.viewR(); e.y = p.y + Math.sin(a) * this.viewR(); }
      }
      if (d < e.r + 12 && p.iframes <= 0) {
        const dmg = e.id === 'BOSS_XLDEATH' ? 1e9 : Math.max(1, (e.dashing ? e.dashAt.dmg : e.pow) - S.armor);
        if (e.id === 'BOSS_XLDEATH') { p.hp -= dmg; p.iframes = IFRAMES; } else this.hurt(dmg);
      }
    }
    // separação leve entre inimigos (vizinhos de grid)
    for (const e of this.enemies) {
      if (e.swarm || e.bossId) continue;
      for (const o of this.near(e.x, e.y, e.r)) {
        if (o === e || o.swarm || o.bossId) continue; const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = e.r + o.r;
        if (d > 0 && d < m) { const f = (m - d) * 0.05; e.x += dx / d * f; e.y += dy / d * f; }
      }
    }
  }
  kill(e, i) {
    this.enemies.splice(i, 1);
    if (e.bossId) { if (e.silent) { this.boss = null; return; } this.bossDefeated(e); return; }
    const P = e.lastP || this.cur; P.p.kills++;
    this.gems.push({ x: e.x, y: e.y, v: e.xp, t: 'GEM', pull: false });
    if (Math.random() < 0.08 * P.S.greed) this.gems.push({ x: e.x + 8, y: e.y, v: D.pickups.COIN.value, t: 'COIN', pull: false });
    if (e.boss && e.id !== 'BOSS_XLDEATH') this.chests.push({ x: e.x, y: e.y });
    this.fx.push({ x: e.x, y: e.y, r: e.r, life: 0.25, k: 'poof' });
    this.emit({ k: 'kill', x: e.x, y: e.y, r: e.r });
  }
  hit(e, dmg, w, kbMul) {
    let crit = false;
    if (w && w.critChance && Math.random() < w.critChance) { dmg *= w.critMul || 2; crit = true; }
    if (e.id === 'BOSS_XLDEATH') return;
    e.hp -= dmg; e.flash = 0.08; this.dmgLog.push([this.t, dmg]); e.lastP = this.cur; this.cur.p.dmg += dmg;
    if (w && w.knockback !== 0 && e.kb > 0) { const dx = e.x - this.p.x, dy = e.y - this.p.y, d = Math.hypot(dx, dy) || 1, k = (w.knockback == null ? 0.5 : w.knockback) * e.kb * 220 * (kbMul || 1); e.kx += dx / d * k; e.ky += dy / d * k; }
    if (this.floating.length < 80) this.floating.push({ x: e.x, y: e.y - e.r, t: String(Math.round(dmg)), life: 0.5, c: crit ? '#ffe45a' : '#fff' });
    this.emit({ k: 'hit', x: e.x, y: e.y, id: w && w.id, crit, big: dmg >= 40, dmg: Math.round(dmg) });
  }
  dmgOf(w) { return w.power * this.S.power * DMG_UNIT; }
  // ---- armas ----
  updateWeapon(wp, dt) {
    const w = weaponStats(wp.id, wp.lvl), S = this.S, arch = ARCH[wp.id];
    wp.angle += dt;
    if (arch === 'orbit') return this.updateOrbit(wp, w, dt);
    if (arch === 'aura') return this.updateAura(wp, w, dt);
    if (arch === 'ring') return this.updateRing(wp, w, dt);
    if (arch === 'shield') return this.updateShield(wp, w, dt);
    if (arch === 'nova') return this.updateNova(wp, w, dt);
    wp.cd -= dt;
    if (wp.cd <= 0 && wp.queue <= 0) {
      if (this.phase === 'warn' || this.phase === 'outro') { wp.cd = 0.3; return; }
      wp.queue = Math.max(1, Math.round(w.amount + S.amount)); wp.qt = 0; wp.total = wp.queue; wp.cd = Math.max(0.15, w.interval * S.cooldown / 1000); wp.shot = 0; wp.nT = null;
      if (ARCH[wp.id] === 'circle') wp.cd = Math.max(wp.cd, w.duration * S.duration / 1000 * 0.8);   // uma leva por vez (evita sobreposição de 4 levas)
    }
    if (wp.queue > 0) {
      wp.qt -= dt;
      while (wp.queue > 0 && wp.qt <= 0) { this.fire(wp, w, wp.shot++); wp.queue--; wp.qt += Math.max(0.02, (w.repeatInterval || 100) / 1000); }
    }
  }
  fire(wp, w, n) {
    this.emit({ k: 'fire', id: wp.id });
    const p = this.p, S = this.S, arch = ARCH[wp.id], dmg = this.dmgOf(w), area = w.area * S.area, spd = w.speed * S.speed * this.mods.ProjectileSpeed;
    const base = { w, dmg, own: this.cur, am: area, tier: wp.lvl, evo: !!D.weapons[wp.id][0].isEvolution, hits: new Set(), pen: Math.max(1, w.penetrating || 1), from: wp.id, col: COLORS[wp.id] || COLORS[BASE_OF(wp.id)] || '#fff' };
    if (arch === 'whip') {
      const side = (n % 2 === 0 ? 1 : -1) * p.face;
      this.proj.push(Object.assign(base, { k: 'rect', x: p.x, y: p.y - 6 - Math.floor(n / 2) * 26, rw: 150 * area, rh: 30 * area, side, life: 0.18, off: 18 }));
      this.emit({ k: 'whip', id: wp.id });
    } else if (arch === 'aim') {
      const t = this.nearest(p.x, p.y, 700), a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 420 * spd, vy: Math.sin(a) * 420 * spd, r: 9 * area, life: 2 }));
    } else if (arch === 'dir') {
      const a = Math.atan2(p.fy, p.fx), off = (n - ((w.amount + S.amount - 1) / 2)) * 12;
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off, vx: Math.cos(a) * 620 * spd, vy: Math.sin(a) * 620 * spd, r: 9 * area, life: 1.4, blade: a }));
    } else if (arch === 'lob') {
      const lt = this.nearest(p.x, p.y, 420), lvx = lt ? Math.max(-260, Math.min(260, (lt.x - p.x) / 1.1)) + rnd(-40, 40) : rnd(-120, 120);   // [DESIGN] arremesso mira o inimigo mais próximo
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: lvx * spd, vy: -420 * spd, g: 760, r: 22 * area, life: 3, spin: true }));
    } else if (arch === 'boom') {
      const t = this.nearest(p.x, p.y, 700), a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 360 * spd, vy: Math.sin(a) * 360 * spd, r: 18 * area, life: 2.4, boom: true, pen: 1e9, spin: true, rehit: 0.4 }));
    } else if (arch === 'rand') {
      const vis = this.visible(), t = vis.length ? pick(vis) : null, a = t ? Math.atan2(t.y - p.y, t.x - p.x) : rnd(0, 6.283);
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * 380 * spd, vy: Math.sin(a) * 380 * spd, r: 14 * area, life: 2, explode: 42 * area, pen: 1 }));
    } else if (arch === 'strike') {
      const reach = 150 + 28 * wp.lvl, vis0 = this.visible(), vis = vis0.filter(e => Math.hypot(e.x - p.x, e.y - p.y) < reach); if (!vis.length) return; const t = pick(vis);   // [DESIGN] raio de alcance cresce com o nível: não limpa a tela antes de os inimigos chegarem
      this.fx.push({ x: t.x, y: t.y, r: 40 * area, life: 0.3, k: 'bolt', col: base.col, tier: wp.lvl, id: wp.id });
      for (const e of this.near(t.x, t.y, 40 * area)) if (Math.hypot(e.x - t.x, e.y - t.y) < 40 * area + e.r) this.hit(e, dmg, w, 0.5);
      this.emit({ k: 'bolt', x: t.x, y: t.y });
    } else if (arch === 'zone') {
      const vis = this.visible(), t = vis.length ? pick(vis) : null, bora = wp.id === 'BORA', n2 = Math.max(1, Math.round(w.amount + S.amount));
      const ang = n / n2 * 6.283, off = [Math.cos(ang) * 80, Math.sin(ang) * 80], dur = Math.max(1, w.duration * S.duration / 1000);
      this.zones.push({ own: this.cur, x: t && !bora ? t.x + rnd(-30, 30) : p.x + off[0], y: t && !bora ? t.y + rnd(-30, 30) : p.y + off[1], r0: 52 * area * (bora ? 1.2 : 1), r: 52 * area, g: 1, life: dur, dur, delay: bora ? 0.15 : 0.3, tick: 0, every: (w.hitBoxDelay || 500) / 1000, dmg, w, follow: bora, off, from: wp.id, tier: wp.lvl, evo: base.evo, col: base.col, seed: Math.random() * 9 });
    } else if (arch === 'bounce') {
      const t = this.nearest(p.x, p.y, 600), a = t && Math.random() < 0.6 ? Math.atan2(t.y - p.y, t.x - p.x) + rnd(-0.5, 0.5) : rnd(0, 6.283), v = 300 * spd;
      this.proj.push(Object.assign(base, { k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 16 * area, life: Math.max(1, w.duration * S.duration / 1000), bounce: true, evoBounce: wp.id === 'ROCHER', pen: 1e9, rehit: Math.max(0.3, (w.hitBoxDelay || 500) / 1000), spin: true }));
    } else if (arch === 'circle') {
      const tot = wp.total || 1, dur = Math.max(1.5, w.duration * S.duration / 1000);
      this.proj.push(Object.assign(base, { k: 'bird', x: p.x, y: p.y, t: 0, a0: n / tot * 6.283 + (wp.salvo = (wp.salvo || 0)) * 0.9, dir: wp.id === 'SILF2' ? -1 : 1, spin: 2.2 * spd + 0.6, dur, life: dur, r0: 26, rmax: (base.evo ? 90 : 72) * Math.sqrt(area) + 20, r: 15 * Math.sqrt(area), pen: 1e9, rehit: 0.8, share: 'sh_' + wp.id, shareCd: base.evo ? 0.3 : Math.max(0.5, 1.6 - 0.1 * (wp.lvl - 1)), dmg: base.evo ? base.dmg : base.dmg * Math.min(1, 0.85 + 0.03 * (wp.lvl - 1)), ang: 0 }));   // [DESIGN] calibrado com _evidence/dps_harness.js
      if (n === tot - 1) wp.salvo++;
    } else if (arch === 'vert') {
      const side = (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2), mann = wp.id === 'MANNAGGIA';
      this.proj.push(Object.assign(base, { k: 'vrect', x: p.x + side * Math.max(56, 56 * area) * 0.9, y: p.y, rw: 56 * area, rh: 560, life: Math.max(0.45, w.duration * S.duration / 1000 * (mann ? 1 : 1)), dur: Math.max(0.45, w.duration * S.duration / 1000), slow: mann, pen: 1e9 }));
    }
  }
  updateOrbit(wp, w, dt) {
    const S = this.S, perm = wp.id === 'VESPERS', dur = (w.duration * S.duration) / 1000, cd = (w.interval * S.cooldown) / 1000;
    wp.orbitT += dt;
    if (!perm) { if (wp.orbitOn && wp.orbitT >= dur) { wp.orbitOn = false; wp.orbitT = 0; } else if (!wp.orbitOn && wp.orbitT >= cd * 0.6) { wp.orbitOn = true; wp.orbitT = 0; this.emit({ k: 'orbit', id: wp.id }); } }
    if (!wp.orbitOn) { wp.books = []; return; }
    const n = Math.max(1, Math.round(w.amount + S.amount)), area = w.area * S.area, R = 85 * Math.sqrt(area), sp = 3.2 * w.speed * S.speed * this.mods.ProjectileSpeed;
    wp.books = [];
    for (let i = 0; i < n; i++) {
      const a = wp.angle * sp + i / n * 6.283, x = this.p.x + Math.cos(a) * R, y = this.p.y + Math.sin(a) * R, r = 15 * area; wp.books.push({ x, y, r, a });
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
      for (const e of this.near(this.p.x, this.p.y, R)) if (Math.hypot(e.x - this.p.x, e.y - this.p.y) < R + e.r) this.hit(e, this.dmgOf(w), { knockback: 0, id: wp.id });
      this.fx.push({ x: this.p.x, y: this.p.y, r: R, life: 0.2, k: 'aura', col: COLORS.GARLIC });
    }
  }
  // ---- orbitais novos (HALO/EMBER/FROST/STORM e evoluções): ver orbitals.js ----
  updateRing(wp, w, dt) {
    const cfg = ORB.cfg[wp.id], S = this.S, p = this.p, area = w.area * S.area, sa = Math.sqrt(area), evo = !!D.weapons[wp.id][0].isEvolution;
    const n = Math.max(1, Math.round(w.amount + S.amount)), spd = w.speed * S.speed * this.mods.ProjectileSpeed, dmg = this.dmgOf(w), hw = { knockback: cfg.kb, id: wp.id };
    wp.orbs = []; if (!wp.zt) wp.zt = {};
    cfg.rings.forEach((ring, ri) => {
      const cnt = n + ring.add, R = ring.R * sa;
      for (let i = 0; i < cnt; i++) {
        const a = wp.angle * cfg.spin * spd * ring.dir + i / cnt * 6.283, x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R, r = cfg.r * sa, key = wp.id + ri + '_' + i;
        wp.orbs.push({ x, y, r, a, ri, i, kind: cfg.kind, dir: ring.dir });
        if (cfg.kind === 'storm') {
          if (wp.zt[key] == null) wp.zt[key] = rnd(0, 1); wp.zt[key] -= dt;
          if (wp.zt[key] <= 0) { wp.zt[key] = Math.max(0.3, w.interval * S.cooldown / 1000); this.zap(x, y, cfg, dmg, hw, wp); }
          continue;
        }
        for (const e of this.near(x, y, r)) {
          if (Math.hypot(e.x - x, e.y - y) > r + e.r) continue; const last = e.hitT[key] || -9;
          if (this.t - last >= cfg.rehit) { e.hitT[key] = this.t; this.hit(e, dmg, hw, 1); if (cfg.slow) e.slowT = Math.max(e.slowT, cfg.slow); }
        }
        if (cfg.kind === 'ember') {
          wp.zt[key] = (wp.zt[key] || 0) - dt;
          if (wp.zt[key] <= 0 && this.zones.length < 70) { wp.zt[key] = cfg.embers; const zr = 22 * sa * (evo ? 1.3 : 1); this.zones.push({ own: this.cur, x, y, r0: zr, r: zr, g: 1, life: 0.9, dur: 0.9, delay: 0, tick: 0, every: 0.3, dmg: dmg * 0.35, w: hw, follow: false, from: wp.id, tier: wp.lvl, evo, col: COLORS[wp.id], seed: Math.random() * 9 }); }
        }
      }
    });
    if (cfg.field) { wp.field = cfg.field * sa; for (const e of this.near(p.x, p.y, wp.field)) if (Math.hypot(e.x - p.x, e.y - p.y) < wp.field + e.r) e.slowT = Math.max(e.slowT, 0.4); } else wp.field = 0;
  }
  zap(x, y, cfg, dmg, hw, wp) {
    let tx = x, ty = y; const done = new Set();
    for (let c = 0; c < cfg.chain; c++) {
      const rng = c === 0 ? cfg.range : 140; let best = null, bd = rng * rng;
      for (const e of this.enemies) { if (done.has(e)) continue; const d = (e.x - tx) ** 2 + (e.y - ty) ** 2; if (d < bd) { bd = d; best = e; } }
      if (!best) break; done.add(best); this.hit(best, dmg * (c ? 0.7 : 1), hw, 0);
      this.fx.push({ k: 'zap', x, y, x1: tx, y1: ty, x2: best.x, y2: best.y, life: 0.2, col: COLORS[wp.id], id: wp.id }); this.emit({ k: 'zap', x: best.x, y: best.y }); tx = best.x; ty = best.y;
    }
  }
  updateShield(wp, w, dt) {
    const S = this.S, sh = wp.sh, cd = w.interval * S.cooldown / 1000, dur = w.duration * S.duration / 1000;
    if (!sh.on) { wp.cd -= dt; if (wp.cd <= 0 && this.phase !== 'warn') { sh.on = true; sh.t = dur; sh.charges = Math.max(1, Math.round(w.charges || 1)); this.shieldCharges = sh.charges; this.emit({ k: 'shieldup', x: this.p.x, y: this.p.y }); } }
    else { sh.t -= dt; sh.charges = this.shieldCharges; if (sh.t <= 0 || this.shieldCharges <= 0) { sh.on = false; this.shieldCharges = 0; wp.cd = cd; } }
    wp.shR = 50 * Math.sqrt(w.area * S.area);
  }
  updateNova(wp, w, dt) {
    const S = this.S; wp.cd -= dt;
    if (wp.cd > 0 || this.phase === 'warn' || this.phase === 'outro') return;
    wp.cd = w.interval * S.cooldown / 1000;
    const sire = wp.id === 'SIRE', hw = (this.W || 1280) / 2, hh = (this.H || 720) / 2, p = this.p;
    this.fx.push({ x: p.x, y: p.y, r: 380, life: 1.3, k: 'nova', id: wp.id, tier: wp.lvl }); this.emit({ k: 'nova', id: wp.id });
    this.emit({ k: 'shake', a: 10, t: 0.7 }); this.emit({ k: 'flash', a: 0.55 });
    for (const e of this.enemies) if (!e.bossId && e.id !== 'BOSS_XLDEATH' && Math.abs(e.x - p.x) < hw + 40 && Math.abs(e.y - p.y) < hh + 40) e.hp = 0;
    if (sire) {
      for (let i = 0; i < 30; i++) this.gems.push({ x: p.x + rnd(-hw, hw), y: p.y + rnd(-hh, hh), v: 2, t: 'GEM', pull: true });
      for (const g of this.gems) g.pull = true;
    } else {
      const keep = w.chance || 0.1;
      this.gems = this.gems.filter(g => !(Math.abs(g.x - p.x) < hw && Math.abs(g.y - p.y) < hh) || Math.random() < keep);
    }
  }
  updateZones(dt) {
    let p = this.p;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; if (z.own) { this.cur = z.own; p = z.own.p; }
      if (z.delay > 0) { z.delay -= dt; continue; }
      z.life -= dt; if (z.life <= 0) { this.zones.splice(i, 1); continue; }
      if (z.follow) { z.g += ((p.moving ? 1.7 : 1) - z.g) * Math.min(1, dt * 2.2); z.x = p.x + z.off[0]; z.y = p.y + z.off[1]; }
      const R = z.r * z.g; z.rr = R; z.tick -= dt;
      if (z.tick <= 0) { z.tick = z.every; for (const e of this.near(z.x, z.y, R)) if (Math.hypot(e.x - z.x, e.y - z.y) < R + e.r * 0.6) this.hit(e, z.dmg, z.w, 0); }
    }
  }
  blast(x, y, r, dmg, w, col) {
    this.fx.push({ x, y, r, life: 0.3, k: 'aura', col });
    for (const e of this.near(x, y, r)) if (Math.hypot(e.x - x, e.y - y) < r + e.r) this.hit(e, dmg, w, 1);
    this.emit({ k: 'boom', x, y, r, col });
  }
  updateProj(dt) {
    let p = this.p;
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const q = this.proj[i]; if (q.own) { this.cur = q.own; p = q.own.p; } q.life -= dt;
      if (q.life <= 0) { if (q.explode) this.explode(q); this.proj.splice(i, 1); continue; }
      if (q.k === 'rect') {
        const cx = p.x + q.side * (q.rw / 2 + q.off);
        for (const e of this.near(cx, q.y, q.rw)) if (!q.hits.has(e) && Math.abs(e.x - cx) < q.rw / 2 + e.r && Math.abs(e.y - q.y) < q.rh / 2 + e.r) { q.hits.add(e); this.hit(e, q.dmg, q.w, 1); }
        continue;
      }
      if (q.k === 'vrect') {
        q.x += (p.x - (q.px == null ? p.x : q.px)); q.px = p.x; q.y = p.y;
        for (const e of this.enemies) if (!q.hits.has(e) && Math.abs(e.x - q.x) < q.rw / 2 + e.r && Math.abs(e.y - q.y) < q.rh / 2 + e.r) { q.hits.add(e); if (q.slow) e.slowT = 2.5; this.hit(e, q.dmg, q.w, 0.3); }
        continue;
      }
      if (q.k === 'bird') {
        q.t += dt; const ang = q.a0 + q.dir * q.t * q.spin, prog = Math.min(1, q.t / q.dur), rad = q.r0 + (q.rmax - q.r0) * Math.sin(Math.PI * prog);
        q.px = q.x; q.py = q.y; q.x = p.x + Math.cos(ang) * rad; q.y = p.y + Math.sin(ang) * rad; q.ang = Math.atan2(q.y - q.py, q.x - q.px);
      } else {
        if (q.g) q.vy += q.g * dt;
        if (q.boom) { const t = 2.4 - q.life; if (t > 0.6 && !q.turned) { q.turned = true; } if (q.turned) { const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1; q.vx += dx / d * 1800 * dt; q.vy += dy / d * 1800 * dt; } else { q.vx *= 1 - 1.6 * dt; q.vy *= 1 - 1.6 * dt; } }
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.bounce) {
          const hw = (this.W || 1280) / 2 - 16, hh = (this.H || 720) / 2 - 16; let b = false;
          if (q.x < p.x - hw) { q.x = p.x - hw; q.vx = Math.abs(q.vx); b = true; } else if (q.x > p.x + hw) { q.x = p.x + hw; q.vx = -Math.abs(q.vx); b = true; }
          if (q.y < p.y - hh) { q.y = p.y - hh; q.vy = Math.abs(q.vy); b = true; } else if (q.y > p.y + hh) { q.y = p.y + hh; q.vy = -Math.abs(q.vy); b = true; }
          if (b) { this.emit({ k: 'bounce', x: q.x, y: q.y, col: q.col }); if (q.evoBounce) this.blast(q.x, q.y, 70 * q.am, q.dmg * 0.6, q.w, q.col); }
        }
      }
      for (const e of this.near(q.x, q.y, q.r)) {
        if (Math.hypot(e.x - q.x, e.y - q.y) > q.r + e.r) continue;
        if (q.rehit) { const last = q.hitsT && q.hitsT.get(e); if (last != null && q.life > last - q.rehit) continue; (q.hitsT || (q.hitsT = new Map())).set(e, q.life); }
        else if (q.hits.has(e)) continue;
        if (q.share) { const lh = e.hitT[q.share] || -9; if (this.t - lh < q.shareCd) continue; e.hitT[q.share] = this.t; }   // recarga por inimigo compartilhada entre as aves
        q.hits.add(e); this.hit(e, q.dmg, q.w, 1);
        if (q.explode) { this.explode(q); q.life = 0; break; }
        if (!q.rehit && --q.pen <= 0) { q.life = 0; break; }
      }
    }
  }
  explode(q) {
    this.fx.push({ x: q.x, y: q.y, r: q.explode, life: 0.25, k: 'aura', col: '#ff7a3a' });
    this.emit({ k: 'boom', x: q.x, y: q.y, r: q.explode, col: q.col });
    for (const e of this.near(q.x, q.y, q.explode)) if (Math.hypot(e.x - q.x, e.y - q.y) < q.explode + e.r) this.hit(e, q.dmg * 0.5, q.w, 1);
    q.explode = 0;
  }
  updatePickups(dt) {
    const live = this.liveP;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]; let tgt = g.tp && g.tp.alive && !g.tp.left ? g.tp : null;
      if (!tgt) { let bd = Infinity; for (const P of live) { const R = 60 * (1 + P.S.magnet), d = Math.hypot(P.p.x - g.x, P.p.y - g.y); if (d < R && d < bd) { bd = d; tgt = P; } } }
      if (!tgt && g.pull && live.length) { let bd = Infinity; for (const P of live) { const d = Math.hypot(P.p.x - g.x, P.p.y - g.y); if (d < bd) { bd = d; tgt = P; } } }
      if (!tgt) continue;
      g.tp = tgt; g.pull = true; const p = tgt.p, dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1, s = 420;
      g.x += dx / d * s * dt; g.y += dy / d * s * dt;
      if (d < 14) {
        this.cur = tgt; this.emit({ k: 'pickup', t: g.t });
        if (g.t === 'GEM') { this.giveXp(tgt, g.v); if (this.mp) for (const Q of live) if (Q !== tgt) this.giveXp(Q, g.v * 0.3); }   // 30% do XP vai para os amigos
        else p.gold += g.v * tgt.S.greed;
        this.gems.splice(i, 1);
      }
    }
    for (let i = this.chests.length - 1; i >= 0; i--) { const c = this.chests[i]; for (const P of live) if (Math.hypot(P.p.x - c.x, P.p.y - c.y) < 28) { this.cur = P; this.openChest(); this.chests.splice(i, 1); break; } }
    this.cur = live[0] || this.players[0];
  }
}

// acessores do "jogador atual": o código por-jogador existente (this.p, this.S, this.weapons, ...) continua valendo
for (const k of ['p', 'S', 'weapons', 'passives', 'choices', 'popup', 'levelUps', 'shieldCharges', 'revUsed', 'chr', 'charId'])
  Object.defineProperty(Game.prototype, k, { get() { return this.cur[k]; }, set(v) { this.cur[k] = v; }, configurable: true });

const API = { Game, weaponStats, weaponMax, passiveMax, ARCH, xpNeeded, describeLevel, SPR, DMG_UNIT, COLORS, END_MIN, BASE_OF, BOSSES };
if (typeof window !== 'undefined') window.VS = API; else module.exports = API;
