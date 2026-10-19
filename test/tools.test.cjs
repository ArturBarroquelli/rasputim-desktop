const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TOOL_STATUSES,
  addTool,
  checkoutTool,
  emptyTools,
  removeTool,
  returnTool,
  setToolStatus,
  toolSummary,
} = require("../core/tools.cjs");

const manager = { id: "USR-1", name: "José Emerson" };
const operator = { id: "USR-2", name: "Maria da Produção" };
const start = new Date("2026-10-13T10:00:00.000Z");

test("cadastra ferramenta e mantém seu controle separado do estoque de materiais", () => {
  const tools = addTool(emptyTools(start), {
    name: "Parafusadeira Bosch 18V",
    category: "PARAFUSADEIRAS",
    assetTag: "PAT-001",
    location: "Armário A / Rua 001",
  }, manager, start);

  assert.equal(tools.items.length, 1);
  assert.equal(tools.items[0].status, TOOL_STATUSES.AVAILABLE);
  assert.equal(tools.items[0].category, "PARAFUSADEIRAS");
  assert.equal(toolSummary(tools).available, 1);
  const sameTagDifferentTool = addTool(tools, {
    name: "Furadeira Makita 12V",
    category: "FURADEIRAS",
    assetTag: "pat-001",
    brandModel: "Makita FD330D",
  }, manager, start);
  assert.equal(sameTagDifferentTool.items.length, 2);
  assert.throws(() => addTool(sameTagDifferentTool, {
    name: "Furadeira Makita 12V",
    category: "FURADEIRAS",
    assetTag: "PAT-001",
    brandModel: "Makita FD330D",
  }, manager, start), /este mesmo cadastro já existe/i);
  assert.throws(() => addTool(tools, {
    name: "Parafusadeira Bosch 18V",
    category: "PARAFUSADEIRAS",
    assetTag: "pat-001",
  }, manager, start), /este mesmo cadastro já existe/i);
});

test("retirada exige autorização, impede retirada duplicada e registra devolução", () => {
  let tools = addTool(emptyTools(start), {
    name: "Tupia manual",
    category: "TUPIAS",
    assetTag: "PAT-020",
  }, manager, start);
  const tool = tools.items[0];

  tools = checkoutTool(tools, { toolId: tool.id, purpose: "Usinagem da obra Silva" }, operator, manager, start);
  assert.equal(tools.items[0].status, TOOL_STATUSES.IN_USE);
  assert.equal(tools.history[0].requestedBy, "Maria da Produção");
  assert.equal(tools.history[0].authorizedBy, "José Emerson");
  assert.equal(tools.history[0].returnedAt, null);
  assert.throws(() => checkoutTool(tools, { toolId: tool.id }, operator, manager, start), /não está disponível/i);

  const returnedAt = new Date("2026-10-13T13:30:00.000Z");
  tools = returnTool(tools, { toolId: tool.id, returnNote: "Conferida e guardada." }, operator, returnedAt);
  assert.equal(tools.items[0].status, TOOL_STATUSES.AVAILABLE);
  assert.equal(tools.history[0].returnedBy, "Maria da Produção");
  assert.equal(tools.history[0].returnedAt, returnedAt.toISOString());
});

test("funcionário que retirou pode ser diferente de quem registrou a saída", () => {
  let tools = addTool(emptyTools(start), { name: "Furadeira de bancada", category: "FURADEIRAS", assetTag: "PAT-030" }, manager, start);
  const tool = tools.items[0];
  tools = checkoutTool(tools, {
    toolId: tool.id,
    requestedBy: "João da Usinagem",
    requestedById: "USR-3",
    purpose: "Furação da obra Lima",
  }, operator, manager, start);
  assert.equal(tools.history[0].requestedBy, "João da Usinagem");
  assert.equal(tools.history[0].requestedById, "USR-3");
  assert.equal(tools.history[0].registeredBy, "Maria da Produção");
  assert.equal(tools.history[0].authorizedBy, "José Emerson");
});

test("uma ferramenta em uso não pode ir para manutenção antes da devolução", () => {
  let tools = addTool(emptyTools(start), { name: "Lixadeira orbital", category: "LIXADEIRAS" }, manager, start);
  const tool = tools.items[0];
  tools = checkoutTool(tools, { toolId: tool.id }, operator, manager, start);
  assert.throws(() => setToolStatus(tools, tool.id, { status: "MANUTENCAO" }, manager, start), /devolva/i);
  tools = returnTool(tools, { toolId: tool.id }, operator, start);
  tools = setToolStatus(tools, tool.id, { status: "MANUTENCAO" }, manager, start);
  assert.equal(tools.items[0].status, TOOL_STATUSES.MAINTENANCE);
});

test("remove cadastro sem uso e preserva histórico de ferramenta utilizada", () => {
  let tools = addTool(emptyTools(start), { name: "Soprador para teste", category: "SOPRADORES", assetTag: "TESTE-01" }, manager, start);
  const tool = tools.items[0];
  tools = removeTool(tools, tool.id, start);
  assert.equal(tools.items.length, 0);
  tools = addTool(tools, { name: "Furadeira com histórico", category: "FURADEIRAS", assetTag: "TESTE-02" }, manager, start);
  const used = tools.items[0];
  tools = checkoutTool(tools, { toolId: used.id }, operator, manager, start);
  assert.throws(() => removeTool(tools, used.id, start), /devolução/i);
  tools = returnTool(tools, { toolId: used.id }, operator, start);
  assert.throws(() => removeTool(tools, used.id, start), /histórico/i);
});
