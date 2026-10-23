# Changelog

## 2026-10-23
- Criados `assets/spider.blend` e `assets/spider.glb` a partir do FBX do usuário, com rig de oito pernas, corpo articulado e ações `Idle`, `Walk` e `Spit`.
- Preservadas as cores PBR da origem e adicionada aparência brilhante/translúcida ao abdômen traseiro; olhos continuam usando os detalhes originais da textura.
- O inimigo cuspideiro de insetos carrega a aranha animada; o disparo aciona `Spit` no host e nos clientes. Mantido modelo procedimental como fallback de carregamento.
- Incluído `assets/spider.glb` no hash de versão do cliente e documentado o asset no README.

- Aranha: malha reduzida de ~89 mil para ~2,4 mil vértices (`TARGET_RATIO` em `tools/build_spider.py`) e texturas reduzidas por `tools/shrink_glb.py` (15 MB → 1,2 MB), mais leve para celular e para dezenas de inimigos. Materiais por inimigo (brilho de elite não vaza) e esfera de acerto ajustada ao corpo.

## 2026-10-23 (mapa, amizades e liberação)
- Novo jogo ganhou a aba **Mapa** (mundo online somente leitura, sem login, via `GET /api/world`).
- Modo online: aba **Amizades** com recentes locais e **chat** (DM com amigos e canal do esquadrão) repassado pelo servidor sem gravar nada; histórico só em `localStorage`.
- Liberação do setor em destaque: bloco com % grande e barra até 50%, % escrita nas células, linha no HUD e no resultado.

## 2026-10-23 (titã ácido e mapa com zoom)
- Validados corredor, empurrador e titã (`tools/validar_modelos.md`): contagem de pernas, simetria, cor e tamanho. O titã veio com 5 pernas e foi corrigido para 6.
- Novo inimigo **Titã ácido** (`assets/titan.glb`, `tools/build_titan.py`): rig de 20 ossos e ações Idle, Walk, Stomp e Jet; IA de pisada em área e jato de ácido; sincronizado em rede (estados `stomp`/`jet` e projétil de ácido).
- Mapa maior com **zoom** (roda, pinça e botões), arrastar para mover e painel lateral compacto; mapa em resolução cheia (1254 px).

## 2026-10-23 (guerra dinâmica e estágios)
- Menu renomeado: **Novo jogo → Mapa** e **Modo online → Comunicações**; o mundo online virou a aba *Mundo online* dentro de Mapa (sem login só mostra; com login ataca e joga em esquadrão).
- Estágios do setor (disputa, dominado, fixo), missões de erradicar e defender, setor atrás de território humano fora do alcance dos inimigos; setor fixo resiste ao avanço inimigo.
- Guerra mais dinâmica (passo a cada minuto, vários ataques por facção, fronteiras entre insetos e robôs) e interface com duas barras (luta entre as facções + avanço humano) e brilho nos setores que mudaram. `tools/test_world.js` cobre as regras.

## 2026-10-23 (celular: desempenho e experiência de app)
- Desempenho: sem antialias e resolução 1× no toque; qualidade inicial **Baixa** em celulares; resolução se ajusta sozinha (0,55–1×) conforme o tempo dos quadros; limite de 60 quadros/s; sombras 512 px, alcance de visão e névoa menores; ~20% menos inimigos por vez.
- HUD só escreve no DOM quando o valor muda; partículas com materiais compartilhados e teto de quantidade; traçantes liberam a geometria (vazamento de GPU corrigido); animação de esqueleto de aranha e robôs mais espaçada com a distância.
- CSS leve no toque: sem desfoque de fundo, sem linhas de varredura do menu e sem sombras de texto; flash de dano por opacidade.
- Experiência Android: PWA (`manifest.webmanifest`, ícones em `assets/icons/`, `sw.js` com cache dos modelos e bibliotecas, botão **Instalar como app** em Configurações), tela cheia + orientação horizontal no primeiro toque, tela sempre ligada durante a missão, vibração ao levar dano (configurável) e botão Voltar do Android pausa o jogo.
- `tools/make_icons.py` gera os ícones; servidor libera `/sw.js` e `/manifest.webmanifest`.

## 2026-10-23 (guerra lenta: começa quase tudo humano)
- Início da campanha: o planeta é dos humanos; insetos (oeste) e robôs (leste) começam com só 2x2 setores cada (`SEEDS` em `worldlogic.mjs`).
- A expansão é lenta, na escala de dias: a cada minuto cada facção tem uma pequena chance (`ATTACK_BASE`, cresce com os setores que domina) de empurrar um vizinho. Sem intervenção dos jogadores, os primeiros setores caem em ~2 semanas e o planeta em ~3 meses.
- Mundos salvos com o desenho antigo (servidor e campanha local) são reiniciados sozinhos (`isOldLayout`). A campanha local recupera até 3 dias de guerra ao reabrir o jogo.

## 2026-10-23 (inimigos avançam mais fácil)
- Enquanto um setor não é dominado pelos humanos (menos de 50%), a facção que tem 10% ou mais nele pode avançar para os setores vizinhos (antes só avançava a partir de setores que dominava por completo).
- Vantagem de progresso do inimigo: cada avanço empurra 1,5x (`ENEMY_EDGE`, 1,2% a 3,9% por ataque), mais que os jogadores ganham por missão; frequência base reajustada para 0,5% por minuto (`ATTACK_BASE`). Sem intervenção dos jogadores: ~30 setores inimigos em 30 dias, ~95 em 60, planeta tomado em ~4 meses.

