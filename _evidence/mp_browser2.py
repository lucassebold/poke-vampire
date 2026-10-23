# Captura: cartões de level-up (não pausam), emote, tela de espera/queda e resultados. uso: python mp_browser2.py <modo> ; modo = cards | results
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
mode = sys.argv[1] if len(sys.argv) > 1 else 'cards'; OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/#online&play=2&name=Misty', port=9351); B = Page('http://localhost:8780/#online&play=5&name=Brock', port=9352)
try:
    time.sleep(5)
    if mode == 'cards':
        dirs = [('KeyD','d'),('KeyS','s'),('KeyA','a'),('KeyW','w')]; cur = None
        for i in range(160):
            if A.ev("!!(window.__game&&window.__game.choices)"): break
            if i % 4 == 0:
                if cur: A.cmd('Input.dispatchKeyEvent', type='keyUp', key=cur[1], code=cur[0])
                cur = dirs[(i // 4) % 4]; A.cmd('Input.dispatchKeyEvent', type='keyDown', key=cur[1], code=cur[0])
            time.sleep(0.25)
        if cur: A.cmd('Input.dispatchKeyEvent', type='keyUp', key=cur[1], code=cur[0])
        t0 = A.ev("window.__game.t"); A.shot(os.path.join(OUT, 'v8_online_cards.png')); time.sleep(1.0)
        print('t antes/depois da captura (jogo nao pausou):', t0, A.ev("window.__game.t"), 'choices:', A.ev("JSON.stringify(window.__game.choices)"), 'ct', A.ev("window.__game.choiceT"))
        A.key('1', 'Digit1'); time.sleep(0.5); print('apos tecla 1, choices =', A.ev("JSON.stringify(window.__game.choices)"), 'lv', A.ev("window.__game.p.level"))
        B.key('z', 'KeyZ'); time.sleep(0.5); A.shot(os.path.join(OUT, 'v8_online_emote.png')); B.shot(os.path.join(OUT, 'v8_online_emote_B.png'))
    else:
        fallen = False; B.cmd('Input.dispatchKeyEvent', type='keyDown', key='d', code='KeyD')
        for i in range(300):
            if A.ev("!!(window.__game&&window.__game.over)"): break
            if not fallen and A.ev("!!(window.__game&&window.__game.dead)") and not B.ev("!!(window.__game&&window.__game.dead)"):
                time.sleep(0.5); A.shot(os.path.join(OUT, 'v8_online_fallen.png')); fallen = True; print('A caiu; B ainda vivo; captura feita')
            if not fallen and B.ev("!!(window.__game&&window.__game.dead)") and not A.ev("!!(window.__game&&window.__game.dead)"):
                time.sleep(0.5); B.shot(os.path.join(OUT, 'v8_online_fallen.png')); fallen = True; print('B caiu; A ainda vivo; captura feita')
            time.sleep(0.5)
        time.sleep(1.0); A.shot(os.path.join(OUT, 'v8_online_results.png'))
        print('over:', A.ev("window.__game.over"), 'reason:', A.ev("window.__game.endReason"), 'results:', A.ev("JSON.stringify(window.__game.results&&window.__game.results.map(r=>[r.nick,r.lv,r.kills,r.alive]))"), 'err:', A.ev("window.__err||null"))
finally:
    A.close(); B.close()
