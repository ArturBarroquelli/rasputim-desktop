const crypto = require("node:crypto");

const SESSION_IDLE_MS = 20 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const ROLES = Object.freeze({
  GENERAL_MANAGER: "GENERAL_MANAGER",
  FINANCE: "FINANCE",
  PROCUREMENT: "PROCUREMENT",
  STOCK: "STOCK",
  DESIGN_SALES: "DESIGN_SALES",
  PRODUCTION: "PRODUCTION",
  AUDIT: "AUDIT",
  VIEW: "VIEW",
});

const ROLE_DEFINITIONS = Object.freeze([
  { id: ROLES.GENERAL_MANAGER, label: "Responsável geral", description: "Administra pessoas, cargos e todas as operações." },
  { id: ROLES.FINANCE, label: "Financeiro", description: "Consulta informações financeiras; não movimenta estoque." },
  { id: ROLES.PROCUREMENT, label: "Compras", description: "Consulta estoque e registra cotações de compra." },
  { id: ROLES.STOCK, label: "Estoque", description: "Registra entradas, contagens e autoriza saídas." },
  { id: ROLES.DESIGN_SALES, label: "Projetista / Vendas", description: "Consulta projetos e estoque para planejamento." },
  { id: ROLES.PRODUCTION, label: "Produção / Montagem", description: "Solicita saídas e atualiza as etapas autorizadas do PCP." },
  { id: ROLES.AUDIT, label: "Auditoria", description: "Consulta históricos, movimentações e relatórios." },
  { id: ROLES.VIEW, label: "Consulta", description: "Acesso somente para consulta." },
]);

const PERMISSIONS = Object.freeze({
  USE_APP: "USE_APP",
  MANAGE_USERS: "MANAGE_USERS",
  STOCK_ENTRY: "STOCK_ENTRY",
  STOCK_COUNT: "STOCK_COUNT",
  STOCK_IMPORT: "STOCK_IMPORT",
  STOCK_REQUEST_EXIT: "STOCK_REQUEST_EXIT",
  STOCK_AUTHORIZE_EXIT: "STOCK_AUTHORIZE_EXIT",
  STOCK_MANAGE_MATERIALS: "STOCK_MANAGE_MATERIALS",
  TOOL_MANAGE: "TOOL_MANAGE",
  TOOL_REQUEST_WITHDRAWAL: "TOOL_REQUEST_WITHDRAWAL",
  TOOL_AUTHORIZE_WITHDRAWAL: "TOOL_AUTHORIZE_WITHDRAWAL",
  TOOL_REGISTER_RETURN: "TOOL_REGISTER_RETURN",
  PCP_MANAGE: "PCP_MANAGE",
  PROCUREMENT_MANAGE: "PROCUREMENT_MANAGE",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.GENERAL_MANAGER]: Object.values(PERMISSIONS),
  [ROLES.FINANCE]: [PERMISSIONS.USE_APP],
  [ROLES.PROCUREMENT]: [PERMISSIONS.USE_APP, PERMISSIONS.PROCUREMENT_MANAGE],
  [ROLES.STOCK]: [
    PERMISSIONS.USE_APP,
    PERMISSIONS.STOCK_ENTRY,
    PERMISSIONS.STOCK_COUNT,
    PERMISSIONS.STOCK_IMPORT,
    PERMISSIONS.STOCK_REQUEST_EXIT,
    PERMISSIONS.STOCK_AUTHORIZE_EXIT,
    PERMISSIONS.STOCK_MANAGE_MATERIALS,
    PERMISSIONS.TOOL_MANAGE,
    PERMISSIONS.TOOL_REQUEST_WITHDRAWAL,
    PERMISSIONS.TOOL_AUTHORIZE_WITHDRAWAL,
    PERMISSIONS.TOOL_REGISTER_RETURN,
  ],
  [ROLES.DESIGN_SALES]: [PERMISSIONS.USE_APP, PERMISSIONS.PCP_MANAGE],
  [ROLES.PRODUCTION]: [
    PERMISSIONS.USE_APP,
    PERMISSIONS.PCP_MANAGE,
    PERMISSIONS.STOCK_REQUEST_EXIT,
    PERMISSIONS.TOOL_REQUEST_WITHDRAWAL,
    PERMISSIONS.TOOL_REGISTER_RETURN,
  ],
  [ROLES.AUDIT]: [PERMISSIONS.USE_APP],
  [ROLES.VIEW]: [PERMISSIONS.USE_APP],
});

