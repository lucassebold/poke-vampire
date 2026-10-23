# Baixa sprites animados (Pokémon Showdown, gen5ani) para uma pasta ISOLADA e valida cada arquivo como imagem. Uso pessoal/amigos.
import os, urllib.request, json
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dl_poke')
os.makedirs(OUT, exist_ok=True)
NAMES = ['pikachu', 'bulbasaur', 'charizard', 'alakazam', 'scyther', 'machamp', 'gengar', 'mew', 'lucario',
         'zubat', 'golbat', 'crobat', 'rattata', 'poochyena', 'ekans', 'cubone', 'marowak', 'sandshrew', 'sandslash', 'diglett', 'geodude',
         'duskull', 'graveler', 'oddish', 'bellsprout', 'gloom', 'mightyena', 'vileplume', 'pinsir', 'onix', 'darkrai']
UA = {'User-Agent': 'vs-reconstruction-personal/1.0'}
ok, bad = [], []
for n in NAMES:
    p = os.path.join(OUT, n + '.gif')
    try:
        if not os.path.exists(p):
            data = urllib.request.urlopen(urllib.request.Request(f'https://play.pokemonshowdown.com/sprites/gen5ani/{n}.gif', headers=UA), timeout=30).read()
            if len(data) > 2_000_000 or data[:3] != b'GIF': raise ValueError('não parece GIF/tamanho')
            open(p, 'wb').write(data)
        im = Image.open(p); im.verify(); im = Image.open(p)
        ok.append((n, im.size, getattr(im, 'n_frames', 1), os.path.getsize(p)))
    except Exception as e:
        bad.append((n, str(e)[:80]))
print('ok', len(ok), 'falhas', bad)
for r in ok: print(' ', r)
