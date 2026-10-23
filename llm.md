# llm.md — Multipunk

## Stack e arquitetura
- Jogo cooperativo 3D para navegador: Three.js, JavaScript, Node.js e WebSocket; persistência opcional via PostgreSQL/Neon.
- `main.js` controla jogo e renderização; `server.js` serve arquivos e salas; `net.js` cuida da rede; `assets/` guarda modelos do jogo.
- A aranha cuspideira usa `assets/spider.glb`, derivado do FBX fornecido, com fonte editável em `assets/spider.blend` e gerador em `tools/build_spider.py`.

## Convenções
- Preserve a identidade visual dos assets de origem ao fazer ajustes.
- Mudanças de gameplay devem funcionar tanto no host quanto nos clientes online.
- Não altere regras de combate ou protocolo de rede sem necessidade explícita.

## Comandos
- `npm start` inicia o servidor local.
- `npm test` executa os testes existentes.
- Regenerar aranha: `blender --background --factory-startup --python tools/build_spider.py` (requer Blender e os arquivos ignorados em `tools/source/spider/`).

## Segurança e testes
- Leia `Security.md` antes de mudanças na superfície de rede, autenticação ou persistência.
- Nunca exponha segredos; preserve validação, limites e consultas parametrizadas existentes.
- Não declare testes como executados sem executá-los. Mudanças no asset devem ser conferidas visualmente e na integração Three.js.
