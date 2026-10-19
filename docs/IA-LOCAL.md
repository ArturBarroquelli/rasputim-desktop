# IA local do Rasputim

A partir da v0.4.29, o Rasputim possui uma aba **IA LOCAL** que conversa com um servidor compatível com a API OpenAI do `llama.cpp` em `http://127.0.0.1:8080`.

## Segurança

- A integração aceita somente `localhost`, `127.0.0.1` ou `::1`.
- O aplicativo recusa endpoints remotos para o chat local.
- Senhas e chaves não são incluídas no contexto enviado ao modelo.
- O contexto operacional enviado ao modelo contém apenas resumos do painel, PCP, estoque e ferramentas.
- Sem servidor local, todas as outras funções do Rasputim continuam funcionando normalmente.

## Preparação

1. Copie `llama-server.exe` e suas DLLs para `vendor/llama/`.
2. Copie um modelo `.gguf` para `models/`.
3. Execute `scripts/iniciar-ia-local.cmd`.
4. Abra o Rasputim.
5. Entre em **IA LOCAL** e clique em **TESTAR CONEXÃO LOCAL**.

## Endpoint alternativo

Por padrão: `http://127.0.0.1:8080`.

Para usar outra porta local, defina a variável de ambiente `RASPUTIM_LLAMA_URL` antes de abrir o aplicativo. O host continuará restrito ao próprio computador.
