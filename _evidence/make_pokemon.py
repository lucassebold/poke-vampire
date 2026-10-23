# Extrai 4 quadros de cada GIF (amostrados no tempo), alinha, e gera assets/pokemon + pokemon_art.js com escala de exibição por sprite.
import os, json, shutil
from PIL import Image, ImageSequence
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(HERE, 'dl_poke')
GAME = r'D:\jogos\vampire-like'; OUT = os.path.join(GAME, 'assets', 'pokemon')
if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(OUT)
PLAYERS = {'PORTA': 'pikachu', 'ANTONIO': 'bulbasaur', 'CIRO': 'charizard', 'IMELDA': 'alakazam', 'GENNARO': 'scyther', 'LAMA': 'machamp', 'CAMILLO': 'gengar', 'DOMMARIO': 'mew', 'CROCI': 'lucario'}
DISPLAY = {'PORTA': 'Pikachu', 'ANTONIO': 'Bulbasaur', 'CIRO': 'Charizard', 'IMELDA': 'Alakazam', 'GENNARO': 'Scyther', 'LAMA': 'Machamp', 'CAMILLO': 'Gengar', 'DOMMARIO': 'Mew', 'CROCI': 'Lucario'}
ENEMIES = {  # id do inimigo -> espécies (variantes)
    'BAT1': ['zubat'], 'BAT2': ['zubat'], 'BAT3': ['golbat'], 'BAT4': ['crobat'], 'BAT5': ['crobat'],
    'ZOMBIE': ['rattata', 'poochyena', 'ekans'], 'SKELETON': ['cubone', 'marowak', 'sandshrew', 'sandslash', 'diglett', 'geodude'],
    'GHOST': ['duskull'], 'MUDMAN1': ['diglett', 'geodude'], 'MUDMAN2': ['graveler'], 'FLOWER': ['oddish', 'bellsprout', 'gloom'],
    'WEREWOLF': ['mightyena'], 'XLBAT': ['golbat'], 'XLFLOWER': ['vileplume'], 'XLMANTIS': ['pinsir'], 'XLMUMMY': ['onix'],
    'BOSS_WEREWOLF': ['mightyena'], 'BOSS_XLFLOWER': ['vileplume'], 'BOSS_XLMANTIS': ['pinsir'], 'BOSS_XLMUMMY': ['onix'], 'BOSS_XLDEATH': ['darkrai']}
ENEMY_H = {'BAT1': 21, 'BAT2': 21, 'BAT3': 21, 'BAT4': 28, 'BAT5': 28, 'ZOMBIE': 33, 'SKELETON': 33, 'GHOST': 30, 'MUDMAN1': 33, 'MUDMAN2': 33, 'FLOWER': 26,
           'WEREWOLF': 34, 'XLBAT': 34, 'XLFLOWER': 36, 'XLMANTIS': 36, 'XLMUMMY': 36, 'BOSS_WEREWOLF': 34, 'BOSS_XLFLOWER': 36, 'BOSS_XLMANTIS': 36, 'BOSS_XLMUMMY': 36, 'BOSS_XLDEATH': 48}
cache = {}


def frames_of(name):
    if name in cache: return cache[name]
    im = Image.open(os.path.join(SRC, name + '.gif')); fr, dur = [], []
    for f in ImageSequence.Iterator(im):
        fr.append(f.convert('RGBA')); dur.append(max(20, f.info.get('duration', 60)))
    bbs = [f.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox() for f in fr]; bbs = [b for b in bbs if b]
    box = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
    T = sum(dur); picks = []
    for i in range(4):
        t = T * i / 4; acc = 0
        for k, d in enumerate(dur):
            acc += d
            if acc > t: picks.append(k); break
    out = [fr[k].crop(box) for k in picks]; cache[name] = out; return out


def save(name, tag):
    paths = []
    for i, f in enumerate(frames_of(name), 1):
        p = f'assets/pokemon/{tag}_{i}.png'; f.save(os.path.join(GAME, p)); paths.append(p)
    return paths, frames_of(name)[0].size


man = {'chars': {}, 'enemies': {}, 'scales': {}}
for cid, sp in PLAYERS.items():
    paths, (w, h) = save(sp, 'c_' + sp)
    s = max(0.7, min(2.4, 76 / h)); man['chars'][cid] = {'name': DISPLAY[cid], 'species': sp, 'frames': paths, 'w': w, 'h': h, 's': round(s, 3)}
    for p in paths: man['scales'][p] = round(s, 3)
    sq = max(w, h); pt = Image.new('RGBA', (sq, sq), (0, 0, 0, 0)); f0 = frames_of(sp)[0]; pt.alpha_composite(f0, ((sq - w) // 2, sq - h))   # retrato: sprite inteiro, pés embaixo
    pp = f'assets/pokemon/p_{sp}.png'; pt.save(os.path.join(GAME, pp)); man['chars'][cid]['portrait'] = pp; man['chars'][cid]['ps'] = round(66 / sq, 3)
for eid, sps in ENEMIES.items():
    vs = []
    for sp in sps:
        paths, (w, h) = save(sp, 'e_' + sp); s0 = ENEMY_H[eid] * 2 / h   # tamanho de tela = altura do sprite original x2
        s0 = max(0.5, min(2.6, s0)); vs.append({'species': sp, 'frames': paths, 's0': round(s0, 3), 'h': h})
        for p in paths: man['scales'][p] = round(s0, 3)
    man['enemies'][eid] = {'variants': vs}
open(os.path.join(GAME, 'pokemon_art.js'), 'w', encoding='utf-8').write('// GERADO por _evidence/make_pokemon.py (sprites do Pokémon Showdown; material da Nintendo/Game Freak, uso entre amigos)\nwindow.VS_POKE=' + json.dumps(man) + ';\n')
print('players', len(man['chars']), 'enemies', len(man['enemies']), 'imagens', len(os.listdir(OUT)))
# folha de conferência
W = Image.new('RGBA', (9 * 130, 3 * 130), (60, 80, 70, 255))
for i, (cid, c) in enumerate(man['chars'].items()):
    for k, p in enumerate(c['frames'][:4]):
        im = Image.open(os.path.join(GAME, p)); s = min(2.0, 60 / im.height * 1.0); t = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)
        W.alpha_composite(t, (i * 130 + (k % 2) * 62, (k // 2) * 62 + 4))
    W.alpha_composite(Image.open(os.path.join(GAME, c['portrait'])).resize((60, 60), Image.NEAREST), (i * 130 + 4, 130 + 4)) if False else None
W.save(os.path.join(HERE, 'raw', 'poke_chars_sheet.png'))
