'use strict';
// Cliente online: monta um objeto com a MESMA forma do Game (para o render.js desenhar sem mudanças grandes) a partir dos snapshots do servidor.
// Posição do próprio jogador = local (sem atraso); inimigos/outros jogadores = suavizados em direção ao último snapshot; projéteis = extrapolados pela velocidade.
(() => {
  const B = window.VS_BOSSES, ART = window.ART, V = window.VS;
  const KINDS = ['blade', 'ember', 'frost', 'storm'];
  const wrap = a => { while (a > Math.PI) a -= 6.283185; while (a < -Math.PI) a += 6.283185; return a; };
  const lerpK = (dt, rate) => 1 - Math.exp(-dt * rate);
  const SEND_MS = 50, HEART_MS = 250;

  class RemoteGame {
    constructor(url, info, hooks) {
      this.online = true; this.mp = true; this.hooks = hooks || {};
      this.W = 1280; this.H = 720; this.t = 0; this.phase = 'normal'; this.phaseT = 0; this.tension = 0; this.tnT = 0; this.boss = null; this.bossKey = null; this.reaper = false;
      this.over = false; this.paused = false; this.won = false; this.endReason = null; this.results = null; this.endTime = 0;
      this.enemies = []; this.proj = []; this.zones = []; this.fx = []; this.gems = []; this.chests = []; this.eproj = []; this.tele = []; this.floating = []; this.msgs = []; this.ev = []; this.wantEvents = true;
      this.others = []; this.tombs = []; this.reviving = false; this.roster = []; this.emotes = []; this.myId = 0; this.state = 'connecting'; this.error = null; this.late = false;
      this.charId = info.ch; this.nick = info.name;
      this.p = { x: 0, y: 0, fx: 1, fy: 0, hp: 100, level: 1, xp: 0, gold: 0, kills: 0, iframes: 0, face: 1, moving: false, dmg: 0 };
      this.S = { maxHp: 100 }; this.me = { st: 0, spd: 100, need: 5 }; this.weapons = []; this.passives = {}; this.choices = null; this.choiceT = 0; this.popup = null; this.shieldCharges = 0;
      this.dead = false; this.waiting = false; this.specId = 0; this.cam = this.p;
      this.eMap = new Map(); this.zMap = new Map(); this.oMap = new Map(); this.eids = []; this.snapAt = performance.now(); this.snapPrev = 0; this.gotSnap = false;
      this.sendAt = 0; this.heartAt = 0; this.lastSent = null; this.lastTp = 0; this.emoAt = 0; this.visState = new Map(); this.myVis = []; this.pingMs = 0; this.snapN = 0; this.snapGap = 0.066;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.state = 'joining'; this.send({ t: 'join', name: info.name, ch: info.ch }); };
      this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.onMsg(m); };
      this.ws.onclose = () => { if (this.state !== 'closed') { this.state = 'closed'; if (!this.over && !this.error) this.error = 'Disconnected from the server'; } };
      this.ws.onerror = () => { if (!this.error) this.error = 'Could not reach the server'; };
    }
    send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    close() { this.state = 'closed'; try { this.ws.close(); } catch (e) { /* ignore */ } }
    choose(i) { if (this.choices && i >= 0 && i < this.choices.length) { this.send({ t: 'pick', i }); this.choices = null; this.choiceT = 0; } }
    emote(k) { const now = performance.now(); if (now - this.emoAt < 1000) return; this.emoAt = now; this.send({ t: 'emo', k }); }
    cycleSpec(dir) { const live = this.others.filter(o => o.st === 0); if (!live.length) return; let i = live.findIndex(o => o.id === this.specId); i = (i + (dir || 1) + live.length) % live.length; this.specId = live[i].id; }
    nameOf(id) { const r = this.roster.find(q => q.id === id); return r ? r.nick : '?'; }
    charOf(id) { const r = this.roster.find(q => q.id === id); return r ? r.ch : this.charId; }

    onMsg(m) {
      if (m.t === 'welcome') { this.myId = m.you; this.eids = m.eids; this.late = !!m.late; this.state = 'playing'; }
      else if (m.t === 'roster') { this.roster = m.players; }
      else if (m.t === 'snap') this.applySnap(m);
      else if (m.t === 'end') { this.over = true; this.endReason = m.reason; this.results = m.results; this.endTime = m.time; this.choices = null; this.popup = null; }
      else if (m.t === 'emo') { this.emotes.push({ id: m.id, k: m.k, t: 3 }); if (this.emotes.length > 12) this.emotes.shift(); }
      else if (m.t === 'full') { this.error = 'All rooms are full. Try again in a minute.'; this.state = 'closed'; }
    }

    applySnap(m) {
      const now = performance.now(); this.snapGap = this.gotSnap ? Math.min(0.5, Math.max(0.02, (now - this.snapAt) / 1000)) : 0.066; this.snapAt = now; this.snapN++;
      this.t = m.gt; this.phase = m.ph; this.phaseT = m.pt; this.tnT = m.tn; this.bossKey = m.bk; this.reaper = !!m.rp;
      const me = m.me; this.me = me; const p = this.p;
      if (!this.gotSnap || me.tp !== this.lastTp || Math.hypot(me.x - p.x, me.y - p.y) > 250) { p.x = me.x; p.y = me.y; }
      this.lastTp = me.tp; this.gotSnap = true;
      p.hp = me.hp; p.level = me.lv; p.xp = me.xp; p.gold = me.gold; p.kills = me.kills; p.dmg = me.dmg; p.iframes = me.ifr ? 0.2 : 0; this.S.maxHp = me.mhp;
      this.dead = me.st === 1; this.waiting = me.st === 2; this.shieldCharges = me.sc; this.passives = me.ps || {};
      const hadChoices = !!this.choices; this.choices = me.ch ? me.ch.map(o => ({ kind: o[0], id: o[1], lvl: o[2] })) : null; this.choiceT = me.ct || 0;
      if (this.choices && !hadChoices && this.hooks.onChoices) this.hooks.onChoices();
      this.popup = me.pop ? { title: me.pop.title, line: me.pop.line, icon: me.pop.icon, open: true } : null;
      this.myVisItems = me.vw || []; this.syncWeapons(me);
      // outros jogadores
      const seen = new Set();
      for (const a of m.pl) {
        let o = this.oMap.get(a[0]); if (!o) { o = { id: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2], vis: [] }; this.oMap.set(a[0], o); }
        o.tx = a[1]; o.ty = a[2]; o.face = a[3]; o.moving = !!a[4]; o.hp = a[5]; o.mhp = a[6]; o.lv = a[7]; o.st = a[8]; o.ifr = !!a[9]; o.sc = a[10]; o.kills = a[12];
        if (a[11]) o.visItems = a[11]; else o.visItems = null;
        if (Math.hypot(o.tx - o.x, o.ty - o.y) > 400) { o.x = o.tx; o.y = o.ty; }
        seen.add(a[0]);
      }
      for (const id of [...this.oMap.keys()]) if (!seen.has(id)) this.oMap.delete(id);
      this.others = [...this.oMap.values()];
      for (const o of this.others) { const r = this.roster.find(q => q.id === o.id); o.nick = r ? r.nick : '?'; o.ch = r ? r.ch : 'PORTA'; this.trackVis(o.id, o.visItems, o.tx, o.ty, o); }
      if (!this.oMap.has(this.specId) || (this.oMap.get(this.specId) || {}).st !== 0) { const live = this.others.find(o => o.st === 0); this.specId = live ? live.id : 0; }
      this.tombs = (m.tb || []).map(a => ({ id: a[0], x: a[1], y: a[2], pr: a[3] }));
      this.reviving = this.tombs.some(q => q.id === this.myId && q.pr > 0);
      // inimigos
      const es = new Set();
      for (const a of m.en) {
        let e = this.eMap.get(a[0]);
        if (!e) {
          const id = this.eids[a[1]], art = ART.enemies[id], nv = (art && art.variants.length) || 1;
          e = { eid: a[0], id, x: a[2], y: a[3], tx: a[2], ty: a[3], r: V.Game.radiusOf(id), variant: a[0] % nv, seed: ((a[0] * 0.6180339) % 1) * 10, scale: a[7] || (art && art.scale) || 1, vx: 0, vy: 0, hp: 1, max: 1 };
          this.eMap.set(a[0], e);
        }
        e.tx = a[2]; e.ty = a[3]; const f = a[4]; e.boss = !!(f & 1); e.flash = f & 2 ? 0.08 : 0; e.slowT = f & 4 ? 1 : 0; e.swarm = !!(f & 8); e.vx = a[6]; e.hp = a[5]; e.max = 100;
        es.add(a[0]);
      }
      for (const k of [...this.eMap.keys()]) if (!es.has(k)) this.eMap.delete(k);
      const list = [...this.eMap.values()];
      // chefe
      if (m.bo.length) {
        const b = m.bo[0]; let e = this.bossObj; if (!e || e.bossId !== b.bossId) { e = this.bossObj = { x: b.x, y: b.y, tx: b.x, ty: b.y, seed: 0 }; }
        const kx = e.x, ky = e.y; Object.assign(e, b); e.tx = b.x; e.ty = b.y; e.x = kx; e.y = ky; e.def = B.defs[b.bossId]; e.dashDir = b.dd || [1, 0]; e.dashAt = { tele: b.dtl || 1 };
        if (Math.hypot(e.tx - e.x, e.ty - e.y) > 500) { e.x = e.tx; e.y = e.ty; }
        list.push(e); this.boss = e;
      } else { this.boss = null; this.bossObj = null; }
      this.enemies = list;
      // itens no chão
      this.gems = m.gm.map(a => ({ x: a[0], y: a[1], v: a[2], t: a[3] ? 'COIN' : 'GEM' })); this.chests = m.cs.map(a => ({ x: a[0], y: a[1] }));
      // projéteis e inimigos com tiro: guardam a origem para extrapolar
      this.proj = m.pj; for (const q of this.proj) { q.x0 = q.x; q.y0 = q.y; if (q.k === 'rect') { q.mine = q.pid === this.myId; q.y0 = q.y; q.oy0 = q.oy; } }
      this.eproj = m.ep; for (const q of this.eproj) { q.x0 = q.x; q.y0 = q.y; }
      this.tele = m.tl; for (const z of this.tele) z.t0 = z.t;
      // zonas: preservam "seen" (estouro de partículas só na 1ª vez)
      const zs = new Set(), zl = [];
      for (const z of m.zn) { const old = this.zMap.get(z.zid); if (old) { Object.assign(old, z); zl.push(old); } else { z.seen = false; this.zMap.set(z.zid, z); zl.push(z); } zs.add(z.zid); }
      for (const k of [...this.zMap.keys()]) if (!zs.has(k)) this.zMap.delete(k);
      this.zones = zl;
      for (const f of m.fx) { if (this.fx.length < 120) this.fx.push(f); }
      // eventos -> partículas/sons (render) e números de dano
      for (const e of m.ev) {
        this.ev.push(e);
        if (e.k === 'hit' && this.floating.length < 60 && e.dmg) this.floating.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y - 12, t: String(e.dmg), life: 0.5, c: e.crit ? '#ffe45a' : '#fff' });
        else if (e.k === 'msg') this.msgs.push({ t: e.t, life: 3 });
      }
      if (this.msgs.length > 5) this.msgs.splice(0, this.msgs.length - 5);
    }

    // armas do próprio jogador: lista [id, lvl] + visuais (livros, orbes, aura, escudo)
    syncWeapons(me) {
      const vis = {}; for (const it of me.vw || []) vis[it.id] = it;
      this.weapons = me.w.map(a => ({ id: a[0], lvl: a[1], vis: vis[a[0]] || null }));
      this.trackVis('me', me.vw || [], this.p.x, this.p.y, null);
    }
    // converte offsets do snapshot em órbitas com velocidade angular estimada (movimento suave entre snapshots)
    trackVis(key, items, ox, oy, owner) {
      const now = performance.now(); const out = [];
      for (const it of items || []) {
        const k = key + ':' + it.id, st = this.visState.get(k) || { t: 0, bk: [], ob: [] }, dt = (now - st.t) / 1000, okDt = st.t && dt > 0.02 && dt < 0.6;
        const w = { id: it.id, lvl: it.lvl, field: it.fd, auraR: it.au, shR: it.shR, sh: it.sh ? { on: true } : null, _bk: [], _ob: [] };
        (it.bk || []).forEach((b, i) => { const R = Math.hypot(b[0], b[1]), a = Math.atan2(b[1], b[0]), pv = st.bk[i], om = pv && okDt ? wrap(a - pv.a) / dt : 0; w._bk.push({ R, a, om: Math.max(-12, Math.min(12, om)), r: b[3] }); });
        (it.ob || []).forEach((b, i) => { const R = Math.hypot(b[0], b[1]), a = Math.atan2(b[1], b[0]), pv = st.ob[i], om = pv && okDt ? wrap(a - pv.a) / dt : 0; w._ob.push({ R, a, om: Math.max(-12, Math.min(12, om)), r: b[3], dir: b[4], ri: b[5], i: b[6], kind: KINDS[b[7]] || 'blade' }); });
        this.visState.set(k, { t: now, bk: w._bk.map(b => ({ a: b.a })), ob: w._ob.map(b => ({ a: b.a })) });
        out.push(w);
      }
      if (owner) owner.vis = out; else this.myVis = out;
      this.refreshVis(out, ox, oy, 0);
    }
    refreshVis(ws, ox, oy, age) {
      for (const w of ws) {
        if (w._bk.length) w.books = w._bk.map(b => { const a = b.a + b.om * age; return { x: ox + Math.cos(a) * b.R, y: oy + Math.sin(a) * b.R, a, r: b.r }; });
        if (w._ob.length) w.orbs = w._ob.map(b => { const a = b.a + b.om * age; return { x: ox + Math.cos(a) * b.R, y: oy + Math.sin(a) * b.R, a, r: b.r, dir: b.dir, ri: b.ri, i: b.i, kind: b.kind }; });
      }
    }

    update(dt, input) {
      if (dt > 0.1) dt = 0.1;
      const now = performance.now(), age = Math.min(0.2, (now - this.snapAt) / 1000), p = this.p;
      this.tension += (this.tnT - this.tension) * Math.min(1, dt * 3);
      // movimento local do próprio jogador
      if (!this.over && !this.dead && !this.waiting && this.gotSnap) {
        let ix = input.x, iy = input.y; const l = Math.hypot(ix, iy);
        if (l > 0) { ix /= l; iy /= l; p.fx = ix; p.fy = iy; if (ix) p.face = ix > 0 ? 1 : -1; }
        const sp = this.me.spd || 100; p.x += ix * sp * dt; p.y += iy * sp * dt; p.moving = l > 0; this.inputMoving = l > 0;
      } else { p.moving = false; this.inputMoving = false; }
      if (this.gotSnap && this.state === 'playing' && !this.over && !this.dead && !this.waiting && (now - this.sendAt >= SEND_MS) && (this.inputMoving || this.wasMoving || now - this.heartAt >= HEART_MS)) {
        this.sendAt = now; this.heartAt = now; this.wasMoving = this.inputMoving;
        this.send({ t: 's', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, fx: Math.round(p.fx * 100) / 100, fy: Math.round(p.fy * 100) / 100, f: p.face, m: this.inputMoving ? 1 : 0, sp: this.specId });
      } else if ((this.dead || this.waiting) && now - this.heartAt >= 500) { this.heartAt = now; this.send({ t: 's', x: p.x, y: p.y, fx: 0, fy: 0, f: 1, m: 0, sp: this.specId }); }
      // suavização dos remotos
      const k = lerpK(dt, 16);
      for (const e of this.enemies) { if (e.tx !== undefined) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; } }
      for (const o of this.others) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; this.refreshVis(o.vis || [], o.x, o.y, age); }
      this.refreshVis(this.myVis, p.x, p.y, age);
      this.weapons.forEach(w => { const v = this.myVis.find(q => q.id === w.id); if (v) { w.books = v.books; w.orbs = v.orbs; w.field = v.field; w.sh = v.sh; w.shR = v.shR; w.auraR = v.auraR; } else { w.books = w.orbs = w.sh = null; w.field = w.auraR = 0; } });
      for (const q of this.proj) { q.x = q.x0 + (q.vx || 0) * age; q.y = q.y0 + (q.vy || 0) * age + (q.g ? 0.5 * q.g * age * age : 0); if (q.k === 'rect') { if (q.mine) { q.ox = p.x; q.y = q.y0 + (p.y - q.oy0); } } if (q.life !== undefined && q.life0 === undefined) q.life0 = q.life; }
      for (const q of this.eproj) { q.x = q.x0 + (q.vx || 0) * age; q.y = q.y0 + (q.vy || 0) * age; }
      for (const z of this.tele) z.t = z.t0 + age;
      for (const z of this.zones) { if (z.delay > 0) z.delay = Math.max(0, z.delay - dt); else z.life -= dt; }
      for (const f of this.fx) f.life -= dt; this.fx = this.fx.filter(f => f.life > 0);
      for (const f of this.floating) { f.life -= dt; f.y -= 30 * dt; } this.floating = this.floating.filter(f => f.life > 0);
      for (const m of this.msgs) m.life -= dt; this.msgs = this.msgs.filter(m => m.life > 0);
      for (const e of this.emotes) e.t -= dt; this.emotes = this.emotes.filter(e => e.t > 0);
      if (this.choices) this.choiceT = Math.max(0, this.choiceT - dt);
      // câmera: quem está fora assiste um amigo vivo
      const so = this.dead || this.waiting ? this.oMap.get(this.specId) : null; this.cam = so ? so : p;
    }
  }
  window.VSNet = { RemoteGame };
})();
