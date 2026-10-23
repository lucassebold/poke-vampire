'use strict';
// Orbitais NOVOS (design próprio, não vêm do JSON do jogo): 4 armas + 4 evoluções, no mesmo formato de data.js.
// Balanceados contra o King Bible do jogo com _evidence/dps_harness.js. Sprites/ícones são do jogo instalado (uso local).
(() => {
  const D = (typeof window !== 'undefined' ? window.VS_DATA : require('./data.js'));
  const ART = (typeof window !== 'undefined' ? window.ART : require('./art.js'));
  const base = (id, name, description, o) => Object.assign({ level: 1, bulletType: id, name, description, isUnlocked: true, poolLimit: 10, interval: 0, repeatInterval: 0, power: 1, area: 1, speed: 1, amount: 1, hitsWalls: false }, o);
  const W = {
    HALO: [base('HALO', 'Halo Blades', 'Spectral blades orbit close to the character.', { evoSynergy: ['SPEED'], evoInto: 'CROWN', power: 0.35, amount: 3 }),
      { power: 0.1 }, { amount: 1 }, { area: 0.15, speed: 0.15 }, { power: 0.3 }, { amount: 1 }, { area: 0.2 }, { power: 0.5, amount: 1, addEvolvedWeapon: 'CROWN' }],
    CROWN: [base('CROWN', 'Crown of Blades', 'Evolved Halo Blades. A second ring spins the other way.', { isEvolution: true, evolvesFrom: ['HALO'], requires: ['SPEED'], power: 1.0, amount: 4, area: 1.25, speed: 1.2 })],
    EMBER: [base('EMBER', 'Ember Orbs', 'Fire orbs circle the character, leaving burning embers.', { evoSynergy: ['POWER'], evoInto: 'SOLAR', power: 0.8, amount: 2, speed: 0.9 }),
      { power: 0.1 }, { amount: 1 }, { area: 0.2 }, { power: 0.3 }, { amount: 1 }, { area: 0.2 }, { power: 0.5, addEvolvedWeapon: 'SOLAR' }],
    SOLAR: [base('SOLAR', 'Solar Corona', 'Evolved Ember Orbs. Huge suns and a blazing trail.', { isEvolution: true, evolvesFrom: ['EMBER'], requires: ['POWER'], power: 2.4, amount: 5, area: 1.6 })],
    FROST: [base('FROST', 'Frost Shards', 'Ice crystals orbit the character and slow what they hit.', { evoSynergy: ['COOLDOWN'], evoInto: 'GLACIER', power: 0.55, amount: 3, speed: 0.8 }),
      { amount: 1 }, { amount: 1 }, { power: 0.4, area: 0.2 }, { amount: 1 }, { power: 0.5 }, { amount: 1, area: 0.2 }, { amount: 1, power: 0.8, addEvolvedWeapon: 'GLACIER' }],
    GLACIER: [base('GLACIER', 'Glacier Wheel', 'Evolved Frost Shards. A freezing field slows enemies nearby.', { isEvolution: true, evolvesFrom: ['FROST'], requires: ['COOLDOWN'], power: 3.0, amount: 8, area: 1.5 })],
    STORM: [base('STORM', 'Storm Satellites', 'Spark orbs circle the character and zap nearby enemies.', { evoSynergy: ['AMOUNT'], evoInto: 'THUNDER', power: 0.7, amount: 2, interval: 1500 }),
      { interval: -100 }, { amount: 1 }, { power: 0.4 }, { interval: -150 }, { amount: 1 }, { power: 0.6 }, { interval: -150, power: 0.4, addEvolvedWeapon: 'THUNDER' }],
    THUNDER: [base('THUNDER', 'Thunder Crown', 'Evolved Storm Satellites. Lightning chains between enemies.', { isEvolution: true, evolvesFrom: ['STORM'], requires: ['AMOUNT'], power: 2.4, amount: 5, interval: 900 })],
  };
  // configuração de comportamento (rings: raio px, qtd extra, sentido) e visual
  const CFG = {
    HALO:    { kind: 'blade', rings: [{ R: 62, add: 0, dir: 1 }], spin: 4.2, r: 13, rehit: 0.45, kb: 0.3 },
    CROWN:   { kind: 'blade', rings: [{ R: 55, add: 0, dir: 1 }, { R: 118, add: 2, dir: -1 }], spin: 4.6, r: 15, rehit: 0.4, kb: 0.4 },
    EMBER:   { kind: 'ember', rings: [{ R: 105, add: 0, dir: 1 }], spin: 2.4, r: 15, rehit: 0.55, kb: 0.2, embers: 0.38 },
    SOLAR:   { kind: 'ember', rings: [{ R: 88, add: 0, dir: 1 }], spin: 2.2, r: 22, rehit: 0.5, kb: 0.3, embers: 0.2 },
    FROST:   { kind: 'frost', rings: [{ R: 84, add: 0, dir: -1 }], spin: 2.2, r: 17, rehit: 0.45, kb: 0.1, slow: 2.5 },
    GLACIER: { kind: 'frost', rings: [{ R: 95, add: 0, dir: -1 }], spin: 2.0, r: 20, rehit: 0.4, kb: 0.1, slow: 3, field: 150 },
    STORM:   { kind: 'storm', rings: [{ R: 92, add: 0, dir: 1 }], spin: 2.0, r: 11, rehit: 9, kb: 0, range: 190, chain: 1 },
    THUNDER: { kind: 'storm', rings: [{ R: 100, add: 0, dir: 1 }], spin: 2.4, r: 12, rehit: 9, kb: 0, range: 200, chain: 5 },
  };
  const ARCHS = {}, COLS = { HALO: '#bfe8ff', CROWN: '#fff2a0', EMBER: '#ff8a30', SOLAR: '#ffcf40', FROST: '#70e0ff', GLACIER: '#a0f0ff', STORM: '#c0a0ff', THUNDER: '#e0d0ff' };
  for (const k of Object.keys(W)) ARCHS[k] = 'ring';
  Object.assign(D.weapons, W);
  const ICON = { HALO: 'Rings2', CROWN: 'Rings5', EMBER: 'OrbOrange', SOLAR: 'OrbYellow', FROST: 'OrbAqua', GLACIER: 'OrbBlue', STORM: 'OrbPurple', THUNDER: 'OrbGlow' };
  for (const [k, n] of Object.entries(ICON)) ART.icons[k] = 'assets/icons/' + n + '.png';
  ART.fx.diamond = 'assets/fx/Diamond2.png';
  if (D.characters && D.characters.DOMMARIO) D.characters.DOMMARIO[0].moveSpeed = 1.05;   // [DESIGN] Mew: 0.6 original era lento demais
  const api = { weapons: W, cfg: CFG, arch: ARCHS, colors: COLS };
  if (typeof window !== 'undefined') window.VS_ORB = api; else module.exports = api;
})();
