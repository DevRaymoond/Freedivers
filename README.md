# Multipunk

Shooter cooperativo 3D no navegador, para jogar **sozinho** ou **online com até 4 jogadores**.
Cada jogador guarda o próprio progresso (nome, créditos, melhorias, recordes) **no próprio computador**;
só entra na sala quem tiver o **código do host**.

## Jogar sozinho (local)
Dê dois cliques em `Jogar.bat` (precisa do Node.js) ou rode:

```bash
npm install --omit=dev
HOST=127.0.0.1 node server.js     # abre em http://127.0.0.1:8765
```

## Jogar online
1. Abra o jogo pelo endereço do servidor (não pelo arquivo `index.html`).
2. Aba **ONLINE** → digite seu nome (ele aparece sobre a sua cabeça).
3. **Host:** *Criar sala* → aparece um código de 5 letras. Passe-o aos amigos e escolha a operação na aba OPERAÇÕES.
4. **Amigos:** *Entrar na sala de um amigo* → digitam o código.
O host roda o mundo (inimigos, pelotões, ondas); cada jogador controla o próprio personagem. A sala fecha para novos jogadores
enquanto a operação está em andamento. Na operação, o grupo compartilha os 3 reforços e **todos** precisam embarcar na nave.

## Modos de jogo
- **Só campanha online:** a campanha local foi removida. O mundo é um só, compartilhado, e jogar sozinho ou em esquadrão vale para ele. Sem login só dá para ver o mapa.
- **Modo online = mundo compartilhado** (precisa de login): o mapa é o mesmo para todos e muda ao vivo. Você ataca um setor sozinho ou entra no **esquadrão** de quem já está
  jogando naquele setor, se houver vaga (até 4). O host escolhe quem pode entrar: **Aberto**, **Só amigos** ou **Fechado**; dá para entrar com a operação em andamento.
- **Amigos:** enviar e aceitar/recusar/cancelar pedido, remover, **bloquear/desbloquear**, ver quem está online e em qual setor, **convidar** para o esquadrão (convite vale 60 s) e
  entrar no esquadrão de um amigo. Bloqueado não pede amizade, não convida nem entra nos seus esquadrões. Tabelas `friendships` e `blocks`.
- **Mapa (Novo jogo → MAPA):** mostra o mapa do mundo online somente para ver, sem login (`GET /api/world`, público e com limite de taxa). Cada setor mostra a **liberação**
  em destaque: número grande, barra até os 50% e quanto falta (com a contribuição da missão escolhida). A porcentagem também aparece escrita nas células do mapa, no HUD
  da missão ("SETOR K16 · liberação 7,05% de 50,00% · vitória +7,05%") e na tela de resultado.
- **Amizades (Modo online → AMIZADES):** adicionar, pedidos, bloquear, convidar, **jogados recentemente** e **chat** (com amigos online e com o esquadrão). O Multipunk só repassa a
  mensagem em memória (até 300 caracteres, limite de 30 por minuto): **não grava conversa nem dados**. O histórico e a lista de recentes ficam só em `localStorage` do seu aparelho
  e dá para apagar. Mensagem para amigo offline não é entregue.
- **Menu:** **Mapa** (mundo online, partida livre, arsenal e melhorias) e **Comunicações** (amizades, chat, recentes e sala por código).
- **Estágios do setor:** *em disputa* (humanos abaixo de 50%) → *dominado* (50% ou mais, ainda restam inimigos: são necessárias mais missões para **erradicá-los**) → *fixo* (100% humano).
  O setor fixo resiste ao avanço inimigo (metade) e, se estiver atrás de território humano, **nenhuma facção alcança**: a guerra só avança de vizinho para vizinho, a partir de setores dominados por ela.
  Um setor dominado ou fixo ao lado de território inimigo aparece como **sob ataque** e pede missões de **defesa**.
