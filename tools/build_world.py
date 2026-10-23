"""Lê o mapa-múndi (tools/source/worldmap.webp, grade de 24x24 quadrados) e gera:
   assets/world.json   quadrados do continente central (sem as ilhas) com bioma e fração de terra
   assets/worldmap.jpg versão leve do mapa para o menu
   uso: tools/.venv/Scripts/python.exe tools/build_world.py"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'tools/source/worldmap.webp'
N = 24
im = Image.open(SRC).convert('RGB')
W = im.size[0]
a = np.asarray(im).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
snow = np.minimum(np.minimum(r, g), b) > 150
water = ~snow & (b > r + 30) & (b > g - 5)
land = ~water
green = land & (g >= r) & (g > b + 4)
dark = land & ~snow & ~green & (np.maximum(np.maximum(r, g), b) < 100)
lava = land & (r > 200) & (g < 140) & (b < 60)
cs = W / N
cells = {}
for row in range(N):
    for col in range(N):
        y0, y1, x0, x1 = int(row * cs) + 3, int((row + 1) * cs) - 2, int(col * cs) + 3, int((col + 1) * cs) - 2
        sl = (slice(y0, y1), slice(x0, x1))
        frac = land[sl].mean()
        if frac < 0.5:
            continue
        L = land[sl].sum()
        cnt = {'ice': snow[sl].sum(), 'toxic': green[sl].sum(), 'volcanic': dark[sl].sum() + lava[sl].sum()}
        cnt['desert'] = L - sum(cnt.values())
        biome = max(cnt, key=lambda k: cnt[k])
        cells[(col, row)] = (biome, float(frac))

# só o continente central: maior componente conexa (as ilhas ficam de fora)
mask = np.zeros((N, N), bool)
for (c, rw) in cells:
    mask[rw, c] = True
lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
sizes = ndimage.sum(mask, lab, range(1, n + 1))
keep = 1 + int(np.argmax(sizes))
out = []
for (c, rw), (bio, fr) in sorted(cells.items(), key=lambda kv: (kv[0][1], kv[0][0])):
    if lab[rw, c] == keep:
        out.append({'c': c, 'r': rw, 'b': bio, 'l': round(fr, 2)})
json.dump({'n': N, 'cells': out}, open('assets/world.json', 'w'), separators=(',', ':'))
im.resize((900, 900), Image.LANCZOS).save('assets/worldmap.jpg', quality=82)
print(len(out), 'quadrados de terra (de', len(cells), 'com terra)')
sym = {'ice': 'I', 'toxic': 'g', 'volcanic': 'V', 'desert': 'd'}
grid = {(o['c'], o['r']): sym[o['b']] for o in out}
for rw in range(N):
    print(''.join(grid.get((c, rw), '.') for c in range(N)))
