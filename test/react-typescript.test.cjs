const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const app = fs.readFileSync(path.join(root, "src/renderer/App.tsx"), "utf8");
const main = fs.readFileSync(path.join(root, "src/renderer/main.tsx"), "utf8");
const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");

test("v0.6 usa React e TypeScript como renderer principal", () => {
  assert.equal(pkg.version, "0.6.0");
  assert.equal(pkg.dependencies.react, "18.3.1");
  assert.ok(pkg.devDependencies.typescript);
  assert.match(main, /ReactDOM\.createRoot/);
  assert.match(app, /<PcpPage/);
  assert.match(app, /<StockPage/);
  assert.match(app, /<ToolsPage/);
  assert.match(app, /<AiPage/);
  assert.match(vite, /renderer-dist/);
});
