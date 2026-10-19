const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createFirstAdmin, emptySecurity } = require("../core/security.cjs");
const { createSecurityStore } = require("../core/security-store.cjs");

test("duas instalações usam a mesma base central de usuários", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-users-"));
  const shared = path.join(root, "rede");
  fs.mkdirSync(shared);
  const security = createFirstAdmin(emptySecurity(), { name: "Admin", login: "admin", password: "senha-admin-1" }).security;
  const first = createSecurityStore({ userDataPath: path.join(root, "pc-01") });
  first.enableShared(shared, security);
  const second = createSecurityStore({ userDataPath: path.join(root, "pc-02") });
  const connected = second.connectExisting(shared);
  assert.equal(connected.users[0].login, "admin");
  assert.equal(second.status().mode, "SHARED");
});
