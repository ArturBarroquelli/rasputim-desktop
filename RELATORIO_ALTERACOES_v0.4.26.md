# Relatório de alterações — Rasputim Tecnologis v0.4.26

## Centralização de usuários

- Criada uma base central de usuários em arquivo compartilhado de rede (`rasputim-usuarios-compartilhados.json`).
- O computador administrador pode centralizar os usuários atuais pela tela **Configurações → Base central de usuários**.
- Nas outras máquinas, a tela de entrada possui o botão **Conectar base central de usuários**. Basta selecionar a mesma pasta da rede.
- Um usuário criado, bloqueado, promovido a responsável geral ou com senha redefinida passa a valer em todos os computadores conectados.
- A atualização usa bloqueio temporário de gravação para evitar que dois computadores alterem a base simultaneamente.
- Mantido o funcionamento local como alternativa, sem apagar a base central caso uma estação seja desconectada.

## Procedimento de implantação

1. No computador principal, entre com um responsável geral.
2. Em **Configurações → Base central de usuários**, selecione **Centralizar usuários** e escolha uma pasta da rede acessível aos computadores (ex.: `\\SERVIDOR\\Rasputim`).
3. Em cada outra máquina, na tela de entrada, selecione **Conectar base central de usuários** e escolha a mesma pasta.
4. Entre normalmente com o mesmo usuário e senha cadastrados pelo administrador.

## Validação

- Teste automatizado criado para duas instalações conectadas à mesma base de usuários.
- Verificação de sintaxe dos processos principal, interface, segurança e armazenamento compartilhado.
