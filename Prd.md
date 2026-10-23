# Prd.md — asset da aranha cuspideira

## Visão e escopo
Substituir o modelo procedimental do inimigo cuspideiro da facção de insetos por uma aranha baseada no FBX fornecido. O asset deve manter a aparência verde da referência, com olhos claros e abdômen traseiro brilhante.

## Requisitos funcionais
- O jogo carrega a aranha como GLB com armature.
- Deve oferecer ações `Idle`, `Walk` e `Spit`.
- O disparo do projétil deve acionar a animação de cuspida também nos clientes online.
- Um fallback procedimental deve continuar disponível se o GLB não carregar.

## Critérios de aceite
- Arquivo editável `.blend` e asset `.glb` presentes em `assets/`.
- Ações nomeadas e utilizáveis pelo `AnimationMixer` do Three.js.
- A silhueta, cores e brilho do abdômen são reconhecíveis na referência aprovada.
- A versão do GLB participa do hash de atualização do jogo.

## Restrições
O trabalho altera asset e lógica local de apresentação/animação; não muda papéis, permissões, autenticação, economia ou regras de dano.
