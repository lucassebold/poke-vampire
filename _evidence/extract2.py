import UnityPy,os,re,json,collections
B=r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data\StreamingAssets\aa\StandaloneWindows64"
want=['enemies','enemies_universal','enemies2','forest','bg_forest','damagenumbers','titlefont-export','titlefont-white','runefont-export','ui_stageicons','ui_menu','vfx_enemyexplosion','em_vfx','custom_vfxspriteadditive']+['character_'+c for c in ['antonio','imelda','gennaro','arca','porta','lama','poe','dommario','krochi']]
out=os.path.abspath('raw2'); summ={}
for w in want:
    p=os.path.join(B,'vs_local_assets_'+w+'.bundle')
    if not os.path.exists(p): print('NO',w); continue
    env=UnityPy.load(p); names=[]; tex=[]
    os.makedirs(f'{out}/{w}',exist_ok=True)
    for o in env.objects:
        try:
            if o.type.name=='Sprite':
                d=o.read(); n=re.sub(r'[^\w.\-]','_',d.m_Name); d.image.save(f'{out}/{w}/{n}.png'); names.append(n)
            elif o.type.name=='Texture2D':
                d=o.read(); tex.append((d.m_Name,d.m_Width,d.m_Height)); d.image.save(f'{out}/{w}/__tex_{re.sub(r"[^\w.-]","_",d.m_Name)}.png')
            elif o.type.name=='TextAsset':
                d=o.read(); open(f'{out}/{w}/{d.m_Name}.txt','wb').write(bytes(d.m_Script.encode('utf-8','surrogateescape')) if isinstance(d.m_Script,str) else bytes(d.m_Script))
        except Exception as e: print('ERR',w,o.type.name,str(e)[:70])
    summ[w]=(len(names),tex,sorted(names)[:8])
    print(w,len(names),tex,sorted(names)[:6])
