# Gera os sprites dos chefes a partir de imagens livres do Wikimedia Commons (ver CREDITS.md). Uso pessoal local.
import cv2,numpy as np,json,os
from PIL import Image,ImageFilter,ImageDraw
OUT=r'D:\jogos\vampire-like\assets\bosses'; os.makedirs(OUT,exist_ok=True)
def grabcut(bgr,rect,it=7):
    m=np.zeros(bgr.shape[:2],np.uint8); b=np.zeros((1,65)); f=np.zeros((1,65))
    cv2.grabCut(bgr,m,rect,b,f,it,cv2.GC_INIT_WITH_RECT)
    a=np.where((m==cv2.GC_FGD)|(m==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(a)
    if n>1: a=np.where(lab==1+np.argmax(st[1:,cv2.CC_STAT_AREA]),255,0).astype(np.uint8)
    a=cv2.morphologyEx(a,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)); a=cv2.GaussianBlur(a,(5,5),0)
    return a
def rgba(bgr,a): im=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)).convert('RGBA'); im.putalpha(Image.fromarray(a)); return im
def crop_alpha(im):
    bb=im.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox(); return im.crop(bb) if bb else im
def sticker(im,col,height,fade_bottom=0.0,glow=7,edge=3):
    im=crop_alpha(im); w=int(im.width*height/im.height); im=im.resize((w,height),Image.LANCZOS)
    if fade_bottom>0:
        a=np.array(im.getchannel('A'),dtype=np.float32); h=a.shape[0]; k=int(h*fade_bottom); a[h-k:]*=np.linspace(1,0,k)[:,None]; im.putalpha(Image.fromarray(a.astype(np.uint8)))
    pad=glow*3+edge+4; W,H=im.width+pad*2,im.height+pad*2; canvas=Image.new('RGBA',(W,H),(0,0,0,0)); al=Image.new('L',(W,H),0); al.paste(im.getchannel('A'),(pad,pad))
    gl=al.filter(ImageFilter.MaxFilter(edge*2+1)).filter(ImageFilter.GaussianBlur(glow)); g=Image.new('RGBA',(W,H),col+(0,)); g.putalpha(gl.point(lambda v:int(v*0.85))); canvas.alpha_composite(g)
    ed=al.filter(ImageFilter.MaxFilter(edge*2+1)); wh=Image.new('RGBA',(W,H),(255,255,255,0)); wh.putalpha(ed); canvas.alpha_composite(wh)
    canvas.alpha_composite(im,(pad,pad)); return canvas

def medallion(im,ring,size=420,inner=(18,402)):
    im=im.convert('RGB').resize((size,size),Image.LANCZOS); m=Image.new('L',(size,size),0); ImageDraw.Draw(m).ellipse((18,18,size-18,size-18),fill=255)
    dark=tuple(int(c*0.6) for c in ring); c=Image.new('RGBA',(size,size),(0,0,0,0)); dr=ImageDraw.Draw(c)
    dr.ellipse((0,0,size-1,size-1),fill=dark+(255,)); dr.ellipse((6,6,size-7,size-7),fill=ring+(255,)); dr.ellipse((14,14,size-15,size-15),fill=dark+(255,))
    c.paste(im,(0,0),m); dr=ImageDraw.Draw(c); lt=tuple(min(255,int(v*1.3)+40) for v in ring)
    dr.ellipse((18,18,size-18,size-18),outline=lt+(255,),width=4); dr.arc((4,4,size-5,size-5),200,320,fill=(255,255,255,235),width=5); return c
