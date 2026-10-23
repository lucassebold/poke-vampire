import time,json,sys
from cdp import Page
pg=Page('file:///D:/jogos/vampire-like/index.html#play=1&god&weap=WHIP,MAGIC_MISSILE,KNIFE&lv=5&t=294')
try:
    time.sleep(3); pg.key()
    pg.ev("window.__f=0;(function c(){window.__f++;requestAnimationFrame(c)})();window.__t0=performance.now();0")
    log=[]; t0=time.time(); last=None
    while time.time()-t0<45:
        time.sleep(0.5); pg.ev("if(__game.choices)__game.choose(0);if(__game.popup)__game.popup=null;0")
        st=pg.ev("JSON.stringify({ph:__game&&__game.phase,t:+__game.t.toFixed(1),boss:__game.boss&&__game.boss.bossId,a:VSAudio.status(),err:window.__err||null,fps:Math.round(window.__f*1000/(performance.now()-window.__t0))})")
        d=json.loads(st); key=(d['ph'],d['a']['cur'])
        if key!=last: last=key; log.append((round(time.time()-t0,1),d['t'],d['ph'],d['a']['cur'],d['a']['duck'],d['fps'],d['err'])); 
        if d['ph']=='normal' and d['a']['cur']=='forest' and len(log)>=4: break
    for l in log: print(l)
    print('ctx:',d['a']['ctx'],'sfx:',d['a']['sfx'],'bgm:',d['a']['bgm'],'fps medio:',d['fps'])
    pg.shot('live_boss.png')
finally: pg.close()
