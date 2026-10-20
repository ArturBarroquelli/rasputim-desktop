const { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const appPackage = require("../package.json");
const {
  analyzeProjectFile,
  analyzeSalesFile,
  calculateDashboard,
  detectSpreadsheetKind,
} = require("../core/analyzer.cjs");
const {
  projectReportHtml,
  summaryReportHtml,
} = require("../core/report.cjs");
const {
  applyStockImport,
  applyStockSnapshot,
  applyStockSupplement,
  enrich: enrichProcurement,
  loadSeed,
  previewStockImport,
  registerManualMaterial,
  recordMovement,
  registerQuotation,
  saveMarketSearch,
  setInvoiceStatus,
} = require("../core/procurement.cjs");
const {
  isLocationServiceUrl,
  officialSupplierSiteUrl,
  researchMarket,
  safeWhatsappUrl,
  testTavilyKey,
} = require("../core/market.cjs");
const { createCredentialVault } = require("../core/credential-vault.cjs");
const {
  PERMISSIONS,
  ROLE_DEFINITIONS,
  SESSION_IDLE_MS,
  authenticate,
  createFirstAdmin,
  createUser,
  emptySecurity,
  hasPermission,
  normalizeSecurity,
  publicUser,
  resetUserPassword,
  updateUser,
} = require("../core/security.cjs");
const {
  archivePcpProject,
  createPcpProject,
  enrichPcp,
  setPcpBlocked,
  transitionPcpProject,
  updatePcpProject,
} = require("../core/pcp.cjs");
const { createPcpStore } = require("../core/pcp-store.cjs");
const { createSecurityStore } = require("../core/security-store.cjs");
const { createCentralStore } = require("../core/central-store.cjs");
const { DEFAULT_BASE_URL, localAiStatus, sendLocalAiMessage } = require("../core/local-ai.cjs");
const {
  addTool,
  emptyTools,
  normalizeTools,
  removeTool,
  returnTool,
  setToolStatus,
  checkoutTool,
  toolSummary,
} = require("../core/tools.cjs");

const ALLOWED_PROJECT_EXTENSIONS = new Set([".xls", ".xlsx", ".xlsm", ".xlsb"]);
const ALLOWED_SALES_EXTENSIONS = new Set([".xls", ".xlsx", ".xlsm"]);
const ALLOWED_STOCK_EXTENSIONS = new Set([".xls", ".xlsx", ".xlsm", ".csv"]);
const STOCK_PREVIEW_TTL_MS = 30 * 60 * 1000;
const FOCUSED_SCOPE_CLEANUP_ID = "PCP_ESTOQUE_SEM_MDF_CORREDICAS_V024";

let mainWindow = null;
let state = null;
let credentialVault = null;
let pcpStore = null;
let securityStore = null;
let centralStore = null;
let pcpPollTimer = null;
let pcpConnectionSignature = "";
let centralPollTimer = null;
let centralConnectionSignature = "";
let activeSession = null;
const stockImportPreviews = new Map();

if (process.env.RASPUTIM_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.RASPUTIM_USER_DATA_DIR));
}

function seedFile() {
  return path.join(__dirname, "../assets/seed-data.json");
}

function procurementSeedFile() {
  return path.join(__dirname, "../assets/procurement-seed.json");
}

function stockResetFile() {
  return path.join(__dirname, "../assets/stock-reset-v0415.json");
}

function stockSupplementFile() {
  return path.join(__dirname, "../assets/stock-supplement-v0418.json");
}

function stateFile() {
  return path.join(app.getPath("userData"), "rasputim-state.json");
}

function credentialFile() {
  return path.join(app.getPath("userData"), "rasputim-credentials.json");
}

function getCredentialVault() {
  if (!credentialVault) {
    credentialVault = createCredentialVault({
      filePath: credentialFile(),
      encryption: {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (value) => safeStorage.encryptString(value),
        decryptString: (value) => safeStorage.decryptString(value),
      },
    });
  }
  return credentialVault;
}

function getPcpStore() {
  if (!pcpStore) {
    pcpStore = createPcpStore({
      userDataPath: app.getPath("userData"),
      hostname: os.hostname(),
    });
  }
  return pcpStore;
}

function getSecurityStore() {
  if (!securityStore) securityStore = createSecurityStore({ userDataPath: app.getPath("userData") });
  return securityStore;
}

function getCentralStore() {
  if (!centralStore) centralStore = createCentralStore({ userDataPath: app.getPath("userData"), stationName: os.hostname() });
  return centralStore;
}

function centralPayload(rawState) {
  const payload = structuredClone(rawState || emptyState());
  delete payload.security;
  return payload;
}

function pcpConnectionKey(connection) {
  return JSON.stringify({
    mode: connection.mode,
    connected: connection.connected,
    stationName: connection.stationName,
    sharedDirectory: connection.sharedDirectory,
    revision: connection.revision,
    message: connection.message,
    readOnlyFallback: connection.readOnlyFallback,
  });
}

function emptyState() {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projects: [],
    sales: [],
    salesFile: null,
    procurement: loadSeed(procurementSeedFile()),
    tools: emptyTools(),
    security: emptySecurity(),
  };
}

