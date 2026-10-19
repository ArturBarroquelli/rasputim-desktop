const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOGIN_LOCK_MS,
  PERMISSIONS,
  ROLES,
  authenticate,
  createFirstAdmin,
  createUser,
  emptySecurity,
  hasPermission,
  updateUser,
  resetUserPassword,
} = require("../core/security.cjs");

test("cria contas individuais, limita cargos e nunca expõe a senha", () => {
  const now = new Date("2026-09-03T10:00:00.000Z");
  const first = createFirstAdmin(emptySecurity(now), {
    name: "Responsável Geral",
    login: "geral",
    password: "senha-segura-1",
  }, now);
  const stock = createUser(first.security, {
    name: "Equipe Estoque",
    login: "estoque.01",
    role: ROLES.STOCK,
    password: "senha-segura-2",
  }, now);

  assert.equal(first.user.role, ROLES.GENERAL_MANAGER);
  assert.equal(first.user.passwordHash, undefined);
  assert.equal(stock.user.login, "estoque.01");
  assert.equal(hasPermission(stock.user, PERMISSIONS.STOCK_AUTHORIZE_EXIT), true);
  assert.equal(hasPermission(stock.user, PERMISSIONS.MANAGE_USERS), false);
});

test("o usuário criado entra com a senha inicial e também após redefinição", () => {
  const now = new Date("2026-10-16T16:00:00.000Z");
  const first = createFirstAdmin(emptySecurity(now), { name: "Admin", login: "admin", password: "senha-admin-1" }, now);
  const created = createUser(first.security, {
    name: "Nova Responsável",
    login: "nova.responsavel",
    role: ROLES.GENERAL_MANAGER,
    password: "senha-inicial-1",
  }, now);
  const firstLogin = authenticate(created.security, { login: "nova.responsavel", password: "senha-inicial-1" }, now);
  assert.equal(firstLogin.user?.name, "Nova Responsável");
  const changed = resetUserPassword(firstLogin.security, created.user.id, "senha-nova-1", now);
  const secondLogin = authenticate(changed.security, { login: "nova.responsavel", password: "senha-nova-1" }, now);
  assert.equal(secondLogin.user?.role, ROLES.GENERAL_MANAGER);
});

test("bloqueia temporariamente após cinco senhas incorretas e libera depois do prazo", () => {
  const now = new Date("2026-09-03T10:00:00.000Z");
  const first = createFirstAdmin(emptySecurity(now), {
    name: "Responsável Geral",
    login: "geral",
    password: "senha-segura-1",
  }, now);
  let security = first.security;
  let failed;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    failed = authenticate(security, { login: "geral", password: "senha-incorreta" }, new Date(now.getTime() + attempt));
    security = failed.security;
  }

  assert.match(failed.error, /cinco tentativas/i);
  const locked = authenticate(security, { login: "geral", password: "senha-segura-1" }, new Date(now.getTime() + 1000));
  assert.equal(locked.user, null);
  assert.match(locked.error, /bloqueado/i);

  const released = authenticate(security, { login: "geral", password: "senha-segura-1" }, new Date(now.getTime() + LOGIN_LOCK_MS + 1000));
  assert.equal(released.user.name, "Responsável Geral");
});

test("não permite deixar a instalação sem responsável geral ativo", () => {
  const now = new Date("2026-09-03T10:00:00.000Z");
  const first = createFirstAdmin(emptySecurity(now), {
    name: "Responsável Geral",
    login: "geral",
    password: "senha-segura-1",
  }, now);
  assert.throws(
    () => updateUser(first.security, first.user.id, { active: false }, now),
    /pelo menos um responsável geral ativo/i,
  );
});
