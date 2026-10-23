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
- `node tools/test_relay.js` testa as regras das salas (código, limite de 4, sala travada, saída do host).

## Operações
1. **Operação Gerador** (campanha, nível 1 = modo relax): você nasce a ~120 m do objetivo e atravessa o mapa com pelotões patrulhando
   (notam proximidade, tiros e explosões e alertam os vizinhos); defende o gerador por 8 ondas; segura a zona de extração (raio 50 m) por 1:30;
   a nave pousa, abre a rampa traseira e todos embarcam.
2. Limpeza do setor (6 ondas de Fibonacci: 5, 8, 13, 21, 34, 55) · 3. Coleta de amostras · 4. Faróis · 5. Defesa do gerador · 6. Extração sob fogo · 7. Rainha da colmeia
Cada fase tem a sua base de dificuldade (vida, ataque, velocidade, quantidade, elites e mistura de inimigos; só a primeira é modo relax)
e, dentro da fase, a vida e o ataque de cada onda crescem pela sequência de Fibonacci (1, 1, 2, 3, 5, 8, 13, 21…).

## Controles
WASD mover em qualquer direção (a mira não muda) · Mouse mirar · Clique atirar · Shift correr rápido · C andar devagar ·
R recarregar (também correndo) · Espaço dash · 1/2/3 ou roda do mouse trocam de arma · E suprimentos · Q ataque orbital · Esc menu
(online o jogo **não** pausa quando você abre o menu).

## Progressão
- XP por inimigo (equipe); cada nível exige o dobro do anterior. Ao subir há um sorteio às escuras: em geral piora a dificuldade, às vezes dá bônus ou ajuda para todos.
- Pontuação (baixa de propósito): missão, tempo, abates, precisão e nível; perde por mortes, suprimentos e orbitais. Rank D–S. A pontuação é da equipe; os créditos são individuais.
- Melhorias permanentes (+1 de dano, +5 de vida…): 500 créditos + 250 por nível.

## Estrutura
- `server.js` servidor estático + relé WebSocket das salas · `net.js` cliente de rede · `main.js` jogo · `cursor.js` cursor "blob"
- `assets/character.glb` personagem · `lib/` three.js · `tools/` geração do personagem e visualizadores
- Personagem: `tools/build_final.py` (precisa de Python; `tools/source/` com os modelos originais não vai para o repositório):
  `python tools/build_final.py tools/source/cyber_rigged.glb tools/source/texture.webp assets/character.glb --fix-face`
