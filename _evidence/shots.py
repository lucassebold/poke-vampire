import sys,time
from cdp import Page
jobs={'orbA':'#play=1&god&weap=HALO,EMBER,FROST,STORM&lv=6&t=240&warp=12&frames=40','orbB':'#play=1&god&weap=CROWN,SOLAR,GLACIER,THUNDER&lv=1&t=240&warp=12&frames=40','orbC':'#play=1&god&weap=HALO,FROST&lv=3&t=240&warp=12&frames=40'}
for name,h in jobs.items():
    pg=Page('file:///D:/jogos/vampire-like/index.html'+h)
    try: time.sleep(6); pg.shot(f'o_{name}.png'); print(name,pg.ev('window.__err||"sem erro"'))
    finally: pg.close()
