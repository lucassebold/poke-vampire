import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('file:///D:/jogos/vampire-like/index.html#play=3&god&t=290&warp=10&frames=120&bench=200', port=9371)
try:
    time.sleep(12)
    print('titulo:', A.ev("document.title")[:200], '| err:', A.ev("window.__err||null"))
    print('bench:', A.ev("document.body.getAttribute('data-bench')"))
    A.shot(os.path.join(OUT, 'v8_solo_regressao.png'))
finally: A.close()
