import urllib.request,urllib.parse,json,os,sys
UA={'User-Agent':'vs-reconstruction-personal/1.0 (local game; contact lucas@ekyte.com)'}
def api(params):
    u='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA)))
def info(title,w=900):
    r=api({'action':'query','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':w,'format':'json'})
    p=list(r['query']['pages'].values())[0]
    ii=p.get('imageinfo',[{}])[0]; m=ii.get('extmetadata',{})
    return {'title':title,'thumb':ii.get('thumburl'),'url':ii.get('url'),'size':(ii.get('width'),ii.get('height')),'mime':ii.get('mime'),
            'lic':m.get('LicenseShortName',{}).get('value'),'artist':m.get('Artist',{}).get('value','')[:120],'credit':m.get('Credit',{}).get('value','')[:100]}
def get(url,out):
    data=urllib.request.urlopen(urllib.request.Request(url,headers=UA)).read(); open(out,'wb').write(data); return len(data)
if __name__=='__main__':
    want={'elon':'File:Elon Musk Colorado 2022 (cropped2).jpg','trump':'File:Donald Trump official portrait (cropped).jpg',
          'doge1':'File:Kabosu and Atsuko Sato 2023-11-02 (1) (cropped).jpg','doge2':'File:Kabosu and Atsuko Sato 2023-11-02 (2).jpg','doge3':'File:Kabosu and Atsuko Sato 2023-11-02 (3).jpg',
          'pepe':"File:Matt Furie's Pepe the Frog.png"}
    meta={}
    for k,t in want.items():
        i=info(t); meta[k]=i; n=get(i['thumb'],f'dl/{k}.'+('png' if i['mime']=='image/png' else 'jpg')); print(k,i['size'],i['lic'],'|',i['artist'][:60],'|',n,'bytes')
    json.dump(meta,open('dl/meta.json','w'),indent=1)
    # touro: busca
    r=api({'action':'query','generator':'search','gsrsearch':'Charging Bull Wall Street','gsrnamespace':6,'gsrlimit':8,'prop':'imageinfo','iiprop':'extmetadata|size','format':'json'})
    for p in r['query']['pages'].values():
        ii=p['imageinfo'][0]; print('BULL?',p['title'],ii['width'],ii['height'],ii['extmetadata'].get('LicenseShortName',{}).get('value'))
    for t in ['File:Bitcoin.svg','File:Bitcoin logo.svg']:
        try: i=info(t,400); print('BTC',t,i['lic'],i['size'],i['mime'])
        except Exception as e: print('BTC erro',t,str(e)[:60])
