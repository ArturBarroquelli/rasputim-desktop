const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const CURRENCY_EPSILON = 0.011;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function safeNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;

  const cleaned = value
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

function cell(sheet, address) {
  return sheet?.[address];
}

function cellValue(sheet, address) {
  return cell(sheet, address)?.v;
}

function cellNumber(sheet, address, fallback = 0) {
  const source = cell(sheet, address);
  if (!source || source.t === "e") return fallback;
  return safeNumber(source.v, fallback);
}

function findSheet(workbook, expectedName) {
  const normalized = normalizeText(expectedName);
  const name = workbook.SheetNames.find((candidate) => normalizeText(candidate) === normalized);
  return name ? { name, sheet: workbook.Sheets[name] } : null;
}

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, {
    cellFormula: true,
    cellNF: true,
    cellText: true,
    cellDates: true,
    raw: false,
  });
}

function findProposalSheet(workbook) {
  const named = findSheet(workbook, "PROPOSTA");
  if (named && findHeaderRow(named.sheet, ["ITEM", "AMBIENTE", "QUANT"]) > 0) return named;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (findHeaderRow(sheet, ["ITEM", "AMBIENTE", "QUANT"]) > 0) return { name, sheet };
  }
  return null;
}

function findHeaderRow(sheet, requiredHeaders, maxRows = 80) {
  if (!sheet) return -1;
  const ref = sheet["!ref"];
  if (!ref) return -1;
  const range = XLSX.utils.decode_range(ref);
  const lastRow = Math.min(range.e.r, maxRows - 1);

  for (let r = range.s.r; r <= lastRow; r += 1) {
    const values = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      values.push(normalizeText(cellValue(sheet, XLSX.utils.encode_cell({ r, c }))));
    }
    if (requiredHeaders.every((header) => values.includes(normalizeText(header)))) return r + 1;
  }
  return -1;
}

function findColumnMap(sheet, rowNumber) {
  const map = new Map();
  if (!sheet || rowNumber < 1) return map;
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const r = rowNumber - 1;
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const address = XLSX.utils.encode_cell({ r, c });
    const normalized = normalizeText(cellValue(sheet, address));
    if (normalized && !map.has(normalized)) map.set(normalized, c);
  }
  return map;
}

function findSalesTable(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const headerRow = findHeaderRow(sheet, ["MARCENARIA"]);
    if (headerRow < 1) continue;
    const headerMap = findColumnMap(sheet, headerRow);
    const hasClient = ["CLIENTES", "CLIENTE PROJETO", "CLIENTE", "CLIENTE / PROJETO"]
      .some((header) => headerMap.has(normalizeText(header)));
    if (hasClient) return { sheetName, sheet, headerRow, headerMap };
  }
  return null;
}

function detectSpreadsheetKind(filePath) {
  const workbook = readWorkbook(filePath);
  const proposal = findProposalSheet(workbook);
  if (proposal) {
    return { kind: "PROJECT", sheetName: proposal.name, sheetNames: workbook.SheetNames };
  }
  const sales = findSalesTable(workbook);
  if (sales) {
    return { kind: "SALES", sheetName: sales.sheetName, sheetNames: workbook.SheetNames };
  }
  return {
    kind: "UNKNOWN",
    sheetName: null,
    sheetNames: workbook.SheetNames,
    message: `Arquivo não reconhecido. Abas encontradas: ${workbook.SheetNames.join(", ") || "nenhuma"}. Para orçamento, procurei ITEM, AMBIENTE e QUANT; para clientes, procurei CLIENTE e MARCENARIA.`,
  };
}

function columnAddress(columnIndex, rowNumber) {
  return XLSX.utils.encode_cell({ c: columnIndex, r: rowNumber - 1 });
}

function valueByHeader(sheet, headerMap, aliases, rowNumber, fallback = null) {
  const key = aliases.map(normalizeText).find((alias) => headerMap.has(alias));
  if (!key) return fallback;
  const value = cellValue(sheet, columnAddress(headerMap.get(key), rowNumber));
  return value ?? fallback;
}

