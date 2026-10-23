import re,struct,json
d=open(r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data\resources.assets",'rb').read()
# região da tabela: em torno do hit conhecido
lo=45_000_000; hi=min(len(d),lo+6_000_000)
reg=d[lo:hi]; out={}
pat=re.compile(rb'(?:lang|partyLang|weaponLang|powerUpLang|[A-Za-z]+Lang)/[A-Za-z0-9_{}\-./ ]+')
def eng(pos):
    # procura o primeiro int32 L (1..400) seguido de L bytes imprimíveis (inglês)
    for k in range(pos,pos+64):
        L=struct.unpack_from('<I',reg,k)[0]
        if 1<=L<=600 and k+4+L<=len(reg):
            s=reg[k+4:k+4+L]
            if all(32<=c<127 or c in(10,13) for c in s) and len(s)>0 and not s.startswith((b'lang/',b'partyLang')):
                return s.decode(),k
    return None,None
for m in pat.finditer(reg):
    key=m.group().decode()
    L=struct.unpack_from('<I',reg,m.start()-4)[0] if m.start()>=4 else -1
    if L!=len(key): continue
    end=m.end(); end=(end+3)//4*4
    s,k=eng(end)
    if s is not None: out.setdefault(key,s)
json.dump(out,open('loc_en.json','w',encoding='utf-8'),indent=0,ensure_ascii=False)
print(len(out))
for k in sorted(out):
    if k.startswith('lang/weaponLevelUp') : print(k,'=>',repr(out[k]))
