# Navegador real: 2 jogadores na sala PAGA (pagamento simulado): lobby -> clicar PAY -> partida -> resultados com vencedor. Capturas v8_prize_*.png
# servidor: PAID_WAIT=20 PAID_START=3 PAY_WINDOW=40 PAID_RESULTS=12 TIME_SCALE=70 TEST_GOD=1 node server.js
import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/#prize&play=2&name=Misty', port=9401); B = Page('http://localhost:8780/#prize&play=5&name=Brock', port=9402)
st = lambda pg: pg.ev("(()=>{const g=window.__game;return JSON.stringify({state:g.state,lobby:g.lobby&&{stage:g.lobby.paid.stage,n:g.lobby.paid.n,share:g.lobby.paid.share,paid:g.lobby.paid.paidCount},playing:g.gotSnap,over:g.over,err:g.error||window.__err||null,winner:g.paidEnd&&g.paidEnd.winner})})()")
try:
    time.sleep(4); print('A lobby:', st(A)); A.shot(os.path.join(OUT, 'v8_prize_1_lobby.png'))
    time.sleep(4); print('A pagamento:', st(A)); A.shot(os.path.join(OUT, 'v8_prize_2_pagar.png'))
    for pg in (A, B):
        c = pg.ev("JSON.stringify(window.__ui('paynow'))"); c = __import__('json').loads(c); pg.click(c['x'], c['y']); time.sleep(0.6)
    time.sleep(2.5); print('A jogando:', st(A)); A.shot(os.path.join(OUT, 'v8_prize_3_jogo.png'))
    for i in range(120):
        if A.ev("!!window.__game.over"): break
        time.sleep(1)
    time.sleep(1.2); print('A fim:', st(A)); A.shot(os.path.join(OUT, 'v8_prize_4_resultado.png'))
finally:
    A.close(); B.close()
