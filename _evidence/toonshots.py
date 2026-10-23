import time,json
from cdp import Page
jobs={'t_game':'#play=1&god&weap=WHIP,MAGIC_MISSILE,KNIFE,HOLYBOOK&lv=4&t=200&warp=15&frames=30',
      't_orb':'#play=1&god&weap=HALO,EMBER,SILF,STORM&lv=5&t=240&warp=15&frames=30',
      't_boss':'#play=1&god&weap=WHIP,MAGIC_MISSILE,KNIFE&lv=4&t=598&warp=9&frames=30'}
for name,h in jobs.items():
    pg=Page('file:///D:/jogos/vampire-like/index.html'+h)
    try:
        time.sleep(7); pg.shot(name+'.png')
        b=pg.ev("JSON.stringify(window.__bench(120))"); print(name,'erro:',pg.ev('window.__err||"nenhum"'),'| bench:',b)
    finally: pg.close()
