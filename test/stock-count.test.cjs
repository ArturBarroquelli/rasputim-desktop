const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyStockImport,
  buildStockImportPreview,
  parseStockNumber,
  parseStockRows,
} = require("../core/procurement.cjs");

function baseState() {
  return {
    schemaVersion: 8,
    settings: { location: "Maringá/PR", marketRadiusKm: 100 },
    stock: [
      {
        code: "MAT-001",
        category: "Parafusos",
        material: "PARAFUSO- 4X16",
        unit: "UN.",
        sourcePresentation: "CX-1000",
        unitsPerPackage: 1000,
        sourceBalance: 5,
        current: 5000,
        balanceKnown: true,
        minimum: 100,
      },
      {
        code: "MAT-002",
        category: "Material geral",
        material: "FITA CREPE",
        unit: "UN.",
        sourcePresentation: "UN.",
        unitsPerPackage: 1,
        sourceBalance: 10,
        current: 10,
        balanceKnown: true,
        minimum: 100,
      },
      {
        code: "MAT-033",
        category: "MDF 18 MM",
        material: "CHAPA MDF BRANCO BERNECK 18 MM",
        unit: "CHAPA",
        sourcePresentation: "CHAPA",
        unitsPerPackage: 1,
        sourceBalance: 20,
        current: 20,
        balanceKnown: true,
        minimum: 20,
      },
    ],
    invoiceItems: [],
    invoices: [],
    movements: [],
    stockCounts: [],
    quotations: [],
    marketSearches: [],
    suppliers: [],
  };
}

function stockRow(presentation, material, current) {
  const row = Array(15).fill(null);
  row[0] = new Date("2026-08-10T12:00:00.000Z");
  row[1] = presentation;
  row[3] = material;
  row[9] = current;
  return row;
}

function planosulRows() {
  const header = Array(15).fill(null);
  header[0] = "DATA";
  header[1] = "QUANTIDADE";
  header[3] = "MATERIAIS DIA A DIA GERAL";
  header[9] = "ESTOQUE ATUAL";
  header[12] = "UNIDADE";
  header[13] = "ESTOQUE IDEAL";
  header[14] = "COMPRAR";
  return [
    [null, null, "LISTA DE COMPRAS GERAL"],
    [],
    [null, null, null, "AGOSTO"],
    header,
    stockRow("CX-1000", "PARAFUSO- 4X16", 7),
    stockRow("UN.", "FITA CREPE", -3),
    stockRow("UN.", "COLA BRANCA", 2),
    stockRow("UN.", "COLA BRANCA", 3),
    stockRow("PACOTE", "ESTOPA", null),
  ];
}

test("leitor escolhe material D, saldo J e embalagem B pelo conteúdo real", () => {
  const parsed = parseStockRows(planosulRows(), { sheetName: "Planilha1" });
  assert.equal(parsed.columns.material.column, "D");
  assert.equal(parsed.columns.current.column, "J");
  assert.equal(parsed.columns.unit.column, "B");
  assert.equal(parsed.headerRow, 4);

  const parafuso = parsed.stock.find((item) => item.material === "PARAFUSO- 4X16");
  const cola = parsed.stock.find((item) => item.material === "COLA BRANCA");
  assert.equal(parafuso.sourceBalance, 7);
  assert.equal(parafuso.unitsPerPackage, 1000);
  assert.equal(parafuso.current, 7000);
  assert.equal(cola.current, 5);
  assert.deepEqual(cola.sourceRows, [7, 8]);
});

test("prévia não altera o estado e informa mudanças, novos, pendentes e preservados", () => {
  const parsed = {
    ...parseStockRows(planosulRows(), { sheetName: "Planilha1" }),
    fileName: "LEVANTAMENTO-AGOSTO.xlsx",
    fileType: "XLSX",
    fileHash: "hash-agosto",
    sheetNames: ["Planilha1"],
  };
  const current = baseState();
  const preview = buildStockImportPreview(parsed, current);

  assert.equal(current.stock.find((item) => item.code === "MAT-001").current, 5000);
  assert.equal(preview.totals.validItems, 4);
  assert.equal(preview.totals.changedItems, 1);
  assert.equal(preview.totals.newItems, 2);
  assert.equal(preview.totals.pendingItems, 2);
  assert.equal(preview.totals.preservedItems, 1);
  assert.ok(preview.warnings.some((warning) => /VERIFICAR NO ESTOQUE/.test(warning)));
});

