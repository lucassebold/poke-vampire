import shutil, re
P = r'D:\jogos\vampire-like\render.js'
shutil.copy(P, r'D:\jogos\vampire-like\_evidence\render_v6_before_pokemon.js')
r = open(P, encoding='utf-8').read()


def rep(a, b, cnt=1):
    global r
    assert a in r, ('nao achei', a[:80])
    r = r.replace(a, b, cnt)


# --- A. skins
i0 = r.index("  let sheriff = true;"); i1 = r.index("  // ---------- imagens ----------")
r = r[:i0] + '''  const SKINS = ['pokemon', 'sheriff', 'original']; let skin = 'pokemon';
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
  function applyEnemySkin() { for (const [id, a] of Object.entries(ART.enemies)) { const pk = skin === 'pokemon' && POKE.enemies[id]; a.variants = pk ? pk.variants.map(v => v.frames) : ENEMY_ORIG[id]; a.pk = pk ? pk.variants : null; } }
  const cycleSkin = () => { skin = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]; try { localStorage.setItem('vs_skin', skin); } catch (e) { } };
''' + r[i1:]

# --- B. tamanho de exibição para o raio de colisão
rep("Game.sizeOf = p => { const i = img(p); return i ? [i.naturalWidth, i.naturalHeight] : null; };",
    "Game.sizeOf = p => { const i = img(p); if (!i) return null; const sc = POKE.scales[p]; return sc ? [i.naturalWidth * sc / SPR, i.naturalHeight * sc / SPR] : [i.naturalWidth, i.naturalHeight]; };")
# --- C. preload
rep("walk(Object.values(ART.enemies).map(e => e.variants));",
    "walk(Object.values(ART.enemies).map(e => e.variants)); walk(Object.values(POKE.chars).map(c => [c.frames, c.portrait])); walk(Object.values(POKE.enemies).map(e => e.variants.map(v => v.frames)));")
# --- D. seleção
rep("if (p) spr(p, x + cell / 2, y + cell / 2, 4);", "if (p) spr(p, x + cell / 2, y + cell / 2, portraitScale(id));")
rep("f = img(fr[Math.floor(t * 6) % fr.length]); spr(f, dx + 100, dy + 105, 4);",
    "f = img(fr[Math.floor(t * 6) % fr.length]); spr(f, dx + 100, dy + 105, isPk(PAL_NAMES[selIdx]) ? charScale(PAL_NAMES[selIdx]) * 2.3 : 4, isPk(PAL_NAMES[selIdx]));")
rep("K: sheriff outfit ' + (sheriff ? 'ON' : 'OFF') + '  -  Enter: '", "K: skin ' + skin.toUpperCase() + '  -  Enter: '")
rep("if (e.code === 'KeyK') toggleSheriff();", "if (e.code === 'KeyK') cycleSkin();")
# --- E. start
rep("function start() { if (window.VSAudio) VSAudio.play('ui_start', { prio: true, jitter: 0 }); g = new Game(",
    "function start() { if (window.VSAudio) VSAudio.play('ui_start', { prio: true, jitter: 0 }); applyEnemySkin(); g = new Game(")
# --- F. inimigos
old = r[r.index("      const a = ART.enemies[e.id], vs = a && a.variants"):r.index("      else { ctx.fillStyle = '#a44'; ctx.beginPath(); ctx.arc(ex, ey, e.r, 0, 7); ctx.fill(); }")]
new = '''      const a = ART.enemies[e.id], vi = a ? e.variant % a.variants.length : 0, vs = a && a.variants[vi], im = vs && img(vs[Math.floor(t * 6 + e.seed) % vs.length]);
      const pkv = a && a.pk && a.pk[vi], s = pkv ? pkv.s0 * (e.scale || 1) : SPR * (e.scale || 1), ex = e.x - cx, ey = e.y - cy, ol = Math.max(1, Math.round(2 / s));
      const feet = im ? ey + (im.naturalHeight * s) / 2 - 3 : ey + e.r * .55, rw = Math.max(10, im ? im.naturalWidth * s * 0.4 : e.r);
      ctx.save(); ctx.globalAlpha = e.boss ? 0.9 : 0.62; ctx.fillStyle = 'rgba(255,30,60,.22)'; ctx.strokeStyle = e.boss ? '#ff2a4a' : '#ff3355'; ctx.lineWidth = e.boss ? 3 : 2; ctx.beginPath(); ctx.ellipse(ex, feet, rw, rw * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();   // anel vermelho = INIMIGO
      if (im) { const fr2 = facesRight(), flip = (fr2 ? (gm.p.x < e.x) : (gm.p.x > e.x)) && !e.swarm ? true : (e.swarm && (fr2 ? e.vx < 0 : e.vx > 0)); spr(outlined(im, e.boss ? '#ff2a4a' : '#5a0820', ol), ex, ey, s, flip); if (e.flash > 0) spr(tintOf(im, '#ffffff'), ex, ey, s, flip, 0, .85); else if (e.slowT > 0) spr(tintOf(im, '#4aa8ff'), ex, ey, s, flip, 0, .45); }
'''
r = r.replace(old, new)
# --- G. jogador
old = r[r.index("    const fr = charFrames(gm.charId), moving = gm.p.moving"):r.index("  // ---------- chefes ----------")]
new = '''    const fr = charFrames(gm.charId), moving = gm.p.moving, im = img(fr[moving ? Math.floor(t * 9) % fr.length : 0]);
    const flicker = gm.p.iframes > 0 && Math.floor(t * 20) % 2, px = W / 2, py = H / 2, sc = charScale(gm.charId), ol = Math.max(1, Math.round(2 / sc));
    const ph = im ? im.naturalHeight * sc : 68, feet = py + ph / 2 - 8, rw = Math.max(16, im ? im.naturalWidth * sc * 0.42 : 24);
    if (sh) { ctx.save(); ctx.fillStyle = 'rgba(80,255,150,.20)'; ctx.strokeStyle = '#5dff9a'; ctx.globalAlpha = 0.85; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, feet, rw, rw * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }   // anel verde = JOGADOR (aliado)
    if (gm.shieldCharges > 0) { ctx.globalCompositeOperation = 'lighter'; const R = (gm.weapons.find(w => ARCH[w.id] === 'shield') || {}).shR || 50; glow(px, py, R * 1.6 + Math.sin(t * 6) * 3, '#7dff9a', .65); ctx.globalAlpha = .6; ctx.strokeStyle = '#b8ffc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, R + 6, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (!flicker) spr(outlined(im, '#e8ffe0', ol), px, py, sc, facesRight() ? gm.p.face < 0 : gm.p.face > 0);
    const bw = 50, by = feet + 6; ctx.fillStyle = '#000'; ctx.fillRect(px - bw / 2 - 2, by - 2, bw + 4, 8); ctx.fillStyle = '#5a0f0f'; ctx.fillRect(px - bw / 2, by, bw, 4); ctx.fillStyle = '#e03a3a'; ctx.fillRect(px - bw / 2, by, bw * Math.max(0, Math.min(1, gm.p.hp / gm.S.maxHp)), 4);
  }

'''
r = r.replace(old, new)
open(P, 'w', encoding='utf-8').write(r)
h = open(r'D:\jogos\vampire-like\index.html', encoding='utf-8').read()
if 'pokemon_art.js' not in h:
    h = h.replace('<script src="art.js"></script>', '<script src="art.js"></script>\n<script src="pokemon_art.js"></script>', 1)
    open(r'D:\jogos\vampire-like\index.html', 'w', encoding='utf-8').write(h)
print('patch ok')
