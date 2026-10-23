import shutil
P = r'D:\jogos\vampire-like\render.js'
shutil.copy(P, r'D:\jogos\vampire-like\_evidence\render_v5_before_toon.js')
r = open(P, encoding='utf-8').read()


def rep(a, b, cnt=1):
    global r
    assert a in r, ('nao achei', a[:70])
    r = r.replace(a, b, cnt)


# 1) spr aceita canvas
rep("if (!im) return; const w = im.naturalWidth * s, h = im.naturalHeight * s;",
    "if (!im) return; const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, w = iw * s, h = ih * s;")
# 2) props no preload + filtro base
rep("walk(ART.chars); walk(ART.portraits);",
    "for (let i = 0; i < 10; i++) list.push('assets/props/p' + i + '.png'); walk(ART.chars); walk(ART.portraits);")
rep("  const FACE_RIGHT = true;",
    "  const BASE_FILTER = 'saturate(1.3) contrast(1.06)';   // cores mais vivas (estilo cartoon)\n  const FACE_RIGHT = true;")
r = r.replace("cv.style.filter = 'none'", "cv.style.filter = BASE_FILTER")
rep("if (cv.style.filter !== 'none') cv.style.filter = BASE_FILTER; return; }",
    "if (cv.style.filter !== BASE_FILTER) cv.style.filter = BASE_FILTER; return; }") if "if (cv.style.filter !== 'none') cv.style.filter = BASE_FILTER; return; }" in r else None
rep("cv.style.filter = `saturate(${(1 - 0.5 * k).toFixed(2)}) contrast(${(1 + 0.14 * k).toFixed(2)})",
    "cv.style.filter = `saturate(${(1.3 * (1 - 0.5 * k)).toFixed(2)}) contrast(${(1.06 + 0.14 * k).toFixed(2)})")

HELPERS = r'''  // ================= ESTILO CARTOON: contorno, chão pintado, luz =================
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
    const pals = [['#3e7b86', '#2b5560'], ['#58499a', '#3a2f68'], ['#3f8a58', '#2b6040'], ['#7a7a3a', '#55552a'], ['#2f7fa0', '#205a70'], ['#6a449a', '#47305f'], ['#43907a', '#2f6654'], ['#8a4e6a', '#5c3548']];
    for (let v = 0; v < NT; v++) {
      const c = document.createElement('canvas'); c.width = c.height = TILE; const x = c.getContext('2d'), [a, b] = pals[v];
      const gr = x.createLinearGradient(0, 0, TILE, TILE); gr.addColorStop(0, a); gr.addColorStop(1, b); x.fillStyle = gr; x.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(255,255,255,${0.03 + rr() * 0.06})`; x.beginPath(); x.ellipse(rr() * TILE, rr() * TILE, 6 + rr() * 18, 4 + rr() * 12, rr() * 3, 0, 7); x.fill(); x.fillStyle = `rgba(0,0,0,${0.04 + rr() * 0.08})`; x.beginPath(); x.ellipse(rr() * TILE, rr() * TILE, 6 + rr() * 18, 4 + rr() * 12, rr() * 3, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(12,4,28,.6)'; x.lineWidth = 2; x.lineCap = 'round'; for (let i = 0; i < 2; i++) { x.beginPath(); let px = rr() * TILE, py = rr() * TILE; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rr() - 0.5) * 30; py += (rr() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,.24)'; x.fillRect(0, 0, TILE, 4); x.fillRect(0, 0, 4, TILE); x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(0, TILE - 5, TILE, 5); x.fillRect(TILE - 5, 0, 5, TILE);
      x.strokeStyle = '#160a26'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
      x.fillStyle = 'rgba(96,230,96,.38)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(rr() < 0.5 ? rr() * 18 : TILE - rr() * 18, rr() < 0.5 ? rr() * 18 : TILE - rr() * 18, 3 + rr() * 8, 0, 7); x.fill(); }
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
  // ---------- mundo ----------'''
rep("  // ---------- mundo ----------", HELPERS)

rep("""    const bg = img('assets/bg/forest.png'), T0 = 1024 * SPR;
    ctx.fillStyle = '#1f3a1b'; ctx.fillRect(0, 0, W, H);
    if (bg) { const ox = -(((cx % T0) + T0) % T0), oy = -(((cy % T0) + T0) % T0); for (let x = ox; x < W; x += T0) for (let y = oy; y < H; y += T0) ctx.drawImage(bg, x, y, T0, T0); }
""", """    drawFloor(cx, cy, t);
    ctx.globalCompositeOperation = 'lighter'; glow(W / 2, H / 2 + 8, 330, '#ffd9a0', 0.22); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;   // luz quente em volta do herói
""")
rep("spr(im, ex, ey, s, flip); if (e.flash > 0)",
    "spr(outlined(im, e.boss ? '#ff3a5a' : '#14061f', 1), ex, ey, s, flip); if (e.flash > 0)")
rep("if (!flicker) spr(im, px, py, SPR, FACE_RIGHT ? gm.p.face < 0 : gm.p.face > 0);",
    "if (!flicker) spr(outlined(im, '#fff0b8', 1), px, py, SPR, FACE_RIGHT ? gm.p.face < 0 : gm.p.face > 0);")
rep("spr(sh, gm2.x - cx, gm2.y - cy + 8, SPR * .8, false, 0, .5); spr(im, gm2.x - cx,",
    "spr(sh, gm2.x - cx, gm2.y - cy + 8, SPR * .8, false, 0, .5); ctx.globalCompositeOperation = 'lighter'; glow(gm2.x - cx, gm2.y - cy, 15, gm2.t === 'COIN' ? '#ffd24a' : gm2.v >= 25 ? '#ff5a6a' : gm2.v >= 5 ? '#5aff8a' : '#4ab8ff', 0.55); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; spr(im, gm2.x - cx,")
rep("      drawTension(g, t); drawHUD(g, t);", "      drawVignette(); drawTension(g, t); drawHUD(g, t);")
rep("  preload().then(() => {\n    state = 'select';", "  cv.style.filter = BASE_FILTER;\n  preload().then(() => {\n    state = 'select';")
open(P, 'w', encoding='utf-8').write(r)
print('patch ok')
