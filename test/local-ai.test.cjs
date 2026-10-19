const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseUrl, localAiStatus, sendLocalAiMessage } = require('../core/local-ai.cjs');

test('IA local aceita apenas loopback por segurança', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8080/path'), 'http://127.0.0.1:8080');
  assert.throws(() => normalizeBaseUrl('https://example.com'), /somente no próprio computador/);
});

test('status da IA detecta servidor compatível pelo endpoint de modelos', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/health')) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'qwen-local' }] }) };
  };
  const result = await localAiStatus({ fetchImpl, timeoutMs: 1000 });
  assert.equal(result.online, true);
  assert.deepEqual(result.models, ['qwen-local']);
  assert.equal(calls.length, 2);
});

test('chat da IA envia somente para localhost e devolve o conteúdo', async () => {
  let body;
  const fetchImpl = async (_url, options) => {
    body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ model: 'qwen-local', choices: [{ message: { content: 'Resposta local.' } }] }),
    };
  };
  const result = await sendLocalAiMessage({ prompt: 'Qual é o status?', context: { pcp: { active: 2 } }, fetchImpl });
  assert.equal(result.content, 'Resposta local.');
  assert.equal(body.stream, false);
  assert.match(body.messages[0].content, /Rasputim Tecnologis/);
  assert.equal(body.messages[1].content, 'Qual é o status?');
});
