const crypto = require("node:crypto");

const TOOL_CATEGORIES = Object.freeze([
  "PARAFUSADEIRAS",
  "FURADEIRAS",
  "SERRAS TICO-TICO",
  "LIXADEIRAS",
  "ESMERILHADEIRAS",
  "PLAINAS",
  "TUPIAS",
  "SOPRADORES",
  "OUTRAS",
]);

const TOOL_STATUSES = Object.freeze({
  AVAILABLE: "DISPONIVEL",
  IN_USE: "EM_USO",
  MAINTENANCE: "MANUTENCAO",
  INACTIVE: "INATIVA",
});

function cleanText(value, maxLength = 140) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function normalizedAssetTag(value) {
  return cleanText(value, 80).toLocaleUpperCase("pt-BR");
}

function normalizedToolName(value) {
  return cleanText(value, 160).toLocaleUpperCase("pt-BR");
}

function normalizedBrandModel(value) {
  return cleanText(value, 160).toLocaleUpperCase("pt-BR");
}

function normalizeCategory(value) {
  const category = cleanText(value, 60).toLocaleUpperCase("pt-BR");
  return TOOL_CATEGORIES.includes(category) ? category : "OUTRAS";
}

function normalizeAvailableStatus(value) {
  const status = cleanText(value, 32).toLocaleUpperCase("pt-BR");
  return [TOOL_STATUSES.AVAILABLE, TOOL_STATUSES.MAINTENANCE, TOOL_STATUSES.INACTIVE].includes(status)
    ? status
    : TOOL_STATUSES.AVAILABLE;
}

function normalizeUse(raw = {}, now = new Date()) {
  const checkoutAt = raw.checkoutAt && !Number.isNaN(new Date(raw.checkoutAt).getTime())
    ? raw.checkoutAt
    : isoNow(now);
  const returnedAt = raw.returnedAt && !Number.isNaN(new Date(raw.returnedAt).getTime())
    ? raw.returnedAt
    : null;
  return {
    id: cleanText(raw.id, 100) || `USE-${crypto.randomUUID()}`,
    toolId: cleanText(raw.toolId, 100),
    toolName: cleanText(raw.toolName, 160) || "Ferramenta sem nome",
    category: normalizeCategory(raw.category),
    assetTag: cleanText(raw.assetTag, 80),
    checkoutAt,
    returnedAt,
    requestedBy: cleanText(raw.requestedBy, 120) || "Usuário não informado",
    requestedById: cleanText(raw.requestedById, 100),
    registeredBy: cleanText(raw.registeredBy, 120),
    registeredById: cleanText(raw.registeredById, 100),
    authorizedBy: cleanText(raw.authorizedBy, 120) || "Não informado",
    authorizedById: cleanText(raw.authorizedById, 100),
    returnedBy: cleanText(raw.returnedBy, 120),
    returnedById: cleanText(raw.returnedById, 100),
    purpose: cleanText(raw.purpose, 500),
    returnNote: cleanText(raw.returnNote, 500),
  };
}

function normalizeTool(raw = {}, now = new Date()) {
  const createdAt = raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime())
    ? raw.createdAt
    : isoNow(now);
  return {
    id: cleanText(raw.id, 100) || `TOOL-${crypto.randomUUID()}`,
    name: cleanText(raw.name, 160) || "Ferramenta sem nome",
    category: normalizeCategory(raw.category),
    assetTag: cleanText(raw.assetTag, 80),
    brandModel: cleanText(raw.brandModel, 160),
    location: cleanText(raw.location, 120),
    notes: cleanText(raw.notes, 700),
    status: normalizeAvailableStatus(raw.status),
    currentUseId: cleanText(raw.currentUseId, 100),
    createdAt,
    createdBy: cleanText(raw.createdBy, 120),
    updatedAt: raw.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime())
      ? raw.updatedAt
      : createdAt,
    lastCheckoutAt: raw.lastCheckoutAt && !Number.isNaN(new Date(raw.lastCheckoutAt).getTime())
      ? raw.lastCheckoutAt
      : null,
    lastReturnAt: raw.lastReturnAt && !Number.isNaN(new Date(raw.lastReturnAt).getTime())
      ? raw.lastReturnAt
      : null,
  };
}

