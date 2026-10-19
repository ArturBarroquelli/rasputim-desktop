const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  applyStockSupplement,
  loadSeed,
  normalize,
} = require("../core/procurement.cjs");

const root = path.join(__dirname, "..");
const seed = loadSeed(path.join(root, "assets", "procurement-seed.json"));
const supplement = JSON.parse(fs.readFileSync(path.join(root, "assets", "stock-supplement-v0418.json"), "utf8"));

test("complementa a base anterior de 205 materiais sem duplicar o estoque atual", () => {
  assert.equal(seed.stock.length, 130);

  const result = applyStockSupplement(seed, supplement, "Teste automatizado");
  assert.equal(result.applied, true);
  assert.equal(result.additions.length, 75);
  assert.equal(result.corrections.length, 1);
  assert.equal(result.state.stock.length, 205);

  const identities = result.state.stock.map((item) => normalize(item.material));
  assert.equal(new Set(identities).size, 205);

  const bridge = result.state.stock.find((item) => item.material === "PONTEIRAS PERFIL Y PRETO 18 MM");
  assert.ok(bridge);
  assert.equal(bridge.code, "MAT-095");
  assert.equal(bridge.current, 21);
  assert.equal(bridge.storageLocation, "AV-B / RUA-004 / E03 / P002");

  const bucha = result.state.stock.find((item) => item.material === "BUCHA PARA GESSO BRANCA Nº 10");
  assert.ok(bucha);
  assert.notEqual(bucha.code, "MAT-106");
  assert.equal(bucha.current, 78);
  assert.match(bucha.notes, /MAT-106/);

  const corrediça = result.state.stock.find((item) => item.code === "COR-OS-600");
  assert.ok(corrediça);
  assert.equal(corrediça.balanceKnown, false);
  assert.equal(corrediça.storageLocation, "AV-B / RUA-002 / E04 / P009");

  const mdf = result.state.stock.find((item) => item.material === "MDF CINZA CRISTAL CHESS 6 MM");
  assert.ok(mdf);
  assert.equal(mdf.category, "MDF");
  assert.equal(mdf.current, 1);

  const repeated = applyStockSupplement(result.state, supplement, "Teste automatizado");
  assert.equal(repeated.applied, false);
  assert.equal(repeated.state.stock.length, 205);
});
