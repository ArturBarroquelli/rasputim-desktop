# Rasputim Tecnologis — Visão para Recrutadores

## O projeto em uma frase

Aplicação desktop para Windows que transforma a rotina operacional de uma fábrica em fluxos rastreáveis de produção, estoque, ferramentas, usuários e apoio por IA local.

## Problema real que resolve

A operação dependia de planilhas, registros manuais e conhecimento distribuído entre pessoas. O Rasputim foi concebido para concentrar o acompanhamento de projetos, materiais e responsabilidades em uma aplicação que funcione localmente no ambiente da empresa.

## O que foi construído

- **PCP:** acompanhamento de projetos por etapa, responsável, prazo e histórico.
- **Estoque e compras:** materiais, estoque mínimo, entradas/saídas e necessidades de reposição.
- **Ferramentas:** cadastro, retirada, devolução, manutenção e identificação de quem retirou, autorizou e registrou a operação.
- **Usuários e permissões:** login individual, perfis de acesso e trilha de responsabilidade.
- **IA local opcional:** integração com `llama.cpp`/GGUF via servidor local, sem dependência obrigatória de serviço externo.
- **Auditoria:** relatórios de alterações e histórico operacional.

## Decisões técnicas

| Tema | Decisão |
| --- | --- |
| Interface | React 18 + TypeScript + Vite |
| Aplicação desktop | Electron |
| Regras de negócio | Node.js / CommonJS |
| Comunicação interna | Preload + IPC com isolamento de contexto |
| Importação de planilhas | SheetJS |
| Qualidade | `node:test`, typecheck e verificações automatizadas |
| Entrega | Empacotamento Windows x64 no GitHub Actions |

## Arquitetura

```text
React + TypeScript
        ↓
Electron preload / IPC seguro
        ↓
Core Node.js
 ├─ PCP
 ├─ Estoque e compras
 ├─ Ferramentas
 ├─ Usuários e permissões
 ├─ Relatórios
 └─ IA local
```

O renderer não recebe acesso direto ao Node.js. A ponte de comunicação é controlada pelo preload, com `contextIsolation`, sandbox e `nodeIntegration` desabilitada.

## Evidências de engenharia

- Migração progressiva da interface para React + TypeScript, preservando um Core validado.
- Organização por módulos de domínio em vez de concentrar regras em uma única tela.
- Testes automatizados e build para Windows no pipeline.
- Versões documentadas em relatórios de alterações.
- Projeto criado a partir de necessidades reais de operação, não apenas como demonstração visual.

## Escopo de demonstração

Dados comerciais, credenciais e arquivos de produção não fazem parte do repositório público. O foco é a arquitetura, o código e a evolução técnica do produto.

## Próximos passos técnicos

- Consolidar a camada de persistência compartilhada entre máquinas.
- Ampliar testes de integração para fluxos de usuário e ferramentas.
- Disponibilizar demonstração visual com dados fictícios.