## 2026-10-23 (derrota)
- Derrota numa operação: os humanos perdem 1/4 do progresso que a vitória renderia e o inimigo avança o mesmo valor (`LOSS_RATIO` = 0,25; antes 40%).

## 2026-10-23 (só campanha online)
- Removida a campanha local (`WLOC`, salvamento e guerra offline); o save antigo `campaign` é apagado ao abrir. O menu Mapa mostra o mundo online (somente leitura sem login).
- **Partida livre** agora lista os setores que mais precisam de atenção (prestes a ser retomados, perto de dominar, fronteiras) com nível e botão Jogar; a partida vale para o mundo online. Sem contas no servidor, continua o treino sem efeito.
- A abertura da operação de um setor virou `launchSector`, usada pelo painel do mapa e pela Partida livre.

## 2026-10-23 (progresso por vitória menor)
- Progresso base por missão dividido por 5 (Operação Gerador 15% → 3%, Rainha 20% → 4%, Coleta/Faróis 1%); a derrota continua custando 1/4 do valor. Constante `MISSION_POINTS` em `worldlogic.mjs`.

## 2026-10-23 (ritmo proporcional ao tempo)
- Inimigo: avanço **contínuo e fixo** de 0,0015% por segundo (9 pontos por minuto) em cada setor vizinho de um setor que a facção já tem com 50% ou mais; 100% em 18 h 31 min por setor. Sem sorteio e sem bônus por setor fixo. Sem jogadores, o planeta cai em ~4 dias (o último reduto de 3 setores resiste).
- Jogadores: o ganho da vitória é o mesmo ritmo aplicado ao tempo-meta da missão (`MISSION_PAR`): 5 min = 0,45%, Operação Gerador 1,44%. O tempo só entra no cálculo, a partida não ganha relógio. Derrota continua custando 1/4.
- Removidas as constantes `ATTACK_BASE` e `ENEMY_EDGE`; novos `ENEMY_PTS_PER_MIN`, `MISSION_PAR`.

## 2026-10-23 (dominado a 70%, reivindicado a 100%)
- `HUMAN_MIN` passa de 50% para 70%: o setor é dominado com 70% ou mais e **reivindicado** com 100% (antes "fixo"), tanto para os humanos quanto para as facções.
- O inimigo só passa a empurrar os vizinhos quando domina o setor (70%), mas continua empurrando o próprio setor até 100%. Corrigido: antes ele parava ao passar do limite. Sem jogadores, o planeta cai em ~6 dias. O bônus de resistência do setor fixo foi removido.

## 2026-10-23 (3 setores por vez)
- Cada facção empurra no máximo **3 setores por vez** até eles chegarem a 70% (`MAX_PUSH`); os dominados seguem até 100% sem ocupar vaga. Vagas: primeiro os em andamento em que a facção lidera, depois os novos; quem perde a disputa com a outra facção fica por último (evita setores empatados travando as vagas). Sem jogadores, o planeta cai em ~30 dias.

## 2026-10-23 (novos mobs rigados e personagem)
- **Rastejador** passa a usar o modelo do corredor (`assets/crawler.glb`) e o **investidor** o do empurrador (`assets/pusher.glb`), com rig e marcha de aranha: pernas em duas partes, passos alternados/trípode, corpo de lagarta ondulando (corredor) e ações de combate: `Attack` (investida de cabeça), `Wind` (agacha e treme), `Charge` (corrida baixa) e `Stun` (cabeça baixa). Geração em `tools/build_mob.py`; malhas ~3,7 mil e ~4,7 mil vértices; olhos com material emissivo.
- Jogo: kit genérico de criaturas rigadas (`makeCreatureMesh`, `animateCreature`), passo sincronizado com a velocidade, animação mais espaçada à distância e escalas ajustadas; modelos de reserva continuam se o arquivo não carregar. Facção robôs não muda.
- Personagem: camada procedural sobre os clipes (inclina para onde corre, recua ao atirar, recarregar e levar dano), também nos outros jogadores.

## 2026-10-23 (Rainha é o gigante)
- O gigante de seis pernas (`assets/titan.glb`) passa a ser a **Rainha da colmeia** dos insetos: ~9 m, pisada em área, jato de ácido e convocação do enxame, com a barra de chefe da missão. O Titã ácido deixou de aparecer sozinho nas outras missões e nas ondas da Operação Gerador. Com robôs, o chefe continua sendo o Comandante Mecha.

## 2026-10-23 (bombardeiro novo e modelos otimizados)
- **Bombardeiro** (inseto explosivo) passa a usar a formiga nova (`assets/bomber.glb`), rigada por `tools/build_mob.py`: 6 pernas em trípode, abdômen brilhante e ações `Idle`, `Walk` e `Swell` (agacha, treme e incha o abdômen quando chega a 7 m do alvo; estado `wind` na rede). Com robôs continua o modelo antigo.
- **Modelos otimizados** sem perda visível: vértices soldados, normais removidas (o jogo usa `flatShading`) e posições quantizadas (`tools/optimize/optimize_glb.mjs`). Aranha, corredor, empurrador, Rainha e bombardeiro: de ~9 MB para ~3,4 MB no total. Desvio máximo medido nas animações: 0,05% do tamanho do modelo.
