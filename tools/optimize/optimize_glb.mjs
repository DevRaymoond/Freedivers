// Otimiza um .glb sem perder qualidade visível: remove as normais (o jogo usa flatShading, que as calcula pela face), solda os vértices duplicados
// do sombreamento chapado, quantiza as posições/UVs e apara o que sobrar. uso: node tools/optimize/optimize_glb.mjs entrada.glb saida.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, prune, dedup } from '@gltf-transform/functions';
const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
let before = 0, after = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) { before += prim.getAttribute('POSITION').getCount(); prim.setAttribute('NORMAL', null); }
await doc.transform(weld(), dedup(), quantize({ quantizePosition: 14, quantizeTexcoord: 14, quantizeWeight: 8, quantizeColor: 8, quantizeNormal: 8 }), prune());
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) after += prim.getAttribute('POSITION').getCount();
await io.write(out, doc);
console.log(`${inp}: vértices ${before} -> ${after}`);
