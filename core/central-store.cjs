const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SHARED_FILE_NAME = "rasputim-operacao-central.json";
const LOCK_STALE_MS = 30_000;

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createCentralStore(options = {}) {
  if (!options.userDataPath) throw new Error("A pasta local do Rasputim é obrigatória para a base central.");
  const userDataPath = path.resolve(String(options.userDataPath));
  const configFile = path.join(userDataPath, "rasputim-central-config.json");
  const cacheFile = path.join(userDataPath, "rasputim-operacao-cache.json");
  const stationName = String(options.stationName || os.hostname() || "ESTAÇÃO").trim().slice(0, 80);
  let lastRevision = -1;
  let lastSyncAt = null;
  let lastError = "";

  const defaultConfig = () => ({ schemaVersion: 1, mode: "LOCAL", sharedDirectory: "", stationName, updatedAt: new Date().toISOString() });
  function loadConfig() {
    try {
      const saved = readJson(configFile);
      return { ...defaultConfig(), mode: saved.mode === "CENTRAL" ? "CENTRAL" : "LOCAL", sharedDirectory: String(saved.sharedDirectory || ""), stationName: String(saved.stationName || stationName), updatedAt: saved.updatedAt || new Date().toISOString() };
    } catch { return defaultConfig(); }
  }
  let config = loadConfig();
  function saveConfig(next) { config = { ...defaultConfig(), ...next, updatedAt: new Date().toISOString() }; writeJson(configFile, config); }
  function sharedFile(directory = config.sharedDirectory) { return directory ? path.join(directory, SHARED_FILE_NAME) : ""; }
  function normalizeEnvelope(raw) {
    if (!raw || typeof raw !== "object" || !raw.data || typeof raw.data !== "object") throw new Error("A base central está em formato inválido.");
    return { schemaVersion: 1, revision: Math.max(0, Number(raw.revision || 0)), updatedAt: raw.updatedAt || new Date().toISOString(), updatedBy: raw.updatedBy || "", data: raw.data };
  }
  function ensureDirectory(directory) {
    const absolute = path.resolve(String(directory || ""));
    try { if (!fs.statSync(absolute).isDirectory()) throw new Error(); } catch { throw new Error("A pasta central selecionada não está acessível."); }
    return absolute;
  }
  function saveCache(envelope) { writeJson(cacheFile, envelope); }
  function readCache() { try { return normalizeEnvelope(readJson(cacheFile)); } catch { return null; } }
  function acquireLock(target) {
    const lockPath = `${target}.lock`;
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, JSON.stringify({ station: config.stationName, createdAt: new Date().toISOString() }));
      return { descriptor, lockPath };
    } catch (error) {
      if (error.code === "EEXIST") {
        try { if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lockPath); return acquireLock(target); } } catch {}
        throw new Error("Outro computador está atualizando a base central. Aguarde alguns segundos e tente novamente.");
      }
      throw new Error("Não foi possível reservar a base central: verifique as permissões da pasta compartilhada.");
    }
  }
  function releaseLock(lock) { if (!lock) return; try { fs.closeSync(lock.descriptor); } catch {} try { fs.unlinkSync(lock.lockPath); } catch {} }
  function read() {
    if (config.mode !== "CENTRAL") return null;
    try {
      const envelope = normalizeEnvelope(readJson(sharedFile()));
      lastRevision = envelope.revision; lastSyncAt = new Date().toISOString(); lastError = ""; saveCache(envelope);
      return envelope.data;
    } catch (error) {
      lastError = error.message || "A base central não está acessível.";
      const cached = readCache();
      if (cached) { lastRevision = cached.revision; return cached.data; }
      return null;
    }
  }
  function write(data) {
    if (config.mode !== "CENTRAL") return data;
    const target = sharedFile(); let lock;
    try {
      lock = acquireLock(target);
      let currentRevision = -1;
      try { currentRevision = normalizeEnvelope(readJson(target)).revision; } catch {}
      const envelope = { schemaVersion: 1, revision: currentRevision + 1, updatedAt: new Date().toISOString(), updatedBy: config.stationName, data };
      writeJson(target, envelope); saveCache(envelope); lastRevision = envelope.revision; lastSyncAt = new Date().toISOString(); lastError = "";
      return data;
    } catch (error) { lastError = error.message; throw error; } finally { releaseLock(lock); }
  }
  function enable(directory, data) {
    const absolute = ensureDirectory(directory); const target = sharedFile(absolute);
    if (!fs.existsSync(target)) writeJson(target, { schemaVersion: 1, revision: 0, updatedAt: new Date().toISOString(), updatedBy: stationName, data });
    else normalizeEnvelope(readJson(target));
    saveConfig({ mode: "CENTRAL", sharedDirectory: absolute });
    return read();
  }
  function connect(directory) {
    const absolute = ensureDirectory(directory); const target = sharedFile(absolute);
    if (!fs.existsSync(target)) throw new Error("Não foi encontrada uma base central do Rasputim nesta pasta. Configure-a primeiro no computador central.");
    normalizeEnvelope(readJson(target)); saveConfig({ mode: "CENTRAL", sharedDirectory: absolute });
    return read();
  }
  function useLocal() { saveConfig({ mode: "LOCAL", sharedDirectory: "" }); lastError = ""; return status(); }
  function refresh() { const previousRevision = lastRevision; const data = read(); return { changed: !lastError && lastRevision !== previousRevision, data }; }
  function status() { const central = config.mode === "CENTRAL"; return { mode: config.mode, connected: !central || !lastError, sharedDirectory: central ? config.sharedDirectory : "", dataFile: central ? sharedFile() : "", stationName: config.stationName, revision: Math.max(0, lastRevision), lastSyncAt, readOnlyFallback: central && Boolean(lastError), message: central ? lastError || "Operação conectada à base central." : "Operação salva somente neste computador." }; }
  return { read, write, enable, connect, useLocal, refresh, status, isCentral: () => config.mode === "CENTRAL" };
}

module.exports = { SHARED_FILE_NAME, createCentralStore };
