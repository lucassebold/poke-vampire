import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
A = Page('http://localhost:8780/#online&play=2&name=Misty', port=9361)
try:
    for i in range(6):
        time.sleep(3); print(A.ev("(()=>{const g=window.__game;return JSON.stringify({t:g.t,lv:g.p.level,xp:g.p.xp,need:g.me.need,kills:g.p.kills,hp:g.p.hp,gems:g.gems.length,en:g.enemies.length,w:g.weapons.map(w=>w.id),ch:g.choices,st:g.me.st,dead:g.dead,err:window.__err})})()"))
finally: A.close()
