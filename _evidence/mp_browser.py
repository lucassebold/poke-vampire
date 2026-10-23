# Teste no navegador real (Edge headless): 2 jogadores online na mesma sala. uso: python mp_browser.py [segundos]
import sys, time, json, subprocess, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 12
OUT = os.path.dirname(os.path.abspath(__file__))
def down(pg, code, key):
    pg.cmd('Input.dispatchKeyEvent', type='keyDown', key=key, code=code)
def up(pg, code, key):
    pg.cmd('Input.dispatchKeyEvent', type='keyUp', key=key, code=code)
A = Page('http://localhost:8780/#online&play=1&name=Ash', port=9341)
B = Page('http://localhost:8780/#online&play=3&name=Red', port=9342)
try:
    time.sleep(6)
    shot_cards = False
    for i in range(SECS):
        time.sleep(1)
        if i == 3: B.key('z', 'KeyZ')
        if i == 5: A.key('c', 'KeyC')
        if not shot_cards and A.ev("!!(window.__game&&window.__game.choices)"):
            time.sleep(0.4); A.shot(os.path.join(OUT, 'v8_online_cards.png')); shot_cards = True
        if A.ev("!!(window.__game&&window.__game.over)"): break
    for pg, nm in ((A, 'A'), (B, 'B')):
        s = pg.ev("(()=>{const g=window.__game;return JSON.stringify({err:window.__err||null,state:g&&g.state,got:g&&g.gotSnap,roster:g&&g.roster.map(r=>r.nick),others:g&&g.others.map(o=>[o.nick,Math.round(o.x),Math.round(o.y),o.st]),me:g&&[Math.round(g.p.x),Math.round(g.p.y),g.p.level,g.p.hp],en:g&&g.enemies.length,t:g&&g.t,kills:g&&g.p.kills,over:g&&g.over,reason:g&&g.endReason,title:document.title,err2:g&&g.error})})()")
        print(nm, s)
    A.shot(os.path.join(OUT, 'v8_online_A.png')); B.shot(os.path.join(OUT, 'v8_online_B.png'))
finally:
    A.close(); B.close()
