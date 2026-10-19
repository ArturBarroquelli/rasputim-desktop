# Relatório de alterações — Rasputim Tecnologis v0.4.23

Data: 14/10/2026

## Objetivo

Permitir o controle diário de estoque sem depender de planilha: cadastrar materiais manualmente e registrar entradas, saídas ou contagens diretamente no sistema.

## Alterações realizadas

- Incluído o botão **Cadastrar material** na aba Estoque & Compras.
- Criado formulário com nome, categoria, unidade, saldo inicial, estoque mínimo, localização, observações e documento de referência.
- Cada cadastro cria automaticamente um código interno de material e um registro de **Cadastro inicial** no histórico de movimentações.
- Mantidos os lançamentos diretos de entrada, saída e contagem física, que podem ser feitos quantas vezes forem necessárias sem uso de planilha.
- Saídas continuam exigindo autorização por usuário e senha, preservando solicitante e autorizador no histórico.
- Mantida a correção anterior de ferramentas: identificadores iguais não bloqueiam ferramentas diferentes; apenas o mesmo cadastro completo é bloqueado.
- Mantida a exclusão de ferramenta sem retirada e sem histórico. Ferramentas com uso registrado permanecem protegidas para preservar auditoria.

## Dados preservados

- Estoque, movimentações, usuários, ferramentas, PCP e cotações existentes são preservados.
- A nova função apenas adiciona registros; não substitui a base atual e não exige nova planilha.

## Validações executadas

- Cadastro manual gera saldo inicial e histórico.
- Material recém-cadastrado aceita entrada e saída.
- Cadastro duplicado de mesmo material e categoria é bloqueado.
- Saídas mantêm autorização.
- Testes automatizados do projeto executados antes do empacotamento.

## Pontos de atenção

- Use a unidade correta ao cadastrar: `UN.`, `M`, `KG`, `CHAPA`, `CAIXA` etc.
- Para corrigir uma ferramenta que já possui histórico, use o status **Inativa**; ela não deve ser excluída para não apagar a auditoria.
- A planilha continua disponível como opção de levantamento/importação, mas deixa de ser obrigatória para a operação diária.

## Próximo ajuste recomendado

Criar edição de material para alterar mínimo, localização e descrição sem criar um novo cadastro.
