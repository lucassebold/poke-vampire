P=r'D:\jogos\vampire-like\render.js'
r=open(P,encoding='utf-8').read()
a="const pals = [['#3e7b86', '#2b5560'], ['#58499a', '#3a2f68'], ['#3f8a58', '#2b6040'], ['#7a7a3a', '#55552a'], ['#2f7fa0', '#205a70'], ['#6a449a', '#47305f'], ['#43907a', '#2f6654'], ['#8a4e6a', '#5c3548']];"
assert a in r
r=r.replace(a,"const pals = [['#3a4a6e', '#29344f'], ['#44406c', '#2f2c4e'], ['#36566a', '#263d4d'], ['#4a4070', '#332c52'], ['#3a5272', '#28384f'], ['#403a66', '#2d284b'], ['#365a66', '#274149'], ['#463e68', '#30294b']];")
b="x.fillStyle = 'rgba(96,230,96,.38)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(rr() < 0.5 ? rr() * 18 : TILE - rr() * 18, rr() < 0.5 ? rr() * 18 : TILE - rr() * 18, 3 + rr() * 8, 0, 7); x.fill(); }"
assert b in r
r=r.replace(b,"x.fillStyle = 'rgba(80,200,110,.30)'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(rr() < 0.5 ? rr() * 14 : TILE - rr() * 14, rr() < 0.5 ? rr() * 14 : TILE - rr() * 14, 2 + rr() * 4, 0, 7); x.fill(); }")
open(P,'w',encoding='utf-8').write(r); print('ok')
