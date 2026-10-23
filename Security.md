# Security.md

## Threat model
- Ativos: código do jogo e assets estáticos; esta alteração não adiciona dados pessoais nem credenciais.
- Atores: jogadores locais, clientes online e host da sala.
- Superfícies afetadas: carregamento HTTP de `assets/spider.glb` e evento visual de animação durante o combate.
- Limite de confiança: o host já decide o combate da sala; esta alteração não amplia sua autoridade nem muda mensagens de rede.

## Authentication e authorization
Sem mudanças. O servidor continua usando o mecanismo existente descrito em `README.md`; o GLB é público como os demais assets do jogo.

## Dados sensíveis e secrets
Nenhum dado sensível ou segredo foi incorporado ao asset ou ao código.

## Attack surface
- Um arquivo `.glb` estático, servido pela allowlist existente em `server.js` com MIME `model/gltf-binary`.
- Não foram criados endpoints, uploads, webhooks ou jobs.

## Security tests
Nenhum teste de segurança foi executado para esta mudança de asset. A alteração não introduz autenticação, autorização, consultas, uploads de usuário ou novos dados persistentes.

## Known risks
O combate das salas continua decidido pelo host, risco preexistente documentado no README. Assets estáticos seguem a política de cache existente; o hash da versão inclui `assets/spider.glb` para solicitar atualização do jogo após alteração do modelo.

## Atualização 2026-10-23 — chat, recentes e mapa público
- **Chat (`chat:dm`, `chat:squad`):** só em WebSocket autenticado; o servidor valida amizade/bloqueio, limita a 300 caracteres e 30 mensagens/minuto por conta, remove caracteres de controle e repassa em memória. **Nada é gravado, registrado em log ou enviado ao banco.** Mensagem para quem está offline é descartada com aviso. O cliente exibe com `textContent` (sem HTML), evitando XSS.
- **Histórico e recentes:** ficam em `localStorage` do aparelho, por conta, e podem ser apagados pelo jogador. O servidor não guarda quem jogou com quem.
- **`GET /api/world`:** público e somente leitura (porcentagens por setor e notícias, sem dados de usuários), com limite de 60 requisições/minuto por IP.
- **Testes:** `tools/test_social.js` cobre DM, canal do esquadrão, bloqueio e limite; `tools/test_auth.js` cobre o endpoint público. Não houve teste de carga nem pentest externo.
