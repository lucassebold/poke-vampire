# Navegador real: A cai, B chega perto da lápide, barra de ressurreição, A volta. Capturas em v8_revive_*.png
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/#online&play=2&name=Misty', port=9391); B = Page('http://localhost:8780/#online&play=5&name=Brock', port=9392)
st = lambda pg: pg.ev("(()=>{const g=window.__game;return JSON.stringify({dead:g.dead,hp:Math.round(g.p.hp),lv:g.p.level,reviving:g.reviving,tombs:g.tombs,err:window.__err||null})})()")
try:
    time.sleep(5)
    A.ev("window.__game.send({t:'dbg_kill'})"); time.sleep(1.2)
    print('A apos cair :', st(A)); A.shot(os.path.join(OUT, 'v8_revive_1_caiu.png'))
    B.cmd('Input.dispatchKeyEvent', type='keyDown', key='d', code='KeyD'); time.sleep(0.35); B.cmd('Input.dispatchKeyEvent', type='keyUp', key='d', code='KeyD')
    time.sleep(2.5); print('A durante   :', st(A)); B.shot(os.path.join(OUT, 'v8_revive_2_barra_B.png')); A.shot(os.path.join(OUT, 'v8_revive_2_barra_A.png'))
    time.sleep(4); print('A depois    :', st(A)); A.shot(os.path.join(OUT, 'v8_revive_3_voltou.png'))
finally:
    A.close(); B.close()
