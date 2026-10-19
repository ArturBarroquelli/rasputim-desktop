const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const packageInfo = require(path.join(root, "package.json"));
const main = fs.readFileSync(path.join(root, "src", "main.cjs"), "utf8");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");

test("piloto Windows 10 preserva o modelo desktop local", () => {
  assert.equal(packageInfo.name, "rasputim-tecnologis-react");
  assert.equal(packageInfo.version, "0.5.0");
  assert.match(html, /WINDOWS 10/);
  assert.match(main, /mainWindow\.loadFile\(path\.join\(__dirname, "index\.html"\)\)/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /sandbox: true/);
  assert.doesNotMatch(main, /mainWindow\.loadURL\(/);
});
