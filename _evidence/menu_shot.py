import sys, time, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/', port=9381)
try:
    time.sleep(6); A.shot(os.path.join(OUT, 'v8_menu_play_prize.png'))
    c = json.loads(A.ev("JSON.stringify(window.__ui('prize'))")); A.click(c['x'], c['y']); time.sleep(0.8); A.shot(os.path.join(OUT, 'v8_menu_prize_intro.png'))
finally: A.close()
