import re,struct,os,json
base=r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data\resources.assets"
d=open(base,'rb').read()
os.makedirs('json',exist_ok=True)
# TextAsset layout: name(len,str,pad4), script(len,str,pad4). find JSON starts '{' or '[' preceded by int32 length equal to remaining json size
out=[]
i=0
pos=0
for m in re.finditer(rb'[\{\[]\s*"?',d[16000000:17200000]):
    pass
# simpler: scan for int32 length L followed by '{' or '[' where d[o+4+L-1] is '}' or ']'
rng=range(15500000,17500000)
found=[]
o=15500000
end=17500000
while o<end:
    if d[o+4] in (0x7b,0x5b):
        L=struct.unpack_from('<I',d,o)[0]
        if 200<L<5000000 and d[o+4+L-1] in (0x7d,0x5d):
            try:
                j=json.loads(d[o+4:o+4+L].decode('utf-8'))
                found.append((o,L,type(j).__name__,len(j)))
                # name precedes: try read name before
                open(f'json/{o}.json','wb').write(d[o+4:o+4+L])
                o+=4+L; continue
            except Exception: pass
    o+=1
for f in found:
    first=json.loads(open(f'json/{f[0]}.json',encoding='utf-8').read())
    k=list(first.keys())[:3] if isinstance(first,dict) else None
    print(f,k)
