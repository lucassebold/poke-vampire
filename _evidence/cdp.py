import subprocess,json,time,urllib.request,websocket,base64,sys,os,tempfile,shutil
EDGE=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
class Page:
    def __init__(self,url,w=1280,h=720,port=9333,flags=()):
        self.ud=tempfile.mkdtemp(prefix='edgecdp_')
        self.p=subprocess.Popen([EDGE,'--headless=new','--disable-gpu','--remote-debugging-port=%d'%port,'--user-data-dir='+self.ud,'--window-size=%d,%d'%(w,h),'--autoplay-policy=no-user-gesture-required','--hide-scrollbars','--no-first-run','--remote-allow-origins=*',*flags,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(60):
            try: tabs=json.load(urllib.request.urlopen('http://127.0.0.1:%d/json'%port)); break
            except Exception: time.sleep(0.25)
        tab=[t for t in tabs if t['type']=='page'][0]; self.ws=websocket.create_connection(tab['webSocketDebuggerUrl'],max_size=None,timeout=120); self.i=0
        self.cmd('Page.enable'); self.cmd('Runtime.enable'); self.cmd('Page.navigate',url=url)
    def cmd(self,m,**p):
        self.i+=1; self.ws.send(json.dumps({'id':self.i,'method':m,'params':p}))
        while True:
            r=json.loads(self.ws.recv())
            if r.get('id')==self.i: return r.get('result',r)
    def ev(self,js): 
        r=self.cmd('Runtime.evaluate',expression=js,returnByValue=True,awaitPromise=True); return r.get('result',{}).get('value')
    def key(self,k='Shift',code='ShiftLeft'):
        self.cmd('Input.dispatchKeyEvent',type='keyDown',key=k,code=code); self.cmd('Input.dispatchKeyEvent',type='keyUp',key=k,code=code)
    def click(self,x=300,y=300):
        self.cmd('Input.dispatchMouseEvent',type='mousePressed',x=x,y=y,button='left',clickCount=1); self.cmd('Input.dispatchMouseEvent',type='mouseReleased',x=x,y=y,button='left',clickCount=1)
    def shot(self,path):
        r=self.cmd('Page.captureScreenshot',format='png'); open(path,'wb').write(base64.b64decode(r['data']))
    def close(self):
        try: self.ws.close()
        except Exception: pass
        tag = os.path.basename(self.ud)   # o processo lançador sai logo; os filhos são achados pela pasta de perfil
        ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*" + tag + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        subprocess.run(['powershell', '-NoProfile', '-Command', ps], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.5); shutil.rmtree(self.ud, ignore_errors=True)
if __name__=='__main__':
    pg=Page('file:///D:/jogos/vampire-like/index.html#audiotest')
    t0=time.time()
    try:
        for i in range(40):
            time.sleep(1.5); s=pg.ev("document.title")
            if s and 'forest' in s and 'boss4' in s: break
        print(round(time.time()-t0,1),'s reais ->',s)
    finally: pg.close()
