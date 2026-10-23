import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
for n, warp in ((1, 30), (5, 30), (3, 70)):
    pg = Page('file:///D:/jogos/vampire-like/index.html#play=%d&god&warp=%d&frames=90&bench=120' % (n, warp), port=9420 + n)
    try:
        time.sleep(9); print(n, warp, pg.ev("document.body.getAttribute('data-bench')"), pg.ev("window.__err||null"))
        pg.shot(os.path.join(OUT, 'v9_early_%d_%ds.png' % (n, warp)))
    finally: pg.close()
