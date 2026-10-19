# Rasputim Tecnologis v0.5.0

## Migração do renderer
- React 18 + TypeScript como interface principal.
- Vite para build do renderer.
- Electron continua como shell desktop.
- Core Node.js/PCP/estoque/ferramentas/segurança preservado.
- IPC seguro mantido pelo preload.

## Páginas React
- PCP / quadro de produção.
- Estoque & compras.
- Ferramentas.
- IA local com núcleo visual Matrix.
- Página de arquitetura/portfólio.
- Login/setup inicial em React.

## CI/CD
GitHub Actions executa typecheck TypeScript, build Vite, testes Node e empacotamento Windows x64.