function titleCase(value) {
  const lowerWords = new Set(["E", "DA", "DAS", "DE", "DO", "DOS"]);
  return normalizeText(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word, index) => (index > 0 && lowerWords.has(word.toUpperCase())
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function extractProjectName(filePath) {
  let base = path.basename(filePath, path.extname(filePath));
  base = base.replace(/^PLANILHA[_ ]PARA[_ ]LEVANTAMENTO[_ ]DE[_ ]QUANTITATIV[OA]?\s*-\s*/i, "");
  base = base.replace(/^PLANILHA\s+PARA\s+LEVANTAMENTO\s+DE\s+QUANTITATIV[OA]?\s*-\s*/i, "");
  base = base.replace(/\bADVOCAIA\b/gi, "ADVOCACIA");
  return titleCase(base || "Projeto sem nome");
}

function projectSize(total) {
  if (total < 16000) return "Pequeno";
  if (total < 23000) return "Médio";
  return "Grande";
}

function errorLabel(cellData) {
  const text = `${cellData?.w ?? ""} ${cellData?.f ?? ""}`.toUpperCase();
  if (text.includes("#REF!")) return "#REF!";
  if (text.includes("#NAME?") || text.includes("#NOME?")) return "#NOME?";
  if (text.includes("#DIV/0!")) return "#DIV/0!";
  if (text.includes("#VALUE!") || text.includes("#VALOR!")) return "#VALOR!";
  if (text.includes("#N/A")) return "#N/D";
  return cellData?.w || "Erro de fórmula";
}

function scanFormulaErrors(workbook) {
  const errors = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    for (const [address, cellData] of Object.entries(sheet)) {
      if (address.startsWith("!")) continue;
      const content = `${cellData?.w ?? ""} ${cellData?.f ?? ""}`;
      const isError = cellData?.t === "e" || /#REF!|#NAME\?|#NOME\?|#DIV\/0!|#VALUE!|#VALOR!|#N\/A/i.test(content);
      if (!isError) continue;
      const direct = /^#(?:REF!|NAME\?|NOME\?|DIV\/0!|VALUE!|VALOR!|N\/A)$/i.test(String(cellData?.f || ""));
      errors.push({
        sheet: sheetName,
        cell: address,
        error: errorLabel(cellData),
        formula: cellData?.f || null,
        origin: direct ? "direto" : "propagado",
      });
    }
  }
  return errors;
}

function groupFormulaErrors(errors) {
  const groups = new Map();
  for (const error of errors) {
    const key = `${error.sheet}|${error.error}|${error.origin}`;
    if (!groups.has(key)) {
      groups.set(key, {
        type: "FORMULA_ERROR",
        severity: error.origin === "direto" ? "warning" : "info",
        title: `${error.error} em ${error.sheet}`,
        description: error.origin === "direto"
          ? "A planilha contém referências de origem quebradas."
          : "O erro foi propagado por outra célula com problema.",
        count: 0,
        cells: [],
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (group.cells.length < 12) group.cells.push(error.cell);
  }
  return [...groups.values()];
}

function analyzeProposal(workbook, proposalSheet, filePath) {
  const sheet = proposalSheet.sheet;
  const headerRow = findHeaderRow(sheet, ["ITEM", "AMBIENTE", "QUANT"]);
  if (headerRow < 1) {
    throw new Error("Não encontrei as colunas ITEM, AMBIENTE e QUANT na aba PROPOSTA.");
  }

  const ref = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  let totalRow = -1;
  for (let row = headerRow + 1; row <= ref.e.r + 1; row += 1) {
    if (normalizeText(cellValue(sheet, `A${row}`)) === "TOTAL") {
      totalRow = row;
      break;
    }
  }

  const lastDataRow = totalRow > 0 ? totalRow - 1 : Math.min(ref.e.r + 1, headerRow + 100);
  const environments = [];
  const alerts = [];

  for (let row = headerRow + 1; row <= lastDataRow; row += 1) {
    const environment = String(cellValue(sheet, `B${row}`) ?? "").trim();
    if (!environment) continue;

    const quantity = cellNumber(sheet, `C${row}`, 1) || 1;
    const marcenariaUnit = cellNumber(sheet, `W${row}`) + cellNumber(sheet, `X${row}`);
    const vidracariaUnit = cellNumber(sheet, `Y${row}`) + cellNumber(sheet, `Z${row}`);
    const serralheriaUnit = cellNumber(sheet, `AA${row}`);
    const iluminacaoUnit = cellNumber(sheet, `AB${row}`);
    const calculatedUnit = marcenariaUnit + vidracariaUnit + serralheriaUnit + iluminacaoUnit;
    const reportedUnit = cellNumber(sheet, `AC${row}`, calculatedUnit);
    const reportedTotal = cellNumber(sheet, `AK${row}`, reportedUnit * quantity);
    const calculatedTotal = calculatedUnit * quantity;

    const wFormula = String(cell(sheet, `W${row}`)?.f || "").replace(/\$/g, "").toUpperCase();
    const foreignVarReference = wFormula.match(/\bV(\d+)\b/);
    if (foreignVarReference && Number(foreignVarReference[1]) !== row) {
      alerts.push({
        type: "CROSS_ROW_REFERENCE",
        severity: "warning",
        title: `Referência cruzada inesperada em W${row}`,
        description: `A fórmula usa V${foreignVarReference[1]} em vez de V${row}.`,
        count: 1,
        cells: [`W${row}`],
      });
    }

    if (Math.abs(calculatedUnit - reportedUnit) >= CURRENCY_EPSILON) {
      alerts.push({
        type: "ROW_COMPONENT_MISMATCH",
        severity: "error",
        title: `Divergência nos componentes de ${environment}`,
        description: `A composição soma R$ ${roundMoney(calculatedUnit).toFixed(2)}, mas AC${row} informa R$ ${roundMoney(reportedUnit).toFixed(2)}.`,
        count: 1,
        cells: [`AC${row}`],
      });
    }

    if (Math.abs(calculatedTotal - reportedTotal) >= CURRENCY_EPSILON) {
      alerts.push({
        type: "ROW_TOTAL_MISMATCH",
        severity: "error",
        title: `Total divergente em ${environment}`,
        description: `O cálculo por quantidade resulta em R$ ${roundMoney(calculatedTotal).toFixed(2)}, mas AK${row} informa R$ ${roundMoney(reportedTotal).toFixed(2)}.`,
        count: 1,
        cells: [`AK${row}`],
      });
    }

    environments.push({
      item: cellNumber(sheet, `A${row}`, environments.length + 1),
      name: environment,
      quantity,
      marcenaria: roundMoney(marcenariaUnit * quantity),
      serralheria: roundMoney(serralheriaUnit * quantity),
      vidracaria: roundMoney(vidracariaUnit * quantity),
      iluminacao: roundMoney(iluminacaoUnit * quantity),
      totalCalculated: roundMoney(calculatedTotal),
      totalReported: roundMoney(reportedTotal),
      sourceRow: row,
    });
  }

  if (!environments.length) {
    throw new Error("A aba PROPOSTA foi encontrada, mas não há ambientes preenchidos.");
  }

  const categories = environments.reduce((total, current) => ({
    marcenaria: roundMoney(total.marcenaria + current.marcenaria),
    serralheria: roundMoney(total.serralheria + current.serralheria),
    vidracaria: roundMoney(total.vidracaria + current.vidracaria),
    iluminacao: roundMoney(total.iluminacao + current.iluminacao),
  }), { marcenaria: 0, serralheria: 0, vidracaria: 0, iluminacao: 0 });

  const calculatedTotal = roundMoney(Object.values(categories).reduce((sum, value) => sum + value, 0));
  const rowsReportedTotal = roundMoney(environments.reduce((sum, item) => sum + item.totalReported, 0));
  const workbookTotal = totalRow > 0
    ? roundMoney(cellNumber(sheet, `AK${totalRow}`, rowsReportedTotal))
    : rowsReportedTotal;

  if (Math.abs(calculatedTotal - workbookTotal) >= CURRENCY_EPSILON) {
    alerts.push({
      type: "PROJECT_TOTAL_MISMATCH",
      severity: "error",
      title: "Total geral divergente",
      description: `Os componentes somam R$ ${calculatedTotal.toFixed(2)}, mas a planilha informa R$ ${workbookTotal.toFixed(2)}.`,
      count: 1,
      cells: totalRow > 0 ? [`AK${totalRow}`] : [],
    });
  }

  if (totalRow < 1) {
    alerts.push({
      type: "MISSING_TOTAL_ROW",
      severity: "warning",
      title: "Linha TOTAL não encontrada",
      description: "O valor geral foi calculado a partir dos ambientes preenchidos.",
      count: 1,
      cells: [],
    });
  }

  return {
    name: extractProjectName(filePath),
    headerRow,
    totalRow,
    environments,
    categories,
    calculatedTotal,
    workbookTotal,
    difference: roundMoney(workbookTotal - calculatedTotal),
    size: projectSize(workbookTotal),
    alerts,
  };
}

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function analyzeProjectFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (![".xls", ".xlsx", ".xlsm", ".xlsb"].includes(extension)) {
    throw new Error("Formato não aceito. Use .xls ou .xlsx.");
  }

  const workbook = readWorkbook(filePath);
  const proposal = findProposalSheet(workbook);
  if (!proposal) {
    throw new Error(`Não encontrei um orçamento compatível. Abas: ${workbook.SheetNames.join(", ") || "nenhuma"}. É necessária uma tabela com ITEM, AMBIENTE e QUANT.`);
  }

  const proposalResult = analyzeProposal(workbook, proposal, filePath);
  const formulaErrors = scanFormulaErrors(workbook);
  const alerts = [...proposalResult.alerts, ...groupFormulaErrors(formulaErrors)];
  const hasTotalError = alerts.some((alert) => alert.severity === "error");
  const status = hasTotalError
    ? "Divergência encontrada"
    : alerts.length
      ? "Conferido com alertas"
      : "Conferido";

  const stats = fs.statSync(filePath);
  return {
    id: fileHash(filePath).slice(0, 16),
    hash: fileHash(filePath),
    fileName: path.basename(filePath),
    sourcePath: path.resolve(filePath),
    fileType: extension.slice(1).toUpperCase(),
    importedAt: new Date().toISOString(),
    fileModifiedAt: stats.mtime.toISOString(),
    sheetNames: workbook.SheetNames,
    name: proposalResult.name,
    environments: proposalResult.environments,
    environmentCount: proposalResult.environments.length,
    categories: proposalResult.categories,
    calculatedTotal: proposalResult.calculatedTotal,
    workbookTotal: proposalResult.workbookTotal,
    difference: proposalResult.difference,
    size: proposalResult.size,
    status,
    alerts,
    formulaErrors,
    formulaErrorCount: formulaErrors.length,
    directFormulaErrorCount: formulaErrors.filter((item) => item.origin === "direto").length,
    propagatedFormulaErrorCount: formulaErrors.filter((item) => item.origin === "propagado").length,
  };
}

function projectTokens(name) {
  const ignored = new Set(["A", "E", "O", "DA", "DAS", "DE", "DO", "DOS", "PROJETO"]);
  return new Set(normalizeText(name).split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
}

function similarity(left, right) {
  const leftTokens = projectTokens(left);
  const rightTokens = projectTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function matchProjectsToSales(projects, sales) {
  return projects.map((project) => {
    let best = null;
    for (const sale of sales) {
      const score = similarity(project.name, sale.client);
      if (!best || score > best.score) best = { sale, score };
    }
    if (!best || best.score < 0.66) return { ...project, commercialComparison: null };
    const difference = roundMoney(project.workbookTotal - best.sale.total);
    return {
      ...project,
      commercialComparison: {
        saleId: best.sale.id,
        client: best.sale.client,
        saleTotal: best.sale.total,
        projectTotal: project.workbookTotal,
        difference,
        matches: Math.abs(difference) < CURRENCY_EPSILON,
        similarity: roundMoney(best.score),
      },
    };
  });
}

function analyzeSalesFile(filePath) {
  const workbook = readWorkbook(filePath);
  const selected = findSalesTable(workbook);

  if (!selected) {
    throw new Error(`Não encontrei uma tabela com Cliente e Marcenaria. Abas encontradas: ${workbook.SheetNames.join(", ") || "nenhuma"}.`);
  }

  const aliases = {
    client: ["CLIENTES", "CLIENTE PROJETO", "CLIENTE", "CLIENTE / PROJETO"],
    marcenaria: ["MARCENARIA"],
    serralheria: ["SERRALHERIA", "SERRALHEIRA"],
    vidracaria: ["VIDRACARIA"],
    iluminacao: ["ILUMINACAO"],
    total: ["TOTAL", "TOTAL DA VENDA"],
    date: ["DATA DO FECHAMENTO", "DATA"],
    budget: ["N DO ORCAMENTO", "NUMERO DO ORCAMENTO", "ORCAMENTO"],
    projectType: ["TIPO DE PROJETO"],
    seller: ["VENDEDOR"],
    source: ["ORIGEM DO CLIENTE"],
    city: ["CIDADE"],
    notes: ["OBSERVACOES"],
  };

  const ref = XLSX.utils.decode_range(selected.sheet["!ref"] || "A1:A1");
  const sales = [];
  let blankStreak = 0;
  for (let row = selected.headerRow + 1; row <= Math.min(ref.e.r + 1, selected.headerRow + 2000); row += 1) {
    const clientName = String(valueByHeader(selected.sheet, selected.headerMap, aliases.client, row, "") || "").trim();
    if (!clientName) {
      blankStreak += 1;
      if (blankStreak >= 30 && sales.length) break;
      continue;
    }
    blankStreak = 0;
    const marcenaria = roundMoney(valueByHeader(selected.sheet, selected.headerMap, aliases.marcenaria, row, 0));
    const serralheria = roundMoney(valueByHeader(selected.sheet, selected.headerMap, aliases.serralheria, row, 0));
    const vidracaria = roundMoney(valueByHeader(selected.sheet, selected.headerMap, aliases.vidracaria, row, 0));
    const iluminacao = roundMoney(valueByHeader(selected.sheet, selected.headerMap, aliases.iluminacao, row, 0));
    const calculated = roundMoney(marcenaria + serralheria + vidracaria + iluminacao);
    const reported = roundMoney(valueByHeader(selected.sheet, selected.headerMap, aliases.total, row, calculated));
    const total = reported || calculated;
    if (!total && !marcenaria && !serralheria && !vidracaria && !iluminacao) continue;

    sales.push({
      id: crypto.createHash("sha1").update(`${normalizeText(clientName)}|${row}`).digest("hex").slice(0, 12),
      client: clientName,
      marcenaria,
      serralheria,
      vidracaria,
      iluminacao,
      total,
      calculatedTotal: calculated,
      difference: roundMoney(reported - calculated),
      date: valueByHeader(selected.sheet, selected.headerMap, aliases.date, row, null),
      budget: valueByHeader(selected.sheet, selected.headerMap, aliases.budget, row, null),
      projectType: valueByHeader(selected.sheet, selected.headerMap, aliases.projectType, row, null),
      seller: valueByHeader(selected.sheet, selected.headerMap, aliases.seller, row, null),
      source: valueByHeader(selected.sheet, selected.headerMap, aliases.source, row, null),
      city: valueByHeader(selected.sheet, selected.headerMap, aliases.city, row, null),
      notes: valueByHeader(selected.sheet, selected.headerMap, aliases.notes, row, null),
      sourceRow: row,
    });
  }

  if (!sales.length) throw new Error("A tabela de clientes foi encontrada, mas não contém vendas preenchidas.");
  return {
    fileName: path.basename(filePath),
    sourcePath: path.resolve(filePath),
    sheetName: selected.sheetName,
    importedAt: new Date().toISOString(),
    sales,
  };
}

function calculateDashboard(state) {
  const sales = state.sales || [];
  const projects = matchProjectsToSales(state.projects || [], sales);
  const salesTotal = roundMoney(sales.reduce((sum, sale) => sum + sale.total, 0));
  const categoryTotals = sales.reduce((total, sale) => ({
    marcenaria: roundMoney(total.marcenaria + sale.marcenaria),
    serralheria: roundMoney(total.serralheria + sale.serralheria),
    vidracaria: roundMoney(total.vidracaria + sale.vidracaria),
    iluminacao: roundMoney(total.iluminacao + sale.iluminacao),
  }), { marcenaria: 0, serralheria: 0, vidracaria: 0, iluminacao: 0 });

  const positiveSales = sales.map((sale) => sale.total).filter((value) => value > 0).sort((a, b) => a - b);
  const averageTicket = positiveSales.length ? roundMoney(salesTotal / positiveSales.length) : 0;
  const medianTicket = positiveSales.length
    ? roundMoney(positiveSales.length % 2
      ? positiveSales[(positiveSales.length - 1) / 2]
      : (positiveSales[positiveSales.length / 2 - 1] + positiveSales[positiveSales.length / 2]) / 2)
    : 0;

  return {
    ...state,
    projects,
    dashboard: {
      salesTotal,
      salesCount: positiveSales.length,
      averageTicket,
      medianTicket,
      largestSale: positiveSales.at(-1) || 0,
      smallestSale: positiveSales[0] || 0,
      categoryTotals,
      analyzedProjectTotal: roundMoney(projects.reduce((sum, project) => sum + project.workbookTotal, 0)),
      projectCount: projects.length,
      projectsWithAlerts: projects.filter((project) => project.alerts?.length).length,
      commercialDifferences: projects.filter((project) => project.commercialComparison && !project.commercialComparison.matches).length,
    },
  };
}

module.exports = {
  analyzeProjectFile,
  analyzeSalesFile,
  calculateDashboard,
  detectSpreadsheetKind,
  extractProjectName,
  matchProjectsToSales,
  normalizeText,
  projectSize,
  roundMoney,
  safeNumber,
  similarity,
};
