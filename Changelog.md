# Changelog

## 2026-10-23
- Criados `assets/spider.blend` e `assets/spider.glb` a partir do FBX do usuário, com rig de oito pernas, corpo articulado e ações `Idle`, `Walk` e `Spit`.
- Preservadas as cores PBR da origem e adicionada aparência brilhante/translúcida ao abdômen traseiro; olhos continuam usando os detalhes originais da textura.
- O inimigo cuspideiro de insetos carrega a aranha animada; o disparo aciona `Spit` no host e nos clientes. Mantido modelo procedimental como fallback de carregamento.
- Incluído `assets/spider.glb` no hash de versão do cliente e documentado o asset no README.

- Aranha: malha reduzida de ~89 mil para ~2,4 mil vértices (`TARGET_RATIO` em `tools/build_spider.py`) e texturas reduzidas por `tools/shrink_glb.py` (15 MB → 1,2 MB), mais leve para celular e para dezenas de inimigos. Materiais por inimigo (brilho de elite não vaza) e esfera de acerto ajustada ao corpo.
