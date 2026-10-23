// Mede DPS contra dummies imóveis/imortais. A = "multidão" (40 dummies num disco de raio 230); B = alvo único (média em 60/90/120 px).
// Referência de balanceamento: King Bible (HOLYBOOK) no mesmo nível; evoluções comparadas com Vespers.
const {Game,weaponMax,ARCH}=require('../game.js');const D=require('../data.js');
function run(id,lvl,dummies,secs=30){
  const g=new Game('ANTONIO');g.W=1280;g.H=720;g.godMode=true;g.weapons=[];g.addWeapon(id);g.weapons[0].lvl=lvl;g.weapons[0].cd=0.01;g.recalc();
  g.waveIdx=0;g.phase='boss';let tot=0;const oh=g.hit.bind(g);g.hit=(e,d,w,k)=>{tot+=d;return oh(e,d,w,k);};
  for(const [x,y] of dummies){const e=g.spawn('ZOMBIE',x,y);e.hp=1e15;e.max=1e15;e.spd=0;e.kb=0;e.pow=0;e.r=12;}
  for(let i=0;i<secs*60;i++){if(g.choices)g.choose(0);if(g.popup)g.popup=null;g.update(1/60,{x:0,y:0});}
  return tot/secs;
}
let s=12345;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const crowd=[];for(let i=0;i<40;i++){const r=30+Math.sqrt(rnd())*200,a=rnd()*6.283;crowd.push([Math.cos(a)*r,Math.sin(a)*r]);}
const A=(id,l)=>run(id,l,crowd), Bm=(id,l)=>[60,90,120].map(r=>run(id,l,[[r,0]])).reduce((a,b)=>a+b)/3;
const only=(process.argv[2]||'').split(',').filter(Boolean);
const base0=['HOLYBOOK','GARLIC','SILF','WHIP','MAGIC_MISSILE','LIGHTNING','HALO','EMBER','FROST','STORM'];
const evos0=['VESPERS','VORTEX','SILF3','VAMPIRICA','HOLY_MISSILE','LOOP','CROWN','SOLAR','GLACIER','THUNDER'];
const isEvo=id=>!!D.weapons[id][0].isEvolution;
const base=only.length?only.filter(i=>!isEvo(i)):base0, evos=only.length?only.filter(isEvo):evos0;
const res={};const f=x=>x.toFixed(0).padStart(5);
console.log('DPS (dano/s):  A=multidão  B=alvo único   | razão vs King Bible (A / B)');
for(const l of [1,4,8]){
  const ref={A:A('HOLYBOOK',l),B:Bm('HOLYBOOK',l)};console.log('\n-- nível',l,'(King Bible: A='+f(ref.A)+' B='+f(ref.B)+')');
  for(const id of base){const a=A(id,l),b=Bm(id,l);res[id+l]=[a,b];console.log('  '+id.padEnd(14),'A='+f(a),'B='+f(b),'|',(a/ref.A).toFixed(2),'/',(b/ref.B).toFixed(2));}
}
const refE={A:A('VESPERS',1),B:Bm('VESPERS',1)};console.log('\n-- evoluções (nível 1; Vespers: A='+f(refE.A)+' B='+f(refE.B)+')');
for(const id of evos){const a=A(id,1),b=Bm(id,1);res[id]=[a,b];console.log('  '+id.padEnd(14),'A='+f(a),'B='+f(b),'|',(a/refE.A).toFixed(2),'/',(b/refE.B).toFixed(2));}
require('fs').writeFileSync(__dirname+'/dps_result.json',JSON.stringify(res));