function initialState() {
  try {
    const seed = JSON.parse(fs.readFileSync(seedFile(), "utf8"));
    return {
      ...emptyState(),
      projects: Array.isArray(seed.projects) ? seed.projects : [],
      sales: Array.isArray(seed.sales) ? seed.sales : [],
      salesFile: seed.salesFile || null,
      procurement: loadSeed(procurementSeedFile()),
      seededAt: seed.seededAt || null,
    };
  } catch {
    return emptyState();
  }
}

function applyBundledStockUpdates(loaded) {
  let nextState = {
    ...loaded,
    procurement: enrichProcurement(loaded.procurement || loadSeed(procurementSeedFile())),
  };
  let changed = false;

  try {
    const snapshot = JSON.parse(fs.readFileSync(stockResetFile(), "utf8"));
    const migration = applyStockSnapshot(
      nextState.procurement,
      snapshot,
      "Atualização automática v0.4.15",
    );
    if (migration.applied) {
      nextState = { ...nextState, procurement: migration.state };
      changed = true;
    }
  } catch (error) {
    console.error("Falha ao aplicar a atualização inicial do estoque:", error);
  }

  try {
    const supplement = JSON.parse(fs.readFileSync(stockSupplementFile(), "utf8"));
    const migration = applyStockSupplement(
      nextState.procurement,
      supplement,
      "Atualização automática v0.4.18 — complemento da base antiga",
    );
    if (migration.applied) {
      nextState = { ...nextState, procurement: migration.state };
      changed = true;
    }
  } catch (error) {
    console.error("Falha ao complementar os materiais da base antiga:", error);
  }

  return { state: nextState, changed };
}

function cleanupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

function isRemovedMaterial(item) {
  const text = cleanupText(`${item?.material || ""} ${item?.category || ""}`);
  return text.includes("MDF") || text.includes("CORREDIC");
}

function applyFocusedFactoryScopeCleanup(loaded) {
  const completed = Array.isArray(loaded?.completedDataCleanups) ? loaded.completedDataCleanups : [];
  if (completed.includes(FOCUSED_SCOPE_CLEANUP_ID)) return { state: loaded, changed: false };
  const procurement = enrichProcurement(loaded.procurement || loadSeed(procurementSeedFile()));
  const removedCodes = new Set((procurement.stock || []).filter(isRemovedMaterial).map((item) => item.code));
  const matchesRemovedMaterial = (entry) => removedCodes.has(entry?.materialCode) || isRemovedMaterial(entry);
  const cleanedProcurement = enrichProcurement({
    ...procurement,
    explicitStockSet: true,
    stock: (procurement.stock || []).filter((item) => !isRemovedMaterial(item)),
    movements: (procurement.movements || []).filter((entry) => !matchesRemovedMaterial(entry)),
    quotations: [],
    invoices: [],
    invoiceItems: [],
    marketSearches: [],
    updatedAt: new Date().toISOString(),
  });
  return {
    changed: true,
    state: {
      ...loaded,
      projects: [],
      sales: [],
      salesFile: null,
      procurement: cleanedProcurement,
      completedDataCleanups: [FOCUSED_SCOPE_CLEANUP_ID, ...completed].slice(0, 30),
    },
  };
}

function loadState() {
  try {
    const stored = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const loaded = {
      ...emptyState(),
      ...stored,
      projects: Array.isArray(stored.projects) ? stored.projects : [],
      sales: Array.isArray(stored.sales) ? stored.sales : [],
      procurement: enrichProcurement(stored.procurement || loadSeed(procurementSeedFile())),
      tools: normalizeTools(stored.tools),
      security: normalizeSecurity(stored.security),
    };
    const sharedOperations = getCentralStore().read();
    if (sharedOperations) Object.assign(loaded, sharedOperations);
    const sharedSecurity = getSecurityStore().read();
    if (sharedSecurity) loaded.security = sharedSecurity;
    const updated = applyBundledStockUpdates(loaded);
    const cleaned = applyFocusedFactoryScopeCleanup(updated.state);
    if (updated.changed || cleaned.changed) persistState(cleaned.state);
    return cleaned.state;
  } catch {
    const seeded = initialState();
    const sharedOperations = getCentralStore().read();
    if (sharedOperations) Object.assign(seeded, sharedOperations);
    const sharedSecurity = getSecurityStore().read();
    if (sharedSecurity) seeded.security = sharedSecurity;
    const updated = applyBundledStockUpdates(seeded);
    const cleaned = applyFocusedFactoryScopeCleanup(updated.state);
    persistState(cleaned.state);
    return cleaned.state;
  }
}

function persistState(nextState = state) {
  if (!nextState) return;
  const target = stateFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = { ...nextState, updatedAt: new Date().toISOString() };
  if (getSecurityStore().isShared()) payload.security = getSecurityStore().write(payload.security);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
  if (getCentralStore().isCentral()) getCentralStore().write(centralPayload(payload));
  state = payload;
}

function currentSessionUser({ touch = false } = {}) {
  if (!activeSession?.userId || !state?.security) return null;
  const lastActivityAt = Number(activeSession.lastActivityAt || 0);
  if (!lastActivityAt || Date.now() - lastActivityAt >= SESSION_IDLE_MS) {
    activeSession = null;
    return null;
  }
  const user = state.security.users?.find((item) => item.id === activeSession.userId);
  if (!user?.active) {
    activeSession = null;
    return null;
  }
  if (touch) activeSession.lastActivityAt = Date.now();
  return publicUser(user);
}

