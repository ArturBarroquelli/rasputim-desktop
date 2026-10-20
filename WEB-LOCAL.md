# Rasputim Web — interface local

Esta é a nova interface web do Rasputim. Ela foi desenhada para abrir no navegador dos computadores da fábrica, mantendo PCP, estoque, ferramentas, usuários e relatórios em uma única tela responsiva.

## Nesta primeira entrega

- navegação lateral entre os módulos;
- visão geral com pipeline de produção, indicadores, estoque crítico e ferramentas em uso;
- filtro de projetos por etapa;
- criação de projeto pela própria tela, iniciando em **Orçamento**;
- design preparado para operação em notebook, desktop e tela menor.

## Próxima integração

A tela será ligada ao computador central para substituir os dados demonstrativos pelos dados compartilhados da operação. Os demais computadores acessarão pelo navegador na rede local, sem precisar instalar o aplicativo em cada estação.

## Desenvolvimento

```bash
npm run dev:web
```

Para gerar a versão estática:

```bash
npm run build:web
```
