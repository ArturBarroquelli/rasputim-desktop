# Relatório de alterações — Rasputim Tecnologis v0.4.24

Data: 16/10/2026

## Objetivo da atualização

Reduzir o sistema ao escopo operacional definido: **PCP** e **gestão de estoque**.

## Limpeza automática aplicada na primeira abertura

- Remove todas as chapas e demais itens identificados como **MDF**.
- Remove todas as **corrediças**.
- Remove movimentações vinculadas aos materiais removidos.
- Remove cotações, notas, histórico de preços e pesquisas de mercado para eliminar valores/orçamentos comerciais.
- Limpa os levantamentos de clientes, vendas, arquivos comerciais e projetos analisados fora do PCP.
- Preserva o PCP, que utiliza sua base própria de produção.
- Preserva usuários, permissões e os dados de ferramentas já existentes, embora a ferramenta não apareça mais no menu principal.

## Interface operacional

O menu principal passa a exibir somente:

- PCP · Produção
- Estoque & Compras
- Configurações

## Segurança da limpeza

- A limpeza possui identificador próprio e é executada apenas uma vez por computador/base local.
- A nova versão não repõe automaticamente MDF ou corrediças após a limpeza.
- O estoque restante continua com cadastro manual, entradas, saídas, contagens e autorização de retirada.

## Validações executadas

- Testes automatizados do projeto.
- Conferência de sintaxe dos módulos alterados.
- Conferência de navegação PCP e estoque após a remoção dos atalhos comerciais.

## Ajuste recomendado

Após abrir a versão, confira os materiais restantes na aba Estoque & Compras. Caso algum item seja relacionado a MDF ou corrediça mas tenha nomenclatura atípica, informe o nome para inclusão na regra de limpeza.
