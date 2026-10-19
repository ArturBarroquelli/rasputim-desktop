const crypto = require("node:crypto");

const PCP_STAGES = Object.freeze([
  Object.freeze({ key: "BUDGET", label: "Orçamento", shortLabel: "Orçamento" }),
  Object.freeze({ key: "TECHNICAL", label: "Lista de compra + caderno técnico", shortLabel: "Lista + caderno" }),
  Object.freeze({ key: "MACHINING", label: "Usinagem", shortLabel: "Usinagem" }),
  Object.freeze({ key: "ASSEMBLY", label: "Montagem", shortLabel: "Montagem" }),
  Object.freeze({ key: "DISPATCH", label: "Expedição", shortLabel: "Expedição" }),
  Object.freeze({ key: "DELIVERY", label: "Entrega", shortLabel: "Entrega" }),
  Object.freeze({ key: "INSTALLATION", label: "Instalação", shortLabel: "Instalação" }),
  Object.freeze({ key: "COMPLETED", label: "Concluído", shortLabel: "Concluído" }),
]);

const PCP_STAGE_KEYS = new Set(PCP_STAGES.map((stage) => stage.key));
const PCP_PRIORITIES = new Set(["NORMAL", "ALTA", "URGENTE"]);
const PCP_STATUSES = new Set(["ACTIVE", "BLOCKED", "COMPLETED", "ARCHIVED"]);

function clone(value) {
  return structuredClone(value);
}

function isoNow(options = {}) {
  const source = typeof options.now === "function" ? options.now() : options.now;
  const date = source ? new Date(source) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Data de operação inválida.");
  return date.toISOString();
}

function newId(prefix, options = {}) {
  const id = typeof options.idGenerator === "function" ? options.idGenerator() : crypto.randomUUID();
  return `${prefix}-${String(id).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80)}`;
}

function cleanText(value, label, maximum, required = false) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (required && cleaned.length < 2) throw new Error(`${label} deve ter pelo menos 2 caracteres.`);
  if (cleaned.length > maximum) throw new Error(`${label} deve ter no máximo ${maximum} caracteres.`);
  return cleaned;
}

function cleanMultiline(value, label, maximum) {
  const cleaned = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length > maximum) throw new Error(`${label} deve ter no máximo ${maximum} caracteres.`);
  return cleaned;
}

function cleanDate(value, required = false) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    if (required) throw new Error("Informe o prazo de entrega da obra.");
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) throw new Error("O prazo deve estar no formato AAAA-MM-DD.");
  const [year, month, day] = cleaned.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Informe um prazo de entrega válido.");
  }
  return cleaned;
}

function stageIndex(stageKey) {
  return PCP_STAGES.findIndex((stage) => stage.key === stageKey);
}

function assertStage(stageKey) {
  const key = String(stageKey || "").toUpperCase();
  if (!PCP_STAGE_KEYS.has(key)) throw new Error("Etapa do PCP inválida.");
  return key;
}

function cleanPriority(value) {
  const priority = String(value || "NORMAL").toUpperCase();
  if (!PCP_PRIORITIES.has(priority)) throw new Error("Prioridade do PCP inválida.");
  return priority;
}

function emptyPcp(options = {}) {
  const now = isoNow(options);
  return {
    schemaVersion: 1,
    revision: 0,
    nextSequence: 1,
    createdAt: now,
    updatedAt: now,
    projects: [],
  };
}

function normalizeStageRecords(records, currentStage, status, createdAt, completedAt) {
  const byStage = new Map((Array.isArray(records) ? records : []).map((record) => [record?.stage, record]));
  const currentIndex = stageIndex(currentStage);
  return PCP_STAGES.map((stage, index) => {
    const stored = byStage.get(stage.key) || {};
    let stageStatus = String(stored.status || "").toUpperCase();
    if (!["PENDING", "IN_PROGRESS", "COMPLETED"].includes(stageStatus)) {
      stageStatus = index < currentIndex ? "COMPLETED" : index === currentIndex ? "IN_PROGRESS" : "PENDING";
    }
    if (status === "COMPLETED" && index <= currentIndex) stageStatus = "COMPLETED";
    return {
      stage: stage.key,
      status: stageStatus,
      startedAt: stored.startedAt || (index === 0 ? createdAt : null),
      completedAt: stored.completedAt || (status === "COMPLETED" && index === currentIndex ? completedAt : null),
      responsible: cleanText(stored.responsible, "Responsável da etapa", 100),
      note: cleanMultiline(stored.note, "Observação da etapa", 1000),
    };
  });
}