- **Guerra dinâmica:** a cada minuto cada facção ataca vários setores vizinhos, tanto os humanos quanto a outra facção (criando **fronteiras** onde insetos e robôs aparecem juntos). No mapa, fronteiras mostram a faixa roxa × vermelha e os setores que mudaram há pouco pulsam;
  no painel do setor há **duas barras**: a luta entre insetos e robôs e o avanço humano (azul, com os marcos de 50% e 100%), com setas de quem está ganhando terreno. **Partida livre** mostra os setores que mais precisam de atenção (os que estão para ser retomados, os perto de dominar e as fronteiras) e a partida vale para o mundo. Sem contas no servidor (sem `DATABASE_URL`), ela vira um treino sem efeito no mundo.
- **Progresso do setor:** cada missão vale um progresso base e **cada nível de ameaça soma +1**; **1 ponto = 0,01%** do setor.
  Base: Operação Gerador 300 · Limpeza 120 · Coleta 100 · Faróis 100 · Defesa 140 · Extração 160 · Rainha 400
  (ex.: Operação Gerador no nível 10 = 310 pontos = 3,10%). Com 50% ou mais o setor passa a ser dos humanos. Derrota devolve 25% (1/4) do que a missão valeria ao inimigo.

## Contas, mundo compartilhado e banco (Neon)
Com `DATABASE_URL` definida o servidor liga **login obrigatório** (usuário, senha e confirmar senha) e a **campanha única para todos os jogadores**:
cada quadrado do mapa tem a porcentagem de domínio de humanos, insetos e robôs (em centésimos de %, soma 10000), mostrada ao vivo para todos; vencer uma operação
aumenta a % dos humanos e, de tempos em tempos, as facções brigam entre si e contra os humanos. Bancos criados antes da escala de 0,01% são migrados sozinhos no primeiro boot. Sem `DATABASE_URL` o jogo roda
local, sem contas, com a campanha salva no navegador (como no `Jogar.bat`).
- **Banco:** rode `deploy/schema.sql` uma vez no SQL Editor do Neon (já foi aplicado no projeto *MultiPunk*). Tabelas: `users`, `sessions`, `world_sectors`,
  `world_meta`, `world_events`, `battles`, `battle_members`, `contributions`, `friendships`, `blocks`.
- **Variáveis:** copie `deploy/.env.example` para `.env` na VPS (`chmod 600`) e preencha `DATABASE_URL` (conexão *pooled* do Neon, `sslmode=verify-full`),
  `TRUST_PROXY=1` atrás de nginx/Caddy e `ALLOWED_ORIGINS=https://seu-dominio`. O systemd já lê esse arquivo (`EnvironmentFile`).
- **Segurança:** senhas com bcrypt (custo 12, 8 a 72 caracteres) · sessão em cookie HttpOnly + SameSite=Strict (+ Secure em HTTPS), token de 256 bits e só o hash no banco ·
  limite de tentativas por IP e por usuário, bloqueio de 15 min após 5 erros, 5 cadastros por IP/hora, corpo máximo de 2 KB e tempo limite nas requisições ·
  checagem de Origin em todo POST e no WebSocket · uma conexão por conta · cabeçalhos de segurança (CSP, nosniff, frame-ancestors none, HSTS atrás de HTTPS) · SQL sempre parametrizado.
- **Antifraude:** o servidor só aceita atacar quadrados atacáveis e níveis permitidos, reserva a batalha ao começar e descarta vitórias mais rápidas que `MIN_WIN_SECONDS` (60 s).
  O combate em si é decidido pelo host da sala, então um host malicioso ainda poderia mentir: é o limite de um jogo cooperativo sem servidor de simulação.
- **Missões que giram:** cada quadrado é uma das 7 missões, sorteada de novo a cada 15 minutos (igual para todos, decidida pelo servidor). Ao clicar no quadrado você escolhe o nível de ameaça.
  A campanha não exige ter liberado a fase: a trava de progresso vale na Partida livre.
- **Fronteiras:** quadrados onde insetos e robôs têm 10% ou mais cada são mapas com as duas facções, que entram por lados opostos, lutam entre si (não dão abate nem XP) e só então miram nos jogadores.
  O nível mínimo ali é o maior entre os dois lados.
