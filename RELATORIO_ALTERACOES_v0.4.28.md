# Relatório de alterações — Rasputim Tecnologis v0.4.28

## Controle de retirada de ferramentas

- Incluído o campo obrigatório **Funcionário que retirou** no registro de saída de ferramenta.
- O campo é preenchido a partir dos usuários ativos cadastrados no Rasputim.
- O funcionário responsável pelo uso fica separado de quem registrou a operação e de quem autorizou a retirada.
- A tabela de ferramentas e o histórico passam a indicar o funcionário selecionado como responsável pela retirada.
- Registros antigos permanecem preservados: quando não possuírem funcionário selecionado, continuam exibindo o usuário que registrou a saída naquela época.

## Validação

- Teste automatizado incluído para retirada realizada em nome de funcionário diferente do operador que registrou a saída.
- Verificações de sintaxe e testes da aplicação executados antes do empacotamento.
