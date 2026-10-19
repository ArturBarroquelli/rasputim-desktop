const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src/renderer.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src/preload.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "src/main.cjs"), "utf8");

test("todos os IDs estáticos usados pelo renderer existem no HTML", () => {
  const usedIds = new Set([...renderer.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
  const declaredIds = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((match) => match[1]));
  const missing = [...usedIds].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, []);
});

test("PCP está integrado ao Rasputim com quadro, oito etapas e controles auditáveis", () => {
  assert.match(html, /data-view="pcp"/);
  assert.match(html, /id="view-pcp"/);
  assert.match(html, /id="pcp-board"/);
  assert.match(html, /id="pcp-project-form"/);
  assert.match(html, /id="pcp-detail-modal"/);
  assert.match(html, /id="pcp-network-modal"/);
  assert.match(html, /Lista de compra \+ caderno técnico/);
  assert.match(renderer, /function renderPcp\(/);
  assert.match(renderer, /function movePcpProject\(/);
  assert.match(renderer, /function togglePcpBlock\(/);
  assert.match(preload, /pcp:create/);
  assert.match(preload, /pcp:transition/);
  assert.match(preload, /pcp:changed/);
  assert.match(main, /createPcpStore/);
  assert.match(main, /pcp:choose-shared-directory/);
  assert.match(main, /setInterval\(\(\) =>/);
});

test("interface permite testar, salvar e remover uma chave Tavily opcional", () => {
  assert.match(html, /PESQUISA TAVILY/);
  assert.match(html, /KEYLESS ATIVO/);
  assert.match(html, /IMPORTAR PLANILHA · AUTO/);
  assert.match(html, /id="market-api-key"[^>]+type="password"/);
  assert.match(html, /id="test-market-api-key"/);
  assert.match(html, /id="save-market-api-key"/);
  assert.match(html, /id="remove-market-api-key"/);
  assert.match(renderer, /async function testMarketApiKey/);
  assert.match(renderer, /async function saveMarketApiKey/);
  assert.match(renderer, /async function removeMarketApiKey/);
  assert.doesNotMatch(html, /Serper/i);
  assert.doesNotMatch(renderer, /Serper/i);
});

test("IPC mantém a chave no processo principal e usa o cofre do sistema operacional", () => {
  assert.match(preload, /market:credentials:get/);
  assert.match(preload, /market:credentials:test/);
  assert.match(preload, /market:credentials:save/);
  assert.match(preload, /market:credentials:remove/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /safeStorage\.decryptString/);
  assert.match(main, /createCredentialVault/);
  assert.match(main, /tavilyApiKey/);
  assert.doesNotMatch(preload, /loadKey|decryptString/);
});

test("interface aplica Paraná obrigatório e nunca oferece mapa como site", () => {
  assert.match(html, /nunca ultrapassa a divisa do Paraná/i);
  assert.match(html, /procura SITE OFICIAL, TELEFONE e WHATSAPP automaticamente/i);
  assert.match(renderer, /PARANÁ CONFIRMADO/);
  assert.match(renderer, /ABRIR SITE OFICIAL/);
  assert.match(renderer, /SITE NÃO ENCONTRADO/);
  assert.match(renderer, /ABRIR WHATSAPP/);
  assert.match(renderer, /COPIAR TELEFONE/);
  assert.match(preload, /market:copy-phone/);
  assert.match(main, /market:copy-phone/);
  assert.doesNotMatch(renderer, /Ofertas online e nacionais/);
  assert.doesNotMatch(renderer, /Fora do raio escolhido/);
  assert.match(main, /Links de mapas e páginas de localização não são exibidos/);
  assert.match(main, /página de localização ou terceiro, não ao site oficial confirmado/);
});

test("estoque possui área de levantamentos com prévia, confirmação e histórico", () => {
  assert.match(html, /data-procurement-tab="counts"/);
  assert.match(html, /IMPORTAR LEVANTAMENTO DE ESTOQUE/);
  assert.match(html, /id="stock-drop-zone"/);
  assert.match(html, /id="stock-import-preview"/);
  assert.match(html, /id="stock-count-responsible"/);
  assert.match(html, /id="apply-stock-count"/);
  assert.match(html, /id="stock-count-history-body"/);
  assert.match(html, /id="stock-import-mode"/);
  assert.match(html, /SUBSTITUIR TODO O ESTOQUE/);
  assert.match(renderer, /async function applyStockImportPreview/);
  assert.match(html, /SUBSTITUIÇÃO TOTAL CONTROLADA/);
});

test("movimentação de estoque permite lançamentos consecutivos sem barreira operacional", () => {
  assert.match(html, /data-continue-movement="true"/);
  assert.match(html, /SALVAR E REGISTRAR OUTRO/);
  assert.match(html, /Saldos negativos geram alerta, mas não bloqueiam/);
  assert.match(renderer, /continueRegistering/);
  assert.match(renderer, /Saldo negativo mantido para conferência, sem bloquear novas movimentações/);
});

test("controle de usuários exige autorização registrada para a saída", () => {
  assert.match(html, /id="auth-gate"/);
  assert.match(html, /id="auth-setup-form"/);
  assert.match(html, /id="auth-login-form"/);
  assert.match(html, /id="user-management-card"/);
  assert.match(html, /id="movement-authorization"/);
  assert.match(html, /USUÁRIO AUTORIZADOR/);
  assert.match(renderer, /function showAuthGate/);
  assert.match(renderer, /function submitUser/);
  assert.match(renderer, /authorizerPassword/);
  assert.match(preload, /auth:login/);
  assert.match(preload, /auth:create-user/);
  assert.match(main, /recordWithdrawalAuthorization/);
  assert.match(main, /STOCK_AUTHORIZE_EXIT/);
  assert.match(main, /SESSION_IDLE_MS/);
});

test("ferramentas possuem cadastro individual, retirada autorizada e devolução auditável", () => {
  assert.match(html, /id="view-tools"/);
  assert.match(html, /PARAFUSADEIRAS/);
  assert.match(html, /SERRAS TICO-TICO/);
  assert.match(html, /id="tool-register-form"/);
  assert.match(html, /id="tool-checkout-form"/);
  assert.match(html, /id="tool-authorizer-login"/);
  assert.match(html, /id="tool-history-body"/);
  assert.match(renderer, /function renderTools\(/);
  assert.match(renderer, /function submitToolCheckout\(/);
  assert.match(renderer, /function returnToolFromUi\(/);
  assert.match(preload, /tools:add/);
  assert.match(preload, /tools:checkout/);
  assert.match(preload, /tools:return/);
  assert.match(main, /recordToolWithdrawalAuthorization/);
  assert.match(main, /TOOL_AUTHORIZE_WITHDRAWAL/);
});

test("IPC de levantamento separa prévia e aplicação sem expor escrita direta", () => {
  assert.match(preload, /procurement:preview-stock/);
  assert.match(preload, /procurement:apply-stock-preview/);
  assert.match(preload, /procurement:cancel-stock-preview/);
  assert.match(main, /previewStockImport/);
  assert.match(main, /applyStockImport/);
  assert.match(main, /A planilha foi alterada depois da prévia/);
  assert.doesNotMatch(preload, /procurement:import-stock/);
});
