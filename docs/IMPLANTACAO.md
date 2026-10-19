# Implantação do Rasputim Tecnologis

## Estação principal

1. Instale/extrair o pacote Windows x64.
2. Crie o primeiro **Responsável geral**.
3. Em **Configurações → Base central de usuários**, escolha uma pasta de rede acessível às estações.
4. Use **Centralizar usuários**.
5. Configure o PCP compartilhado conforme a rede da empresa.

## Outras estações

1. Abra o Rasputim.
2. Na tela de login, use **Conectar base central de usuários**.
3. Selecione a mesma pasta da rede.
4. Entre com a conta criada pelo responsável geral.

## IA local

A IA é opcional. O servidor `llama-server` pode rodar na própria estação em `127.0.0.1:8080`. A v0.4.29 bloqueia endpoints remotos nessa integração.

## Backup

Faça backup periódico da pasta de dados exibida em **Configurações → Armazenamento local** e da pasta compartilhada de usuários/PCP quando configurada.
