const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const {
  analyzeProjectFile,
  detectSpreadsheetKind,
} = require("../core/analyzer.cjs");

function temporaryWorkbook(name, sheetName, rows) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rasputim-xls-"));
  const filePath = path.join(directory, name);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filePath, { bookType: "xls" });
  return filePath;
}

function proposalRows() {
  const header = Array(37).fill("");
  header[0] = "ITEM";
  header[1] = "AMBIENTE";
  header[2] = "QUANT";
  const item = Array(37).fill(0);
  item[0] = 1;
  item[1] = "COZINHA";
  item[2] = 1;
  item[22] = 100;
  item[28] = 100;
  item[36] = 100;
  const total = Array(37).fill("");
  total[0] = "TOTAL";
  total[36] = 100;
  return [header, item, total];
}

test("reconhece orçamento mesmo quando a aba não se chama PROPOSTA", () => {
  const filePath = temporaryWorkbook("orcamento.xls", "ORÇAMENTO 2026", proposalRows());
  const detected = detectSpreadsheetKind(filePath);
  assert.equal(detected.kind, "PROJECT");
  assert.equal(detected.sheetName, "ORÇAMENTO 2026");
  const project = analyzeProjectFile(filePath);
  assert.equal(project.environmentCount, 1);
  assert.equal(project.environments[0].name, "COZINHA");
});

test("reconhece base de clientes por cabeçalhos", () => {
  const filePath = temporaryWorkbook("clientes.xls", "VENDAS", [
    ["CLIENTE / PROJETO", "MARCENARIA", "TOTAL"],
    ["CLIENTE TESTE", 1250, 1250],
  ]);
  const detected = detectSpreadsheetKind(filePath);
  assert.equal(detected.kind, "SALES");
  assert.equal(detected.sheetName, "VENDAS");
});

test("erro de planilha desconhecida informa abas e cabeçalhos esperados", () => {
  const filePath = temporaryWorkbook("desconhecida.xls", "PLANILHA 1", [["DESCRIÇÃO", "VALOR"], ["Item", 10]]);
  const detected = detectSpreadsheetKind(filePath);
  assert.equal(detected.kind, "UNKNOWN");
  assert.match(detected.message, /PLANILHA 1/);
  assert.match(detected.message, /ITEM, AMBIENTE e QUANT/);
  assert.match(detected.message, /CLIENTE e MARCENARIA/);
});
