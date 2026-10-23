// Compara os primeiros 3 min de cada personagem (jogador parado/andando em círculo): abates, nível, vida mínima.
const {Game}=require('../game.js');
for(const ch of process.argv.slice(2)){let rs=[];for(let k=0;k<4;k++){const g=new Game(ch);g.W=1280;g.H=720;let minHp=1e9,t0=null;
  for(let i=0;i<180*60&&!g.over;i++){const a=g.t*0.8;if(g.choices)g.choose(Math.floor(Math.random()*g.choices.length));if(g.popup)g.popup=null;g.update(1/60,{x:Math.cos(a),y:Math.sin(a)});minHp=Math.min(minHp,g.p.hp/g.S.maxHp);}
  rs.push([g.p.kills,g.p.level,Math.round(minHp*100),g.over?Math.round(g.t):'-']);}
  console.log(ch.padEnd(9),'[abates,nivel,vidaMin%,morreu_em] ',JSON.stringify(rs));}
