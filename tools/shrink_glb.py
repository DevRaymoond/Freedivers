"""Reduz as texturas embutidas de um .glb (o jogo roda no navegador e o asset é baixado por todos os jogadores).
   uso: tools/.venv/Scripts/python.exe tools/shrink_glb.py assets/spider.glb [tamanho_cor=1024] [tamanho_outras=512]
   - cor (baseColor) vira JPEG; normal vira PNG; metálico/rugosidade vira JPEG. Geometria e animações não são tocadas."""
import io
import sys
from PIL import Image
from pygltflib import GLTF2

path = sys.argv[1]
color_size = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
other_size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
g = GLTF2().load(path)
blob = g.binary_blob()
roles = {}
for m in g.materials:
    pbr = m.pbrMetallicRoughness
    if pbr and pbr.baseColorTexture: roles[g.textures[pbr.baseColorTexture.index].source] = 'color'
    if pbr and pbr.metallicRoughnessTexture: roles[g.textures[pbr.metallicRoughnessTexture.index].source] = 'mr'
    if m.normalTexture: roles[g.textures[m.normalTexture.index].source] = 'normal'

new_data = {}
before = len(blob)
for i, img in enumerate(g.images):
    bv = g.bufferViews[img.bufferView]
    im = Image.open(io.BytesIO(blob[bv.byteOffset:bv.byteOffset + bv.byteLength]))
    role = roles.get(i, 'mr')
    size = color_size if role == 'color' else other_size
    im = im.convert('RGB').resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    if role == 'normal': im.save(out, 'PNG', optimize=True); img.mimeType = 'image/png'
    else: im.save(out, 'JPEG', quality=88 if role == 'color' else 90, optimize=True); img.mimeType = 'image/jpeg'
    new_data[img.bufferView] = out.getvalue()

# remonta o blob com as imagens novas (alinhado a 4 bytes)
parts, pos = [], 0
for idx, bv in enumerate(g.bufferViews):
    data = new_data.get(idx, blob[bv.byteOffset:bv.byteOffset + bv.byteLength])
    pad = (-pos) % 4
    if pad: parts.append(b'\0' * pad); pos += pad
    bv.byteOffset = pos; bv.byteLength = len(data); parts.append(data); pos += len(data)
pad = (-pos) % 4
if pad: parts.append(b'\0' * pad); pos += pad
g.set_binary_blob(b''.join(parts)); g.buffers[0].byteLength = pos
g.save(path)
print(f'{path}: {before / 1e6:.1f} MB -> {pos / 1e6:.1f} MB')
