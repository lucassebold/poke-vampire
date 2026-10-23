const {Game,weaponStats,ARCH}=require('D:/jogos/vampire-like/game.js');
const D=require('D:/jogos/vampire-like/data.js');
let fails=0; const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m); if(!c)fails++;};
// 1) cada arma isolada (base + evoluída) dispara e causa dano
for(const id of Object.keys(D.weapons)){
  const g=new Game('ANTONIO'); g.W=1280;g.H=720; g.weapons=[]; g.addWeapon(id); g.weapons[0].lvl=1;
  g.recalc();
  for(let i=0;i<40;i++) g.spawn('ZOMBIE',(Math.random()-.5)*300,(Math.random()-.5)*300);
  g.enemies.forEach(e=>e.hp=1e6); g.p.hp=1e9;
  const hp0=g.enemies.reduce((a,e)=>a+e.hp,0);
  for(let i=0;i<60*12;i++) g.update(1/60,{x:0,y:0});
  const hp1=g.enemies.filter(e=>e.hp>1000).reduce((a,e)=>a+e.hp,0);
  const dealt=g.enemies.filter(e=>e.hp>1000).length? (hp0-g.enemies.reduce((a,e)=>a+(e.hp>1000?e.hp:0),0)):0;
  ok(g.enemies.some(e=>e.hp<1e6), `${id} (${ARCH[id]}) causou dano`);
}
// 2) partida completa 30 min com bot que foge dos inimigos
for(const ch of Object.keys(D.characters)){
  const g=new Game(ch); g.W=1280;g.H=720; let maxEn=0,lv=0,t0=Date.now();
  for(let i=0;i<60*60*31 && !g.over;i++){
    // bot: afasta-se do inimigo mais próximo
    const near=g.enemies.filter(e=>Math.abs(e.x-g.p.x)<420&&Math.abs(e.y-g.p.y)<420);
    let best=null,bs=-1e18; const sp=g.mods.PlayerPxSpeed*100*g.S.moveSpeed;
    for(let k=0;k<16;k++){const a=k/16*6.283,dx=Math.cos(a),dy=Math.sin(a),nx=g.p.x+dx*sp*0.7,ny=g.p.y+dy*sp*0.7; let sc=0;
      for(const e of near){const d=Math.hypot(e.x-nx,e.y-ny)-e.r; if(d<110) sc-= (110-d)*(110-d)/10;} 
      let gm=null,gd=1e9; for(const q of g.gems){const d=Math.hypot(q.x-g.p.x,q.y-g.p.y); if(d<gd){gd=d;gm=q;}} if(gm&&gd<500) sc+=(gd-Math.hypot(gm.x-nx,gm.y-ny))*0.8;
      for(const c of g.chests) sc+=(Math.hypot(c.x-g.p.x,c.y-g.p.y)-Math.hypot(c.x-nx,c.y-ny))*1.5;
      if(sc>bs){bs=sc;best=[dx,dy];}}
    let x=best[0],y=best[1];
    if(g.choices) g.choose(Math.floor(Math.random()*g.choices.length));
    if(g.popup) g.popup=null;
    g.update(1/60,{x,y}); maxEn=Math.max(maxEn,g.enemies.length);
  }
  const m=Math.floor(g.t/60);
  console.log(ch,'fim t='+g.t.toFixed(0)+'s lvl='+g.p.level+' kills='+g.p.kills+' maxEn='+maxEn+' armas='+g.weapons.map(w=>w.id+w.lvl).join(',')+' passivos='+JSON.stringify(g.passives)+' reaper='+g.reaper+' over='+g.over+' cpu='+(Date.now()-t0)+'ms');
  if(g.t>60) ok(g.p.level>=3,ch+' subiu de nível'); else console.log('NOTE '+ch+' morreu cedo ('+g.t.toFixed(0)+'s): limitação do bot (ver README)'); ok(!isNaN(g.p.hp)&&!isNaN(g.p.x),ch+' sem NaN');
}
// 3) evolução via baú
{const g=new Game('ANTONIO'); g.weapons[0].lvl=8; g.passives={MAXHEALTH:1}; g.recalc(); g.openChest(); ok(g.weapons[0].id==='VAMPIRICA','Whip nv8 + Hollow Heart + baú => VAMPIRICA (evidência: evoInto/evoSynergy)');}
{const g=new Game('ANTONIO'); g.weapons[0].lvl=8; g.recalc(); g.openChest(); ok(g.weapons[0].id==='WHIP','sem o passivo NÃO evolui');}
// 4) stats: Antonio +0.1 power no nv10
{const g=new Game('ANTONIO'); g.p.level=9; g.recalc(); const a=g.stat('power'); g.p.level=10; g.recalc(); ok(Math.abs(g.stat('power')-a-0.1)<1e-9,'Antonio power +0.1 no nível 10'); g.p.level=20; g.recalc(); const g20=g.stat('growth'); g.p.level=21; g.recalc(); ok(g20-g.stat('growth')===1,'growth +1 no nv20 cancelado no nv21');}
console.log(fails?('FALHAS: '+fails):'TUDO OK'); process.exit(fails?1:0);