- **Atrás de proxy (Coolify/Nixpacks/Traefik, nginx, Caddy):** `TRUST_PROXY=1` e `HOST=0.0.0.0` dentro do container; `PROXY_HOPS=2` se houver Cloudflare na frente do proxy.
- **Dificuldade por jogadores:** vida, quantidade e dano dos inimigos crescem com o número de jogadores da sessão (invisível no jogo).
- Testes: `npm test` (salas, contas/limites/mundo e amizades/esquadrões, usando banco em memória, sem tocar no Neon).

## Hospedar na sua VPS
Requisitos: Node.js 18+ e uma porta aberta (ou nginx na frente).

```bash
git clone https://github.com/DevRaymoond/Freedivers.git /opt/multipunk && cd /opt/multipunk
npm install --omit=dev
PORT=8765 node server.js            # escuta em 0.0.0.0 (use HOST=127.0.0.1 atrás de um proxy)
```
- `deploy/multipunk.service`: unidade systemd (reinicia sozinha).
- `deploy/nginx.conf`: proxy com HTTPS e WebSocket em `/ws` (certificado via certbot).
- Variáveis: `PORT`, `HOST`, `ALLOWED_ORIGINS` (lista de origens permitidas no WebSocket), `DEV=1` (libera `/tools`).
- `/health` responde `ok`. O servidor só faz o relé das salas: não guarda nada dos jogadores.
- **Validador de versão:** a versão é o hash dos arquivos do jogo (muda sozinha ao atualizar o código na VPS; `/version.json`). O
  navegador confere a cada 30 s: se saiu versão nova, abre um modal pedindo para atualizar a página, **só para quem está no menu
  principal** — quem está em partida (ou pausado nela) nunca é interrompido. Quem está com versão antiga não entra em sala de versão nova.
- `node tools/test_relay.js` (salas) e `node tools/test_auth.js` (contas e mundo) testam as regras das salas (código, limite de 4, sala travada, saída do host).

## Menu e facções
O menu principal tem **Novo jogo · Modo online · Configurações · Controles**. Em *Novo jogo* você escolhe a **facção inimiga** e a operação
(Arsenal e Melhorias ficam ali dentro):
- **Insetos** (o enxame): rastejadores, cuspidores, brutos, bombardeiros, investidores e a Rainha da colmeia.
- **Robôs** (exército mecha, `assets/robot.glb` + `bots.js`): soldados-lâmina e lanceiros com **espada**, atiradores com **rifle** (balas de plasma),
  pesados com espadão, kamikazes e o Comandante Mecha (espada + canhão). Mesmos papéis e comportamentos dos insetos; o esqueleto é animado por código
  (ciclo de corrida, cinemática inversa nos braços, golpe de espada, mira). O modelo veio sem UV, então a cor é pintada por região do corpo.
Online, o host escolhe a facção e os clientes seguem. **Créditos só são concedidos se o objetivo for concluído**; derrota ou abandono não pagam.
*Configurações*: volume, sensibilidade da mira, qualidade gráfica (alta/média/baixa), tipo de controle (automático/PC/toque) e tela cheia.

## Campanha e progressão
- **Campanha** (Novo jogo): o continente central do mapa (`assets/worldmap.jpg`, grade 24×24, só a terra firme, sem as ilhas: 337 quadrados em `assets/world.json`)
  é dividido entre três forças: **jogadores**, **insetos** e **robôs**. Cada quadrado é uma operação, no bioma do quadrado, e o dono dele define o inimigo.
  Você só ataca quadrados vizinhos ao seu território (contorno amarelo). Ganhar converte o quadrado; depois de cada operação as facções lutam entre si e contra-atacam.
- **Dificuldade dinâmica:** quanto mais território uma facção perde, mais **níveis baixos de ameaça são desativados** contra ela (0% perdido = nível 1+; ~50% = nível 9+).
- **Fases em sequência:** a fase seguinte só libera depois de vencer a anterior em nível de ameaça **3 ou mais** (vale na campanha e na Partida livre).
- O estado da campanha fica em `save.campaign` (JSON simples, salvo no aparelho; não precisa de banco de dados). `tools/build_world.py` gera o mapa a partir da imagem.