function cleanText(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeLogin(value) {
  return cleanText(value, 60)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9._-]+/g, "");
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function validRole(role) {
  return ROLE_DEFINITIONS.some((item) => item.id === role);
}

function roleLabel(role) {
  return ROLE_DEFINITIONS.find((item) => item.id === role)?.label || "Consulta";
}

function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.VIEW])];
}

function hasPermission(user, permission) {
  return Boolean(user?.active) && permissionsForRole(user.role).includes(permission);
}

function assertPassword(password) {
  const value = String(password || "");
  if (value.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  if (value.length > 200) throw new Error("A senha informada é inválida.");
  return value;
}

function passwordRecord(password) {
  const value = assertPassword(password);
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  return {
    passwordSalt,
    passwordHash: crypto.scryptSync(value, passwordSalt, 64).toString("hex"),
  };
}

function passwordMatches(user, password) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const supplied = String(password || "");
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = crypto.scryptSync(supplied, user.passwordSalt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function emptySecurity(now = new Date()) {
  const createdAt = isoNow(now);
  return { schemaVersion: 1, users: [], createdAt, updatedAt: createdAt };
}

function normalizeUser(raw = {}, now = new Date()) {
  const createdAt = raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime()) ? raw.createdAt : isoNow(now);
  const login = normalizeLogin(raw.login);
  return {
    id: cleanText(raw.id, 80) || `USR-${crypto.randomUUID()}`,
    name: cleanText(raw.name, 120) || "Usuário sem nome",
    login,
    role: validRole(raw.role) ? raw.role : ROLES.VIEW,
    active: raw.active !== false,
    passwordSalt: typeof raw.passwordSalt === "string" ? raw.passwordSalt : "",
    passwordHash: typeof raw.passwordHash === "string" ? raw.passwordHash : "",
    failedAttempts: Math.max(0, Math.min(MAX_FAILED_ATTEMPTS, Number(raw.failedAttempts) || 0)),
    lockedUntil: raw.lockedUntil && !Number.isNaN(new Date(raw.lockedUntil).getTime()) ? raw.lockedUntil : null,
    lastLoginAt: raw.lastLoginAt && !Number.isNaN(new Date(raw.lastLoginAt).getTime()) ? raw.lastLoginAt : null,
    createdAt,
    updatedAt: raw.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime()) ? raw.updatedAt : createdAt,
  };
}

function normalizeSecurity(raw, now = new Date()) {
  const empty = emptySecurity(now);
  const users = Array.isArray(raw?.users)
    ? raw.users.map((user) => normalizeUser(user, now)).filter((user) => user.login)
    : [];
  const seen = new Set();
  return {
    schemaVersion: 1,
    users: users.filter((user) => {
      if (seen.has(user.login)) return false;
      seen.add(user.login);
      return true;
    }),
    createdAt: raw?.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime()) ? raw.createdAt : empty.createdAt,
    updatedAt: raw?.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime()) ? raw.updatedAt : empty.updatedAt,
  };
}