function normalizeProject(project = {}) {
  const createdAt = project.createdAt && !Number.isNaN(new Date(project.createdAt).getTime())
    ? new Date(project.createdAt).toISOString()
    : new Date().toISOString();
  const currentStage = PCP_STAGE_KEYS.has(project.currentStage) ? project.currentStage : "BUDGET";
  let status = PCP_STATUSES.has(project.status) ? project.status : "ACTIVE";
  if (currentStage === "COMPLETED" && status === "ACTIVE") status = "COMPLETED";
  return {
    id: cleanText(project.id, "Identificador", 120) || `PCP-${crypto.randomUUID()}`,
    code: cleanText(project.code, "Código", 30) || "PCP-0000",
    client: cleanText(project.client, "Cliente", 160),
    name: cleanText(project.name, "Nome da obra", 180),
    dueDate: cleanDate(project.dueDate),
    responsible: cleanText(project.responsible, "Responsável", 100),
    priority: PCP_PRIORITIES.has(project.priority) ? project.priority : "NORMAL",
    currentStage,
    status,
    blockedReason: cleanMultiline(project.blockedReason, "Motivo do bloqueio", 500),
    notes: cleanMultiline(project.notes, "Observações", 3000),
    sourceProjectId: cleanText(project.sourceProjectId, "Projeto vinculado", 120),
    stageRecords: normalizeStageRecords(project.stageRecords, currentStage, status, createdAt, project.completedAt),
    history: Array.isArray(project.history) ? project.history.slice(0, 1000).map((event) => ({
      id: cleanText(event?.id, "Evento", 120) || `EVT-${crypto.randomUUID()}`,
      type: cleanText(event?.type, "Tipo", 40) || "IMPORTED",
      fromStage: PCP_STAGE_KEYS.has(event?.fromStage) ? event.fromStage : null,
      toStage: PCP_STAGE_KEYS.has(event?.toStage) ? event.toStage : null,
      user: cleanText(event?.user, "Usuário", 100),
      note: cleanMultiline(event?.note, "Observação", 1000),
      changedFields: Array.isArray(event?.changedFields) ? event.changedFields.map(String).slice(0, 20) : [],
      createdAt: event?.createdAt && !Number.isNaN(new Date(event.createdAt).getTime())
        ? new Date(event.createdAt).toISOString()
        : createdAt,
    })) : [],
    createdAt,
    updatedAt: project.updatedAt && !Number.isNaN(new Date(project.updatedAt).getTime())
      ? new Date(project.updatedAt).toISOString()
      : createdAt,
    completedAt: project.completedAt && !Number.isNaN(new Date(project.completedAt).getTime())
      ? new Date(project.completedAt).toISOString()
      : null,
    archivedAt: project.archivedAt && !Number.isNaN(new Date(project.archivedAt).getTime())
      ? new Date(project.archivedAt).toISOString()
      : null,
  };
}

