# Rasputim Tecnologis

Aplicação desktop local para **PCP, estoque/compras, ferramentas e controle de usuários** em ambiente fabril, com integração opcional a uma IA executada no próprio computador.

> Base de produção desta revisão: **v0.4.29**, derivada diretamente da v0.4.28 validada.

## Recursos

- PCP com 8 etapas, bloqueios, prazos e operação compartilhada em rede.
- Estoque com entradas, saídas, contagem física, histórico e estoque mínimo.
- Compras e pesquisa de fornecedores.
- Cadastro e auditoria de ferramentas, retiradas, devoluções e manutenção.
- Usuários individuais e base central compartilhada em rede.
- Registro separado de funcionário que retirou, operador e autorizador.
- Relatórios em PDF.
- IA local opcional via `llama-server`, restrita a localhost.

## Stack

- Electron **28.3.3**
- Node.js
- JavaScript / CommonJS
- HTML + CSS
- SheetJS (`xlsx` 0.18.5)
- `node:test`
- GitHub Actions
- llama.cpp / GGUF (opcional, não incluído no repositório)

## Desenvolvimento

```bash
npm ci
npm test
```

Validação completa:

```bash
npm run verify
```

## Build Windows x64

O GitHub Actions instala a toolchain de empacotamento sem alterar o lockfile e gera o artefato Windows.

Para executar localmente:

```bash
npm install --no-save --package-lock=false electron@28.3.3 @electron/packager@18.3.2
npm run build:windows
```

## IA local

O Rasputim **não inclui** modelo GGUF nem `llama-server.exe` no Git.

Veja [docs/IA-LOCAL.md](docs/IA-LOCAL.md).

Estrutura esperada:

```text
models/
└── seu-modelo.gguf

vendor/llama/
├── llama-server.exe
└── *.dll
```

Depois execute:

```text
scripts\iniciar-ia-local.cmd
```

A aba **IA LOCAL** detecta o servidor em `http://127.0.0.1:8080`.

## Segurança

- Credenciais Tavily são tratadas pelo cofre do sistema operacional quando disponível.
- O renderer não recebe a chave Tavily completa depois de salva.
- A IA local não aceita hosts externos.
- Dados locais, credenciais, modelos e binários pesados estão no `.gitignore`.

## Testes

A suíte cobre análise de planilhas, PCP, estoque, compras, segurança, credenciais, usuários compartilhados, ferramentas e integração da IA local.

## Implantação

Veja [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md).
