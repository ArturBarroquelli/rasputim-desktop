const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { loadSeed, enrich: enrichProcurement } = require("./procurement.cjs");
const { emptyTools, normalizeTools, toolSummary } = require("./tools.cjs");
const {
  SESSION_IDLE_MS,
  authenticate,
  createFirstAdmin,
  emptySecurity,
  hasPermission,
  normalizeSecurity,
  publicUser,
  PERMISSIONS,
} = require("./security.cjs");
const { createPcpProject, enrichPcp } = require("./pcp.cjs");
const { createPcpStore } = require("./pcp-store.cjs");

const MAX_BODY_BYTES = 256 * 1024;
const COOKIE = "rasputim_session";
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }

function defaultState(seedFile, procurementSeedFile) {
  let seed = {};
  try { seed = readJson(seedFile); } catch {}
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projects: Array.isArray(seed.projects) ? seed.projects : [],
    sales: Array.isArray(seed.sales) ? seed.sales : [],
    salesFile: seed.salesFile || null,
    procurement: loadSeed(procurementSeedFile),
    tools: emptyTools(),
    security: emptySecurity(),
  };
}

function safeFile(root, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const absolute = path.resolve(root, `.${requested}`);
  return absolute.startsWith(`${root}${path.sep}`) || absolute === root ? absolute : null;
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")]));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0; const chunks = [];
    req.on("data", (chunk) => { received += chunk.length; if (received > MAX_BODY_BYTES) { reject(new Error("O envio ultrapassou o limite permitido.")); req.destroy(); } else chunks.push(chunk); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(new Error("Dados enviados em formato inválido.")); } });
    req.on("error", reject);
  });
}

function createWebServer(options = {}) {
  if (!options.userDataPath || !options.staticRoot || !options.seedFile || !options.procurementSeedFile) throw new Error("Configuração incompleta do servidor web Rasputim.");
  const userDataPath = path.resolve(options.userDataPath);
  const staticRoot = path.resolve(options.staticRoot);
  const statePath = path.join(userDataPath, "rasputim-state.json");
  const pcpStore = createPcpStore({ userDataPath, hostname: options.stationName || "CENTRAL WEB" });
  const sessions = new Map();
  let state;

  function loadState() {
    try {
      const stored = readJson(statePath);
      return {
        ...defaultState(options.seedFile, options.procurementSeedFile),
        ...stored,
        procurement: enrichProcurement(stored.procurement || loadSeed(options.procurementSeedFile)),
        tools: normalizeTools(stored.tools),
        security: normalizeSecurity(stored.security),
      };
    } catch {
      const initial = defaultState(options.seedFile, options.procurementSeedFile);
      writeJson(statePath, initial);
      return initial;
    }
  }
  function persist() { state.updatedAt = new Date().toISOString(); writeJson(statePath, state); }
  function userForRequest(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const session = token && sessions.get(token);
    if (!session || Date.now() - session.lastActivityAt >= SESSION_IDLE_MS) { if (token) sessions.delete(token); return null; }
    const user = state.security.users.find((item) => item.id === session.userId && item.active);
    if (!user) { sessions.delete(token); return null; }
    session.lastActivityAt = Date.now();
    return publicUser(user);
  }
  function issueSession(user) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, lastActivityAt: Date.now() });
    return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_IDLE_MS / 1000)}`;
  }
  function authPayload(req) {
    const currentUser = userForRequest(req);
    const canManageUsers = hasPermission(currentUser, PERMISSIONS.MANAGE_USERS);
    return { hasUsers: state.security.users.length > 0, authenticated: Boolean(currentUser), currentUser, users: canManageUsers ? state.security.users.map(publicUser) : [], sessionIdleMinutes: Math.round(SESSION_IDLE_MS / 60000) };
  }
  function requireUser(req, permission = PERMISSIONS.USE_APP) {
    const user = userForRequest(req);
    if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
    if (!hasPermission(user, permission)) throw new Error("Seu cargo não possui permissão para esta operação.");
    return user;
  }
  function dashboard(req) {
    const auth = authPayload(req);
    if (!auth.authenticated) return { auth, procurement: { stock: [], summary: {} }, tools: { items: [], history: [], summary: toolSummary(emptyTools()) }, pcp: { projects: [], summary: {}, stages: [] } };
    return {
      auth,
      procurement: enrichProcurement(state.procurement),
      tools: { ...normalizeTools(state.tools), summary: toolSummary(state.tools) },
      pcp: enrichPcp(pcpStore.read()),
      generatedAt: new Date().toISOString(),
    };
  }
  async function api(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { online: true, app: "Rasputim Central Web", version: options.version });
    if (req.method === "GET" && url.pathname === "/api/auth/status") return sendJson(res, 200, authPayload(req));
    if (req.method === "POST" && url.pathname === "/api/auth/setup") {
      const created = createFirstAdmin(state.security, await readBody(req)); state.security = created.security; persist();
      return sendJson(res, 201, dashboard(req), { "Set-Cookie": issueSession(created.user) });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const result = authenticate(state.security, await readBody(req)); state.security = result.security; persist();
      if (!result.user) return sendJson(res, 401, { error: result.error || "Não foi possível entrar." });
      return sendJson(res, 200, dashboard(req), { "Set-Cookie": issueSession(result.user) });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = parseCookies(req.headers.cookie)[COOKIE]; if (token) sessions.delete(token);
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }
    if (req.method === "GET" && url.pathname === "/api/dashboard") { requireUser(req); return sendJson(res, 200, dashboard(req)); }
    if (req.method === "POST" && url.pathname === "/api/pcp/projects") {
      const actor = requireUser(req, PERMISSIONS.PCP_MANAGE); const input = await readBody(req);
      const updated = pcpStore.mutate((current) => createPcpProject(current, { ...input, responsible: input.responsible || actor.name, historyNote: `Obra cadastrada por ${actor.name}.` }));
      return sendJson(res, 201, { pcp: enrichPcp(updated) });
    }
    return sendJson(res, 404, { error: "Rota não encontrada." });
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Método não permitido." });
      const file = safeFile(staticRoot, decodeURIComponent(url.pathname));
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Página não encontrada.", { "Content-Type": "text/plain; charset=utf-8" });
      const headers = { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": path.extname(file) ? "public, max-age=3600" : "no-store", "X-Content-Type-Options": "nosniff" };
      res.writeHead(200, headers); if (req.method === "HEAD") return res.end(); fs.createReadStream(file).pipe(res);
    } catch (error) {
      const status = /sessão|cargo não possui/i.test(error.message) ? 401 : 400;
      sendJson(res, status, { error: error.message || "Falha no servidor Rasputim." });
    }
  });
  state = loadState();
  return {
    start({ host = "0.0.0.0", port = 8080 } = {}) { return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => { server.removeListener("error", reject); resolve(server.address()); }); }); },
    stop() { return new Promise((resolve) => server.close(resolve)); },
    address() { return server.address(); },
    dashboard,
  };
}

module.exports = { createWebServer };
