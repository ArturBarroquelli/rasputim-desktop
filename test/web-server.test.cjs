const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createWebServer } = require("../core/web-server.cjs");

function request(port, method, pathname, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request({ hostname: "127.0.0.1", port, method, path: pathname, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      let raw = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { raw += chunk; }); res.on("end", () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {}, cookie: res.headers["set-cookie"]?.[0] || "" }));
    });
    req.on("error", reject); req.end(payload);
  });
}

test("servidor web central inicia, cria responsável e protege o dashboard", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-web-"));
  const staticRoot = path.join(temp, "web"); fs.mkdirSync(staticRoot); fs.writeFileSync(path.join(staticRoot, "index.html"), "<h1>Rasputim</h1>");
  const root = path.join(__dirname, "..");
  const server = createWebServer({ userDataPath: path.join(temp, "data"), staticRoot, seedFile: path.join(root, "assets", "seed-data.json"), procurementSeedFile: path.join(root, "assets", "procurement-seed.json"), version: "test" });
  try {
    const address = await server.start({ host: "127.0.0.1", port: 0 });
    const health = await request(address.port, "GET", "/api/health"); assert.equal(health.status, 200); assert.equal(health.body.online, true);
    const locked = await request(address.port, "GET", "/api/dashboard"); assert.equal(locked.status, 401);
    const setup = await request(address.port, "POST", "/api/auth/setup", { name: "Administrador", login: "admin", password: "senha-segura" }); assert.equal(setup.status, 201); assert.match(setup.cookie, /rasputim_session=/);
    const session = setup.cookie.split(";")[0];
    const dashboard = await request(address.port, "GET", "/api/dashboard", null, session); assert.equal(dashboard.status, 200); assert.equal(dashboard.body.auth.currentUser.login, "admin");
    const project = await request(address.port, "POST", "/api/pcp/projects", { client: "Cliente teste", name: "Obra teste", dueDate: "2026-12-20" }, session); assert.equal(project.status, 201); assert.equal(project.body.pcp.projects.length, 1);
  } finally { await server.stop(); fs.rmSync(temp, { recursive: true, force: true }); }
});
