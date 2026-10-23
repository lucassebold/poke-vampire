# Veste o sprite do Antonio de xerife do velho oeste: chapéu, estrela, lenço vermelho e colete de couro (pixel-art desenhado por código sobre os frames originais).
import numpy as np,colorsys,os
from PIL import Image,ImageDraw
A=r'D:\jogos\vampire-like\assets'; os.makedirs(A+r'\chars_sheriff',exist_ok=True); os.makedirs(A+r'\portraits_sheriff',exist_ok=True)
PAD=10
def recolor(im):
    a=np.array(im).astype(np.float32); rgb=a[...,:3]/255; out=a.copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]==0: continue
            h,s,v=colorsys.rgb_to_hsv(*rgb[y,x]); H=h*360
            if s>0.28 and 200<=H<=260:            # faixa azul -> lenço vermelho
                nh,ns,nv=0.0,min(1,s*1.05),min(1,v*1.0+0.05)
            elif s>0.12 and 70<=H<=170:           # colete verde -> couro marrom
                nh,ns,nv=28/360,min(1,s*1.9+0.12),v*0.92
            else: continue
            r,g,b=colorsys.hsv_to_rgb(nh,ns,nv); out[y,x,:3]=[r*255,g*255,b*255]
    return Image.fromarray(out.astype(np.uint8),'RGBA')
STAR=["...X...","..XXX..","XXXXXXX",".XXXXX.",".XX.XX.",".X...X."]
def star(img,cx,cy,col,edge):
    px=img.load(); pts=[(x-3,y-2) for y,r in enumerate(STAR) for x,c in enumerate(r) if c=='X']
    S=set((cx+x,cy+y) for x,y in pts)
    for (x,y) in list(S):
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            if (x+dx,y+dy) not in S and 0<=x+dx<img.width and 0<=y+dy<img.height: px[x+dx,y+dy]=edge
    for (x,y) in S:
        if 0<=x<img.width and 0<=y<img.height: px[x,y]=col
def dress(path,out):
    base=Image.open(path).convert('RGBA'); w,h=base.size; im=recolor(base)
    a=np.array(im)[...,3]; ys=np.where(a.max(1)>0)[0]; y0=ys.min()
    rows=a[y0:y0+7]; xs=np.where(rows.max(0)>0)[0]; cx=(xs.min()+xs.max())/2+0.5; hw=xs.max()-xs.min()+1
    canvas=Image.new('RGBA',(w+8,h+2*PAD),(0,0,0,0)); canvas.alpha_composite(im,(4,PAD)); ox=4; oy=PAD
    hat=Image.new('RGBA',canvas.size,(0,0,0,0)); d=ImageDraw.Draw(hat)
    CX=int(round(cx))+ox; by=y0+oy+1            # y da aba (brim): acima da testa
    tan,shade,band,dark,gold=(196,150,86,255),(150,106,56,255),(70,38,18,255),(32,18,8,255),(255,214,64,255)
    cw=7                    # copa
    d.rectangle([CX-cw//2,by-5,CX+cw//2,by-1],fill=tan)                      # copa
    d.rectangle([CX-cw//2,by-5,CX-cw//2+1,by-1],fill=shade)                   # sombra lateral
    d.rectangle([CX-1,by-5,CX,by-5],fill=shade)                               # vinco no topo
    d.rectangle([CX-cw//2,by-2,CX+cw//2,by-2],fill=band)                      # faixa
    bw=cw+6                                                                   # aba larga e curva
    d.rectangle([CX-bw//2,by-1,CX+bw//2-1,by+1],fill=tan)
    d.rectangle([CX-bw//2,by+1,CX+bw//2-1,by+1],fill=shade)
    d.point([(CX-bw//2,by-2),(CX+bw//2-1,by-2),(CX-bw//2+1,by-2),(CX+bw//2-2,by-2)],fill=tan)  # pontas viradas pra cima
    # contorno escuro 1px
    al=np.array(hat)[...,3]>0; ol=al.copy(); ol[1:]|=al[:-1]; ol[:-1]|=al[1:]; ol[:,1:]|=al[:,:-1]; ol[:,:-1]|=al[:,1:]; ol&=~al
    ho=np.array(hat); ho[ol]=dark; hat=Image.fromarray(ho,'RGBA')
    canvas.alpha_composite(hat)
    # estrela de xerife no peito e lenço
    star(canvas,CX+2,y0+oy+13,gold,dark)
    canvas.save(out); return canvas,(CX,y0+oy)
if __name__=='__main__':
    res=[]
    for n in range(1,5):
        c,(cx,y0)=dress(f'{A}/chars/ANTONIO_{n}.png',f'{A}/chars_sheriff/ANTONIO_{n}.png'); res.append(c)
    p=res[0].crop((cx-9,y0-8,cx+9,y0+10)); p.save(f'{A}/portraits_sheriff/ANTONIO.png')
    S=10; W=Image.new('RGBA',(4*(res[0].width*S+10)+200,res[0].height*S+10),(70,90,70,255))
    for i,c in enumerate(res): W.alpha_composite(c.resize((c.width*S,c.height*S),Image.NEAREST),(i*(c.width*S+10)+5,5))
    pp=Image.open(f'{A}/portraits_sheriff/ANTONIO.png').resize((180,180),Image.NEAREST); W.alpha_composite(pp,(4*(res[0].width*S+10)+10,5)); W.save('raw/sheriff_preview.png'); print(res[0].size,'ok')