function emptyTools(now = new Date()) {
  const createdAt = isoNow(now);
  return {
    schemaVersion: 1,
    items: [],
    history: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeTools(raw, now = new Date()) {
  const empty = emptyTools(now);
  const ids = new Set();
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .map((item) => normalizeTool(item, now))
    .filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return item.name !== "Ferramenta sem nome";
    });
  const history = (Array.isArray(raw?.history) ? raw.history : [])
    .map((entry) => normalizeUse(entry, now))
    .filter((entry) => entry.toolId && ids.has(entry.toolId))
    .sort((a, b) => new Date(b.checkoutAt) - new Date(a.checkoutAt));

  const activeUseByTool = new Map();
  for (const entry of history) {
    if (!entry.returnedAt && !activeUseByTool.has(entry.toolId)) activeUseByTool.set(entry.toolId, entry);
  }

  const normalizedItems = items.map((item) => {
    const activeUse = activeUseByTool.get(item.id);
    if (activeUse) {
      return {
        ...item,
        status: TOOL_STATUSES.IN_USE,
        currentUseId: activeUse.id,
        lastCheckoutAt: activeUse.checkoutAt,
      };
    }
    return {
      ...item,
      status: normalizeAvailableStatus(item.status),
      currentUseId: "",
    };
  });

  return {
    schemaVersion: 1,
    items: normalizedItems,
    history,
    createdAt: raw?.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime()) ? raw.createdAt : empty.createdAt,
    updatedAt: raw?.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime()) ? raw.updatedAt : empty.updatedAt,
  };
}

function withUpdatedAt(tools, now) {
  return { ...tools, updatedAt: isoNow(now) };
}

function toolSummary(rawTools) {
  const tools = normalizeTools(rawTools);
  const items = tools.items || [];
  return {
    total: items.length,
    available: items.filter((item) => item.status === TOOL_STATUSES.AVAILABLE).length,
    inUse: items.filter((item) => item.status === TOOL_STATUSES.IN_USE).length,
    maintenance: items.filter((item) => item.status === TOOL_STATUSES.MAINTENANCE).length,
    inactive: items.filter((item) => item.status === TOOL_STATUSES.INACTIVE).length,
    historyCount: tools.history.length,
  };
}

function addTool(rawTools, payload = {}, actor = {}, now = new Date()) {
  const tools = normalizeTools(rawTools, now);
  const name = cleanText(payload.name, 160);
  if (name.length < 2) throw new Error("Informe o nome da ferramenta.");
  const assetTag = cleanText(payload.assetTag, 80);
  const duplicateTag = normalizedAssetTag(assetTag);
  const duplicate = duplicateTag && tools.items.find((item) => (
    normalizedAssetTag(item.assetTag) === duplicateTag
    && normalizedToolName(item.name) === normalizedToolName(name)
    && item.category === normalizeCategory(payload.category)
    && normalizedBrandModel(item.brandModel) === normalizedBrandModel(payload.brandModel)
  ));
  if (duplicate) {
    throw new Error(`Este mesmo cadastro já existe: ${duplicate.name} (${duplicate.category}).`);
  }
  const createdAt = isoNow(now);
  const item = {
    id: `TOOL-${crypto.randomUUID()}`,
    name,
    category: normalizeCategory(payload.category),
    assetTag,
    brandModel: cleanText(payload.brandModel, 160),
    location: cleanText(payload.location, 120),
    notes: cleanText(payload.notes, 700),
    status: TOOL_STATUSES.AVAILABLE,
    currentUseId: "",
    createdAt,
    createdBy: cleanText(actor.name, 120),
    updatedAt: createdAt,
    lastCheckoutAt: null,
    lastReturnAt: null,
  };
  return withUpdatedAt({ ...tools, items: [item, ...tools.items] }, now);
}

