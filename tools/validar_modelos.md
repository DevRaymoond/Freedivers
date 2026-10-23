# Validação dos modelos novos (corredor, empurrador e titã)

Origem: três `.zip` do Tripo (FBX sem rig) em `Downloads`, extraídos em `tools/source/mA`, `mB` e `mC` (ignorados pelo Git).
Método: `tools/inspect_fbx.py` (Blender) mede a malha e gera renders em `tools/preview/`; a contagem de pernas usa cortes horizontais da malha
(componentes conexos por altura), a igualdade usa o espelhamento da malha (erro médio em % do tamanho) e o pareamento dos pés.

| | **Corredor** (mA) | **Empurrador** (mB) | **Titã ácido** (mC) |
|---|---|---|---|
| Aparência | larva segmentada com chifres brancos e espinhos | robô-caranguejo de pedra, placa frontal, olhos ciano | corpo de osso/areia com saco de ácido amarelo-esverdeado |
| **Pernas** | **8** (4 pares) — 7 apoiadas, a 3ª da esquerda está levantada | **6** (3 por lado) | **5 no arquivo original** (falta a perna traseira esquerda) → **corrigido para 6** em `build_titan.py` |
| **Pernas iguais?** | Sim: espelhamento em X com erro médio 0,5%; os pares afunilam da frente para trás (normal); a perna levantada é só pose | Sim: espelhamento 1,2%; pares com 90–91% dos vértices; pé dianteiro esquerdo ~10% mais curto | Quase: pares do meio e da frente com 81–86% dos vértices; **o par da frente é assimétrico** (pés a 0,23 e 0,35 do eixo) |
| **Cor** (média do render) | rosa-lilás `#bc78b5`, pernas malva, olhos amarelos | prata/cinza `#aea8b3`, pernas marrons, olhos ciano | areia/osso `#cabb75`, saco ácido `#c8e61a` |
| **Tamanho nativo** (x·y·z) | 0,50 · 0,98 · 0,41 | 0,84 · 0,98 · 0,49 | 0,98 · 0,83 · 0,87 |
| **Escala sugerida no jogo** | ×1,4 → ~1,4 m de comprimento (porte do rastejador) | ×2,0 → ~1,7 m de largura (porte do investidor) | ×9 → ~8,8 m de comprimento e ~7,8 m de altura |

Observações
- Todos saem normalizados em ~1 unidade pelo Tripo; o tamanho real no jogo vem da escala, não do arquivo.
- **Cor do corredor:** o rosa não combina com a paleta atual dos insetos (vermelho-marrom, verde, roxo escuro, laranja, cinza-azul). Se for entrar como inseto, vale escurecer/avermelhar a textura; como unidade nova ela funciona.
- **Empurrador:** a cor cinza clara com olhos ciano lembra o investidor (cinza-azulado); fica coerente como parente dele.
- **Corredor e empurrador agora estão no jogo**, rigados por `tools/build_mob.py`: o corredor (8 pernas, corpo de lagarta em 5 segmentos que ondulam) substitui o rastejador, e o empurrador (6 pernas, andar em trípode, placa de pedra) substitui o investidor. As cores das texturas já batem com as referências (roxo com olhos laranja; ardósia escura com olhos ciano); os olhos têm material brilhante.
- **Titã:** modelo corrigido (6 pernas), reduzido de ~25 mil para ~9 mil vértices, rigado (20 ossos: raiz, tórax, cabeça, abdômen e 2 ossos por perna) e animado com `Idle`, `Walk` (passos em trípode, lento), `Stomp` (ergue o par da frente e esmaga; impacto em 46% do clipe) e `Jet` (jato de ácido; ativo entre 34% e 84% do clipe). O saco de ácido tem material emissivo próprio.
