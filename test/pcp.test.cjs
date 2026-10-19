const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  PCP_STAGES,
  archivePcpProject,
  createPcpProject,
  emptyPcp,
  enrichPcp,
  setPcpBlocked,
  transitionPcpProject,
  updatePcpProject,
} = require("../core/pcp.cjs");
const { createPcpStore } = require("../core/pcp-store.cjs");

function options(now = "2026-08-18T12:00:00.000Z") {
  let sequence = 0;
  return { now, idGenerator: () => `TEST-${++sequence}` };
}

function newProject(now = "2026-08-18T12:00:00.000Z") {
  const operationOptions = options(now);
  return createPcpProject(emptyPcp(operationOptions), {
    client: "Cliente Industrial",
    name: "Obra Sede Administrativa",
    dueDate: "2026-09-20",
    responsible: "Carlos",
    priority: "ALTA",
    notes: "Entrega completa de uma vez.",
  }, operationOptions);
}

test("PCP possui as oito etapas aprovadas na ordem correta", () => {
  assert.deepEqual(PCP_STAGES.map((stage) => stage.label), [
    "Orçamento",
    "Lista de compra + caderno técnico",
    "Usinagem",
    "Montagem",
    "Expedição",
    "Entrega",
    "Instalação",
    "Concluído",
  ]);
});

test("cadastra a obra inteira no orçamento com código sequencial e auditoria", () => {
  const pcp = newProject();
  assert.equal(pcp.revision, 1);
  assert.equal(pcp.nextSequence, 2);
  assert.equal(pcp.projects[0].code, "PCP-0001");
  assert.equal(pcp.projects[0].currentStage, "BUDGET");
  assert.equal(pcp.projects[0].stageRecords[0].status, "IN_PROGRESS");
  assert.equal(pcp.projects[0].stageRecords[1].status, "PENDING");
  assert.equal(pcp.projects[0].history[0].type, "CREATED");
});

test("avança somente uma etapa por vez e conclui a obra como um único bloco", () => {
  let pcp = newProject();
  const projectId = pcp.projects[0].id;
  assert.throws(() => transitionPcpProject(pcp, projectId, {
    toStage: "ASSEMBLY",
    user: "Carlos",
  }), /uma etapa por vez/i);

  for (let index = 1; index < PCP_STAGES.length; index += 1) {
    pcp = transitionPcpProject(pcp, projectId, {
      direction: "NEXT",
      user: "Carlos",
      note: `Etapa ${index} liberada`,
    }, options(`2026-08-${String(18 + index).padStart(2, "0")}T12:00:00.000Z`));
  }
  const project = pcp.projects[0];
  assert.equal(project.currentStage, "COMPLETED");
  assert.equal(project.status, "COMPLETED");
  assert.ok(project.completedAt);
  assert.equal(project.stageRecords.every((record) => record.status === "COMPLETED"), true);
  assert.equal(project.history.filter((entry) => entry.type === "ADVANCED").length, 7);
});

test("bloqueio exige motivo e impede movimentação até o desbloqueio", () => {
  let pcp = newProject();
  const id = pcp.projects[0].id;
  assert.throws(() => setPcpBlocked(pcp, id, { blocked: true, user: "Ana", reason: "" }), /motivo/i);
  pcp = setPcpBlocked(pcp, id, { blocked: true, user: "Ana", reason: "Aguardando ferragens" }, options());
  assert.equal(pcp.projects[0].status, "BLOCKED");
  assert.throws(() => transitionPcpProject(pcp, id, { direction: "NEXT", user: "Ana" }), /desbloqueie/i);
  pcp = setPcpBlocked(pcp, id, { blocked: false, user: "Ana" }, options("2026-08-19T12:00:00.000Z"));
  pcp = transitionPcpProject(pcp, id, { direction: "NEXT", user: "Ana" }, options("2026-08-20T12:00:00.000Z"));
  assert.equal(pcp.projects[0].currentStage, "TECHNICAL");
});

test("edição registra campos alterados e arquivamento retira a obra dos indicadores", () => {
  let pcp = newProject();
  const id = pcp.projects[0].id;
  pcp = updatePcpProject(pcp, id, {
    client: "Cliente Industrial",
    name: "Obra Sede Administrativa - Bloco A",
    dueDate: "2026-09-25",
    responsible: "Carlos",
    priority: "URGENTE",
    notes: "Entrega completa de uma vez.",
    user: "Carlos",
  }, options());
  assert.deepEqual(pcp.projects[0].history[0].changedFields.sort(), ["dueDate", "name", "priority"]);
  pcp = archivePcpProject(pcp, id, { user: "Carlos", note: "Contrato cancelado" }, options("2026-08-20T12:00:00.000Z"));
  const enriched = enrichPcp(pcp, options("2026-08-21T12:00:00.000Z"));
  assert.equal(enriched.projects[0].status, "ARCHIVED");
  assert.equal(enriched.summary.total, 0);
});

test("indicadores identificam atraso, bloqueio e entregas do mês", () => {
  let pcp = createPcpProject(emptyPcp(options()), {
    client: "Cliente A",
    name: "Obra atrasada",
    dueDate: "2026-08-10",
    responsible: "João",
    priority: "NORMAL",
  }, options());
  const id = pcp.projects[0].id;
  pcp = setPcpBlocked(pcp, id, { blocked: true, reason: "Material em falta", user: "João" }, options());
  const enriched = enrichPcp(pcp, options());
  assert.equal(enriched.summary.active, 1);
  assert.equal(enriched.summary.late, 1);
  assert.equal(enriched.summary.critical, 1);
  assert.equal(enriched.summary.blocked, 1);
  assert.equal(enriched.summary.deliveriesThisMonth, 1);
});

test("duas estações leem e escrevem a mesma base compartilhada", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-pcp-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const shared = path.join(root, "rede");
  fs.mkdirSync(shared);
  const storeA = createPcpStore({ userDataPath: path.join(root, "pc-a"), hostname: "PC-A" });
  const storeB = createPcpStore({ userDataPath: path.join(root, "pc-b"), hostname: "PC-B" });

  storeA.configureShared(shared, "ORÇAMENTO");
  storeA.mutate((current) => createPcpProject(current, {
    client: "Cliente Rede",
    name: "Obra Compartilhada",
    dueDate: "2026-10-01",
    responsible: "Maria",
  }, options()));
  storeB.configureShared(shared, "PRODUÇÃO");
  assert.equal(storeB.read().projects.length, 1);
  assert.equal(storeB.status().mode, "SHARED");
  assert.equal(storeB.status().connected, true);

  const id = storeB.read().projects[0].id;
  storeB.mutate((current) => transitionPcpProject(current, id, {
    direction: "NEXT",
    user: "José",
  }, options("2026-08-19T12:00:00.000Z")));
  const refreshed = storeA.refresh();
  assert.equal(refreshed.changed, true);
  assert.equal(refreshed.data.projects[0].currentStage, "TECHNICAL");
});
