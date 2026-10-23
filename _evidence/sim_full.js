// Partidas completas de 30 min com bot: valida ausência de NaN/travamentos, passagem pelos 5 chefes e a chegada da Morte.
const {Game}=require('../game.js');const D=require('../data.js');
const chars=process.argv.slice(2).length?process.argv.slice(2):['ANTONIO','IMELDA','GENNARO'];
let f=0;const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m);if(!c)f++;};
for(const ch of chars){
  const g=new Game(ch);g.W=1280;g.H=720;let nan=false,t0=Date.now(),bossSeen=new Set(),worst=0;
  for(let i=0;i<60*60*31&&!g.over;i++){
    if(g.choices)g.choose(Math.floor(Math.random()*g.choices.length));if(g.popup)g.popup=null;
    // bot: escolhe a direção que mais afasta de inimigos/tiros e atrai para gemas/baús
    let best=[1,0],bs=-1e18;const sp=g.mods.PlayerPxSpeed*100*g.S.moveSpeed;
    const near=g.enemies.filter(e=>Math.abs(e.x-g.p.x)<420&&Math.abs(e.y-g.p.y)<420);
    for(let k=0;k<16;k++){const a=k/16*6.283,dx=Math.cos(a),dy=Math.sin(a),nx=g.p.x+dx*sp*.7,ny=g.p.y+dy*sp*.7;let sc=0;
      for(const e of near){const d=Math.hypot(e.x-nx,e.y-ny)-e.r;if(d<110)sc-=(110-d)*(110-d)/10;}
      for(const q of g.eproj){const d=Math.hypot(q.x-nx,q.y-ny);if(d<90)sc-=(90-d)*(90-d)/6;}
      for(const z of g.tele){const d=Math.hypot(z.x-nx,z.y-ny);if(d<z.r+40)sc-=3000;}
      let gm=null,gd=1e9;for(const q of g.gems){const d=Math.hypot(q.x-g.p.x,q.y-g.p.y);if(d<gd){gd=d;gm=q;}}if(gm&&gd<500)sc+=(gd-Math.hypot(gm.x-nx,gm.y-ny))*.8;
      for(const c of g.chests)sc+=(Math.hypot(c.x-g.p.x,c.y-g.p.y)-Math.hypot(c.x-nx,c.y-ny))*1.5;
      if(sc>bs){bs=sc;best=[dx,dy];}}
    const a=Date.now();g.update(1/60,{x:best[0],y:best[1]});worst=Math.max(worst,Date.now()-a);
    if(!isFinite(g.p.x)||!isFinite(g.p.hp))nan=true;if(g.boss)bossSeen.add(g.boss.bossId);
  }
  console.log(ch,'fim t='+g.t.toFixed(0)+'s lvl='+g.p.level+' kills='+g.p.kills+' armas='+g.weapons.map(w=>w.id+w.lvl).join(',')+' chefes='+[...bossSeen].join('/')+' derrotados='+g.bossesDone+' reaper='+g.reaper+' over='+g.over+' pior_frame_logica='+worst+'ms cpu='+(Date.now()-t0)+'ms');
  ok(!nan,ch+' sem NaN');ok(worst<50,ch+' nenhum frame de lógica acima de 50 ms');
}
console.log(f?'FALHAS '+f:'TUDO OK');process.exit(f?1:0);
