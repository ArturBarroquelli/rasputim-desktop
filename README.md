# Rasputim Tecnologis v0.6.3

**React + TypeScript + Electron + Node.js + IA local** aplicados a um sistema desktop de operação fabril.

> **Para recrutadores:** veja a [visão técnica do projeto](docs/PORTFOLIO_RECRUTADORES.md), com problema resolvido, decisões de arquitetura e evidências de engenharia.

O Rasputim nasceu para resolver um problema real: centralizar **PCP, estoque/compras, ferramentas, usuários e inteligência operacional** em um único aplicativo Windows. A v0.6.3 preserva na interface web local o mesmo painel visual escuro da versão executável, acessada pelos navegadores da rede da empresa.

## Stack

- React 18
- TypeScript
- Vite
- Electron 28.3.3
- Node.js / CommonJS no Core
- SheetJS (`xlsx`)
- `node:test`
- GitHub Actions
- llama.cpp / GGUF para IA local opcional

## Arquitetura

```text
React + TypeScript (renderer)
            │
            ▼
Electron preload / IPC seguro
            │
            ▼
Node.js Core
├── PCP
├── Estoque e compras
├── Ferramentas
├── Usuários e permissões
├── Relatórios
└── IA local
```

O renderer não recebe acesso direto ao Node.js. A comunicação acontece pelo `preload.cjs` com `contextIsolation: true`, `nodeIntegration: false` e sandbox habilitado.

## Funcionalidades demonstráveis

- Quadro PCP com etapas, prazos, responsáveis e movimentações.
- Dashboard de estoque, estoque mínimo e necessidade de compra.
- Gestão de ferramentas, disponibilidade e manutenção.
- Login individual e trilha de responsabilidade.
- Assistente de IA local conectado ao `llama-server`.
- Build Windows x64 automatizado pelo GitHub Actions.

## Operação central na empresa

### Acesso web local

No notebook central, execute `INICIAR-RASPUTIM-WEB-CENTRAL.cmd` dentro da
versão Windows. O notebook passa a atender a interface web em uma porta local e
abre automaticamente o navegador. Nos outros computadores, acesse o endereço
de rede exibido pelo central, por exemplo `http://192.168.1.50:8080`.

O acesso não depende de internet: os dados e o login permanecem na rede local.
O primeiro acesso cria o responsável geral. Os demais usuários usam suas
próprias credenciais.

### Operação compartilhada da versão desktop

No notebook central, o responsável geral escolhe uma pasta compartilhada em **Sobre o projeto → Configurar como central**. Essa pasta concentra a base operacional, usuários e PCP. Em cada computador operacional, antes do primeiro login, use **Conectar ao computador central** e selecione a mesma pasta compartilhada.

Todos os computadores precisam ter leitura e gravação nessa pasta. A conexão é local pela rede da empresa; não depende de internet.

## Desenvolvimento

```bash
npm install
npm run verify
```

Renderer:

```bash
npm run dev:renderer
```

## Build Windows

```bash
npm install --no-save electron@28.3.3 @electron/packager@18.3.2
npm run build:windows
```

## Portfólio

Este projeto demonstra frontend moderno, aplicação desktop, IPC seguro, regras de negócio, persistência local/rede, CI/CD e IA local em um cenário empresarial real.
