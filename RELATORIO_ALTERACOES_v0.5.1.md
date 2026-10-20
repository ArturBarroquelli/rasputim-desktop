# Rasputim Tecnologis v0.5.1 — Operação Central

## Entrega

- Inclusa base operacional central para notebook Windows 10 e computadores clientes Windows 11.
- PCP, usuários, estoque, ferramentas e respectivos históricos passam a utilizar a mesma pasta central quando configurados em rede.
- Clientes podem conectar-se à operação antes do primeiro login, selecionando a pasta compartilhada do computador central.
- Atualizações feitas em uma máquina são verificadas automaticamente nas demais a cada três segundos.
- Mantido o modo local como alternativa controlada para o responsável geral.

## Segurança e continuidade

- A interface continua isolada do Node.js por preload/IPC seguro.
- A base central possui bloqueio temporário para evitar duas escritas concorrentes.
- Cada computador mantém um cache local da última base lida, usado apenas se a pasta compartilhada ficar indisponível.
- A operação exige permissões de leitura e gravação na pasta do notebook central.

## Validação

- TypeScript, build React, verificação de sintaxe e 95 testes automatizados aprovados.
- Teste novo confirma que computador central e cliente leem a mesma base operacional e propagam atualizações.
