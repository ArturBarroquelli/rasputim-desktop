# Relatório de alterações — Rasputim Tecnologis v0.4.29

## GitHub e distribuição

- Adicionado workflow reproduzível para Windows x64 usando Electron 28.3.3.
- O pipeline executa validação de sintaxe e toda a suíte de testes antes do empacotamento.
- O artefato final é publicado pelo GitHub Actions em ZIP.
- Modelos GGUF, binários do llama.cpp, credenciais, dados locais e builds foram excluídos do versionamento.

## IA local

- Criada aba **IA LOCAL** com núcleo visual no tema Matrix.
- Integração com `llama-server` compatível com `/health`, `/v1/models` e `/v1/chat/completions`.
- Comunicação restrita a localhost por segurança.
- A IA recebe somente resumo operacional; senhas e credenciais não são incluídas.
- O restante do Rasputim funciona normalmente quando a IA está offline.

## Preservação funcional

- PCP, estoque/compras, usuários centralizados, ferramentas, manutenção e responsável pela retirada foram preservados sobre a base v0.4.28.
