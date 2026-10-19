const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.value = "";
    this.placeholder = "";
    this.disabled = false;
    this.title = "";
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.children = [];
  }
  addEventListener() {}
  append(element) { this.children.push(element); }
  focus() { this.ownerDocument.activeElement = this; }
  remove() { this.removed = true; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function rendererHarness() {
  const ids = [
    "data-path", "platform-label", "settings-version", "sidebar-version",
    "market-api-status", "market-api-key", "test-market-api-key",
    "save-market-api-key", "remove-market-api-key", "market-api-mode",
    "market-api-storage", "market-api-plan", "market-api-help", "toast-region",
    "confirm-title", "confirm-message", "confirm-accept", "confirm-dialog",
    "market-title", "market-subtitle", "market-radius", "market-summary", "market-results",
    "stock-count-history-count", "stock-count-last", "stock-count-history-body",
    "stock-import-preview", "stock-preview-body", "stock-preview-file", "stock-preview-sheet",
    "stock-preview-valid", "stock-preview-changed", "stock-preview-new", "stock-preview-pending",
    "stock-preview-preserved", "stock-preview-removed", "stock-preview-warning", "stock-count-responsible",
    "stock-import-mode",
    "apply-stock-count", "cancel-stock-count",
    "nav-pcp-count", "pcp-active-count", "pcp-critical-count", "pcp-late-count",
    "pcp-blocked-count", "pcp-delivery-count", "pcp-completed-count",
    "pcp-connection-strip", "pcp-connection-status", "pcp-connection-detail", "pcp-connection-sync",
    "pcp-stage-filter", "pcp-priority-filter", "pcp-search", "pcp-board-summary", "pcp-board",
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const document = {
    activeElement: null,
    querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
    addEventListener: () => {},
  };
  elements.forEach((element) => { element.ownerDocument = document; });

  const calls = { savedKey: "", testedKey: "", removed: 0 };
  const configured = {
    hasKey: true,
    maskedKey: "tvly-••••••••7890",
    storageProtected: true,
    savedAt: "2026-08-05T12:00:00.000Z",
    lastTestedAt: "2026-08-05T12:00:00.000Z",
    plan: "Bootstrap",
    usage: 25,
    limit: 1000,
    remaining: 975,
    error: "",
  };
  const keyless = {
    hasKey: false,
    maskedKey: "",
    storageProtected: true,
    savedAt: null,
    lastTestedAt: null,
    plan: "",
    usage: null,
    limit: null,
    remaining: null,
    error: "",
  };
  const api = {
    testTavilyKey: async (key) => {
      calls.testedKey = key;
      return { ok: true, testedAt: configured.lastTestedAt, plan: "Bootstrap", usage: 25, limit: 1000, remaining: 975 };
    },
    saveTavilyKey: async (key) => { calls.savedKey = key; return { ...configured }; },
    removeTavilyKey: async () => { calls.removed += 1; return { ...keyless }; },
  };

  const sourcePath = path.resolve(__dirname, "../src/renderer.js");
  const original = fs.readFileSync(sourcePath, "utf8").replace(/\ninitialize\(\);\s*$/, "\n");
  const instrumented = `${original}\n;globalThis.__rendererTest = {\n  renderSettings, renderMarketResults, marketResultCard, renderStockImport, renderPcp, testMarketApiKey, saveMarketApiKey, removeMarketApiKey, closeConfirmation,\n  setAppState(value) { appState = value; },\n  setAppInfo(value) { appInfo = value; },\n  setCredentials(value) { tavilyCredentials = value; },\n  setStockPreview(value) { currentStockImportPreview = value; },\n  setStockBusy(value) { stockImportBusy = value; }\n};\n`;
  const context = vm.createContext({
    window: { rasputim: api },
    document,
    console,
    Intl,
    Date,
    URL,
    Promise,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    structuredClone,
  });
  vm.runInContext(instrumented, context, { filename: "renderer.js" });
  return { calls, configured, document, elements, hooks: context.__rendererTest, keyless };
}

test("renderiza Keyless e chave mascarada sem devolver o segredo salvo à tela", () => {
  const harness = rendererHarness();
  harness.hooks.setAppInfo({ version: "0.4.11", dataPath: "C:/dados/rasputim-state.json", platform: "Windows" });
  harness.hooks.setCredentials(harness.keyless);
  harness.hooks.renderSettings();
  assert.equal(harness.elements.get("market-api-status").textContent, "KEYLESS ATIVO");
  assert.equal(harness.elements.get("remove-market-api-key").disabled, true);

  harness.hooks.setCredentials(harness.configured);
  harness.hooks.renderSettings();
  assert.equal(harness.elements.get("market-api-status").textContent, "CHAVE ATIVA");
  assert.match(harness.elements.get("market-api-key").placeholder, /tvly-••••••••7890/);
  assert.equal(harness.elements.get("market-api-key").value, "");
  assert.doesNotMatch(harness.elements.get("market-api-mode").textContent, /valid_test_key/);
});

test("testa e salva a chave pelo fluxo da tela, limpando o campo depois", async () => {
  const harness = rendererHarness();
  const rawKey = "tvly-valid_test_key_1234567890";
  harness.hooks.setAppInfo({ version: "0.4.11" });
  harness.hooks.setCredentials(harness.keyless);
  harness.elements.get("market-api-key").value = rawKey;
  await harness.hooks.testMarketApiKey();
  assert.equal(harness.calls.testedKey, rawKey);
  assert.equal(harness.elements.get("market-api-status").textContent, "CHAVE VÁLIDA");

  await harness.hooks.saveMarketApiKey();
  assert.equal(harness.calls.savedKey, rawKey);
  assert.equal(harness.elements.get("market-api-key").value, "");
  assert.equal(harness.elements.get("market-api-status").textContent, "CHAVE ATIVA");
  assert.equal(harness.elements.get("remove-market-api-key").disabled, false);
});

test("remove a chave após confirmação e volta ao modo Keyless", async () => {
  const harness = rendererHarness();
  harness.hooks.setAppInfo({ version: "0.4.11" });
  harness.hooks.setCredentials(harness.configured);
  harness.hooks.renderSettings();
  const removal = harness.hooks.removeMarketApiKey();
  harness.hooks.closeConfirmation(true);
  await removal;
  assert.equal(harness.calls.removed, 1);
  assert.equal(harness.elements.get("market-api-status").textContent, "KEYLESS ATIVO");
  assert.equal(harness.elements.get("remove-market-api-key").disabled, true);
});

test("renderiza quadro PCP completo e sinaliza conexão compartilhada", () => {
  const harness = rendererHarness();
  const stages = [
    ["BUDGET", "Orçamento"],
    ["TECHNICAL", "Lista de compra + caderno técnico"],
    ["MACHINING", "Usinagem"],
    ["ASSEMBLY", "Montagem"],
    ["DISPATCH", "Expedição"],
    ["DELIVERY", "Entrega"],
    ["INSTALLATION", "Instalação"],
    ["COMPLETED", "Concluído"],
  ].map(([key, label]) => ({ key, label, shortLabel: label }));
  harness.hooks.setAppState({
    projects: [],
    pcpConnection: {
      mode: "SHARED",
      connected: true,
      stationName: "USINAGEM",
      message: "PCP sincronizado na pasta compartilhada.",
      lastSyncAt: "2026-08-18T12:00:00.000Z",
    },
    pcp: {
      stages,
      summary: { active: 1, critical: 1, late: 0, blocked: 0, deliveriesThisMonth: 1, completed: 0 },
      projects: [{
        id: "PCP-ID-1", code: "PCP-0001", client: "Cliente Teste", name: "Obra Teste",
        dueDate: "2026-08-29", responsible: "Maria", priority: "ALTA", currentStage: "MACHINING",
        status: "ACTIVE", blockedReason: "", progress: 29, daysUntilDue: 11, isLate: false,
      }],
    },
  });
  harness.elements.get("pcp-priority-filter").value = "ALL";
  harness.hooks.renderPcp();
  assert.equal(harness.elements.get("pcp-connection-status").textContent, "PCP COMPARTILHADO · CONECTADO");
  assert.equal(harness.elements.get("pcp-active-count").textContent, "1");
  assert.match(harness.elements.get("pcp-board").innerHTML, /PCP-0001/);
  assert.match(harness.elements.get("pcp-board").innerHTML, /Lista de compra \+ caderno técnico/);
  assert.match(harness.elements.get("pcp-board").innerHTML, /data-pcp-column="COMPLETED"/);
});

test("resultado renderizado separa endereço do site oficial e bloqueia mapa", () => {
  const harness = rendererHarness();
  const base = {
    id: "PR-1",
    kind: "SUPPLIER",
    title: "Fornecedor Paraná",
    supplierName: "Fornecedor Paraná",
    isKnown: false,
    price: 0,
    freightKnown: false,
    reliability: "NÃO AVALIADA",
    matchConfidence: "ALTA",
    confidenceScore: 88,
    locationConfirmed: true,
    stateCode: "PR",
    distanceStatus: "WITHIN_RADIUS",
    distanceKm: 12,
    address: "Maringá/PR",
  };

  const official = harness.hooks.marketResultCard({
    ...base,
    sourceUrl: "https://fornecedor-parana.example/",
    officialSiteUrl: "https://fornecedor-parana.example/",
    officialSiteConfirmed: true,
    phoneNumber: "(44) 3030-2020",
    whatsappUrl: "https://wa.me/5544999992020",
    whatsappConfirmed: true,
  });
  assert.match(official, /ABRIR SITE OFICIAL/);
  assert.match(official, /<strong>ENDEREÇO:<\/strong> 12 km de Maringá · Maringá\/PR/);
  assert.match(official, /<strong>SITE OFICIAL:<\/strong> https:\/\/fornecedor-parana\.example\//);
  assert.match(official, /https:\/\/fornecedor-parana\.example\//);
  assert.match(official, /ABRIR WHATSAPP/);
  assert.match(official, /COPIAR TELEFONE/);
  assert.match(official, /\(44\) 3030-2020/);
  assert.doesNotMatch(official, /openstreetmap/i);

  const withoutSite = harness.hooks.marketResultCard({
    ...base,
    sourceUrl: "https://www.openstreetmap.org/node/123",
    officialSiteConfirmed: false,
  });
  assert.match(withoutSite, /SITE NÃO ENCONTRADO/);
  assert.match(withoutSite, /<strong>SITE OFICIAL:<\/strong> Não encontrado automaticamente/);
  assert.doesNotMatch(withoutSite, /data-open-url/);
});

test("renderização remove resultado de outro estado como segunda barreira", () => {
  const harness = rendererHarness();
  harness.hooks.renderMarketResults({
    material: "PARAFUSO 4X16",
    radiusKm: 5000,
    searchedAt: "2026-08-05T12:00:00.000Z",
    diagnostics: { tavilyPages: 8, reservePages: 2 },
    warnings: [],
    results: [
      {
        id: "PR-1", kind: "SUPPLIER", title: "Fornecedor Paraná", supplierName: "Fornecedor Paraná",
        locationConfirmed: true, stateCode: "PR", distanceStatus: "WITHIN_RADIUS", distanceKm: 10,
        officialSiteConfirmed: true, officialSiteUrl: "https://fornecedor-pr.example/", sourceUrl: "https://fornecedor-pr.example/", confidenceScore: 80,
        phoneNumber: "(44) 3030-1010", whatsappUrl: "https://wa.me/5544999991010", whatsappConfirmed: true,
      },
      {
        id: "SC-1", kind: "SUPPLIER", title: "Fornecedor Santa Catarina", supplierName: "Fornecedor Santa Catarina",
        locationConfirmed: true, stateCode: "SC", distanceStatus: "WITHIN_RADIUS", distanceKm: 400,
        officialSiteConfirmed: true, sourceUrl: "https://fornecedor-sc.example/", confidenceScore: 90,
      },
    ],
  });
  const html = harness.elements.get("market-results").innerHTML;
  assert.match(html, /Fornecedor Paraná/);
  assert.doesNotMatch(html, /Fornecedor Santa Catarina/);
  assert.match(harness.elements.get("market-subtitle").textContent, /1 resultado confirmado no Paraná/i);
  assert.match(harness.elements.get("market-subtitle").textContent, /10 páginas encontradas/i);
  assert.match(harness.elements.get("market-summary").innerHTML, /1 sites oficiais/i);
  assert.match(harness.elements.get("market-summary").innerHTML, /1 telefones/i);
  assert.match(harness.elements.get("market-summary").innerHTML, /1 WhatsApps/i);
});

test("pesquisa vazia diferencia páginas encontradas de endereços verificados", () => {
  const harness = rendererHarness();
  harness.hooks.renderMarketResults({
    material: "PARAFUSO 4X16",
    radiusKm: 100,
    searchedAt: "2026-08-05T12:00:00.000Z",
    diagnostics: { tavilyPages: 12, reservePages: 3, locationPagesExtracted: 12 },
    warnings: ["Resultados sem endereço confirmado foram ocultados."],
    results: [],
  });
  assert.match(harness.elements.get("market-subtitle").textContent, /15 páginas encontradas/i);
  assert.match(harness.elements.get("market-subtitle").textContent, /12 endereços verificados/i);
  assert.match(harness.elements.get("market-results").innerHTML, /encontrou 15 páginas e abriu 12 para confirmar o endereço/i);
  assert.match(harness.elements.get("market-results").innerHTML, /nenhuma comprovou endereço paranaense/i);
});

test("prévia de levantamento renderiza saldos, ações e histórico sem aplicar dados", () => {
  const harness = rendererHarness();
  harness.hooks.setStockPreview({
    previewId: "PREV-1",
    fileName: "LEVANTAMENTO-AGOSTO.xlsx",
    sheetName: "Estoque",
    headerRow: 4,
    warnings: ["1 material sem saldo."],
    duplicate: null,
    mode: "MERGE",
    totals: { validItems: 2, changedItems: 1, newItems: 1, pendingItems: 0, preservedItems: 3, removedItems: 0 },
    rows: [
      {
        material: "PARAFUSO 4X16", materialCode: "MAT-001", sourcePresentation: "CX-1000",
        unit: "UN.", before: 5000, after: 7000, difference: 2000, action: "UPDATE", sourceRow: 6, sourceRows: [6],
      },
      {
        material: "COLA BRANCA", materialCode: "NOVO", sourcePresentation: "UN.",
        unit: "UN.", before: null, after: 3, difference: null, action: "NEW", sourceRow: 7, sourceRows: [7],
      },
    ],
  });
  harness.hooks.renderStockImport({
    stockCounts: [{
      importedAt: "2026-08-09T12:00:00.000Z",
      fileName: "LEVANTAMENTO-JULHO.xlsx",
      sheetName: "Estoque",
      headerRow: 4,
      registeredBy: "Artur",
      totals: { changedItems: 4, newItems: 1, pendingItems: 2, preservedItems: 3 },
    }],
  });

  assert.equal(harness.elements.get("stock-import-preview").hidden, false);
  assert.equal(harness.elements.get("stock-preview-valid").textContent, "2");
  assert.equal(harness.elements.get("stock-preview-changed").textContent, "1");
  assert.match(harness.elements.get("stock-preview-body").innerHTML, /PARAFUSO 4X16/);
  assert.match(harness.elements.get("stock-preview-body").innerHTML, /ATUALIZAR/);
  assert.match(harness.elements.get("stock-preview-body").innerHTML, /NOVO MATERIAL/);
  assert.match(harness.elements.get("stock-count-history-body").innerHTML, /LEVANTAMENTO-JULHO.xlsx/);
  assert.equal(harness.elements.get("apply-stock-count").disabled, false);
});

test("prévia de substituição total destaca remoções e o botão destrutivo", () => {
  const harness = rendererHarness();
  harness.hooks.setStockPreview({
    previewId: "PREV-REPLACE",
    mode: "REPLACE",
    fileName: "estoque profissional - 14-08-2026.xlsx",
    sheetName: "FERRAGEM + MATERIAL GERAL",
    headerRow: 3,
    warnings: ["SUBSTITUIÇÃO TOTAL: backup automático será criado."],
    duplicate: null,
    totals: {
      validItems: 130,
      changedItems: 0,
      newItems: 130,
      pendingItems: 0,
      preservedItems: 0,
      removedItems: 33,
    },
    rows: [],
  });
  harness.hooks.renderStockImport({ stockCounts: [] });
  assert.equal(harness.elements.get("stock-preview-valid").textContent, "130");
  assert.equal(harness.elements.get("stock-preview-preserved").textContent, "0");
  assert.equal(harness.elements.get("stock-preview-removed").textContent, "33");
  assert.equal(harness.elements.get("apply-stock-count").textContent, "SUBSTITUIR ESTOQUE");
  assert.equal(harness.elements.get("stock-import-mode").value, "REPLACE");
  assert.match(harness.elements.get("stock-preview-warning").textContent, /SUBSTITUIÇÃO TOTAL/);
});
