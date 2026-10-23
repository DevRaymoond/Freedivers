"""Gera os ícones do app (PWA) em assets/icons/. uso: tools/.venv/Scripts/python.exe tools/make_icons.py"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

def icon(size, maskable):
    S = size * 4
    im = Image.new('RGBA', (S, S), (14, 17, 22, 255))
    d = ImageDraw.Draw(im)
    pad = S * (0.22 if maskable else 0.10)          # maskable: miolo seguro de 80%
    box = (pad, pad, S - pad, S - pad)
    d.ellipse(box, outline=(255, 176, 32, 255), width=int(S * 0.045))
    c = S / 2; r = (S - 2 * pad) / 2
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):  # mira
        d.line((c + dx * r * 0.35, c + dy * r * 0.35, c + dx * r * 0.95, c + dy * r * 0.95), fill=(255, 176, 32, 255), width=int(S * 0.04))
    d.ellipse((c - S * 0.035, c - S * 0.035, c + S * 0.035, c + S * 0.035), fill=(255, 77, 77, 255))
    return im.resize((size, size), Image.LANCZOS).convert('RGB')

for n, mk in ((192, False), (512, False)):
    icon(n, mk).save(os.path.join(OUT, f'icon-{n}.png'), optimize=True)
icon(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)
print('ok')
