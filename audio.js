'use strict';
// Motor de áudio (WebAudio). Sons/músicas vêm do jogo instalado (audio_sfx.js, audio_bgm_*.js), uso local.
// O navegador só libera som após um clique/tecla: unlock() é chamado no primeiro gesto.
(() => {
  // volume base de cada efeito (0..1) e intervalo mínimo entre repetições (ms): evita virar ruído com muitos acertos
  const VOL = { hit: .30, kill: .34, gem: .34, coin: .5, levelup: .9, choose: .6, chest: .9, evolve: .9, hurt: .8, gameover: .9, pause_in: .5, pause_out: .5, warn_gong: .9, warn_alarm: .45,
    boss_die: .9, boss_boom: .8, boss_shot: .22, boss_dash: .6, boss_shock: .8, boss_land: .8, reaper: .9, w_whip: .5, w_wand: .32, w_holy: .32, w_knife: .26, w_axe: .5, w_scythe: .5,
    w_cross: .4, w_fire: .5, w_fireboom: .5, w_lightning: .55, w_garlic: .3, w_bottle: .5, w_bounce: .35, w_birds: .3, w_song: .45, w_nova: .9, w_shieldup: .6, w_shieldhit: .6, w_orbit: .4, ui_start: .7 };
  const GAP = { hit: 55, kill: 75, gem: 45, coin: 60, boss_shot: 110, w_knife: 90, w_wand: 90, w_holy: 90, w_garlic: 400, w_birds: 250, w_fire: 120, w_fireboom: 90, w_lightning: 110, w_whip: 120, w_bounce: 80, w_song: 200, w_axe: 150, w_scythe: 150, w_cross: 150, w_bottle: 150 };
  const MAXV = 22;
  let ctx = null, master, musicG, sfxG, comp, unlocked = false, muted = false, vols = { master: 0.85, music: 0.5, sfx: 0.9 }, duck = 1, active = 0;
  const bufs = {}, bgm = {}, last = {}, loading = {}, fails = {}; let cur = null, curKey = null, toast = null, sfxReady = 0, sfxTotal = 0;
  try { const st = JSON.parse(localStorage.getItem('vs_audio') || 'null'); if (st) { muted = !!st.muted; vols = Object.assign(vols, st.vols || {}); } } catch (e) { }
  const save = () => { try { localStorage.setItem('vs_audio', JSON.stringify({ muted, vols })); } catch (e) { } };
  const dataBuf = url => { const b = atob(url.split(',')[1]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); musicG = ctx.createGain(); sfxG = ctx.createGain(); comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    musicG.connect(master); sfxG.connect(comp); comp.connect(master); master.connect(ctx.destination); applyVol(true); return true;
  }
  function applyVol(now) {
    if (!ctx) return; const t = ctx.currentTime, k = now ? 0 : 0.08;
    master.gain.setTargetAtTime(muted ? 0 : vols.master, t, k + 0.001); musicG.gain.setTargetAtTime(vols.music * duck, t, 0.15); sfxG.gain.setTargetAtTime(vols.sfx, t, k + 0.001);
  }
  function decodeAll() {
    const src = window.VS_SFX || {}; sfxTotal = Object.keys(src).length;
    for (const [k, url] of Object.entries(src)) {
      if (bufs[k]) { sfxReady++; continue; }
      try { ctx.decodeAudioData(dataBuf(url), b => { bufs[k] = b; sfxReady++; }, () => { sfxReady++; }); } catch (e) { sfxReady++; }
    }
  }
  function loadBgm(key) {
    if (bgm[key] || loading[key] || !ctx) return Promise.resolve(bgm[key]);
    loading[key] = new Promise(res => {
      const go = () => { const url = window.VS_BGM && window.VS_BGM[key]; if (!url) { res(null); return; } ctx.decodeAudioData(dataBuf(url), b => { bgm[key] = b; res(b); }, er => { fails[key] = String(er && er.message || er); res(null); }); };
      if (window.VS_BGM && window.VS_BGM[key]) go(); else { const s = document.createElement('script'); s.src = 'audio_bgm_' + key + '.js'; s.onload = go; s.onerror = () => res(null); document.head.appendChild(s); }
    });
    return loading[key];
  }
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!unlocked) { unlocked = true; decodeAll(); loadBgm('forest'); setTimeout(() => ['boss0', 'boss1', 'boss2', 'boss3', 'boss4'].forEach((k, i) => setTimeout(() => loadBgm(k), 1500 * i)), 4000); }
  }
  function play(key, o) {
    o = o || {}; if (!ctx || !unlocked || muted || !bufs[key] || ctx.state !== 'running') return;
    const now = performance.now(), gap = GAP[key] || 35; if (now - (last[key] || 0) < gap) return; last[key] = now;
    if (active >= MAXV && !o.prio) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = bufs[key];
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jitter == null ? 0.1 : o.jitter)); g.gain.value = (VOL[key] || 0.5) * (o.vol == null ? 1 : o.vol);
    let out = g; if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    src.connect(g); out.connect(sfxG); active++; src.onended = () => { active--; }; src.start(ctx.currentTime + (o.when || 0));
  }
  function music(key, o) {
    o = o || {}; if (!ctx || !unlocked || key === curKey) return;
    curKey = key; const fade = o.fade == null ? 1.4 : o.fade, old = cur; cur = null;
    if (old) { old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => { try { old.s.stop(); } catch (e) { } }, fade * 1000 + 300); }
    if (!key) return;
    loadBgm(key).then(b => {
      if (!b || curKey !== key) return; const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(musicG); s.start();
      g.gain.setTargetAtTime(o.vol == null ? 1 : o.vol, ctx.currentTime, fade / 3); cur = { s, g };
    });
  }
  function setDuck(d) { if (Math.abs(d - duck) > 0.01) { duck = d; applyVol(false); } }
  function say(t) { toast = { t, until: performance.now() + 1600 }; }
  function toggleMute() { muted = !muted; applyVol(false); save(); say(muted ? 'SOUND OFF' : 'SOUND ON'); }
  function bump(d) { vols.master = Math.max(0, Math.min(1, +(vols.master + d).toFixed(2))); muted = false; applyVol(false); save(); say('VOLUME ' + Math.round(vols.master * 100) + '%'); }
  const gesture = e => { unlock(); };
  addEventListener('keydown', e => { gesture(); if (e.code === 'KeyM') toggleMute(); else if (e.key === '-' || e.code === 'NumpadSubtract') bump(-0.1); else if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') bump(0.1); }, true);
  addEventListener('mousedown', gesture, true); addEventListener('touchstart', gesture, true);
  window.VSAudio = { unlock, play, music, setDuck, toggleMute, bump, preload: loadBgm,
    status: () => ({ cur: curKey, duck: +duck.toFixed(2), fails, loadingKeys: Object.keys(loading), vsbgm: Object.keys(window.VS_BGM || {}), ctx: ctx && ctx.state, unlocked, muted, sfx: Object.keys(bufs).length + '/' + sfxTotal, bgm: Object.keys(bgm), active, master: vols.master }),
    get label() { return (!unlocked ? 'CLICK OR PRESS A KEY FOR SOUND' : muted ? 'SOUND OFF  [M]' : 'SOUND ON  [M]  VOL ' + Math.round(vols.master * 100) + '%  [-/+]'); },
    get toast() { return toast && performance.now() < toast.until ? toast.t : null; } };
})();