function startSession(userId) {
  activeSession = { userId, lastActivityAt: Date.now() };
  return currentSessionUser();
}

function authStatus() {
  const sharedSecurity = getSecurityStore().read();
  if (sharedSecurity) state.security = sharedSecurity;
  const currentUser = currentSessionUser();
  const hasUsers = Boolean(state?.security?.users?.length);
  const canManageUsers = hasPermission(currentUser, PERMISSIONS.MANAGE_USERS);
  return {
    hasUsers,
    authenticated: Boolean(currentUser),
    currentUser,
    roles: ROLE_DEFINITIONS,
    users: canManageUsers ? (state.security.users || []).map((user) => publicUser(user)) : [],
    sessionIdleMinutes: Math.round(SESSION_IDLE_MS / 60000),
    userDirectory: getSecurityStore().status(),
    centralDirectory: getCentralStore().status(),
  };
}

function requirePermission(permission = PERMISSIONS.USE_APP) {
  const user = currentSessionUser({ touch: true });
  if (!user) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  if (!hasPermission(user, permission)) throw new Error("Seu cargo não possui permissão para esta operação.");
  return user;
}

function recordWithdrawalAuthorization(payload) {
  const verified = authenticate(state.security, {
    login: payload?.authorizerLogin,
    password: payload?.authorizerPassword,
  });
  state.security = verified.security;
  persistState();
  if (!verified.user) throw new Error(`Autorização da saída recusada: ${verified.error}`);
  if (!hasPermission(verified.user, PERMISSIONS.STOCK_AUTHORIZE_EXIT)) {
    throw new Error("O usuário informado não possui permissão para autorizar saídas de estoque.");
  }
  return verified.user;
}

function recordToolWithdrawalAuthorization(payload) {
  const verified = authenticate(state.security, {
    login: payload?.authorizerLogin,
    password: payload?.authorizerPassword,
  });
  state.security = verified.security;
  persistState();
  if (!verified.user) throw new Error(`Autorização da retirada recusada: ${verified.error}`);
  if (!hasPermission(verified.user, PERMISSIONS.TOOL_AUTHORIZE_WITHDRAWAL)) {
    throw new Error("O usuário informado não possui permissão para autorizar retiradas de ferramentas.");
  }
  return verified.user;
}

function publicState() {
  const auth = authStatus();
  if (!auth.authenticated) {
    return {
      auth,
      projects: [],
      sales: [],
      procurement: { stock: [], movements: [], invoices: [], suppliers: [], summary: {} },
      tools: { items: [], history: [], summary: toolSummary(emptyTools()) },
      pcp: { projects: [], summary: {} },
      dashboard: {},
    };
  }
  const snapshot = structuredClone(state || emptyState());
  delete snapshot.security;
  snapshot.procurement = enrichProcurement(snapshot.procurement);
  snapshot.tools = normalizeTools(snapshot.tools);
  snapshot.tools.summary = toolSummary(snapshot.tools);
  snapshot.employees = (state.security.users || []).filter((user) => user.active).map((user) => ({ id: user.id, name: user.name, login: user.login, roleLabel: publicUser(user).roleLabel }));
  snapshot.pcp = enrichPcp(getPcpStore().read());
  snapshot.pcpConnection = getPcpStore().status();
  snapshot.centralConnection = getCentralStore().status();
  return { ...calculateDashboard(snapshot), auth };
}

function localAiContext() {
  const snapshot = publicState();
  const pcpProjects = snapshot.pcp?.projects || [];
  const procurement = snapshot.procurement || {};
  const tools = snapshot.tools || {};
  return {
    generatedAt: new Date().toISOString(),
    dashboard: snapshot.dashboard || {},
    pcp: {
      total: pcpProjects.length,
      active: pcpProjects.filter((item) => item.status !== "COMPLETED" && item.status !== "ARCHIVED").length,
      blocked: pcpProjects.filter((item) => item.status === "BLOCKED").length,
      stages: snapshot.pcp?.stages || [],
    },
    stock: procurement.summary || {},
    tools: tools.summary || {},
  };
}

function validateFile(filePath, allowedExtensions) {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("Caminho de arquivo inválido.");
  const absolute = path.resolve(filePath);
  const extension = path.extname(absolute).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error(`Formato ${extension || "desconhecido"} não aceito.`);
  const stats = fs.statSync(absolute);
  if (!stats.isFile()) throw new Error("O item selecionado não é um arquivo.");
  if (stats.size > 100 * 1024 * 1024) throw new Error("O arquivo ultrapassa o limite local de 100 MB.");
  return absolute;
}

function clearExpiredStockPreviews() {
  const cutoff = Date.now() - STOCK_PREVIEW_TTL_MS;
  for (const [previewId, entry] of stockImportPreviews) {
    if (entry.createdAt < cutoff) stockImportPreviews.delete(previewId);
  }
}

function publicStockPreview(previewId, preview) {
  return {
    previewId,
    fileName: preview.fileName,
    fileType: preview.fileType,
    sheetName: preview.sheetName,
    sheetNames: preview.sheetNames,
    sheetNamesUsed: preview.sheetNamesUsed,
    mode: preview.mode,
    headerRow: preview.headerRow,
    columns: preview.columns,
    totals: preview.totals,
    rows: preview.rows,
    warnings: preview.warnings,
    duplicate: preview.duplicate,
  };
}

