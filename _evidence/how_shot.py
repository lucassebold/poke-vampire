import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/how', port=9411, w=1100, h=900)
try:
    time.sleep(3); print('titulo:', A.ev('document.title'), '| linhas de preco:', A.ev("document.querySelectorAll('#priceRows tr').length"), '| erros:', A.ev('window.__err||null'))
    A.shot(os.path.join(OUT, 'v9_how_1.png'))
    A.ev("document.getElementById('prize').scrollIntoView()"); time.sleep(0.6); A.shot(os.path.join(OUT, 'v9_how_2_prize.png'))
finally: A.close()