function normalizePcp(raw, options = {}) {
  if (!raw || typeof raw !== "object") return emptyPcp(options);
  const fallback = emptyPcp(options);
  const projects = Array.isArray(raw.projects) ? raw.projects.map(normalizeProject) : [];
  const highestSequence = projects.reduce((highest, project) => {
    const match = /^PCP-(\d+)$/.exec(project.code);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return {
    schemaVersion: 1,
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    nextSequence: Math.max(Number(raw.nextSequence) || 1, highestSequence + 1),
    createdAt: raw.createdAt && !Number.isNaN(new Date(raw.createdAt).getTime())
      ? new Date(raw.createdAt).toISOString()
      : fallback.createdAt,
    updatedAt: raw.updatedAt && !Number.isNaN(new Date(raw.updatedAt).getTime())
      ? new Date(raw.updatedAt).toISOString()
      : fallback.updatedAt,
    projects,
  };
}

function event(type, user, note, options = {}, extra = {}) {
  return {
    id: newId("EVT", options),
    type,
    fromStage: extra.fromStage || null,
    toStage: extra.toStage || null,
    user: cleanText(user, "Responsável pela operação", 100),
    note: cleanMultiline(note, "Observação", 1000),
    changedFields: Array.isArray(extra.changedFields) ? extra.changedFields : [],
    createdAt: isoNow(options),
  };
}

function finishMutation(pcp, now) {
  pcp.revision = Number(pcp.revision || 0) + 1;
  pcp.updatedAt = now;
  return pcp;
}

function createPcpProject(rawPcp, input = {}, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const now = isoNow(options);
  const sequence = pcp.nextSequence;
  const responsible = cleanText(input.responsible, "Responsável", 100, true);
  const project = {
    id: newId("PCP", options),
    code: `PCP-${String(sequence).padStart(4, "0")}`,
    client: cleanText(input.client, "Cliente", 160, true),
    name: cleanText(input.name, "Nome da obra", 180, true),
    dueDate: cleanDate(input.dueDate, true),
    responsible,
    priority: cleanPriority(input.priority),
    currentStage: "BUDGET",
    status: "ACTIVE",
    blockedReason: "",
    notes: cleanMultiline(input.notes, "Observações", 3000),
    sourceProjectId: cleanText(input.sourceProjectId, "Projeto vinculado", 120),
    stageRecords: PCP_STAGES.map((stage, index) => ({
      stage: stage.key,
      status: index === 0 ? "IN_PROGRESS" : "PENDING",
      startedAt: index === 0 ? now : null,
      completedAt: null,
      responsible: index === 0 ? responsible : "",
      note: "",
    })),
    history: [event("CREATED", responsible, input.historyNote || "Obra cadastrada no PCP.", { ...options, now }, { toStage: "BUDGET" })],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
  };
  pcp.projects.push(project);
  pcp.nextSequence = sequence + 1;
  return finishMutation(pcp, now);
}

function findEditableProject(pcp, projectId) {
  const project = pcp.projects.find((item) => item.id === String(projectId || ""));
  if (!project) throw new Error("Obra não encontrada no PCP.");
  if (project.status === "ARCHIVED") throw new Error("Esta obra está arquivada e não pode ser alterada.");
  return project;
}

function updatePcpProject(rawPcp, projectId, input = {}, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const project = findEditableProject(pcp, projectId);
  const now = isoNow(options);
  const updates = {
    client: cleanText(input.client ?? project.client, "Cliente", 160, true),
    name: cleanText(input.name ?? project.name, "Nome da obra", 180, true),
    dueDate: cleanDate(input.dueDate ?? project.dueDate, true),
    responsible: cleanText(input.responsible ?? project.responsible, "Responsável", 100, true),
    priority: cleanPriority(input.priority ?? project.priority),
    notes: cleanMultiline(input.notes ?? project.notes, "Observações", 3000),
    sourceProjectId: cleanText(input.sourceProjectId ?? project.sourceProjectId, "Projeto vinculado", 120),
  };
  const changedFields = Object.keys(updates).filter((key) => updates[key] !== project[key]);
  if (!changedFields.length) return pcp;
  Object.assign(project, updates, { updatedAt: now });
  project.history.unshift(event(
    "UPDATED",
    input.user || updates.responsible,
    input.historyNote || "Cadastro da obra atualizado.",
    { ...options, now },
    { fromStage: project.currentStage, toStage: project.currentStage, changedFields },
  ));
  return finishMutation(pcp, now);
}

function transitionPcpProject(rawPcp, projectId, input = {}, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const project = findEditableProject(pcp, projectId);
  if (project.status === "BLOCKED") throw new Error("Desbloqueie a obra antes de mudar sua etapa.");
  const fromStage = assertStage(project.currentStage);
  const fromIndex = stageIndex(fromStage);
  let targetIndex;
  if (input.direction === "NEXT") targetIndex = fromIndex + 1;
  else if (input.direction === "PREVIOUS") targetIndex = fromIndex - 1;
  else targetIndex = stageIndex(assertStage(input.toStage));
  if (targetIndex < 0 || targetIndex >= PCP_STAGES.length) throw new Error("Esta obra já está no limite do fluxo do PCP.");
  if (Math.abs(targetIndex - fromIndex) !== 1) throw new Error("A obra só pode avançar ou voltar uma etapa por vez.");

  const now = isoNow(options);
  const user = cleanText(input.user || project.responsible, "Responsável pela movimentação", 100, true);
  const note = cleanMultiline(input.note, "Observação da movimentação", 1000);
  const toStage = PCP_STAGES[targetIndex].key;
  const movingForward = targetIndex > fromIndex;

  if (movingForward) {
    const currentRecord = project.stageRecords[fromIndex];
    currentRecord.status = "COMPLETED";
    currentRecord.completedAt = now;
    currentRecord.responsible = user;
    if (note) currentRecord.note = note;
    const targetRecord = project.stageRecords[targetIndex];
    targetRecord.status = toStage === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
    targetRecord.startedAt ||= now;
    targetRecord.completedAt = toStage === "COMPLETED" ? now : null;
    targetRecord.responsible = user;
  } else {
    for (let index = targetIndex + 1; index < PCP_STAGES.length; index += 1) {
      const record = project.stageRecords[index];
      record.status = "PENDING";
      record.startedAt = null;
      record.completedAt = null;
      record.responsible = "";
      record.note = "";
    }
    const targetRecord = project.stageRecords[targetIndex];
    targetRecord.status = "IN_PROGRESS";
    targetRecord.startedAt ||= now;
    targetRecord.completedAt = null;
    targetRecord.responsible = user;
    if (note) targetRecord.note = note;
  }

  project.currentStage = toStage;
  project.status = toStage === "COMPLETED" ? "COMPLETED" : "ACTIVE";
  project.completedAt = toStage === "COMPLETED" ? now : null;
  project.updatedAt = now;
  project.history.unshift(event(
    movingForward ? "ADVANCED" : "RETURNED",
    user,
    note || (movingForward ? "Obra avançada para a próxima etapa." : "Obra devolvida para a etapa anterior."),
    { ...options, now },
    { fromStage, toStage },
  ));
  return finishMutation(pcp, now);
}

function setPcpBlocked(rawPcp, projectId, input = {}, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const project = findEditableProject(pcp, projectId);
  if (project.status === "COMPLETED") throw new Error("Uma obra concluída não pode ser bloqueada.");
  const blocked = Boolean(input.blocked);
  const reason = blocked
    ? cleanMultiline(input.reason, "Motivo do bloqueio", 500)
    : "";
  if (blocked && reason.length < 3) throw new Error("Informe o motivo do bloqueio.");
  if ((project.status === "BLOCKED") === blocked && project.blockedReason === reason) return pcp;
  const now = isoNow(options);
  const user = cleanText(input.user || project.responsible, "Responsável pela operação", 100, true);
  project.status = blocked ? "BLOCKED" : "ACTIVE";
  project.blockedReason = reason;
  project.updatedAt = now;
  project.history.unshift(event(
    blocked ? "BLOCKED" : "UNBLOCKED",
    user,
    blocked ? reason : (input.note || "Obra desbloqueada."),
    { ...options, now },
    { fromStage: project.currentStage, toStage: project.currentStage },
  ));
  return finishMutation(pcp, now);
}

function archivePcpProject(rawPcp, projectId, input = {}, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const project = findEditableProject(pcp, projectId);
  const now = isoNow(options);
  const user = cleanText(input.user || project.responsible, "Responsável pelo arquivamento", 100, true);
  project.status = "ARCHIVED";
  project.archivedAt = now;
  project.updatedAt = now;
  project.history.unshift(event(
    "ARCHIVED",
    user,
    input.note || "Obra arquivada no PCP.",
    { ...options, now },
    { fromStage: project.currentStage, toStage: project.currentStage },
  ));
  return finishMutation(pcp, now);
}

function daysBetweenDate(dateText, todayText) {
  const target = new Date(`${dateText}T12:00:00Z`);
  const today = new Date(`${todayText}T12:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function enrichPcp(rawPcp, options = {}) {
  const pcp = normalizePcp(rawPcp, options);
  const now = isoNow(options);
  const today = now.slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const byStage = Object.fromEntries(PCP_STAGES.map((stage) => [stage.key, 0]));
  const projects = pcp.projects.map((project) => {
    const index = stageIndex(project.currentStage);
    const daysUntilDue = project.dueDate ? daysBetweenDate(project.dueDate, today) : null;
    const isLate = project.status !== "COMPLETED" && project.status !== "ARCHIVED" && daysUntilDue !== null && daysUntilDue < 0;
    const isCritical = project.status !== "COMPLETED" && project.status !== "ARCHIVED"
      && (isLate || project.priority === "URGENTE" || (daysUntilDue !== null && daysUntilDue <= 7));
    if (project.status !== "ARCHIVED") byStage[project.currentStage] += 1;
    return {
      ...project,
      stageIndex: index,
      stageLabel: PCP_STAGES[index]?.label || "Etapa desconhecida",
      progress: project.currentStage === "COMPLETED" ? 100 : Math.round((index / (PCP_STAGES.length - 1)) * 100),
      daysUntilDue,
      isLate,
      isCritical,
    };
  });
  const visible = projects.filter((project) => project.status !== "ARCHIVED");
  return {
    ...pcp,
    stages: PCP_STAGES,
    projects: projects.sort((a, b) => {
      if (a.status === "BLOCKED" && b.status !== "BLOCKED") return -1;
      if (a.status !== "BLOCKED" && b.status === "BLOCKED") return 1;
      return String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31"));
    }),
    summary: {
      total: visible.length,
      active: visible.filter((project) => !["COMPLETED", "ARCHIVED"].includes(project.status)).length,
      completed: visible.filter((project) => project.status === "COMPLETED").length,
      blocked: visible.filter((project) => project.status === "BLOCKED").length,
      critical: visible.filter((project) => project.isCritical).length,
      late: visible.filter((project) => project.isLate).length,
      deliveriesThisMonth: visible.filter((project) => project.dueDate?.startsWith(currentMonth)).length,
      byStage,
    },
  };
}

module.exports = {
  PCP_PRIORITIES,
  PCP_STAGES,
  archivePcpProject,
  createPcpProject,
  emptyPcp,
  enrichPcp,
  normalizePcp,
  setPcpBlocked,
  transitionPcpProject,
  updatePcpProject,
};
