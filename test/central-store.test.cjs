const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCentralStore } = require("../core/central-store.cjs");

test("computadores usam a mesma base operacional central", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-central-"));
  const shared = path.join(root, "central");
  fs.mkdirSync(shared);
  const central = createCentralStore({ userDataPath: path.join(root, "notebook"), stationName: "NOTEBOOK CENTRAL" });
  central.enable(shared, { procurement: { stock: [{ code: "MAT-01", quantity: 2 }] }, tools: { items: [] } });
  const client = createCentralStore({ userDataPath: path.join(root, "pc-01"), stationName: "PC CORTE" });
  const loaded = client.connect(shared);
  assert.equal(loaded.procurement.stock[0].quantity, 2);
  central.write({ procurement: { stock: [{ code: "MAT-01", quantity: 8 }] }, tools: { items: [] } });
  const refreshed = client.refresh();
  assert.equal(refreshed.changed, true);
  assert.equal(refreshed.data.procurement.stock[0].quantity, 8);
  assert.equal(client.status().mode, "CENTRAL");
});