def sq_crop(path,cx,cy,side):
    im=Image.open(path).convert('RGB'); pad=Image.new('RGB',(im.width+2*side,im.height+2*side),(40,40,40)); pad.paste(im,(side,side))
    return pad.crop((cx-side//2+side,cy-side//2+side,cx+side//2+side,cy+side//2+side))
res={}
# ELON (domínio público) e TRUMP (domínio público): medalhões em volta do rosto
res['ELON']=sticker(medallion(sq_crop('dl/elon.jpg',440,480,900),(110,190,240)),(127,208,255),210,glow=8)
res['TRUMP']=sticker(medallion(sq_crop('dl/trump.jpg',490,520,1000),(255,170,70)),(255,176,80),210,glow=8)
# PEPE: azulejo do arquivo CC0, azul -> verde
p=cv2.imread('dl/pepe.png'); tile=p[171:333,0:192].copy(); tile=cv2.resize(tile,None,fx=3,fy=3,interpolation=cv2.INTER_CUBIC)
hsv=cv2.cvtColor(tile,cv2.COLOR_BGR2HSV); H0=hsv[...,0]; blue=(H0>=85)&(H0<=135)&(hsv[...,1]>60); hsv[...,0][blue]=57
tile=cv2.cvtColor(hsv,cv2.COLOR_HSV2BGR)
bgc=tile[3:12,3:12].reshape(-1,3).mean(0); diff=np.abs(tile.astype(int)-bgc).sum(2); cand=(diff<60).astype(np.uint8)*255
flood=cand.copy(); mask=np.zeros((flood.shape[0]+2,flood.shape[1]+2),np.uint8)
bgm=np.zeros(cand.shape,np.uint8)
n,lab=cv2.connectedComponents(cand)
edge_labels=set(np.unique(np.concatenate([lab[0,:],lab[-1,:],lab[:,0],lab[:,-1]])))-{0}
for l in edge_labels: bgm[lab==l]=255
a=255-bgm; a=cv2.morphologyEx(a,cv2.MORPH_OPEN,np.ones((5,5),np.uint8)); a=cv2.GaussianBlur(a,(5,5),0)
res['PEPE']=sticker(rgba(tile,a),(111,224,111),210)
# DOGE: medalhão redondo dourado com o Kabosu (foto CC0)
d=Image.open('dl/doge1.jpg').convert('RGB'); cx,cy,r=442,303,307
pad=Image.new('RGB',(d.width,d.height+400),(150,130,110)); pad.paste(d,(0,0)); crop=pad.crop((cx-r,cy-r,cx+r,cy+r)).resize((420,420),Image.LANCZOS)
m=Image.new('L',(420,420),0); ImageDraw.Draw(m).ellipse((18,18,402,402),fill=255)
coin=Image.new('RGBA',(420,420),(0,0,0,0)); dr=ImageDraw.Draw(coin); dr.ellipse((0,0,419,419),fill=(176,128,20,255)); dr.ellipse((6,6,413,413),fill=(245,197,24,255)); dr.ellipse((14,14,405,405),fill=(200,150,20,255))
coin.paste(crop,(0,0),m); dr=ImageDraw.Draw(coin); dr.ellipse((18,18,402,402),outline=(255,225,120,255),width=4); dr.arc((4,4,415,415),200,320,fill=(255,245,190,255),width=5)
res['DOGE']=sticker(coin,(242,192,106),210,glow=8)
# BULL (touro Brahman, CC BY-SA 4.0) + moeda de Bitcoin (domínio público)
b=cv2.imread('dl/bullC.jpg'); a=grabcut(b,(140,8,740,700)); bull=rgba(b,a); bull=crop_alpha(bull)
btc=Image.open('dl/btc.png').convert('RGBA').resize((int(bull.height*0.28),)*2,Image.LANCZOS)
bw,bh=bull.size; chain=ImageDraw.Draw(bull); cxn,cyn=int(bw*0.24),int(bh*0.44)
bull.alpha_composite(btc,(cxn,cyn)); res['BULL']=sticker(bull,(255,138,58),210)
for k,im in res.items(): im.save(f'{OUT}/{k}.png'); print(k,im.size)
# folha de conferência
W=Image.new('RGBA',(5*300,300),(60,70,60,255)); 
for i,(k,im) in enumerate(res.items()):
    t=im.copy(); t.thumbnail((290,290)); W.alpha_composite(t,(i*300+5,5))
W.save('dl/bosses_sheet.png')
