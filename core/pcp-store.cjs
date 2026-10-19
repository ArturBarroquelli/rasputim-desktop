const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { emptyPcp, normalizePcp } = require("./pcp.cjs");

const SHARED_FILE_NAME = "rasputim-pcp-compartilhado.json";
const LOCK_STALE_MS = 30_000;

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stationName(value, fallback) {
  const cleaned = String(value || fallback || "ESTAÇÃO PCP").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || "ESTAÇÃO PCP";
}

function createPcpStore(options = {}) {
  const userDataPath = path.resolve(String(options.userDataPath || ""));
  if (!options.userDataPath) throw new Error("A pasta local do Rasputim é obrigatória para iniciar o PCP.");
  const localFile = path.join(userDataPath, "rasputim-pcp.json");
  const cacheFile = path.join(userDataPath, "rasputim-pcp-cache.json");
  const configFile = path.join(userDataPath, "rasputim-pcp-config.json");
  const hostname = stationName(options.hostname, os.hostname());
  let lastRevision = -1;
  let lastSyncAt = null;
  let lastError = "";

  function defaultConfig() {
    return {
      schemaVersion: 1,
      mode: "LOCAL",
      sharedDirectory: "",
      stationName: hostname,
      updatedAt: new Date().toISOString(),
    };
  }

  function loadConfig() {
    try {
      const stored = readJson(configFile);
      return {
        ...defaultConfig(),
        mode: stored.mode === "SHARED" ? "SHARED" : "LOCAL",
        sharedDirectory: String(stored.sharedDirectory || ""),
        stationName: stationName(stored.stationName, hostname),
        updatedAt: stored.updatedAt || new Date().toISOString(),
      };
    } catch {
      return defaultConfig();
    }
  }

  let config = loadConfig();

  function persistConfig(nextConfig) {
    config = {
      ...defaultConfig(),
      ...nextConfig,
      stationName: stationName(nextConfig.stationName, hostname),
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(configFile, config);
  }

  function sharedFile() {
    return config.sharedDirectory ? path.join(config.sharedDirectory, SHARED_FILE_NAME) : "";
  }

  function activeFile() {
    return config.mode === "SHARED" ? sharedFile() : localFile;
  }

  function initializeLocal() {
    try {
      const normalized = normalizePcp(readJson(localFile));
      lastRevision = normalized.revision;
      return normalized;
    } catch {
      const initial = emptyPcp();
      atomicWriteJson(localFile, initial);
      lastRevision = initial.revision;
      return initial;
    }
  }

  function readCache() {
    for (const candidate of [cacheFile, localFile]) {
      try { return normalizePcp(readJson(candidate)); } catch {}
    }
    return initializeLocal();
  }

  function saveCache(data) {
    atomicWriteJson(cacheFile, normalizePcp(data));
  }

  function read() {
    if (config.mode !== "SHARED") {
      const local = initializeLocal();
      lastError = "";
      lastSyncAt = new Date().toISOString();
      return local;
    }
    try {
      const target = sharedFile();
      if (!target) throw new Error("A pasta compartilhada do PCP não está configurada.");
      const data = normalizePcp(readJson(target));
      lastRevision = data.revision;
      lastSyncAt = new Date().toISOString();
      lastError = "";
      saveCache(data);
      return data;
    } catch (error) {
      lastError = error.message || "A pasta compartilhada não está acessível.";
      const cached = readCache();
      lastRevision = cached.revision;
      return cached;
    }
  }

  function acquireLock(target) {
    const lockPath = `${target}.lock`;
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, station: config.stationName, createdAt: new Date().toISOString() })}\n`, "utf8");
      return { descriptor, lockPath };
    } catch (error) {
      if (error.code === "EEXIST") {
        try {
          const age = Date.now() - fs.statSync(lockPath).mtimeMs;
          if (age > LOCK_STALE_MS) {
            fs.unlinkSync(lockPath);
            return acquireLock(target);
          }
        } catch {}
        throw new Error("Outro computador está atualizando o PCP. Aguarde alguns segundos e tente novamente.");
      }
      throw new Error(`Não foi possível reservar a base compartilhada do PCP: ${error.message}`);
    }
  }

  function releaseLock(lock) {
    if (!lock) return;
    try { fs.closeSync(lock.descriptor); } catch {}
    try { fs.unlinkSync(lock.lockPath); } catch {}
  }

  function mutate(mutator) {
    if (typeof mutator !== "function") throw new Error("Operação de PCP inválida.");
    const target = activeFile();
    if (!target) throw new Error("A base do PCP não está configurada.");
    let lock = null;
    try {
      if (config.mode === "SHARED") lock = acquireLock(target);
      let current;
      try { current = normalizePcp(readJson(target)); } catch {
        current = config.mode === "SHARED" ? readCache() : emptyPcp();
      }
      const updated = normalizePcp(mutator(current));
      if (updated.revision <= current.revision) {
        lastRevision = current.revision;
        lastSyncAt = new Date().toISOString();
        lastError = "";
        return current;
      }
      atomicWriteJson(target, updated);
      if (config.mode === "SHARED") saveCache(updated);
      lastRevision = updated.revision;
      lastSyncAt = new Date().toISOString();
      lastError = "";
      return updated;
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      releaseLock(lock);
    }
  }

  function configureShared(directory, requestedStationName) {
    const absolute = path.resolve(String(directory || ""));
    let stats;
    try { stats = fs.statSync(absolute); } catch {
      throw new Error("A pasta compartilhada selecionada não está acessível.");
    }
    if (!stats.isDirectory()) throw new Error("Selecione uma pasta para compartilhar o PCP.");

    const current = read();
    const nextConfig = {
      ...config,
      mode: "SHARED",
      sharedDirectory: absolute,
      stationName: stationName(requestedStationName, config.stationName),
    };
    const target = path.join(absolute, SHARED_FILE_NAME);
    if (!fs.existsSync(target)) atomicWriteJson(target, current);
    else normalizePcp(readJson(target));
    persistConfig(nextConfig);
    const shared = read();
    return { data: shared, connection: status() };
  }

  function useLocal(requestedStationName) {
    const current = read();
    atomicWriteJson(localFile, current);
    persistConfig({
      ...config,
      mode: "LOCAL",
      sharedDirectory: "",
      stationName: stationName(requestedStationName, config.stationName),
    });
    lastError = "";
    lastSyncAt = new Date().toISOString();
    lastRevision = current.revision;
    return { data: current, connection: status() };
  }

  function updateStationName(value) {
    persistConfig({ ...config, stationName: stationName(value, config.stationName) });
    return status();
  }

  function refresh() {
    if (config.mode !== "SHARED") return { changed: false, data: read() };
    const previousRevision = lastRevision;
    const data = read();
    return { changed: !lastError && data.revision !== previousRevision, data };
  }

  function status() {
    const shared = config.mode === "SHARED";
    return {
      mode: config.mode,
      connected: !shared || !lastError,
      stationName: config.stationName,
      sharedDirectory: shared ? config.sharedDirectory : "",
      dataFile: activeFile(),
      revision: Math.max(lastRevision, 0),
      lastSyncAt,
      message: shared
        ? lastError || "PCP sincronizado na pasta compartilhada."
        : "PCP salvo somente neste computador.",
      readOnlyFallback: shared && Boolean(lastError),
    };
  }

  initializeLocal();

  return {
    configureShared,
    read,
    refresh,
    status,
    mutate,
    updateStationName,
    useLocal,
    paths: { localFile, cacheFile, configFile },
  };
}

module.exports = {
  SHARED_FILE_NAME,
  createPcpStore,
};
