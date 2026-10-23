import UnityPy,os,json,re
base=r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data"
out=os.path.join(os.getcwd(),'raw'); os.makedirs(out+'/sprites',exist_ok=True); os.makedirs(out+'/fonts',exist_ok=True); os.makedirs(out+'/text',exist_ok=True)
idx=[]
for f in ['resources.assets','sharedassets0.assets','sharedassets1.assets','sharedassets3.assets','globalgamemanagers.assets']:
    env=UnityPy.load(os.path.join(base,f))
    for o in env.objects:
        t=o.type.name
        try:
            if t=='Sprite':
                d=o.read(); n=re.sub(r'[^\w.\-]','_',d.m_Name)
                img=d.image
                p=f'{out}/sprites/{n}'
                if os.path.exists(p): p=f'{out}/sprites/{f[:6]}_{n}'
                img.save(p if p.endswith('.png') else p+'.png')
                idx.append((f,n,img.size[0],img.size[1]))
            elif t=='Font':
                d=o.read(); data=bytes(d.m_FontData) if d.m_FontData else b''
                print('FONT',f,d.m_Name,len(data))
                if data: open(f'{out}/fonts/{d.m_Name}.ttf','wb').write(data)
            elif t=='TextAsset':
                d=o.read(); 
                open(f'{out}/text/{f[:6]}_{d.m_Name}.txt','wb').write(d.m_Script.encode('utf-8','surrogateescape') if isinstance(d.m_Script,str) else bytes(d.m_Script))
        except Exception as e: print('ERR',f,t,getattr(o,'path_id',''),str(e)[:80])
json.dump(idx,open(out+'/index.json','w'))
print(len(idx))
