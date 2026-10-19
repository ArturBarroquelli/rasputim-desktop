const test = require("node:test");
const assert = require("node:assert/strict");
const { enrich, recordMovement, registerManualMaterial } = require("../core/procurement.cjs");

function baseStock() {
  return enrich({
    schemaVersion: 10,
    explicitStockSet: true,
    stock: [
      {
        code: "MAT-A",
        category: "FERRAGEM",
        material: "DOBRADIÇA",
        unit: "UN.",
        current: 5,
        balanceKnown: true,
        minimum: 10,
        minimumKnown: true,
      },
      {
        code: "MAT-B",
        category: "MATERIAL GERAL",
        material: "COLA",
        unit: "UN.",
        current: null,
        balanceKnown: false,
        minimum: 5,
        minimumKnown: true,
      },
    ],
    invoices: [],
    invoiceItems: [],
    movements: [],
    stockCounts: [],
    stockBackups: [],
    quotations: [],
    marketSearches: [],
    suppliers: [],
  });
}

function movement(materialCode, type, quantity) {
  return {
    materialCode,
    type,
    quantity,
    reason: "Atualização operacional",
    registeredBy: "Operador de teste",
  };
}

test("permite entradas e saídas consecutivas em materiais diferentes", () => {
  let state = baseStock();
  state = recordMovement(state, movement("MAT-A", "ENTRADA", 2));
  state = recordMovement(state, movement("MAT-B", "SAIDA", 3));
  state = recordMovement(state, movement("MAT-A", "SAIDA", 20));
  state = recordMovement(state, movement("MAT-B", "ENTRADA", 5));

  assert.equal(state.stock.find((item) => item.code === "MAT-A").current, -13);
  assert.equal(state.stock.find((item) => item.code === "MAT-B").current, 2);
  assert.equal(state.movements.length, 4);
  assert.equal(state.movements.some((item) => item.before === null && /iniciado em zero/i.test(item.warning)), true);
  assert.equal(state.movements.some((item) => item.after < 0 && /saldo negativo/i.test(item.warning)), true);
});

test("não bloqueia saída maior que o saldo e sinaliza compra urgente", () => {
  const state = recordMovement(baseStock(), movement("MAT-A", "SAIDA", 9));
  const material = state.stock.find((item) => item.code === "MAT-A");

  assert.equal(material.current, -4);
  assert.equal(material.status, "COMPRA URGENTE");
  assert.equal(material.buyNow, 14);
});

test("cadastra material manual com saldo inicial e o torna disponível para movimentação", () => {
  let state = registerManualMaterial(baseStock(), {
    material: "PARAFUSO 4 X 40",
    category: "FERRAGENS",
    unit: "UN.",
    current: 150,
    minimum: 50,
    storageLocation: "Armário A · Rua 001",
    registeredBy: "Responsável de estoque",
  });
  const material = state.stock.find((item) => item.material === "PARAFUSO 4 X 40");
  assert.ok(material);
  assert.equal(material.current, 150);
  assert.equal(material.minimum, 50);
  assert.equal(state.movements[0].type, "CADASTRO INICIAL");

  state = recordMovement(state, movement(material.code, "SAIDA", 20));
  assert.equal(state.stock.find((item) => item.code === material.code).current, 130);
  assert.throws(() => registerManualMaterial(state, {
    material: "PARAFUSO 4 X 40",
    category: "FERRAGENS",
    unit: "UN.",
    current: 1,
    minimum: 0,
    registeredBy: "Responsável de estoque",
  }), /já está cadastrado/i);
});

test("preserva solicitante e autorizador na auditoria da saída", () => {
  const state = recordMovement(baseStock(), {
    ...movement("MAT-A", "SAIDA", 2),
    requestedBy: "Produção",
    requestedById: "USR-PRODUCAO",
    authorizedBy: "Responsável Estoque",
    authorizedById: "USR-ESTOQUE",
    authorizationAt: "2026-09-03T10:00:00.000Z",
  });
  const audit = state.movements[0];

  assert.equal(audit.requestedBy, "Produção");
  assert.equal(audit.requestedById, "USR-PRODUCAO");
  assert.equal(audit.authorizedBy, "Responsável Estoque");
  assert.equal(audit.authorizedById, "USR-ESTOQUE");
  assert.equal(audit.authorizationAt, "2026-09-03T10:00:00.000Z");
});

test("não descarta movimentações antigas ao ultrapassar cinco mil registros", () => {
  const historical = Array.from({ length: 5001 }, (_, index) => ({
    id: `MOV-ANTIGA-${index}`,
    materialCode: "MAT-A",
    material: "DOBRADIÇA",
    unit: "UN.",
    type: "ENTRADA",
    quantity: 1,
    before: index,
    after: index + 1,
    reason: "Histórico",
    registeredBy: "Sistema",
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const state = recordMovement({ ...baseStock(), movements: historical }, movement("MAT-A", "ENTRADA", 1));

  assert.equal(state.movements.length, 5002);
});
