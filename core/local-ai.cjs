const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_TIMEOUT_MS = 120000;

function normalizeBaseUrl(value) {
  const input = String(value || DEFAULT_BASE_URL).trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Endereço da IA local inválido.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("A IA local deve usar HTTP ou HTTPS.");
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error("Por segurança, o Rasputim aceita a IA local somente no próprio computador.");
  }
  return parsed.origin;
}

function buildController(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  return { controller, clear: () => clearTimeout(timer) };
}

function ensureFetch(fetchImpl) {
  const fn = fetchImpl || globalThis.fetch;
  if (typeof fn !== 'function') throw new Error("Este ambiente não possui suporte HTTP para a IA local.");
  return fn;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`A IA local respondeu em formato inesperado (${response.status}).`);
  }
}

async function localAiStatus({ baseUrl = DEFAULT_BASE_URL, fetchImpl, timeoutMs = 1800 } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const request = ensureFetch(fetchImpl);
  const { controller, clear } = buildController(timeoutMs);
  try {
    let response;
    try {
      response = await request(`${base}/health`, { method: 'GET', signal: controller.signal });
      if (response.ok) {
        const body = await parseJson(response).catch(() => ({}));
        return { online: true, baseUrl: base, endpoint: '/health', detail: body.status || body.message || 'ONLINE' };
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }

    response = await request(`${base}/v1/models`, { method: 'GET', signal: controller.signal });
    if (!response.ok) return { online: false, baseUrl: base, endpoint: '/v1/models', status: response.status };
    const body = await parseJson(response);
    const models = Array.isArray(body.data) ? body.data.map((item) => item?.id).filter(Boolean) : [];
    return { online: true, baseUrl: base, endpoint: '/v1/models', models, detail: models[0] || 'ONLINE' };
  } catch (error) {
    if (error?.name === 'AbortError') return { online: false, baseUrl: base, error: 'TIMEOUT' };
    return { online: false, baseUrl: base, error: error?.message || 'OFFLINE' };
  } finally {
    clear();
  }
}

function cleanPrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) throw new Error("Digite uma pergunta para a IA.");
  if (prompt.length > 12000) throw new Error("A pergunta é muito longa para esta versão do Rasputim.");
  return prompt;
}

function systemPrompt(context = {}) {
  return [
    'Você é o núcleo de IA local do Rasputim Tecnologis.',
    'Responda em português do Brasil, com linguagem objetiva e operacional.',
    'Não invente dados de estoque, PCP, ferramentas, compras ou usuários.',
    'Quando faltar informação, diga exatamente qual dado está ausente.',
    'Nunca peça senhas, chaves privadas ou credenciais.',
    'Use o contexto operacional fornecido apenas para ajudar na resposta.',
    `Contexto operacional: ${JSON.stringify(context)}`,
  ].join('\n');
}

async function sendLocalAiMessage({
  baseUrl = DEFAULT_BASE_URL,
  prompt,
  context = {},
  model = 'local-model',
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const request = ensureFetch(fetchImpl);
  const userPrompt = cleanPrompt(prompt);
  const { controller, clear } = buildController(timeoutMs);
  try {
    const response = await request(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.25,
        messages: [
          { role: 'system', content: systemPrompt(context) },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const body = await parseJson(response);
    if (!response.ok) {
      const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
      throw new Error(`Falha na IA local: ${message}`);
    }
    const content = body?.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) throw new Error("A IA local não devolveu conteúdo.");
    return {
      content: String(content).trim(),
      model: body?.model || model,
      usage: body?.usage || null,
      baseUrl: base,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error("A IA local demorou demais para responder.");
    throw error;
  } finally {
    clear();
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
  localAiStatus,
  sendLocalAiMessage,
};
