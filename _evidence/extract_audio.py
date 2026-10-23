# Extrai SFX e músicas do jogo instalado (uso pessoal local), normaliza com ffmpeg e gera arquivos .js com base64 (funciona via file://).
import UnityPy,os,subprocess,glob,re,json,base64,shutil,sys
base=r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data"; B=base+r"\StreamingAssets\aa\StandaloneWindows64"
FF=shutil.which('ffmpeg') or glob.glob(r'C:\Users\lucas\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\ffmpeg.exe')[0]
OUT=r'D:\jogos\vampire-like'; AD=OUT+r'\assets\audio'; os.makedirs(AD,exist_ok=True); TMP=os.path.abspath('audiotmp'); os.makedirs(TMP,exist_ok=True)
SFX={ # chave lógica : (clipe, duração máx em s ou None)
 'hit':('sfx_enemyHit',None),'kill':('sfx_exp_shortest_soft10',None),'gem':('sfx_littlepickup',None),'coin':('sfx_coin_double4',None),
 'levelup':('sfx_levelup',None),'choose':('sfx_sounds_interaction13',None),'chest':('sfx_treasure_found',None),'evolve':('sfx_wheelOfFortuneFanfare',None),
 'hurt':('sfx_wpn_punch4',None),'gameover':('sfx_gameOver',None),'pause_in':('sfx_sounds_pause7_in',None),'pause_out':('sfx_sounds_pause7_out',None),
 'warn_gong':('sfx_evilgong',4.0),'warn_alarm':('sfx_alarm_loop6',None),'boss_die':('sfx_victory2',None),'boss_boom':('sfx_exp_cluster8',None),
 'boss_shot':('sfx_guns1',None),'boss_dash':('sfx_wingsB',None),'boss_shock':('sfx_exp_medium11',None),'boss_land':('sfx_impact',None),'reaper':('sfx_DeathBreath',None),
 'w_whip':('sfx_attack1',None),'w_wand':('sfx_projectile',None),'w_holy':('sfx_projectile_magic4',0.6),'w_knife':('sfx_weapon_singleshot18',None),
 'w_axe':('sfx_attack_sword4',None),'w_scythe':('sfx_sword_klang',None),'w_cross':('sfx_flikA',None),'w_fire':('sfx_Fireball',None),'w_fireboom':('sfx_explo_soft',None),
 'w_lightning':('sfx_lightningimpact',None),'w_garlic':('sfx_bubble',None),'w_bottle':('sfx_potBreak',None),'w_bounce':('sfx_bumper3',None),'w_birds':('sfx_wingsA',None),
 'w_song':('sfx_MagicWord_02',None),'w_nova':('sfx_forbiddenSpell',3.5),'w_shieldup':('sfx_sounds_powerup2',None),'w_shieldhit':('glass05',None),'w_orbit':('sfx_sounds_powerup9',None),
 'ui_start':('sfx_sounds_powerup18',None),
}
MUSIC={'forest':'vs_local_assets_bgm_elrond_forest.bundle','boss0':'vs_local_assets_bgm_elrond_boss0.bundle','boss1':'vs_local_assets_bgm_elrond_boss1.bundle','boss2':'vs_local_assets_bgm_elrond_boss2.bundle','boss3':'vs_local_assets_bgm_elrond_boss3.bundle','boss4':'vs_local_assets_bgm_elrond_boss4.bundle'}
def run(*a): return subprocess.run([FF,'-y','-hide_banner','-loglevel','error',*a],capture_output=True,text=True)
def meanmax(wav):
    r=subprocess.run([FF,'-hide_banner','-i',wav,'-af','volumedetect','-f','null','-'],capture_output=True,text=True).stderr
    m=re.search(r'mean_volume: (-?[\d.]+) dB',r); x=re.search(r'max_volume: (-?[\d.]+) dB',r); return (float(m.group(1)) if m else -30,float(x.group(1)) if x else -3)
def encode(wav,ogg,target,maxdur=None,mono=True,q=3,fade=0.0):
    mean,mx=meanmax(wav); gain=max(-12,min(14,target-mean)); gain=min(gain,-1.5-mx)   # pico final <= -1.5 dB
    af=f'volume={gain:.1f}dB'
    if maxdur: af+=f',afade=t=out:st={max(0,maxdur-0.4)}:d=0.4'
    args=['-i',wav]+(['-t',str(maxdur)] if maxdur else [])+['-af',af]+(['-ac','1'] if mono else [])+['-ar','44100' if not mono else '32000','-c:a','libvorbis','-q:a',str(q),ogg]
    r=run(*args); return gain,(r.stderr or '')[:100]
# 1) SFX (resources.assets)
env=UnityPy.load(base+r'\resources.assets'); clips={}
for o in env.objects:
    if o.type.name=='AudioClip': d=o.read(); clips[d.m_Name]=d
sfx={}; rep=[]
for key,(name,md) in SFX.items():
    d=clips.get(name)
    if d is None: rep.append(('FALTA',key,name)); continue
    s=d.samples; k,v=next(iter(s.items())); wav=f'{TMP}/{key}.wav'; open(wav,'wb').write(v)
    ogg=f'{AD}/{key}.ogg'; g,err=encode(wav,ogg,-20,md,mono=True,q=3)
    if not os.path.exists(ogg): rep.append(('ERRO',key,err)); continue
    sfx[key]=base64.b64encode(open(ogg,'rb').read()).decode(); rep.append(('ok',key,name,round(g,1),os.path.getsize(ogg)))
open(OUT+'/audio_sfx.js','w',encoding='utf-8').write('// GERADO por _evidence/extract_audio.py (efeitos do jogo instalado, uso local)\nwindow.VS_SFX='+json.dumps({k:'data:audio/ogg;base64,'+v for k,v in sfx.items()})+';\n')
# 2) músicas (bundles)
for key,b in MUSIC.items():
    e=UnityPy.load(os.path.join(B,b)); d=[o.read() for o in e.objects if o.type.name=='AudioClip'][0]
    k,v=next(iter(d.samples.items())); wav=f'{TMP}/{key}.wav'; open(wav,'wb').write(v)
    ogg=f'{AD}/bgm_{key}.ogg'; g,err=encode(wav,ogg,-19,None,mono=False,q=4)
    open(OUT+f'/audio_bgm_{key}.js','w',encoding='utf-8').write(f"window.VS_BGM=window.VS_BGM||{{}};window.VS_BGM['{key}']='data:audio/ogg;base64,'+'{base64.b64encode(open(ogg,'rb').read()).decode()}';\n")
    rep.append(('ok','bgm_'+key,d.m_Name,round(g,1),os.path.getsize(ogg)))
json.dump(rep,open('audio_report.json','w'))
tot=sum(r[4] for r in rep if r[0]=='ok'); print('clipes ok:',sum(r[0]=='ok' for r in rep),'| problemas:',[r for r in rep if r[0]!='ok'],'| bytes OGG:',tot)
for r in rep:
    if r[0]=='ok' and (r[1].startswith('bgm') or r[4]>40000): print(' ',r)
