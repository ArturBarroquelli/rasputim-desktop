# Rasputim Web — interface local

Esta é a nova interface web do Rasputim. Ela foi desenhada para abrir no navegador dos computadores da fábrica, mantendo PCP, estoque, ferramentas, usuários e relatórios em uma única tela responsiva.

## Acesso na fábrica

No notebook central, abra `INICIAR-RASPUTIM-WEB-CENTRAL.cmd`. O Rasputim abre
no navegador do próprio notebook e também atende os computadores da rede local
na porta `8080`. O endereço exibido no terminal do Rasputim terá o formato
`http://192.168.1.50:8080`.

Nos computadores operacionais, abra o endereço informado no Chrome ou Edge e
salve-o como favorito. O primeiro acesso no notebook central cria o responsável
geral; os demais acessos usam login individual.

## Nesta entrega

- navegação lateral entre os módulos;
- visão geral com pipeline de produção, indicadores, estoque crítico e ferramentas em uso;
- filtro de projetos por etapa;
- servidor local com login, criação do responsável geral e sessão protegida;
- criação de projeto no PCP pela API local, iniciando em **Orçamento**;
- design preparado para operação em notebook, desktop e tela menor.

## Desenvolvimento

```bash
npm run dev:web
```

Para gerar a versão estática:

```bash
npm run build:web
```
