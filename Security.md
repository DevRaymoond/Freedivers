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
