import sys, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Page
OUT = os.path.dirname(os.path.abspath(__file__))
A = Page('http://localhost:8780/', port=9381)
try:
    time.sleep(6); A.shot(os.path.join(OUT, 'v8_menu_online.png'))
finally: A.close()
