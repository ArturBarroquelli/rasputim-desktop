const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const packageInfo = require(path.join(root, "package.json"));
const main = fs.readFileSync(path.join(root, "src", "main.cjs"), "utf8");
const legacyHtml = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const reactEntry = fs.readFileSync(path.join(root, "src", "renderer", "main.tsx"), "utf8");

test("piloto Windows 10 preserva o modelo desktop local com renderer React", () => {
  assert.equal(packageInfo.name, "rasputim-tecnologis-react");
  assert.equal(packageInfo.version, "0.5.0");
  assert.match(legacyHtml, /WINDOWS 10/);
  assert.match(reactEntry, /ReactDOM\.createRoot/);
  assert.match(main, /mainWindow\.loadFile\(path\.join\(__dirname, "renderer-dist", "index\.html"\)\)/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.doesNotMatch(main, /mainWindow\.loadURL\(/);
});