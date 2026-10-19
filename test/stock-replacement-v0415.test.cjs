const test = require("node:test");
const assert = require("node:assert/strict");
const snapshot = require("../assets/stock-reset-v0415.json");
const {
  applyStockImport,
  applyStockSnapshot,
  buildStockImportPreview,
  parseStockMinimum,
  parseStockQuantity,
} = require("../core/procurement.cjs");

function legacyBase() {
  return {
    schemaVersion: 9,
    settings: { location: "Maringá/PR", marketRadiusKm: 100 },
    stock: [
      { code: "MAT-001", material: "ITEM ANTIGO", category: "ANTIGO", unit: "UN.", current: 9, balanceKnown: true, minimum: 100 },
      { code: "MAT-033", material: "CHAPA MDF BRANCO BERNECK 18 MM", category: "MDF 18 MM", unit: "CHAPA", current: 20, balanceKnown: true, minimum: 20 },
    ],
    invoiceItems: [],
    invoices: [],
    movements: [{ id: "MOV-ANTIGO", materialCode: "MAT-001", createdAt: "2026-08-01T12:00:00.000Z" }],
    stockCounts: [{ id: "LEV-ANTIGO", fileHash: "hash-antigo", importedAt: "2026-08-01T12:00:00.000Z" }],
    quotations: [{ id: "COT-ANTIGA", materialCode: "MAT-001", active: true }],
    marketSearches: [{ id: "PES-ANTIGA", materialCode: "MAT-001", results: [] }],
    suppliers: [{ id: "SUP-LOCAL", name: "Fornecedor Local", reliability: "MÉDIA" }],
  };
}

test("interpreta contagens textuais sem somar medidas internas", () => {
  assert.equal(parseStockQuantity("1 CORDA DE LED 10M").current, 1);
  assert.equal(parseStockQuantity("6-CAIXAS DE 5M DE FITA").current, 6);
  assert.equal(parseStockQuantity("50UNID PACOTE FECH/41 UNID ABERTO").current, 91);
  assert.equal(parseStockQuantity("11-UNIDADES BRANCAS/2-UNIDADES PRETOS").current, 13);
  const mixed = parseStockQuantity("16-PONTEIRAS + 1 ROLO DE 15MM BRONZE");
  assert.equal(mixed.current, 16);
  assert.equal(mixed.requiresReview, true);
  assert.equal(parseStockMinimum("1-ROLO DE 10M").minimum, 1);
  assert.equal(parseStockMinimum("??").minimumKnown, false);
});

test("snapshot profissional contém somente a nova base categorizada", () => {
  assert.equal(snapshot.stock.length, 130);
  assert.equal(snapshot.stock.filter((item) => item.category === "FERRAGEM").length, 105);
  assert.equal(snapshot.stock.filter((item) => item.category === "MATERIAL GERAL").length, 25);
  assert.equal(snapshot.stock.some((item) => /MDF/i.test(item.material)), false);
  assert.equal(snapshot.stock.find((item) => item.material === "PARAFUSOS 8,8MM").current, 91);
  assert.equal(snapshot.stock.find((item) => item.material === "ELETRO CALHA CINZA - GRANDE").current, 3);
  assert.equal(snapshot.stock.find((item) => item.material === "PONTEIRA PUXADOR GOLF/GOLA PRATA 15MM").current, 90);
});

test("prévia de substituição total informa remoções e não preserva ausentes", () => {
  const parsed = {
    ...snapshot,
    fileName: snapshot.sourceFile,
    fileType: snapshot.fileType,
    fileHash: snapshot.sourceHash,
    ignoredRows: snapshot.ignoredRows || [],
  };
  const preview = buildStockImportPreview(parsed, legacyBase(), { mode: "REPLACE" });
  assert.equal(preview.mode, "REPLACE");
  assert.equal(preview.totals.validItems, 130);
  assert.equal(preview.totals.preservedItems, 0);
  assert.equal(preview.totals.removedItems, 2);
  assert.match(preview.warnings[0], /SUBSTITUIÇÃO TOTAL/);
});

test("substituição arquiva a base antiga e limpa históricos vinculados", () => {
  const parsed = {
    ...snapshot,
    fileName: snapshot.sourceFile,
    fileType: snapshot.fileType,
    fileHash: `${snapshot.sourceHash}-manual`,
    ignoredRows: snapshot.ignoredRows || [],
  };
  const preview = buildStockImportPreview(parsed, legacyBase(), { mode: "REPLACE" });
  const updated = applyStockImport(legacyBase(), preview, "Artur Barroquelli");
  assert.equal(updated.stock.length, 130);
  assert.equal(updated.stock.some((item) => item.material === "ITEM ANTIGO"), false);
  assert.equal(updated.stock.some((item) => /MDF/i.test(item.material)), false);
  assert.equal(updated.stockBackups.length, 1);
  assert.equal(updated.stockBackups[0].stock.some((item) => item.material === "ITEM ANTIGO"), true);
  assert.equal(updated.quotations.length, 0);
  assert.equal(updated.marketSearches.length, 0);
  assert.equal(updated.stockCounts.length, 1);
  assert.equal(updated.stockCounts[0].mode, "REPLACE");
  assert.equal(updated.stockCounts[0].registeredBy, "Artur Barroquelli");
  assert.equal(updated.movements.length, 130);
  assert.equal(updated.suppliers.some((item) => item.name === "Fornecedor Local"), true);
});

test("migração automática é aplicada uma única vez", () => {
  const first = applyStockSnapshot(legacyBase(), snapshot, "Atualização automática v0.4.15");
  assert.equal(first.applied, true);
  assert.equal(first.state.stock.length, 130);
  assert.equal(first.state.appliedStockResets.includes(snapshot.migrationId), true);
  const second = applyStockSnapshot(first.state, snapshot, "Atualização automática v0.4.15");
  assert.equal(second.applied, false);
  assert.equal(second.state.stockBackups.length, 1);
});