function mergeProjects(projects) {
  const byHash = new Map((state.projects || []).map((project) => [project.hash, project]));
  for (const project of projects) byHash.set(project.hash, project);
  state.projects = [...byHash.values()].sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
  persistState();
}

function registerHandlers() {
  ipcMain.handle("state:get", () => publicState());

  ipcMain.handle("auth:status", () => authStatus());

  ipcMain.handle("auth:setup", (_event, payload) => {
    const created = createFirstAdmin(state.security, payload);
    state.security = created.security;
    persistState();
    startSession(created.user.id);
    return publicState();
  });

  ipcMain.handle("auth:login", (_event, payload) => {
    const result = authenticate(state.security, payload);
    state.security = result.security;
    persistState();
    if (!result.user) throw new Error(result.error || "Não foi possível entrar.");
    startSession(result.user.id);
    return publicState();
  });

  ipcMain.handle("auth:logout", () => {
    activeSession = null;
    return authStatus();
  });

  ipcMain.handle("auth:enable-shared-directory", async () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    const result = await dialog.showOpenDialog(mainWindow, { title: "Selecionar pasta central de usuários", properties: ["openDirectory", "createDirectory"], buttonLabel: "CENTRALIZAR USUÁRIOS" });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, state: publicState() };
    state.security = getSecurityStore().enableShared(result.filePaths[0], state.security);
    persistState();
    return { canceled: false, state: publicState() };
  });

  ipcMain.handle("auth:connect-shared-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Conectar à base central de usuários", properties: ["openDirectory"], buttonLabel: "CONECTAR ESTA MÁQUINA" });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, status: authStatus() };
    state.security = getSecurityStore().connectExisting(result.filePaths[0]);
    persistState();
    return { canceled: false, status: authStatus() };
  });

  ipcMain.handle("auth:use-local-directory", () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    getSecurityStore().useLocal();
    persistState();
    return publicState();
  });

  ipcMain.handle("central:setup", async () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar pasta central do Rasputim",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "CONFIGURAR COMPUTADOR CENTRAL",
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, state: publicState() };
    const directory = result.filePaths[0];
    getCentralStore().enable(directory, centralPayload(state));
    state.security = getSecurityStore().enableShared(directory, state.security);
    getPcpStore().configureShared(directory, os.hostname());
    persistState();
    return { canceled: false, state: publicState() };
  });

  ipcMain.handle("central:connect", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar pasta do computador central",
      properties: ["openDirectory"],
      buttonLabel: "CONECTAR A ESTA OPERAÇÃO",
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, status: authStatus() };
    const directory = result.filePaths[0];
    getCentralStore().connect(directory);
    getSecurityStore().connectExisting(directory);
    getPcpStore().configureShared(directory, os.hostname());
    state = loadState();
    return { canceled: false, status: authStatus() };
  });

  ipcMain.handle("central:use-local", () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    getCentralStore().useLocal();
    getSecurityStore().useLocal();
    getPcpStore().useLocal(os.hostname());
    persistState();
    return publicState();
  });

  ipcMain.handle("auth:create-user", (_event, payload) => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    const created = createUser(state.security, payload);
    state.security = created.security;
    persistState();
    return publicState();
  });

  ipcMain.handle("auth:update-user", (_event, userId, payload) => {
    const actor = requirePermission(PERMISSIONS.MANAGE_USERS);
    if (String(userId || "") === actor.id && payload?.active === false) {
      throw new Error("Você não pode desativar a própria conta durante a sessão.");
    }
    const updated = updateUser(state.security, userId, payload);
    state.security = updated.security;
    persistState();
    return publicState();
  });

  ipcMain.handle("auth:reset-user-password", (_event, userId, password) => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    const updated = resetUserPassword(state.security, userId, password);
    state.security = updated.security;
    persistState();
    return publicState();
  });

  ipcMain.handle("tools:add", (_event, payload) => {
    const user = requirePermission(PERMISSIONS.TOOL_MANAGE);
    state.tools = addTool(state.tools, payload, user);
    persistState();
    return publicState();
  });

  ipcMain.handle("tools:checkout", (_event, payload) => {
    const user = requirePermission(PERMISSIONS.TOOL_REQUEST_WITHDRAWAL);
    const employeeId = String(payload?.requestedById || "");
    const employee = state.security.users.find((item) => item.id === employeeId && item.active);
    if (!employee) throw new Error("Selecione um funcionário ativo para registrar quem retirou a ferramenta.");
    const authorizer = recordToolWithdrawalAuthorization(payload);
    state.tools = checkoutTool(state.tools, { ...payload, requestedBy: employee.name, requestedById: employee.id }, user, authorizer);
    persistState();
    return publicState();
  });

  ipcMain.handle("tools:return", (_event, payload) => {
    const user = requirePermission(PERMISSIONS.TOOL_REGISTER_RETURN);
    state.tools = returnTool(state.tools, payload, user);
    persistState();
    return publicState();
  });

  ipcMain.handle("tools:set-status", (_event, toolId, payload) => {
    const user = requirePermission(PERMISSIONS.TOOL_MANAGE);
    state.tools = setToolStatus(state.tools, toolId, payload, user);
    persistState();
    return publicState();
  });

  ipcMain.handle("tools:remove", (_event, toolId) => {
    requirePermission(PERMISSIONS.TOOL_MANAGE);
    state.tools = removeTool(state.tools, toolId);
    persistState();
    return publicState();
  });

  ipcMain.handle("pcp:create", (_event, payload) => {
    const user = requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().mutate((current) => createPcpProject(current, { ...payload, responsible: user.name, user: user.name }));
    return publicState();
  });

  ipcMain.handle("pcp:update", (_event, projectId, payload) => {
    const user = requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().mutate((current) => updatePcpProject(current, projectId, { ...payload, user: user.name }));
    return publicState();
  });

  ipcMain.handle("pcp:transition", (_event, projectId, payload) => {
    const user = requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().mutate((current) => transitionPcpProject(current, projectId, { ...payload, user: user.name }));
    return publicState();
  });

  ipcMain.handle("pcp:block", (_event, projectId, payload) => {
    const user = requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().mutate((current) => setPcpBlocked(current, projectId, { ...payload, user: user.name }));
    return publicState();
  });

  ipcMain.handle("pcp:archive", (_event, projectId, payload) => {
    const user = requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().mutate((current) => archivePcpProject(current, projectId, { ...payload, user: user.name }));
    return publicState();
  });

  ipcMain.handle("pcp:choose-shared-directory", async (_event, stationName) => {
    requirePermission(PERMISSIONS.PCP_MANAGE);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar pasta compartilhada do PCP",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "USAR ESTA PASTA",
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, state: publicState() };
    getPcpStore().configureShared(result.filePaths[0], stationName);
    return { canceled: false, state: publicState() };
  });

  ipcMain.handle("pcp:use-local", (_event, stationName) => {
    requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().useLocal(stationName);
    return publicState();
  });

  ipcMain.handle("pcp:update-station", (_event, stationName) => {
    requirePermission(PERMISSIONS.PCP_MANAGE);
    getPcpStore().updateStationName(stationName);
    return publicState();
  });

  ipcMain.handle("pcp:refresh", () => {
    requirePermission(PERMISSIONS.USE_APP);
    getPcpStore().refresh();
    return publicState();
  });

  ipcMain.handle("dialog:projects", async () => {
    requirePermission(PERMISSIONS.USE_APP);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar projetos para análise",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Planilhas do Excel", extensions: ["xls", "xlsx", "xlsm", "xlsb"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("projects:analyze", async (event, filePaths) => {
    requirePermission(PERMISSIONS.USE_APP);
    if (!Array.isArray(filePaths) || filePaths.length === 0) throw new Error("Nenhum arquivo foi selecionado.");
    if (filePaths.length > 20) throw new Error("Analise no máximo 20 arquivos por vez.");
    const results = [];
    const failures = [];
    for (let index = 0; index < filePaths.length; index += 1) {
      const original = filePaths[index];
      event.sender.send("analysis:progress", { index, total: filePaths.length, stage: "reading", fileName: path.basename(String(original)) });
      try {
        const absolute = validateFile(original, ALLOWED_PROJECT_EXTENSIONS);
        const analyzed = analyzeProjectFile(absolute);
        results.push(analyzed);
        event.sender.send("analysis:progress", { index, total: filePaths.length, stage: "checked", fileName: analyzed.fileName });
      } catch (error) {
        failures.push({ fileName: path.basename(String(original)), message: error.message });
      }
    }
    if (results.length) mergeProjects(results);
    return { state: publicState(), imported: results.length, failures };
  });

  ipcMain.handle("projects:remove", (_event, projectId) => {
    requirePermission(PERMISSIONS.USE_APP);
    state.projects = (state.projects || []).filter((project) => project.id !== projectId);
    persistState();
    return publicState();
  });

  ipcMain.handle("projects:reveal", async (_event, projectId) => {
    requirePermission(PERMISSIONS.USE_APP);
    const project = (state.projects || []).find((item) => item.id === projectId);
    if (!project?.sourcePath || !fs.existsSync(project.sourcePath)) return { ok: false, message: "O arquivo original não está disponível neste computador." };
    shell.showItemInFolder(project.sourcePath);
    return { ok: true };
  });

  ipcMain.handle("dialog:sales", async () => {
    requirePermission(PERMISSIONS.USE_APP);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar orçamento ou base de clientes",
      properties: ["openFile"],
      filters: [{ name: "Planilhas do Excel", extensions: ["xls", "xlsx", "xlsm"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("sales:import", (_event, filePath) => {
    requirePermission(PERMISSIONS.USE_APP);
    const absolute = validateFile(filePath, ALLOWED_SALES_EXTENSIONS);
    const detected = detectSpreadsheetKind(absolute);
    if (detected.kind === "PROJECT") {
      const project = analyzeProjectFile(absolute);
      mergeProjects([project]);
      return {
        state: publicState(),
        detectedType: "PROJECT",
        projectName: project.name,
        fileName: project.fileName,
      };
    }
    if (detected.kind === "SALES") {
      const result = analyzeSalesFile(absolute);
      state.sales = result.sales;
      state.salesFile = result.fileName;
      state.salesSourcePath = result.sourcePath;
      persistState();
      return {
        state: publicState(),
        detectedType: "SALES",
        imported: result.sales.length,
        fileName: result.fileName,
      };
    }
    throw new Error(detected.message || "A planilha não corresponde a um orçamento nem a uma base de clientes compatível.");
  });

  ipcMain.handle("dialog:stock", async () => {
    requirePermission(PERMISSIONS.STOCK_IMPORT);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Selecionar levantamento de estoque",
      properties: ["openFile"],
      filters: [
        { name: "Planilhas de estoque", extensions: ["xls", "xlsx", "xlsm", "csv"] },
        { name: "Excel", extensions: ["xls", "xlsx", "xlsm"] },
        { name: "CSV", extensions: ["csv"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("procurement:preview-stock", (_event, request) => {
    requirePermission(PERMISSIONS.STOCK_IMPORT);
    clearExpiredStockPreviews();
    const filePath = typeof request === "string" ? request : request?.filePath;
    const mode = typeof request === "object" ? request?.mode : "MERGE";
    const absolute = validateFile(filePath, ALLOWED_STOCK_EXTENSIONS);
    const preview = previewStockImport(
      absolute,
      state.procurement || loadSeed(procurementSeedFile()),
      { mode },
    );
    const previewId = `PREV-${crypto.randomUUID()}`;
    stockImportPreviews.set(previewId, {
      filePath: absolute,
      preview,
      createdAt: Date.now(),
    });
    return publicStockPreview(previewId, preview);
  });

  ipcMain.handle("procurement:apply-stock-preview", (_event, previewId, payload) => {
    const user = requirePermission(PERMISSIONS.STOCK_IMPORT);
    clearExpiredStockPreviews();
    const entry = stockImportPreviews.get(String(previewId || ""));
    if (!entry) throw new Error("A prévia expirou. Selecione a planilha novamente.");
    const absolute = validateFile(entry.filePath, ALLOWED_STOCK_EXTENSIONS);
    const freshPreview = previewStockImport(
      absolute,
      state.procurement || loadSeed(procurementSeedFile()),
      { mode: entry.preview.mode },
    );
    if (freshPreview.fileHash !== entry.preview.fileHash) {
      stockImportPreviews.delete(String(previewId));
      throw new Error("A planilha foi alterada depois da prévia. Selecione o arquivo novamente para conferir os novos valores.");
    }
    state.procurement = applyStockImport(
      state.procurement || loadSeed(procurementSeedFile()),
      freshPreview,
      user.name,
    );
    persistState();
    stockImportPreviews.delete(String(previewId));
    return {
      state: publicState(),
      stockCount: state.procurement.stockCounts?.[0] || null,
    };
  });

  ipcMain.handle("procurement:cancel-stock-preview", (_event, previewId) => {
    requirePermission(PERMISSIONS.STOCK_IMPORT);
    stockImportPreviews.delete(String(previewId || ""));
    return { ok: true };
  });

  ipcMain.handle("procurement:invoice-status", (_event, number, status) => {
    requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
    state.procurement = setInvoiceStatus(state.procurement || loadSeed(procurementSeedFile()), String(number), String(status));
    persistState();
    return publicState();
  });

  ipcMain.handle("procurement:record-movement", (_event, payload) => {
    const type = String(payload?.type || "").trim().toLocaleUpperCase("pt-BR");
    const permission = type === "SAIDA"
      ? PERMISSIONS.STOCK_REQUEST_EXIT
      : type === "CONTAGEM"
        ? PERMISSIONS.STOCK_COUNT
        : PERMISSIONS.STOCK_ENTRY;
    const user = requirePermission(permission);
    const movement = {
      ...payload,
      registeredBy: user.name,
      requestedBy: user.name,
      requestedById: user.id,
    };
    if (type === "SAIDA") {
      const authorizer = recordWithdrawalAuthorization(payload);
      movement.authorizedBy = authorizer.name;
      movement.authorizedById = authorizer.id;
      movement.authorizationAt = new Date().toISOString();
    }
    state.procurement = recordMovement(state.procurement || loadSeed(procurementSeedFile()), movement);
    persistState();
    return publicState();
  });

  ipcMain.handle("procurement:add-material", (_event, payload) => {
    const user = requirePermission(PERMISSIONS.STOCK_MANAGE_MATERIALS);
    state.procurement = registerManualMaterial(state.procurement || loadSeed(procurementSeedFile()), {
      ...payload,
      registeredBy: user.name,
      registeredById: user.id,
    });
    persistState();
    return publicState();
  });

  ipcMain.handle("procurement:add-quotation", (_event, payload) => {
    requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
    state.procurement = registerQuotation(state.procurement || loadSeed(procurementSeedFile()), payload);
    persistState();
    return publicState();
  });

  ipcMain.handle("market:credentials:get", () => {
    requirePermission(PERMISSIONS.USE_APP);
    return getCredentialVault().publicStatus();
  });

  ipcMain.handle("market:credentials:test", async (_event, rawApiKey) => {
    requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
    return testTavilyKey(rawApiKey);
  });

  ipcMain.handle("market:credentials:save", async (_event, rawApiKey) => {
    requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
    const validation = await testTavilyKey(rawApiKey);
    return getCredentialVault().saveKey(rawApiKey, validation);
  });

  ipcMain.handle("market:credentials:remove", () => {
    requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
    return getCredentialVault().removeKey();
  });

  ipcMain.handle("market:research", async (_event, request) => {
    requirePermission(PERMISSIONS.USE_APP);
    const procurement = enrichProcurement(state.procurement || loadSeed(procurementSeedFile()));
    const materialCode = typeof request === "object" ? request?.materialCode : request;
    const requestedRadius = typeof request === "object" ? Number(request?.radiusKm) : Number(procurement.settings?.marketRadiusKm);
    const radiusKm = Number.isFinite(requestedRadius) ? requestedRadius : 100;
    const material = procurement.stock.find((item) => item.code === String(materialCode));
    if (!material) throw new Error("Material não encontrado.");
    let tavilyApiKey = "";
    let credentialWarning = "";
    try {
      tavilyApiKey = getCredentialVault().loadKey();
    } catch (error) {
      credentialWarning = `A chave Tavily salva não pôde ser usada (${error.message}). A pesquisa continuou no modo Keyless.`;
    }
    const search = await researchMarket({
      material: material.material,
      location: procurement.settings?.location || "Maringá PR",
      radiusKm,
      suppliers: procurement.suppliers,
      tavilyApiKey,
    });
    if (credentialWarning) search.warnings.unshift(credentialWarning);
    state.procurement = saveMarketSearch(procurement, material.code, search);
    persistState();
    return {
      state: publicState(),
      search: state.procurement.marketSearches.find((item) => item.materialCode === material.code),
    };
  });

  ipcMain.handle("market:open-url", async (_event, payload) => {
    requirePermission(PERMISSIONS.USE_APP);
    const rawUrl = typeof payload === "string" ? payload : payload?.url;
    const purpose = typeof payload === "object" ? String(payload?.purpose || "") : "";
    const supplierName = typeof payload === "object" ? String(payload?.supplierName || "") : "";
    let target;
    try {
      target = new URL(String(rawUrl || ""));
    } catch {
      throw new Error("Link inválido.");
    }
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("Somente links seguros da web podem ser abertos.");
    if (isLocationServiceUrl(target.href)) {
      throw new Error("Links de mapas e páginas de localização não são exibidos como site do fornecedor.");
    }
    if (purpose === "supplier") {
      const normalizedName = supplierName.trim().toLocaleLowerCase("pt-BR");
      const knownSupplier = (state?.procurement?.suppliers || []).find((supplier) => String(supplier?.name || "").trim().toLocaleLowerCase("pt-BR") === normalizedName);
      let trusted = false;
      if (knownSupplier?.commercialUrl) {
        try {
          trusted = new URL(knownSupplier.commercialUrl).href === target.href;
        } catch {
          trusted = false;
        }
      }
      if (!officialSupplierSiteUrl(target.href, supplierName, { trusted })) {
        throw new Error("Este endereço pertence a uma página de localização ou terceiro, não ao site oficial confirmado do fornecedor.");
      }
    }
    if (purpose === "whatsapp") {
      const whatsappUrl = safeWhatsappUrl(target.href);
      if (!whatsappUrl) throw new Error("O link de WhatsApp não pôde ser confirmado.");
      target = new URL(whatsappUrl);
    }
    await shell.openExternal(target.href);
    return { ok: true };
  });

  ipcMain.handle("market:copy-phone", (_event, rawPhoneNumber) => {
    requirePermission(PERMISSIONS.USE_APP);
    const phoneNumber = String(rawPhoneNumber || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const digits = phoneNumber.replace(/\D/g, "");
    if (!/^[+()\d\s.-]+$/.test(phoneNumber) || ![10, 11, 12, 13].includes(digits.length)) {
      throw new Error("Telefone inválido.");
    }
    clipboard.writeText(phoneNumber);
    return { ok: true };
  });

  ipcMain.handle("report:project", async (_event, projectId) => {
    requirePermission(PERMISSIONS.USE_APP);
    const current = publicState();
    const project = current.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Projeto não encontrado.");
    return savePdf(projectReportHtml(project), `Relatorio-${safeFilename(project.name)}.pdf`);
  });

  ipcMain.handle("report:summary", async () => {
    requirePermission(PERMISSIONS.USE_APP);
    return savePdf(summaryReportHtml(publicState()), "Relatorio-Geral-Rasputim.pdf");
  });

  ipcMain.handle("state:clear", () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    stockImportPreviews.clear();
    const security = state.security;
    state = { ...emptyState(), security };
    persistState();
    return publicState();
  });

  ipcMain.handle("state:restore-demo", () => {
    requirePermission(PERMISSIONS.MANAGE_USERS);
    stockImportPreviews.clear();
    const security = state.security;
    state = { ...initialState(), security };
    persistState();
    return publicState();
  });

  ipcMain.handle("ai:status", async () => {
    requirePermission(PERMISSIONS.USE_APP);
    return localAiStatus({ baseUrl: process.env.RASPUTIM_LLAMA_URL || DEFAULT_BASE_URL });
  });

  ipcMain.handle("ai:chat", async (_event, payload) => {
    requirePermission(PERMISSIONS.USE_APP);
    return sendLocalAiMessage({
      baseUrl: process.env.RASPUTIM_LLAMA_URL || DEFAULT_BASE_URL,
      prompt: payload?.prompt,
      context: localAiContext(),
      model: payload?.model || "local-model",
    });
  });

  ipcMain.handle("app:info", () => {
    const tavilyCredentials = getCredentialVault().publicStatus();
    return {
      version: appPackage.version,
      dataPath: stateFile(),
      platform: `${os.type()} ${os.release()}`,
      localOnly: true,
      procurementReady: true,
      pcpReady: true,
      toolsReady: true,
      pcpConnection: getPcpStore().status(),
      marketConfigured: tavilyCredentials.hasKey,
      marketFree: true,
      marketProvider: tavilyCredentials.hasKey
        ? "Tavily com chave + Keyless de reserva + OpenStreetMap"
        : "Tavily Keyless + OpenStreetMap",
      tavilyCredentials,
      localAiUrl: process.env.RASPUTIM_LLAMA_URL || DEFAULT_BASE_URL,
      localAiLocalhostOnly: true,
    };
  });

  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

function safeFilename(value) {
  return String(value || "projeto").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

async function savePdf(html, defaultName) {
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: "Salvar relatório em PDF",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });
  if (selection.canceled || !selection.filePath) return { canceled: true };

  const temporary = path.join(app.getPath("temp"), `rasputim-report-${Date.now()}.html`);
  fs.writeFileSync(temporary, html, "utf8");
  const reportWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await reportWindow.loadFile(temporary);
    const pdf = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 },
    });
    fs.writeFileSync(selection.filePath, pdf);
    return { canceled: false, filePath: selection.filePath };
  } finally {
    reportWindow.destroy();
    fs.rmSync(temporary, { force: true });
  }
}

function createWindow() {
  const capturePath = process.env.RASPUTIM_CAPTURE_PATH;
  mainWindow = new BrowserWindow({
    width: 1664,
    height: 936,
    minWidth: 1180,
    minHeight: 700,
    show: false,
    backgroundColor: "#080b0e",

    title: "Rasputim Tecnologis · Ferramentas, Acessos e Estoque",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer-dist", "index.html"));
  mainWindow.once("ready-to-show", async () => {
    if (!capturePath) {
      mainWindow.show();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    mainWindow.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const captureView = process.env.RASPUTIM_CAPTURE_VIEW;
    if (captureView === "project-modal") {
      const result = await mainWindow.webContents.executeJavaScript('(() => { const button = document.querySelectorAll("[data-open-project]")[2]; if (!button) return "missing-project"; button.click(); return document.querySelector("#project-modal")?.className; })()');
      console.log(`Captura alvo: ${captureView} (${result})`);
    } else if (["projects", "clients", "pcp", "procurement", "reports", "settings"].includes(captureView)) {
      const result = await mainWindow.webContents.executeJavaScript(`(() => { const button = document.querySelector('[data-view="${captureView}"]'); if (!button) return "missing-view"; button.click(); const view = document.querySelector("#view-${captureView}"); const child = view?.firstElementChild; return { title: document.querySelector("#page-title")?.textContent, className: view?.className, display: view ? getComputedStyle(view).display : null, parent: view?.parentElement?.className, rect: view?.getBoundingClientRect().toJSON(), child: child ? { className: child.className, display: getComputedStyle(child).display, visibility: getComputedStyle(child).visibility, opacity: getComputedStyle(child).opacity, rect: child.getBoundingClientRect().toJSON() } : null }; })()`);
      console.log(`Captura alvo: ${captureView} ${JSON.stringify(result)}`);
    }
    mainWindow.webContents.invalidate();
    await mainWindow.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const screenshot = await mainWindow.webContents.capturePage();
    fs.mkdirSync(path.dirname(capturePath), { recursive: true });
    fs.writeFileSync(capturePath, screenshot.toPNG());
    console.log(`Captura criada: ${capturePath}`);
    app.quit();
  });
  if (capturePath) {
    mainWindow.webContents.on("console-message", (_event, details) => {
      if (details.level === "error") console.error(`Renderer: ${details.message}`);
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startPcpPolling() {
  if (pcpPollTimer) clearInterval(pcpPollTimer);
  pcpConnectionSignature = pcpConnectionKey(getPcpStore().status());
  pcpPollTimer = setInterval(() => {
    try {
      const refreshed = getPcpStore().refresh();
      const signature = pcpConnectionKey(getPcpStore().status());
      if (refreshed.changed || signature !== pcpConnectionSignature) {
        pcpConnectionSignature = signature;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("pcp:changed", publicState());
      }
    } catch (error) {
      console.error("Falha ao atualizar o PCP compartilhado:", error);
    }
  }, 3000);
}

function startCentralPolling() {
  if (centralPollTimer) clearInterval(centralPollTimer);
  centralConnectionSignature = JSON.stringify(getCentralStore().status());
  centralPollTimer = setInterval(() => {
    try {
      const refreshed = getCentralStore().refresh();
      const signature = JSON.stringify(getCentralStore().status());
      if (refreshed.changed && refreshed.data) {
        const localSecurity = state.security;
        state = { ...state, ...refreshed.data, security: localSecurity };
        const temporary = `${stateFile()}.tmp`;
        fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
        fs.renameSync(temporary, stateFile());
      }
      if (refreshed.changed || signature !== centralConnectionSignature) {
        centralConnectionSignature = signature;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("central:changed", publicState());
      }
    } catch (error) {
      console.error("Falha ao atualizar a base central:", error);
    }
  }, 3000);
}

app.whenReady().then(() => {
  state = loadState();
  getPcpStore();
  registerHandlers();
  createWindow();
  startPcpPolling();
  startCentralPolling();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => {
  if (pcpPollTimer) clearInterval(pcpPollTimer);
  pcpPollTimer = null;
  if (centralPollTimer) clearInterval(centralPollTimer);
  centralPollTimer = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
