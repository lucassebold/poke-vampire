import struct,sys
p=r"D:\Steam\steamapps\common\Vampire Survivors\VampireSurvivors_Data\il2cpp_data\Metadata\global-metadata.dat"
d=open(p,'rb').read()
magic,ver=struct.unpack_from('<Ii',d,0)
print(hex(magic),ver)
# header: pairs of (offset,size) int32 starting at 8
hdr=struct.unpack_from('<40i',d,8)
names=['stringLiteral','stringLiteralData','string','events','properties','methods','parameterDefaultValues','fieldDefaultValues','fieldAndParameterDefaultValueData','fieldMarshaledSizes','parameters','fields','genericParameters','genericParameterConstraints','genericContainers','nestedTypes','interfaces','vtableMethods','interfaceOffsets','typeDefinitions']
for i,n in enumerate(names): print(n,hdr[2*i],hdr[2*i+1])
so,ss=hdr[4],hdr[5]
blob=d[so:so+ss]
strs=blob.split(b'\0')
open('names.txt','w',encoding='utf-8').write('\n'.join(s.decode('utf-8','replace') for s in strs))
print(len(strs))
