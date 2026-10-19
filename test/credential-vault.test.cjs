const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createCredentialVault,
  maskTavilyKey,
  validateTavilyKey,
} = require("../core/credential-vault.cjs");

const VALID_KEY = "tvly-valid_test_key_1234567890";

function protectedEncryption() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from([...value].reverse().join(""), "utf8"),
    decryptString: (buffer) => [...buffer.toString("utf8")].reverse().join(""),
  };
}

function temporaryVault(testContext, encryption = protectedEncryption()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-vault-test-"));
  testContext.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "rasputim-credentials.json");
  return {
    filePath,
    vault: createCredentialVault({
      filePath,
      encryption,
      now: () => "2026-08-05T12:00:00.000Z",
    }),
  };
}

test("valida e mascara a chave sem expor seu conteúdo", () => {
  assert.equal(validateTavilyKey(`  ${VALID_KEY}  `), VALID_KEY);
  assert.equal(maskTavilyKey(VALID_KEY), "tvly-••••••••7890");
  assert.throws(() => validateTavilyKey("serper-123"), /iniciada por tvly-/i);
});

test("salva a chave cifrada, recupera localmente e expõe somente metadados", (t) => {
  const { filePath, vault } = temporaryVault(t);
  const status = vault.saveKey(VALID_KEY, {
    testedAt: "2026-08-05T11:59:00.000Z",
    plan: "Bootstrap",
    usage: 25,
    limit: 1000,
    remaining: 975,
  });

  assert.equal(status.hasKey, true);
  assert.equal(status.maskedKey, "tvly-••••••••7890");
  assert.equal(status.plan, "Bootstrap");
  assert.equal(status.remaining, 975);
  assert.equal(vault.loadKey(), VALID_KEY);
  const stored = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(stored, new RegExp(VALID_KEY));
  assert.doesNotMatch(JSON.stringify(status), /valid_test_key/);
});

test("nunca salva em texto aberto quando a proteção do sistema não está disponível", (t) => {
  const { filePath, vault } = temporaryVault(t, {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString("utf8"),
  });
  assert.throws(() => vault.saveKey(VALID_KEY), /não foi salva em texto aberto/i);
  assert.equal(fs.existsSync(filePath), false);
});

test("credencial corrompida não é devolvida e pode ser removida", (t) => {
  const { filePath, vault } = temporaryVault(t);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "{\"schemaVersion\":1,\"encryptedKey\":\"%%%\"}\n", "utf8");
  const status = vault.publicStatus();
  assert.equal(status.hasKey, false);
  assert.match(status.error, /não pôde ser lida/i);
  assert.throws(() => vault.loadKey());
  assert.equal(vault.removeKey().hasKey, false);
  assert.equal(fs.existsSync(filePath), false);
});
