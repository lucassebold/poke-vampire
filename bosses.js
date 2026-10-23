'use strict';
// Chefes a cada 5 minutos. DESIGN próprio (não vem do jogo original): nomes, ataques, números.
// HP real = clamp(DPS recente do jogador x TARGET_SECONDS, hpMin, hpMin*4): a luta dura ~40 s com qualquer build.
const __b = {
  schedule: { 5: 'ELON', 10: 'TRUMP', 15: 'PEPE', 20: 'DOGE', 25: 'BULL' },
  TARGET_SECONDS: 40,
  defs: {
    ELON:  { name: 'ELON',  hpMin: 1800,  speed: 48, r: 58, pow: 12, px: 250, col: '#7fd0ff',
             attacks: [{ k: 'fan', n: 5, spread: 0.9, speed: 150, cd: 3.2, dmg: 10, spr: 'rocket' },
                       { k: 'dash', cd: 9, tele: 0.9, speed: 380, dur: 0.55, dmg: 16 }] },
    TRUMP: { name: 'TRUMP', hpMin: 4000,  speed: 44, r: 58, pow: 13, px: 250, col: '#ffb050',
             attacks: [{ k: 'shock', cd: 5, tele: 0.9, r: 170, dmg: 14 },
                       { k: 'fan', n: 3, spread: 0.5, speed: 170, cd: 3.6, dmg: 10, spr: 'tie' }] },
    PEPE:  { name: 'PEPE',  hpMin: 7500,  speed: 52, r: 58, pow: 13, px: 250, col: '#6fe06f',
             attacks: [{ k: 'hop', cd: 6, tele: 0.9, r: 130, dmg: 16 },
                       { k: 'ring', n: 12, speed: 120, cd: 4.5, dmg: 9, spr: 'orb' }] },
    DOGE:  { name: 'DOGE',  hpMin: 13000, speed: 58, r: 58, pow: 14, px: 250, col: '#f2c06a',
             attacks: [{ k: 'rain', n: 7, cd: 4.5, tele: 0.9, r: 44, dmg: 14, spr: 'coin' },
                       { k: 'spiral', n: 24, speed: 130, cd: 7.5, dmg: 8, spr: 'coin' }] },
    BULL:  { name: 'BITCOIN BULL', hpMin: 22000, speed: 46, r: 62, pow: 15, px: 250, col: '#ff8a3a',
             attacks: [{ k: 'dash', cd: 6, tele: 0.8, speed: 460, dur: 0.6, dmg: 20 },
                       { k: 'fan', n: 7, spread: 1.4, speed: 160, cd: 3.6, dmg: 10, spr: 'candle' }] },
  },
};
if (typeof window !== 'undefined') window.VS_BOSSES = __b; else module.exports = __b;
