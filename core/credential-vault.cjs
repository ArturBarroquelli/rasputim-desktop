const fs = require("node:fs");
const path = require("node:path");

const TAVILY_KEY_PATTERN = /^tvly-[A-Za-z0-9_-]{8,192}$/;

function normalizeTavilyKey(value) {
  return String(value || "").trim();
}

function validateTavilyKey(value) {
  const key = normalizeTavilyKey(value);
  if (!TAVILY_KEY_PATTERN.test(key)) {
    throw new Error("Informe uma chave Tavily válida, iniciada por tvly-. Não envie espaços antes ou depois da chave.");
  }
  return key;
}

function maskTavilyKey(value) {
  const key = validateTavilyKey(value);
  return `${key.slice(0, 5)}••••••••${key.slice(-4)}`;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createCredentialVault({ filePath, encryption, now = () => new Date().toISOString() }) {
  if (!path.isAbsolute(String(filePath || ""))) throw new Error("O cofre de credenciais exige um caminho absoluto.");
  if (!encryption || typeof encryption.isEncryptionAvailable !== "function"
    || typeof encryption.encryptString !== "function" || typeof encryption.decryptString !== "function") {
    throw new Error("Proteção de credenciais não configurada.");
  }

  const target = path.resolve(filePath);

  function protectionAvailable() {
    try {
      return encryption.isEncryptionAvailable() === true;
    } catch {
      return false;
    }
  }

  function readEnvelope() {
    if (!fs.existsSync(target)) return null;
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    if (parsed?.schemaVersion !== 1 || typeof parsed.encryptedKey !== "string" || !parsed.encryptedKey) {
      throw new Error("Formato de credencial inválido.");
    }
    return parsed;
  }

  function decryptEnvelope(envelope) {
    if (!protectionAvailable()) throw new Error("A proteção segura do sistema operacional não está disponível.");
    const encrypted = Buffer.from(envelope.encryptedKey, "base64");
    if (!encrypted.length) throw new Error("Credencial protegida vazia.");
    return validateTavilyKey(encryption.decryptString(encrypted));
  }

  function publicStatus() {
    const base = {
      hasKey: false,
      maskedKey: "",
      storageProtected: protectionAvailable(),
      savedAt: null,
      lastTestedAt: null,
      plan: "",
      usage: null,
      limit: null,
      remaining: null,
      error: "",
    };
    try {
      const envelope = readEnvelope();
      if (!envelope) return base;
      const key = decryptEnvelope(envelope);
      return {
        ...base,
        hasKey: true,
        maskedKey: maskTavilyKey(key),
        savedAt: envelope.savedAt || null,
        lastTestedAt: envelope.lastTestedAt || null,
        plan: String(envelope.plan || ""),
        usage: optionalNumber(envelope.usage),
        limit: optionalNumber(envelope.limit),
        remaining: optionalNumber(envelope.remaining),
      };
    } catch {
      return {
        ...base,
        error: "A chave salva não pôde ser lida. Remova-a e salve novamente.",
      };
    }
  }

  function loadKey() {
    const envelope = readEnvelope();
    return envelope ? decryptEnvelope(envelope) : "";
  }

  function saveKey(value, metadata = {}) {
    const key = validateTavilyKey(value);
    if (!protectionAvailable()) {
      throw new Error("O Windows não disponibilizou a proteção segura de credenciais. A chave não foi salva em texto aberto.");
    }
    const encrypted = encryption.encryptString(key);
    if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error("Não foi possível proteger a chave Tavily.");
    const envelope = {
      schemaVersion: 1,
      provider: "TAVILY",
      encryptedKey: encrypted.toString("base64"),
      savedAt: now(),
      lastTestedAt: metadata.testedAt || null,
      plan: String(metadata.plan || ""),
      usage: optionalNumber(metadata.usage),
      limit: optionalNumber(metadata.limit),
      remaining: optionalNumber(metadata.remaining),
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Windows aplica as permissões da pasta do perfil e a criptografia DPAPI.
    }
    return publicStatus();
  }

  function removeKey() {
    fs.rmSync(target, { force: true });
    fs.rmSync(`${target}.tmp`, { force: true });
    return publicStatus();
  }

  return {
    loadKey,
    publicStatus,
    removeKey,
    saveKey,
  };
}

module.exports = {
  TAVILY_KEY_PATTERN,
  createCredentialVault,
  maskTavilyKey,
  normalizeTavilyKey,
  validateTavilyKey,
};
