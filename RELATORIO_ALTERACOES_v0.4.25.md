# Relatório de alterações — Rasputim Tecnologis v0.4.25

## Correção de acessos e responsáveis

- Confirmada a criação de contas individuais: o usuário novo entra com o login e a senha definidos no cadastro.
- Adicionada confirmação obrigatória da senha ao cadastrar um usuário, evitando que uma senha digitada incorretamente fique salva sem percepção.
- Adicionada a ação **SENHA** em cada usuário cadastrado. O responsável geral pode redefinir a senha sem excluir a pessoa, sem recriar o cadastro e sem perder o histórico.
- O botão do topo agora é apresentado como **Trocar usuário**. Ele abre a tela de entrada para conferir uma nova conta sem fechar nem reiniciar o Rasputim.
- O cadastro informa claramente que o cargo **Responsável geral** concede a responsabilidade administrativa do sistema ao novo usuário.

## Diagnóstico da ocorrência apresentada

O cadastro exibido estava **ativo**, porém com "Nunca entrou". Isso indica que nenhuma autenticação foi concluída com sucesso para aquele login; não indica bloqueio da conta. A redefinição de senha e a troca de usuário permitem testar e corrigir o acesso imediatamente.

## Validação

- Teste automatizado criado para login com senha inicial e após redefinição.
- Suite local: 88 testes aprovados.
- Verificação sintática dos processos principal, interface e segurança concluída.