## Operações
1. **Operação Gerador** (campanha, nível 1 = modo relax): você nasce a ~120 m do objetivo e atravessa o mapa com pelotões patrulhando
   (notam proximidade, tiros e explosões e alertam os vizinhos); defende o gerador por 8 ondas; segura a zona de extração (raio 50 m) por 1:30;
   a nave pousa, abre a rampa traseira e todos embarcam.
2. Limpeza do setor (6 ondas de Fibonacci: 5, 8, 13, 21, 34, 55) · 3. Coleta de amostras · 4. Faróis · 5. Defesa do gerador · 6. Extração sob fogo · 7. Rainha da colmeia
Cada fase tem um **nível de ameaça de 1 a 20 escolhido por você** na aba OPERAÇÕES (online, quem escolhe é o host); o nível 1 é o modo relax e
níveis maiores multiplicam vida, ataque, quantidade e elites e também a pontuação e os créditos.
Cada fase tem a sua base de dificuldade (vida, ataque, velocidade, quantidade, elites e mistura de inimigos; só a primeira é modo relax)
e, dentro da fase, a vida e o ataque de cada onda crescem pela sequência de Fibonacci (1, 1, 2, 3, 5, 8, 13, 21…).

## Controles
WASD mover em qualquer direção (a mira não muda) · Mouse mirar · Clique atirar · Shift correr rápido · C andar devagar ·
R recarregar (também correndo) · Espaço dash · 1/2/3 ou roda do mouse trocam de arma · E suprimentos · Q ataque orbital · Esc menu
(online o jogo **não** pausa quando você abre o menu).

**Celular / tablet:** o jogo detecta a tela de toque sozinho (use `?touch=1` na URL para testar no PC) e mostra controles estilo atirador mobile,
em tela cheia na horizontal: joystick flutuante à esquerda (suave anda devagar, na borda corre rápido), arrastar o dedo à direita para mirar,
botão **FOGO** grande (segure e arraste para mirar atirando) e botões DASH, RECAR., ARMA, SUPR., ORBITAL e pausa (II). Vários dedos ao mesmo tempo.

## Progressão
- XP por inimigo (equipe); cada nível exige o dobro do anterior. Ao subir há um sorteio às escuras: em geral piora a dificuldade, às vezes dá bônus ou ajuda para todos.
- Pontuação (baixa de propósito): missão, tempo, abates, precisão e nível; perde por mortes, suprimentos e orbitais. Rank D–S. A pontuação é da equipe; os créditos são individuais.
- Melhorias permanentes (+1 de dano, +5 de vida…): 500 créditos + 250 por nível.

## Titã ácido (insetos, nível de ameaça 6+)
Gigante lento (~9 m) com 6 pernas: **anda devagar**, **ataca pisando** (área à frente, impacto no meio da animação, dá para sair correndo) e **cospe um jato de ácido** (gotas em arco
que miram devagar: andar de lado desvia). Aparece de tempos em tempos (um por vez) e nas ondas 6 e 8 da Operação Gerador; tem barra de vida própria e deixa suprimentos ao morrer.
Modelo: `assets/titan.glb` (ações Idle, Walk, Stomp, Jet) gerado por `tools/build_titan.py`; a validação dos modelos novos está em `tools/validar_modelos.md`.

## Estrutura
- `server.js` servidor estático + relé WebSocket das salas · `net.js` cliente de rede · `main.js` jogo · `bots.js` robôs · `cursor.js` cursor "blob"
- `assets/character.glb` personagem · `assets/robot.glb` inimigo robô · `assets/spider.glb` aranha rigada (Idle, Walk e Spit) · `assets/titan.glb` titã ácido (Idle, Walk, Stomp e Jet) · `lib/` three.js · `tools/` geração de modelos e visualizadores
- Personagem: `tools/build_final.py` (precisa de Python; `tools/source/` com os modelos originais não vai para o repositório):
  `python tools/build_final.py tools/source/cyber_rigged.glb tools/source/texture.webp assets/character.glb --fix-face`
- Aranha: abra `assets/spider.blend` no Blender; `tools/build_spider.py` regenera o projeto e o `.glb` (com a malha reduzida) usando o FBX e as texturas locais em `tools/source/spider/`; depois rode `tools/shrink_glb.py assets/spider.glb` para encolher as texturas.
