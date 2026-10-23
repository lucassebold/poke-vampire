const {Game,ARCH,BOSSES}=require('../game.js');const D=require('../data.js');
let f=0;const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m);if(!c)f++;};
const mk=(ch='ANTONIO')=>{const g=new Game(ch);g.W=1280;g.H=720;return g;};
// 1) cada arma (inclusive as novas) causa dano; nova (pentagram) e escudo testados à parte
for(const id of Object.keys(D.weapons)){
  if(ARCH[id]==='shield')continue;
  const g=mk();g.weapons=[];g.addWeapon(id);g.recalc();if(ARCH[id]==='nova')g.weapons[0].cd=0;
  for(let i=0;i<40;i++)g.spawn('ZOMBIE',(Math.random()-.5)*300,(Math.random()-.5)*300);
  const n0=g.enemies.length;g.enemies.forEach(e=>e.hp=1e6);g.p.hp=1e9;
  for(let i=0;i<60*14;i++)g.update(1/60,{x:0,y:0});
  const dealt=g.enemies.some(e=>e.hp<1e6)||g.enemies.length<n0||g.p.kills>0;
  ok(dealt,id+' ('+ARCH[id]+') causa dano/efeito');
}
// 2) escudo Laurel absorve acerto
{const g=mk();g.weapons=[];g.addWeapon('LAUREL');g.weapons[0].cd=0;g.recalc();g.update(1/60,{x:0,y:0});ok(g.shieldCharges===1,'Laurel ativa com 1 carga');const hp=g.p.hp;g.hurt(30);ok(g.p.hp===hp&&g.shieldCharges===0,'Laurel absorveu o golpe');g.p.iframes=0;g.hurt(30);ok(g.p.hp<hp,'sem carga, o golpe passa');}
// 3) evoluções novas
{const g=mk();g.weapons=[];g.addWeapon('SILF');g.addWeapon('SILF2');g.weapons.forEach(w=>w.lvl=8);g.openChest();ok(g.weapons.length===1&&g.weapons[0].id==='SILF3','Peachone+Ebony Wings (ambos nv8) => Vandalier');}
{const g=mk();g.weapons=[];g.addWeapon('SILF');g.weapons[0].lvl=8;g.openChest();ok(g.weapons[0].id==='SILF','Peachone sozinho NÃO evolui');}
{const g=mk();g.weapons=[];g.addWeapon('SONG');g.weapons[0].lvl=8;g.passives={CURSE:1};g.recalc();g.openChest();ok(g.weapons[0].id==='MANNAGGIA','Song of Mana nv8 + Curse => Mannajja');}
{const g=mk();g.weapons=[];g.addWeapon('HOLYWATER');g.weapons[0].lvl=8;g.passives={MAGNET:1};g.recalc();g.openChest();ok(g.weapons[0].id==='BORA','Santa Water + Attractorb => La Borra');}
// 3b) orbitais novos: evoluções exigem o passivo certo
for(const [w,p,evo] of [['HALO','SPEED','CROWN'],['EMBER','POWER','SOLAR'],['FROST','COOLDOWN','GLACIER'],['STORM','AMOUNT','THUNDER']]){
  const a=mk();a.weapons=[];a.addWeapon(w);a.weapons[0].lvl=8;a.passives={[p]:1};a.recalc();a.openChest();ok(a.weapons[0].id===evo,w+' nv8 + '+p+' => '+evo);
  const b=mk();b.weapons=[];b.addWeapon(w);b.weapons[0].lvl=8;b.recalc();b.openChest();ok(b.weapons[0].id===w,w+' sem '+p+' NÃO evolui');}
// 4) fluxo do chefe a cada 5 min
const g=mk();g.godMode=true;
const step=(s)=>{for(let i=0;i<s*60;i++){if(g.choices)g.choose(0);if(g.popup)g.popup=null;g.update(1/60,{x:Math.cos(g.t/3),y:Math.sin(g.t/3)});}};
step(299);ok(g.phase==='normal'&&g.enemies.length>0,'antes dos 5:00 o jogo é normal com inimigos ('+g.enemies.length+')');
step(2);ok(g.phase==='warn'&&g.enemies.length===0,'5:00 => AVISO e inimigos comuns removidos');
const gemsBefore=g.gems.length;
step(2.5);ok(g.phase==='boss'&&g.boss&&g.boss.bossId==='ELON','chefe ELON em campo; hp='+Math.round(g.boss&&g.boss.max));
const n1=g.enemies.length;step(10);ok(g.enemies.length===1,'durante o chefe só o chefe existe ('+g.enemies.length+')');
ok(g.eproj.length>0||g.tele.length>0||g.boss.state!=='move','chefe atacou (tiros '+g.eproj.length+', tele '+g.tele.length+', estado '+g.boss.state+')');
g.boss.hp=0;step(0.1);ok(g.phase==='outro'&&g.chests.length>=1,'chefe morto => fase final e baú ('+g.chests.length+')');
step(2.5);ok(g.phase==='normal','spawn normal retomado');step(5);ok(g.enemies.length>0,'inimigos voltaram ('+g.enemies.length+')');
ok(g.tension<0.9,'tensão relaxou ('+g.tension.toFixed(2)+')');
// 4b) chefe não derrotado em 90 s: reforços voltam (jogo não trava)
{const q=mk();q.godMode=true;q.weapons=[];q.t=299;q.waveIdx=4;const U=()=>{if(q.choices)q.choose(0);if(q.popup)q.popup=null;q.update(1/60,{x:Math.cos(q.t/3),y:Math.sin(q.t/3)});};for(let i=0;i<60*(2+3+60);i++)U();ok(q.phase==='boss'&&q.enemies.length===1,'aos 60 s de chefe ainda só o chefe ('+q.enemies.length+')');for(let i=0;i<60*40;i++)U();ok(q.phase==='boss'&&q.reinf&&q.enemies.length>1,'após 90 s: reforços voltam, chefe segue vivo ('+q.enemies.length+' inimigos)');q.boss.hp=0;for(let i=0;i<60*3;i++)U();ok(q.phase==='normal'&&!q.reinf,'derrotar o chefe depois dos reforços retorna ao normal');}
// 5) todos os 5 chefes entram em campo, escolhem ataques e morrem
for(const [m,key] of Object.entries(BOSSES.schedule)){const h=mk();h.godMode=true;h.weapons=[];h.t=m*60-1;h.waveIdx=m-1;
  const U=()=>{if(h.choices)h.choose(0);if(h.popup)h.popup=null;h.update(1/60,{x:0,y:0});};
  for(let i=0;i<60*8&&h.phase!=='boss';i++)U();
  const k=[];for(let i=0;i<60*14;i++){U();if(h.boss&&(h.eproj.length||h.tele.length))k.push(1);}
  ok(h.boss&&h.boss.bossId===key&&k.length>0,'min '+m+': '+key+' em campo e atacando (hp '+Math.round(h.boss.max)+')');}
console.log(f?'FALHAS '+f:'TUDO OK');process.exit(f?1:0);
