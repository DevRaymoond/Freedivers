# Freedivers

Shooter 3D de esquadrão, original, solo e 100% offline (three.js incluído em `lib/`).

## Como jogar
Dê dois cliques em `Jogar.bat` (precisa do Node.js). Ele abre http://127.0.0.1:8765.

WASD mover em qualquer direção (a mira não muda) · Mouse mirar · Clique atirar
Shift correr rápido · C andar devagar · R recarregar (também correndo) · Espaço dash · E suprimentos · Esc pausar

## Missões
1. **Operação Gerador** (campanha): o esquadrão nasce a ~120 m do gerador e atravessa o mapa com pelotões patrulhando
   (eles te notam por proximidade, tiros e explosões, e alertam os vizinhos); ativa e defende o gerador por 8 ondas;
   vai à zona de extração (raio de 50 m) e resiste 1:30; a nave pousa, abre a rampa traseira e você embarca.
   Três reforços (vidas). A tela final mostra a pontuação.
2. Limpeza do setor (6 ondas de Fibonacci: 5, 8, 13, 21, 34, 55) · 3. Coleta de amostras · 4. Faróis · 5. Defesa do gerador · 6. Extração sob fogo · 7. Rainha da colmeia

## Progressão
- XP por inimigo; cada nível exige o dobro do anterior. Ao subir de nível há um sorteio às escuras (as chances não aparecem): em geral piora a dificuldade, às vezes dá bônus ou ajuda.
- Só a primeira operação da lista é nível 1 (modo relax); cada operação seguinte escala vida, quantidade, velocidade, dano e elites dos inimigos.
- Pontuação (baixa de propósito): missão, tempo, abates, precisão, nível; perde por mortes, suprimentos e orbitais. Rank D–S.
- Melhorias permanentes: ganhos pequenos e fixos (+1 de dano, +5 de vida...), 500 créditos + 250 por nível.
- Ataque orbital: ponto central, 6 linhas ao redor em 0,5 s, giram e se fecham, impacto 100 ms depois.
- Cursor "blob" nos menus (`cursor.js`).

## Próximos passos
- Mais missões, inimigos e armas
- Multiplayer cooperativo (por último): `main.js` já separa `tick(dt)` da renderização,
  o que facilita um modelo host-autoritativo via WebSocket/WebRTC.

## Personagem
`assets/character.glb` vem de `tools/build_final.py`: usa o "cyberpunk character 3d model(1).glb" (UV, 65 ossos com
dedos e pesos do próprio arquivo), embute a textura e gera a arma, os carregadores e as animações em camadas:
- baixo (pernas/quadril): `LowIdle` e `Walk_0..315` / `Run_0..315` (8 direções, misturadas pelo ângulo do movimento)
- cima (tronco/braços/dedos): `Aim`, `Reload`, `Shoot`, `Hit` — por isso corre em 360° sem tirar a mira da direção e recarrega correndo
- corpo todo: `Dash`, `Death`
Os braços usam cinemática inversa para as mãos alcançarem a arma; os dedos fecham no punho/guarda-mão e abrem para pegar o carregador.
Para refazer:
`tools\.venv\Scripts\python toolsuild_final.py tools\source\cyber_rigged.glb tools\source	exture.webp assets\character.glb --fix-face`
(`--fix-face` pinta a pele do rosto, porque o atlas fornecido põe uma grade na ilha da cabeça.)
Versões anteriores: `build_rigged.py`, `build_cyber.py`, `build_character.py`.
Visualizador de modelos/animações: `tools/viewer.html?model=../assets/character.glb&anim=Run&t=0.2`.

Pré-visualização: `tools/sheet.html?anim=Run_90+Aim&n=4&yaw=25&cols=4&far=1.0` (poses lado a lado; `+` combina camadas).

Observação: `tools/source/` (modelos e textura originais) não vai para o repositório; coloque seus arquivos lá para regenerar `assets/character.glb`.
