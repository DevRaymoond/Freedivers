# Memory.md — decisões do projeto

- 2026-10-23: usuário pediu rig e animações de aranha e de cuspida para o modelo `tripo_convert_e548c8d3-cd07-46b5-93a0-2033f56ddf57.fbx`.
- Referência visual: corpo verde, olhos verde-limão luminosos e abdômen traseiro brilhante com aparência translúcida.
- O usuário confirmou que as cores da imagem de prévia anexada estavam corretas; manter o mapa de cor PBR original. A shell translúcida cobre o abdômen traseiro; olhos permanecem com a cor e os realces da textura para evitar manchas emissivas na malha.
- Entrega: Blender editável e GLB com rig de 20 ossos e ações `Idle`, `Walk`, `Spit`; integrar no inimigo cuspideiro, com evento de animação alinhado ao disparo.
- Fonte original e texturas ficam em `tools/source/spider/` (ignorado pelo Git); o gerador permite recriar os assets.

- 2026-10-23: usuário adicionou corredor, empurrador e titã (zips do Tripo em Downloads, extraídos em `tools/source/mA|mB|mC`) e pediu validação de pernas, igualdade, cor e tamanho; resultado em `tools/validar_modelos.md`. Titã ácido ganhou rig e animações (andar lento, pisada, jato de ácido estilo Bile Titan) e entrou no jogo para os insetos (nível 6+). Corredor e empurrador seguem só validados.
- 2026-10-23: mapa do modo online/Novo jogo deve ser grande, com zoom e painel lateral pequeno e simples.
- 2026-10-23: menu: Novo jogo virou Mapa e Modo online virou Comunicações. Fronteiras: duas barras (insetos × robôs e avanço humano em azul); dominado (50%+) exige erradicar os inimigos até 100% (fixo); setores atrás de território humano ficam fora do alcance das facções; interface não deve explicar detalhes técnicos ao jogador.

- 2026-10-24: usuário enviou imagens de referência de cenários (Norte: montanhas nevadas, posto avançado, vale congelado; Oeste: floresta densa, ruínas antigas, rio e pântano; Sudeste: dunas e cânions, cidade abandonada, cratera gigante; Leste: campos de lava, fortaleza corrompida, zona de extração; Central: campos abertos, vilarejo, torre de vigilância) e pediu mapas "bem parecidos", refinando várias vezes. Implementado em `scenery.js` + `scn_*.js` (5 regiões × 3 variantes, tudo por código, low-poly facetado). Referências recortadas ficam em `tools/preview/ref/` (ignorado pelo Git). Modo foto de desenvolvimento: `__freedivers.setScenery(bioma, variante, semente, raio)` e `__freedivers.photo = { pos, look, fov }`.
- A região Central (`plains`) foi adicionada ao `assets/world.json` (setores ao redor de (11, 9,5) que eram verde/deserto). A variante e a semente do cenário vêm do quadrado (`hash2(c, r)`), então valem igual para todos os jogadores.