function checkoutTool(rawTools, payload = {}, actor = {}, authorizer = {}, now = new Date()) {
  const tools = normalizeTools(rawTools, now);
  const toolId = cleanText(payload.toolId, 100);
  const item = tools.items.find((tool) => tool.id === toolId);
  if (!item) throw new Error("Ferramenta não encontrada.");
  if (item.status !== TOOL_STATUSES.AVAILABLE || item.currentUseId) {
    throw new Error("Esta ferramenta não está disponível para retirada.");
  }
  const requestedBy = cleanText(payload.requestedBy, 120) || cleanText(actor.name, 120);
  const requestedById = cleanText(payload.requestedById, 100) || cleanText(actor.id, 100);
  const authorizedBy = cleanText(authorizer.name, 120);
  if (!requestedBy) throw new Error("Não foi possível identificar o funcionário que solicitou a ferramenta.");
  if (!authorizedBy) throw new Error("A retirada precisa ser autorizada por um usuário habilitado.");
  const checkoutAt = isoNow(now);
  const usage = {
    id: `USE-${crypto.randomUUID()}`,
    toolId: item.id,
    toolName: item.name,
    category: item.category,
    assetTag: item.assetTag,
    checkoutAt,
    returnedAt: null,
    requestedBy,
    requestedById,
    registeredBy: cleanText(actor.name, 120),
    registeredById: cleanText(actor.id, 100),
    authorizedBy,
    authorizedById: cleanText(authorizer.id, 100),
    returnedBy: "",
    returnedById: "",
    purpose: cleanText(payload.purpose, 500),
    returnNote: "",
  };
  const items = tools.items.map((tool) => tool.id === item.id
    ? { ...tool, status: TOOL_STATUSES.IN_USE, currentUseId: usage.id, lastCheckoutAt: checkoutAt, updatedAt: checkoutAt }
    : tool);
  return withUpdatedAt({ ...tools, items, history: [usage, ...tools.history] }, now);
}

function returnTool(rawTools, payload = {}, actor = {}, now = new Date()) {
  const tools = normalizeTools(rawTools, now);
  const toolId = cleanText(payload.toolId, 100);
  const item = tools.items.find((tool) => tool.id === toolId);
  if (!item) throw new Error("Ferramenta não encontrada.");
  if (item.status !== TOOL_STATUSES.IN_USE || !item.currentUseId) {
    throw new Error("Esta ferramenta não possui uma retirada em aberto.");
  }
  const returnedBy = cleanText(actor.name, 120);
  if (!returnedBy) throw new Error("Não foi possível identificar o responsável pela devolução.");
  const returnedAt = isoNow(now);
  const found = tools.history.some((entry) => entry.id === item.currentUseId && !entry.returnedAt);
  if (!found) throw new Error("Não foi possível localizar a retirada aberta desta ferramenta.");
  const history = tools.history.map((entry) => entry.id === item.currentUseId
    ? {
      ...entry,
      returnedAt,
      returnedBy,
      returnedById: cleanText(actor.id, 100),
      returnNote: cleanText(payload.returnNote, 500),
    }
    : entry);
  const items = tools.items.map((tool) => tool.id === item.id
    ? { ...tool, status: TOOL_STATUSES.AVAILABLE, currentUseId: "", lastReturnAt: returnedAt, updatedAt: returnedAt }
    : tool);
  return withUpdatedAt({ ...tools, items, history }, now);
}

function setToolStatus(rawTools, toolId, payload = {}, actor = {}, now = new Date()) {
  const tools = normalizeTools(rawTools, now);
  const id = cleanText(toolId, 100);
  const item = tools.items.find((tool) => tool.id === id);
  if (!item) throw new Error("Ferramenta não encontrada.");
  if (item.status === TOOL_STATUSES.IN_USE || item.currentUseId) {
    throw new Error("Devolva a ferramenta antes de alterar seu status.");
  }
  const status = normalizeAvailableStatus(payload.status);
  const updatedAt = isoNow(now);
  const notes = payload.notes === undefined ? item.notes : cleanText(payload.notes, 700);
  const items = tools.items.map((tool) => tool.id === id
    ? { ...tool, status, notes, updatedAt, updatedBy: cleanText(actor.name, 120) }
    : tool);
  return withUpdatedAt({ ...tools, items }, now);
}

function removeTool(rawTools, toolId, now = new Date()) {
  const tools = normalizeTools(rawTools, now);
  const id = cleanText(toolId, 100);
  const item = tools.items.find((tool) => tool.id === id);
  if (!item) throw new Error("Ferramenta não encontrada.");
  if (item.status === TOOL_STATUSES.IN_USE || item.currentUseId) {
    throw new Error("Registre a devolução antes de excluir esta ferramenta.");
  }
  if (tools.history.some((entry) => entry.toolId === id)) {
    throw new Error("Esta ferramenta possui histórico de uso e não pode ser excluída. Marque-a como inativa para preservar a auditoria.");
  }
  return withUpdatedAt({ ...tools, items: tools.items.filter((tool) => tool.id !== id) }, now);
}

module.exports = {
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  addTool,
  checkoutTool,
  emptyTools,
  normalizeTools,
  removeTool,
  returnTool,
  setToolStatus,
  toolSummary,
};