function publicUser(raw) {
  const user = normalizeUser(raw);
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    roleLabel: roleLabel(user.role),
    permissions: permissionsForRole(user.role),
    active: user.active,
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createFirstAdmin(rawSecurity, input = {}, now = new Date()) {
  const security = normalizeSecurity(rawSecurity, now);
  if (security.users.length) throw new Error("Já existe um responsável geral cadastrado. Entre no sistema para administrar os usuários.");
  const name = cleanText(input.name, 120);
  const login = normalizeLogin(input.login);
  if (name.length < 2) throw new Error("Informe o nome do responsável geral.");
  if (login.length < 3) throw new Error("Informe um usuário com pelo menos 3 caracteres.");
  const createdAt = isoNow(now);
  const user = {
    id: `USR-${crypto.randomUUID()}`,
    name,
    login,
    role: ROLES.GENERAL_MANAGER,
    active: true,
    ...passwordRecord(input.password),
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  return {
    security: { ...security, users: [user], updatedAt: createdAt },
    user: publicUser(user),
  };
}

function createUser(rawSecurity, input = {}, now = new Date()) {
  const security = normalizeSecurity(rawSecurity, now);
  const name = cleanText(input.name, 120);
  const login = normalizeLogin(input.login);
  const role = validRole(input.role) ? input.role : "";
  if (name.length < 2) throw new Error("Informe o nome completo do usuário.");
  if (login.length < 3) throw new Error("Informe um usuário com pelo menos 3 caracteres.");
  if (!role) throw new Error("Selecione um cargo válido.");
  if (security.users.some((user) => user.login === login)) throw new Error("Este nome de usuário já está cadastrado.");
  const createdAt = isoNow(now);
  const user = {
    id: `USR-${crypto.randomUUID()}`,
    name,
    login,
    role,
    active: input.active !== false,
    ...passwordRecord(input.password),
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  return {
    security: { ...security, users: [...security.users, user], updatedAt: createdAt },
    user: publicUser(user),
  };
}

function updateUser(rawSecurity, userId, input = {}, now = new Date()) {
  const security = normalizeSecurity(rawSecurity, now);
  const userIndex = security.users.findIndex((user) => user.id === String(userId || ""));
  if (userIndex < 0) throw new Error("Usuário não encontrado.");
  const current = security.users[userIndex];
  const nextRole = input.role === undefined ? current.role : input.role;
  const nextActive = input.active === undefined ? current.active : input.active !== false;
  if (!validRole(nextRole)) throw new Error("Cargo inválido.");
  const name = input.name === undefined ? current.name : cleanText(input.name, 120);
  if (name.length < 2) throw new Error("Informe o nome do usuário.");
  const activeGeneralCount = security.users.filter((user, index) => {
    if (index === userIndex) return nextActive && nextRole === ROLES.GENERAL_MANAGER;
    return user.active && user.role === ROLES.GENERAL_MANAGER;
  }).length;
  if (!activeGeneralCount) throw new Error("O sistema precisa manter pelo menos um responsável geral ativo.");
  const updatedAt = isoNow(now);
  const next = { ...current, name, role: nextRole, active: nextActive, updatedAt };
  const users = [...security.users];
  users[userIndex] = next;
  return { security: { ...security, users, updatedAt }, user: publicUser(next) };
}

function resetUserPassword(rawSecurity, userId, password, now = new Date()) {
  const security = normalizeSecurity(rawSecurity, now);
  const userIndex = security.users.findIndex((user) => user.id === String(userId || ""));
  if (userIndex < 0) throw new Error("Usuário não encontrado.");
  const updatedAt = isoNow(now);
  const users = [...security.users];
  users[userIndex] = {
    ...users[userIndex],
    ...passwordRecord(password),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt,
  };
  return { security: { ...security, users, updatedAt }, user: publicUser(users[userIndex]) };
}

function authenticate(rawSecurity, input = {}, now = new Date()) {
  const security = normalizeSecurity(rawSecurity, now);
  const login = normalizeLogin(input.login);
  const password = String(input.password || "");
  const userIndex = security.users.findIndex((user) => user.login === login);
  if (userIndex < 0 || !password) return { security, user: null, error: "Usuário ou senha inválidos." };
  const current = security.users[userIndex];
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!current.active) return { security, user: null, error: "Este usuário está inativo. Procure o responsável geral." };
  if (current.lockedUntil && new Date(current.lockedUntil) > nowDate) {
    return { security, user: null, error: `Acesso bloqueado até ${new Date(current.lockedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` };
  }
  const updatedAt = isoNow(nowDate);
  const users = [...security.users];
  if (!passwordMatches(current, password)) {
    const attempts = Math.min(MAX_FAILED_ATTEMPTS, Number(current.failedAttempts || 0) + 1);
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    users[userIndex] = {
      ...current,
      failedAttempts: locked ? 0 : attempts,
      lockedUntil: locked ? new Date(nowDate.getTime() + LOGIN_LOCK_MS).toISOString() : null,
      updatedAt,
    };
    return {
      security: { ...security, users, updatedAt },
      user: null,
      error: locked
        ? "Cinco tentativas incorretas. Este acesso foi bloqueado por 15 minutos."
        : "Usuário ou senha inválidos.",
    };
  }
  users[userIndex] = { ...current, failedAttempts: 0, lockedUntil: null, lastLoginAt: updatedAt, updatedAt };
  return { security: { ...security, users, updatedAt }, user: publicUser(users[userIndex]), error: "" };
}

module.exports = {
  LOGIN_LOCK_MS,
  MAX_FAILED_ATTEMPTS,
  PERMISSIONS,
  ROLE_DEFINITIONS,
  ROLES,
  SESSION_IDLE_MS,
  authenticate,
  createFirstAdmin,
  createUser,
  emptySecurity,
  hasPermission,
  normalizeSecurity,
  publicUser,
  resetUserPassword,
  roleLabel,
  updateUser,
};
