import time,json
from cdp import Page
pg=Page('file:///D:/jogos/vampire-like/index.html')
try:
    time.sleep(5); print('menu  -> label:',pg.ev("VSAudio.label"),'| ctx:',pg.ev("VSAudio.status().ctx"))
    pg.shot('fin_menu.png')
    pg.cmd('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',windowsVirtualKeyCode=13); pg.cmd('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)
    time.sleep(6)
    st=json.loads(pg.ev("JSON.stringify({state:!!window.__game,t:__game&&+__game.t.toFixed(1),a:VSAudio.status(),err:window.__err||null})"))
    print('jogo  -> iniciou:',st['state'],'t=',st['t'],'| música:',st['a']['cur'],'| sfx:',st['a']['sfx'],'| bgm:',len(st['a']['bgm']),'/6 | ctx:',st['a']['ctx'],'| erro:',st['err'])
    pg.key('m','KeyM'); time.sleep(0.4); print('tecla M -> muted:',pg.ev("VSAudio.status().muted"),'| label:',pg.ev("VSAudio.label"))
    pg.key('m','KeyM'); time.sleep(0.4); print('tecla M -> muted:',pg.ev("VSAudio.status().muted"))
    pg.shot('fin_game.png')
finally: pg.close()
