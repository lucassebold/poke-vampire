'use strict';
// Caricaturas em pixel-art dos chefes, desenhadas por código (48x64). Arte própria, paródia: sem fotos nem assets de terceiros.
(() => {
  const cache = {};
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const DISC = (c, cx, cy, rx, ry, col) => { c.fillStyle = col; for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) c.fillRect(cx + x, cy + y, 1, 1); };
  const mirror = (c, x, y, w, h, col) => { R(c, x, y, w, h, col); R(c, 47 - x - w + 1, y, w, h, col); };
  function outline(cv, col) {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, d = c.getImageData(0, 0, w, h), o = c.createImageData(w, h);
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d.data[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a(x, y) > 0) { o.data.set(d.data.subarray(i, i + 4), i); continue; }
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { const k = parseInt(col.slice(1), 16); o.data[i] = k >> 16; o.data[i + 1] = (k >> 8) & 255; o.data[i + 2] = k & 255; o.data[i + 3] = 255; }
    }
    c.putImageData(o, 0, 0);
  }
  const ART = {
    ELON(c) {
      const skin = '#f0c8a0', sh = '#d4a07a', hair = '#2e2118';
      R(c, 8, 41, 32, 23, '#1c1f2a'); R(c, 6, 41, 36, 6, '#252938'); R(c, 19, 40, 10, 14, '#f4f4f4'); R(c, 23, 41, 2, 13, '#d8d8e0');
      R(c, 21, 34, 6, 7, sh);
      DISC(c, 24, 22, 11, 13, skin); R(c, 12, 22, 2, 5, skin); R(c, 34, 22, 2, 5, skin);
      R(c, 13, 8, 22, 6, hair); R(c, 12, 11, 4, 6, hair); R(c, 32, 11, 4, 6, hair); R(c, 15, 7, 18, 2, hair);
      R(c, 18, 21, 3, 2, '#201810'); R(c, 28, 21, 3, 2, '#201810'); R(c, 17, 19, 5, 1, hair); R(c, 27, 19, 5, 1, hair);
      R(c, 23, 24, 2, 4, sh); R(c, 20, 30, 9, 1, '#8a4a40'); R(c, 29, 29, 1, 1, '#8a4a40'); R(c, 20, 31, 8, 1, '#c88a78');
      R(c, 38, 46, 4, 11, '#e8e8f0'); R(c, 39, 43, 2, 3, '#e04040'); R(c, 36, 53, 2, 5, '#c03030'); R(c, 42, 53, 2, 5, '#c03030'); R(c, 38, 57, 4, 4, '#ffb030'); R(c, 39, 61, 2, 2, '#ff6020');
    },
    TRUMP(c) {
      const skin = '#f2a768', sh = '#d68a50', hair = '#f4d36a';
      R(c, 8, 41, 32, 23, '#1a2646'); R(c, 6, 41, 36, 6, '#222f55'); R(c, 18, 40, 12, 15, '#f4f4f4'); R(c, 22, 42, 4, 3, '#a81818'); R(c, 23, 44, 3, 18, '#d82828'); R(c, 24, 46, 1, 14, '#f06060');
      R(c, 21, 34, 6, 7, sh);
      DISC(c, 24, 23, 12, 13, skin); R(c, 11, 22, 2, 5, skin); R(c, 35, 22, 2, 5, skin);
      DISC(c, 24, 11, 14, 7, hair); R(c, 9, 12, 7, 8, hair); R(c, 13, 14, 24, 3, hair); R(c, 8, 17, 4, 5, hair); R(c, 17, 7, 12, 2, '#fff0a0'); R(c, 22, 5, 8, 2, '#fff0a0');
      R(c, 17, 20, 6, 1, '#e8c070'); R(c, 26, 20, 6, 1, '#e8c070'); R(c, 18, 22, 3, 2, '#243248'); R(c, 28, 22, 3, 2, '#243248'); R(c, 18, 21, 3, 1, '#fff');
      R(c, 23, 25, 3, 5, sh); R(c, 20, 32, 9, 3, '#a84a40'); R(c, 21, 32, 7, 1, '#d86a60');
    },
    PEPE(c) {
      R(c, 10, 44, 28, 20, '#3a5a9a'); R(c, 13, 40, 22, 7, '#2e4a82'); R(c, 21, 46, 1, 9, '#fff'); R(c, 26, 46, 1, 9, '#fff');
      DISC(c, 24, 26, 18, 14, '#5fa84a'); DISC(c, 24, 33, 13, 6, '#74c25a');
      DISC(c, 14, 20, 7, 5, '#fff'); DISC(c, 34, 20, 7, 5, '#fff'); R(c, 16, 20, 4, 4, '#111'); R(c, 30, 20, 4, 4, '#111');
      R(c, 7, 15, 15, 4, '#4a8a3a'); R(c, 27, 15, 15, 4, '#4a8a3a');
      R(c, 7, 31, 34, 2, '#6a1414'); R(c, 9, 33, 30, 3, '#c04040'); R(c, 7, 30, 2, 1, '#6a1414'); R(c, 39, 30, 2, 1, '#6a1414'); R(c, 12, 33, 24, 1, '#e07070');
    },
    DOGE(c) {
      const tan = '#e0a850', cream = '#f6e6c0';
      R(c, 12, 41, 24, 23, tan); R(c, 18, 43, 12, 17, cream); DISC(c, 24, 53, 6, 6, '#f5c518'); DISC(c, 24, 53, 4, 4, '#c8960e'); R(c, 22, 50, 1, 7, '#f5c518'); R(c, 22, 50, 3, 1, '#f5c518'); R(c, 22, 56, 3, 1, '#f5c518');
      for (let i = 0; i < 10; i++) { R(c, 9 + Math.floor(i * 0.6), 13 - i, 10 - Math.floor(i * 0.8) , 1, tan); R(c, 38 - Math.floor(i * 0.6) - (10 - Math.floor(i * 0.8)) + 1, 13 - i, 10 - Math.floor(i * 0.8), 1, tan); }
      R(c, 13, 8, 3, 5, '#e89a8a'); R(c, 32, 8, 3, 5, '#e89a8a');
      DISC(c, 24, 25, 16, 12, tan); DISC(c, 14, 31, 7, 5, cream); DISC(c, 34, 31, 7, 5, cream); DISC(c, 24, 32, 8, 5, cream);
      R(c, 16, 18, 6, 2, cream); R(c, 27, 18, 6, 2, cream); R(c, 17, 21, 3, 3, '#2a1a10'); R(c, 28, 21, 3, 3, '#2a1a10'); R(c, 17, 21, 1, 1, '#fff'); R(c, 28, 21, 1, 1, '#fff');
      R(c, 22, 28, 5, 3, '#1a1a1a'); R(c, 23, 31, 1, 2, '#5a3a20'); R(c, 20, 33, 4, 1, '#5a3a20'); R(c, 25, 33, 4, 1, '#5a3a20'); R(c, 29, 32, 1, 1, '#5a3a20'); R(c, 19, 32, 1, 1, '#5a3a20');
    },
    BULL(c) {
      R(c, 8, 42, 32, 22, '#5a2f1c'); R(c, 5, 40, 38, 9, '#6a3822'); DISC(c, 24, 55, 7, 7, '#f5c518'); DISC(c, 24, 55, 5, 5, '#c8960e');
      R(c, 22, 51, 1, 9, '#f5c518'); R(c, 22, 51, 4, 1, '#f5c518'); R(c, 22, 55, 4, 1, '#f5c518'); R(c, 22, 59, 4, 1, '#f5c518'); R(c, 26, 52, 1, 3, '#f5c518'); R(c, 26, 56, 1, 3, '#f5c518');
      mirror(c, 9, 15, 5, 3, '#f0e6c8'); mirror(c, 6, 10, 5, 5, '#f0e6c8'); mirror(c, 5, 5, 4, 6, '#f0e6c8'); mirror(c, 5, 2, 2, 4, '#fffbe8');
      DISC(c, 24, 25, 13, 12, '#6a3a22'); DISC(c, 24, 33, 10, 6, '#a06a42');
      R(c, 19, 32, 3, 3, '#2a1008'); R(c, 26, 32, 3, 3, '#2a1008'); R(c, 22, 36, 4, 1, '#f5c518'); R(c, 21, 37, 1, 3, '#f5c518'); R(c, 26, 37, 1, 3, '#f5c518'); R(c, 22, 40, 4, 1, '#f5c518');
      R(c, 15, 22, 6, 3, '#ff4a2a'); R(c, 27, 22, 6, 3, '#ff4a2a'); R(c, 16, 20, 5, 2, '#2a1008'); R(c, 27, 20, 5, 2, '#2a1008'); R(c, 20, 19, 2, 2, '#2a1008'); R(c, 26, 19, 2, 2, '#2a1008');
    },
  };
  window.BossArt = { get(id) { if (!cache[id]) { const [cv, c] = mk(48, 64); ART[id](c); outline(cv, '#0e0e16'); cache[id] = cv; } return cache[id]; } };
})();