test("aplicação preserva ausentes, atualiza saldos e grava responsável e histórico", () => {
  const parsed = {
    ...parseStockRows(planosulRows(), { sheetName: "Planilha1" }),
    fileName: "LEVANTAMENTO-AGOSTO.xlsx",
    fileType: "XLSX",
    fileHash: "hash-aplicacao",
    sheetNames: ["Planilha1"],
  };
  const preview = buildStockImportPreview(parsed, baseState());
  const updated = applyStockImport(baseState(), preview, "Artur Barroquelli");

  assert.equal(updated.stock.find((item) => item.code === "MAT-001").current, 7000);
  assert.equal(updated.stock.find((item) => item.code === "MAT-002").current, null);
  assert.equal(updated.stock.find((item) => item.code === "MAT-033").current, 20);
  assert.equal(updated.stock.find((item) => item.material === "COLA BRANCA").current, 5);
  assert.equal(updated.stock.find((item) => item.material === "ESTOPA").status, "VERIFICAR NO ESTOQUE");
  assert.equal(updated.stockCounts.length, 1);
  assert.equal(updated.stockCounts[0].registeredBy, "Artur Barroquelli");
  assert.equal(updated.stockCounts[0].fileName, "LEVANTAMENTO-AGOSTO.xlsx");
  assert.equal(updated.stockCounts[0].totals.preservedItems, 1);
  assert.ok(updated.movements.some((movement) => movement.type === "CONTAGEM PENDENTE"));
});

test("mesmo arquivo não pode ser aplicado duas vezes", () => {
  const parsed = {
    ...parseStockRows(planosulRows(), { sheetName: "Planilha1" }),
    fileName: "LEVANTAMENTO-AGOSTO.xlsx",
    fileType: "XLSX",
    fileHash: "hash-duplicado",
    sheetNames: ["Planilha1"],
  };
  const firstPreview = buildStockImportPreview(parsed, baseState());
  const once = applyStockImport(baseState(), firstPreview, "Artur");
  const duplicatePreview = buildStockImportPreview(parsed, once);
  assert.ok(duplicatePreview.duplicate);
  assert.throws(() => applyStockImport(once, duplicatePreview, "Artur"), /já foi aplicado/);
});

test("variação simples de singular e plural não cria material duplicado", () => {
  const current = baseState();
  current.stock.push({
    code: "MAT-040",
    material: "VB 36 DOIS FUROS",
    category: "Material geral",
    unit: "UN.",
    sourcePresentation: "UN.",
    unitsPerPackage: 1,
    current: 4,
    balanceKnown: true,
    minimum: 100,
  });
  const parsed = {
    sheetName: "Estoque",
    headerRow: 1,
    columns: {},
    sourceRowCount: 1,
    validRowCount: 1,
    ignoredRows: [],
    warnings: [],
    fileName: "levantamento.xlsx",
    fileType: "XLSX",
    fileHash: "hash-plural",
    sheetNames: ["Estoque"],
    stock: [{
      code: "",
      sourceCode: "",
      material: "VB 36 DOIS FURO",
      category: "Material geral",
      unit: "UN.",
      sourcePresentation: "UN.",
      unitsPerPackage: 1,
      sourceBalance: 6,
      current: 6,
      balanceKnown: true,
      sourceRow: 2,
      sourceRows: [2],
    }],
  };
  const preview = buildStockImportPreview(parsed, current);
  assert.equal(preview.totals.newItems, 0);
  assert.equal(preview.rows[0].materialCode, "MAT-040");
});

test("parser numérico aceita valores brasileiros e rejeita texto", () => {
  assert.equal(parseStockNumber("1.234,50"), 1234.5);
  assert.equal(parseStockNumber("12,5"), 12.5);
  assert.equal(parseStockNumber(7), 7);
  assert.equal(parseStockNumber("sete"), null);
});
