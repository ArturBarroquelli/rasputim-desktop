const fs = require("node:fs");
const path = require("node:path");
const { emptySecurity, normalizeSecurity } = require("./security.cjs");

const SHARED_FILE_NAME = "rasputim-usuarios-compartilhados.json";
const LOCK_STALE_MS = 30_000;

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function createSecurityStore(options = {}) {
  const userDataPath = path.resolve(String(options.userDataPath || ""));
  if (!options.userDataPath) throw new Error("A pasta local do Rasputim é obrigatória para iniciar os acessos.");
  const configFile = path.join(userDataPath, "rasputim-usuarios-config.json");
  let lastError = "";
  let lastSyncAt = null;

  function defaultConfig() {
    return { schemaVersion: 1, mode: "LOCAL", sharedDirectory: "", updatedAt: new Date().toISOString() };
  }
  function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  function loadConfig() {
    try {
      const stored = readJson(configFile);
      return { ...defaultConfig(), mode: stored.mode === "SHARED" ? "SHARED" : "LOCAL", sharedDirectory: String(stored.sharedDirectory || ""), updatedAt: stored.updatedAt || new Date().toISOString() };
    } catch { return defaultConfig(); }
  }
  let config = loadConfig();
  function persistConfig(next) {
    config = { ...defaultConfig(), ...next, updatedAt: new Date().toISOString() };
    atomicWriteJson(configFile, config);
  }
  function sharedFile(directory = config.sharedDirectory) { return directory ? path.join(directory, SHARED_FILE_NAME) : ""; }
  function acquireLock(target) {
    const lockPath = `${target}.lock`;
    try { return { descriptor: fs.openSync(lockPath, "wx"), lockPath }; }
    catch (error) {
      if (error.code === "EEXIST") {
        try { if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lockPath); return acquireLock(target); } } catch {}
        throw new Error("Outro computador está atualizando os usuários. Aguarde alguns segundos e tente novamente.");
      }
      throw error;
    }
  }
  function releaseLock(lock) { if (!lock) return; try { fs.closeSync(lock.descriptor); } catch {} try { fs.unlinkSync(lock.lockPath); } catch {} }
  function ensureDirectory(directory) {
    const absolute = path.resolve(String(directory || ""));
    try { if (!fs.statSync(absolute).isDirectory()) throw new Error(); } catch { throw new Error("A pasta compartilhada selecionada não está acessível."); }
    return absolute;
  }
  function read() {
    if (config.mode !== "SHARED") return null;
    try {
      const security = normalizeSecurity(readJson(sharedFile()));
      lastError = ""; lastSyncAt = new Date().toISOString();
      return security;
    } catch (error) { lastError = error.message || "A base compartilhada de usuários não está acessível."; return null; }
  }
  function write(security) {
    if (config.mode !== "SHARED") return normalizeSecurity(security);
    const target = sharedFile();
    let lock;
    try {
      lock = acquireLock(target);
      const normalized = normalizeSecurity(security);
      atomicWriteJson(target, normalized);
      lastError = ""; lastSyncAt = new Date().toISOString();
      return normalized;
    } catch (error) { lastError = error.message; throw error; } finally { releaseLock(lock); }
  }
  function enableShared(directory, currentSecurity) {
    const absolute = ensureDirectory(directory);
    const target = sharedFile(absolute);
    let security;
    if (fs.existsSync(target)) security = normalizeSecurity(readJson(target));
    else { security = normalizeSecurity(currentSecurity || emptySecurity()); atomicWriteJson(target, security); }
    persistConfig({ mode: "SHARED", sharedDirectory: absolute });
    lastError = ""; lastSyncAt = new Date().toISOString();
    return security;
  }
  function connectExisting(directory) {
    const absolute = ensureDirectory(directory);
    const target = sharedFile(absolute);
    if (!fs.existsSync(target)) throw new Error("Não foi encontrada uma base central de usuários nesta pasta. Configure-a primeiro no computador administrador.");
    const security = normalizeSecurity(readJson(target));
    if (!security.users.length) throw new Error("A base central não possui nenhum responsável geral cadastrado.");
    persistConfig({ mode: "SHARED", sharedDirectory: absolute });
    lastError = ""; lastSyncAt = new Date().toISOString();
    return security;
  }
  function useLocal() { persistConfig({ mode: "LOCAL", sharedDirectory: "" }); lastError = ""; return status(); }
  function status() {
    const shared = config.mode === "SHARED";
    return { mode: config.mode, connected: !shared || !lastError, sharedDirectory: shared ? config.sharedDirectory : "", dataFile: shared ? sharedFile() : "", lastSyncAt, message: shared ? lastError || "Usuários centralizados na pasta compartilhada." : "Usuários salvos somente neste computador." };
  }
  return { read, write, enableShared, connectExisting, useLocal, status, isShared: () => config.mode === "SHARED" };
}

module.exports = { SHARED_FILE_NAME, createSecurityStore };
