const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const XLSX = require("xlsx");
const {
  isLocationServiceUrl,
  officialSupplierSiteUrl,
  safeWhatsappUrl,
} = require("./market.cjs");

const SCHEMA_VERSION = 10;
const MDF_CODE = "MAT-033";
const MULTIPARAFUSOS_COMMERCIAL_URL = "https://98app.com.br/multiparafusos";
const STOCK_COUNT_HISTORY_LIMIT = 100;
const STOCK_HEADER_ALIASES = Object.freeze({
  code: ["CODIGO", "COD", "SKU", "REFERENCIA", "REF"],
  material: [
    "MATERIAL",
    "MATERIAIS DIA A DIA GERAL",
    "DESCRICAO DO MATERIAL",
    "DESCRICAO",
    "PRODUTO",
    "ITEM",
    "NOME DO MATERIAL",
  ],
  current: [
    "ESTOQUE ATUAL",
    "SALDO ATUAL",
    "SALDO INFORMADO",
    "QUANTIDADE CONTADA",
    "QTD CONTADA",
    "CONTAGEM FISICA",
    "CONTAGEM",
    "QUANTIDADE EM ESTOQUE",
    "QTD ATUAL",
    "SALDO",
    "QUANTIDADE",
    "QTD",
  ],
  unit: [
    "APRESENTACAO",
    "TIPO DE EMBALAGEM",
    "EMBALAGEM",
    "UNIDADE DE MEDIDA",
    "UNIDADE",
    "UND",
    "UN",
    "QUANTIDADE",
  ],
  multiplier: ["CONTEUDO POR EMBALAGEM", "UNIDADES POR EMBALAGEM", "MULTIPLICADOR", "FATOR"],
  category: ["CATEGORIA", "GRUPO", "TIPO"],
  checkedAt: ["ULTIMA CONFERENCIA", "DATA DA CONTAGEM", "DATA CONTAGEM", "DATA"],
  notes: ["OBSERVACAO", "OBSERVACOES", "NOTAS", "ANOTACAO"],
  location: ["LOCALIZACAO", "LOCAL", "SETOR", "PRATELEIRA"],
  minimum: [
    "QUANTIDADE IDEAL",
    "ESTOQUE IDEAL",
    "ESTOQUE MINIMO",
    "SALDO MINIMO",
    "QUANTIDADE MINIMA",
    "MINIMO",
  ],
});
const LEGACY_UNKNOWN_BALANCES = new Set([
  "MAT-026",
  "MAT-027",
  "MAT-028",
  "MAT-029",
  "MAT-030",
  "MAT-032",
]);

const DEFAULT_SUPPLIERS = [
  {
    id: "SUP-LAMINIL",
    name: "Laminil Rede Pro",
    specialties: "MDF, ferragens, acessórios e itens de marcenaria",
    location: "Av. Colombo, 2199 — Maringá/PR",
    service: "Orçamento por atendimento e WhatsApp",
    evidence: "Site próprio informa CNPJ, endereço físico e linha de MDF, ferragens e acessórios.",
    reliability: "MÉDIA",
    commercialUrl: "https://www.laminil.com.br/",
    reputationUrl: "https://www.facebook.com/laminilredepro/?locale=pt_BR",
    verifiedAt: "2026-07-24",
  },
  {
    id: "SUP-GMAD",
    name: "GMAD Compmag",
    specialties: "MDF, colas, químicos, ferragens e tapa-furos",
    location: "Loja física em Maringá/PR",
    service: "Orçamento e condições dependem da unidade e do CEP",
    evidence: "Rede oficial informa catálogo para marcenaria e mais de 100 lojas.",
    reliability: "MÉDIA",
    commercialUrl: "https://www.gmad.com.br/institucional/nossas-lojas",
    reputationUrl: "https://www.reclameaqui.com.br/empresa/gmad/",
    verifiedAt: "2026-07-24",
  },
  {
    id: "SUP-MULTIPARAFUSOS",
    name: "Multiparafusos",
    specialties: "Fixação, parafusos, ferragens, ferramentas e suprimentos gerais",
    location: "Av. Brasil, 2178 — Maringá/PR",
    service: "Venda local e contato direto",
    evidence: "Site próprio informa especialização, telefone e endereço em Maringá.",
    reliability: "NÃO AVALIADA",
    commercialUrl: MULTIPARAFUSOS_COMMERCIAL_URL,
    reputationUrl: "https://www.facebook.com/multiparafusos/?locale=pt_BR",
    verifiedAt: "2026-07-24",
  },
  {
    id: "SUP-JF-FERRAGENS",
    name: "JF Ferragens",
    specialties: "Ferragens, acessórios e colas para marcenaria",
    location: "Av. Alziro Zarur, 429 — Maringá/PR",
    service: "Contato direto",
    evidence: "Empresa local com CNPJ ativo e divulgação de linha para marcenaria.",
    reliability: "NÃO AVALIADA",
    commercialUrl: "https://www.instagram.com/jf_ferragensmga/",
    reputationUrl: "https://www.econodata.com.br/consulta-empresa/50370619000166-jf-ferragens-ltda",
    verifiedAt: "2026-07-24",
  },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseStockNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isBlank(value)) return null;
  let raw = String(value).trim().replace(/\s+/g, "");
  if (!/^-?[0-9][0-9.,]*$/.test(raw)) return null;
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  } else if ((raw.match(/\./g) || []).length > 1) {
    raw = raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantityUnitFromText(value) {
  const text = normalize(value);
  if (/\bUNIDADES?\b|UNIDS?\b|\bUND\b/.test(text)) return "UN.";
  if (/\bPACOTES?\b/.test(text)) return "PACOTE";
  if (/\bCAIXAS?\b/.test(text)) return "CAIXA";
  if (/\bKITS?\b/.test(text)) return "KIT";
  if (/\bROLOS?\b/.test(text)) return "ROLO";
  if (/\bCHAPAS?\b/.test(text)) return "CHAPA";
  if (/\bPARES?\b|\bPARZINHOS?\b/.test(text)) return "PAR";
  return "UN.";
}

function parseLeadingQuantity(value) {
  const match = String(value || "").trim().match(/^(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStockQuantity(value) {
  if (typeof value === "number") {
    return {
      current: Number.isFinite(value) && value >= 0 ? value : null,
      balanceKnown: Number.isFinite(value) && value >= 0,
      unit: "UN.",
      sourcePresentation: "UN.",
      quantityDetail: String(value),
      quantityComponents: Number.isFinite(value) && value >= 0
        ? [{ quantity: value, unit: "UN.", detail: String(value) }]
        : [],
      requiresReview: false,
    };
  }
  const detail = sanitizeText(value, 300);
  if (!detail) {
    return {
      current: null,
      balanceKnown: false,
      unit: "UN.",
      sourcePresentation: "UN.",
      quantityDetail: "",
      quantityComponents: [],
      requiresReview: false,
    };
  }
  const segments = detail.split(/\s*(?:\/|\+)\s*/).filter(Boolean);
  const components = segments.map((segment) => {
    const quantity = parseLeadingQuantity(segment);
    return quantity === null ? null : {
      quantity,
      unit: quantityUnitFromText(segment),
      detail: sanitizeText(segment, 160),
    };
  }).filter(Boolean);
  if (!components.length) {
    return {
      current: null,
      balanceKnown: false,
      unit: "UN.",
      sourcePresentation: "UN.",
      quantityDetail: detail,
      quantityComponents: [],
      requiresReview: true,
    };
  }
  const primaryUnit = components[0].unit;
  const mixedUnits = components.some((component) => component.unit !== primaryUnit);
  const current = mixedUnits
    ? components[0].quantity
    : components.reduce((sum, component) => sum + component.quantity, 0);
  return {
    current,
    balanceKnown: true,
    unit: primaryUnit,
    sourcePresentation: primaryUnit,
    quantityDetail: detail,
    quantityComponents: components,
    requiresReview: mixedUnits,
  };
}

function parseStockMinimum(value) {
  if (isBlank(value) || /\?/.test(String(value))) {
    return {
      minimum: null,
      minimumKnown: false,
      minimumDetail: sanitizeText(value, 160),
      minimumRequiresReview: false,
    };
  }
  const direct = parseStockNumber(value);
  const minimum = direct !== null ? direct : parseLeadingQuantity(value);
  return {
    minimum: minimum !== null && minimum >= 0 ? minimum : null,
    minimumKnown: minimum !== null && minimum >= 0,
    minimumDetail: sanitizeText(value, 160),
    minimumRequiresReview: /\bCADA\b/i.test(String(value)),
  };
}

function headerMatches(value, aliases) {
  const normalized = normalize(value);
  if (!normalized) return -1;
  const exact = aliases.indexOf(normalized);
  if (exact >= 0) return exact;
  return aliases.findIndex((alias) => alias.length >= 5 && normalized.includes(alias));
}

function columnStats(rows, headerIndex, columnIndex) {
  const sample = rows.slice(headerIndex + 1, headerIndex + 201);
  let filled = 0;
  let numeric = 0;
  let text = 0;
  let quantityLike = 0;
  for (const row of sample) {
    const value = row?.[columnIndex];
    if (isBlank(value)) continue;
    filled += 1;
    if (parseStockNumber(value) !== null) numeric += 1;
    else text += 1;
    if (parseStockQuantity(value).balanceKnown) quantityLike += 1;
  }
  return { filled, numeric, text, quantityLike };
}

function bestColumn(rows, headerIndex, aliases, kind) {
  const header = Array.isArray(rows[headerIndex]) ? rows[headerIndex] : [];
  const candidates = [];
  for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
    const normalizedHeader = normalize(header[columnIndex]);
    if (kind === "current" && /\bIDEAL\b|\bMINIM[OA]\b/.test(normalizedHeader)) continue;
    const aliasIndex = headerMatches(header[columnIndex], aliases);
    if (aliasIndex < 0) continue;
    const stats = columnStats(rows, headerIndex, columnIndex);
    let score = 100 - (aliasIndex * 5) + stats.filled;
    if (kind === "material") score += (stats.text * 5) - (stats.numeric * 2);
    if (kind === "current") score += (stats.numeric * 7) + (stats.quantityLike * 5) - stats.text;
    if (kind === "unit") score += (stats.text * 5) - (stats.numeric * 2);
    if (kind === "date") score += stats.filled * 2;
    candidates.push({ columnIndex, aliasIndex, score, stats });
  }
  candidates.sort((left, right) => right.score - left.score || left.aliasIndex - right.aliasIndex || left.columnIndex - right.columnIndex);
  return candidates[0] || null;
}

function stockColumnMapping(rows, headerIndex) {
  const mapping = {};
  for (const [key, aliases] of Object.entries(STOCK_HEADER_ALIASES)) {
    const kind = key === "current" ? "current" : key === "unit" ? "unit" : key === "material" ? "material" : key === "checkedAt" ? "date" : "other";
    mapping[key] = bestColumn(rows, headerIndex, aliases, kind);
  }
  if (mapping.unit?.columnIndex === mapping.current?.columnIndex) mapping.unit = null;
  return mapping;
}

function columnAddress(column) {
  return column ? XLSX.utils.encode_col(column.columnIndex) : null;
}

function normalizedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (isBlank(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeUrl(value) {
  const raw = sanitizeText(value, 1200);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function packageSizeFrom(item) {
  const explicit = finiteOrNull(item.unitsPerPackage ?? item.packageSize);
  if (explicit && explicit > 0) return explicit;
  const match = normalize(item.sourcePresentation || item.unit).match(/\bCX\s*(\d+)\b/);
  return match ? Number(match[1]) : 1;
}

function isMdfWhiteBerneck18(item) {
  const material = normalize(item.material);
  return item.code === MDF_CODE
    || (material.includes("MDF") && material.includes("BRANCO") && material.includes("BERNECK") && material.includes("18"));
}

function minimumFor(item) {
  if (item?.minimumKnown === false) return null;
  const explicit = finiteOrNull(item?.minimum ?? item?.sourceMinimum);
  if (explicit !== null && explicit >= 0) return explicit;
  return isMdfWhiteBerneck18(item) ? 20 : 100;
}

function migrateSuppliers(suppliers) {
  const source = Array.isArray(suppliers) && suppliers.length
    ? suppliers
    : DEFAULT_SUPPLIERS;
  return source.map((supplier) => {
    const isMultiparafusos = supplier.id === "SUP-MULTIPARAFUSOS"
      || normalize(supplier.name) === "MULTIPARAFUSOS";
    const migrated = {
      ...supplier,
      ...(isMultiparafusos
        ? {
            commercialUrl: MULTIPARAFUSOS_COMMERCIAL_URL,
            verifiedAt: "2026-07-24",
          }
        : {}),
    };
    return {
      ...migrated,
      officialSiteUrl: officialSupplierSiteUrl(migrated.commercialUrl, migrated.name, { trusted: true }),
    };
  });
}

function supplierByName(name, suppliers) {
  const normalizedName = normalize(name);
  if (!normalizedName) return null;
  return (suppliers || []).find((supplier) => {
    const candidate = normalize(supplier?.name);
    return candidate === normalizedName
      || (candidate.length >= 5 && normalizedName.includes(candidate))
      || (normalizedName.length >= 5 && candidate.includes(normalizedName));
  }) || null;
}

function verifiedSupplierSite(item, suppliers) {
  const supplierName = sanitizeText(item?.supplierName || item?.title, 120);
  const knownSupplier = supplierByName(supplierName, suppliers);
  const trustedSite = officialSupplierSiteUrl(
    knownSupplier?.commercialUrl,
    knownSupplier?.name || supplierName,
    { trusted: true },
  );
  const candidate = item?.officialSiteUrl
    || (item?.kind === "SUPPLIER" && item?.officialSiteConfirmed === true ? item?.sourceUrl : "");
  return trustedSite || officialSupplierSiteUrl(candidate, supplierName);
}

function verifiedOfferUrl(item) {
  const candidate = safeUrl(item?.offerUrl || (item?.kind === "OFFER" ? item?.sourceUrl : ""));
  return candidate && !isLocationServiceUrl(candidate) ? candidate : "";
}

function migrateMarketSearches(searches, suppliers) {
  return (Array.isArray(searches) ? searches : []).map((search) => {
    const results = (Array.isArray(search?.results) ? search.results : [])
      .filter((item) => item?.locationConfirmed === true
        && item?.stateCode === "PR"
        && item?.distanceStatus === "WITHIN_RADIUS")
      .map((item) => {
        const kind = item?.kind === "SUPPLIER" ? "SUPPLIER" : "OFFER";
        const officialSiteUrl = verifiedSupplierSite({ ...item, kind }, suppliers);
        const offerUrl = verifiedOfferUrl({ ...item, kind });
        return {
          ...item,
          kind,
          sourceUrl: kind === "SUPPLIER" ? officialSiteUrl : offerUrl,
          officialSiteUrl,
          offerUrl,
          officialSiteConfirmed: Boolean(officialSiteUrl),
          offerUrlConfirmed: kind === "OFFER" && Boolean(offerUrl),
          phoneNumber: sanitizeText(item?.phoneNumber, 80),
          phoneDigits: sanitizeText(item?.phoneDigits, 20).replace(/\D/g, ""),
          whatsappUrl: safeWhatsappUrl(item?.whatsappUrl),
          whatsappConfirmed: item?.whatsappConfirmed === true && Boolean(safeWhatsappUrl(item?.whatsappUrl)),
          contactSource: sanitizeText(item?.contactSource, 80),
        };
      });
    return {
      ...search,
      boundary: { strict: true, stateCode: "PR", stateName: "Paraná" },
      results,
      counts: {
        ...(search?.counts || {}),
        resultCount: results.length,
        offersWithPrice: results.filter((item) => item.kind === "OFFER" && Number(item.price) > 0).length,
        suppliersWithSite: new Set(results.filter((item) => item.officialSiteConfirmed && item.officialSiteUrl).map((item) => normalize(item.supplierName))).size,
        suppliersWithPhone: new Set(results.filter((item) => item.phoneNumber).map((item) => normalize(item.supplierName))).size,
        suppliersWithWhatsapp: new Set(results.filter((item) => item.whatsappUrl).map((item) => normalize(item.supplierName))).size,
        outsideRadius: 0,
      },
    };
  });
}

function statusFor(item) {
  if (item.current === null || item.balanceKnown === false) return "VERIFICAR NO ESTOQUE";
  if (item.current <= 0) return "COMPRA URGENTE";
  if (item.requiresReview === true) return "CONFERIR DETALHAMENTO";
  if (item.minimum === null || item.minimumKnown === false) return "DEFINIR MÍNIMO";
  if (item.current < item.minimum) return "COMPRAR MATERIAL";
  return "ESTOQUE ADEQUADO";
}

function reliabilityScore(value) {
  const normalized = normalize(value);
  if (normalized === "ALTA") return 1;
  if (normalized === "MEDIA") return 0.78;
  if (normalized === "BAIXA") return 0.35;
  return 0.5;
}

function migrateStock(stock, schemaVersion, options = {}) {
  const legacyBalances = Number(schemaVersion || 1) < 2;
  const migrated = (Array.isArray(stock) ? stock : []).map((raw, index) => {
    const code = sanitizeText(raw.code || `MAT-${String(index + 1).padStart(3, "0")}`, 40);
    const sourcePresentation = sanitizeText(raw.sourcePresentation || raw.unit || "UN.", 40) || "UN.";
    const unitsPerPackage = packageSizeFrom({ ...raw, sourcePresentation });
    const explicitlyUnknown = raw.balanceKnown === false;
    const unknownLegacyBalance = legacyBalances && LEGACY_UNKNOWN_BALANCES.has(code);
    const originalCurrent = finiteOrNull(raw.current);
    const balanceKnown = !explicitlyUnknown && !unknownLegacyBalance && originalCurrent !== null;
    const current = balanceKnown
      ? (legacyBalances ? originalCurrent * unitsPerPackage : originalCurrent)
      : null;
    const unit = unitsPerPackage > 1 ? "UN." : sanitizeText(raw.unit || sourcePresentation || "UN.", 30);
    const material = sanitizeText(raw.material, 180);
    const base = {
      ...raw,
      code,
      material,
      category: sanitizeText(raw.category || (isMdfWhiteBerneck18({ code, material }) ? "MDF 18 MM" : "MATERIAL GERAL"), 80),
      unit,
      sourcePresentation,
      unitsPerPackage,
      sourceBalance: raw.sourceBalance ?? (legacyBalances ? originalCurrent : null),
      current,
      balanceKnown,
      minimumKnown: raw.minimumKnown !== false,
      minimumDetail: sanitizeText(raw.minimumDetail, 160),
      minimumRequiresReview: raw.minimumRequiresReview === true,
      minimum: minimumFor({ ...raw, code, material }),
      monthlyConsumption: Math.max(0, finiteOrNull(raw.monthlyConsumption) || 0),
      notes: sanitizeText(raw.notes || raw.observation, 500),
      quantityDetail: sanitizeText(raw.quantityDetail, 300),
      quantityComponents: Array.isArray(raw.quantityComponents)
        ? raw.quantityComponents.slice(0, 12).map((component) => ({
            quantity: Math.max(0, finiteOrNull(component?.quantity) || 0),
            unit: sanitizeText(component?.unit || "UN.", 30),
            detail: sanitizeText(component?.detail, 160),
          }))
        : [],
      requiresReview: raw.requiresReview === true,
      lastCountAt: raw.lastCountAt || raw.lastCheckedAt || null,
    };
    delete base.ideal;
    return base;
  }).filter((item) => item.material);

  if (options.allowImplicitMdf !== false && !migrated.some(isMdfWhiteBerneck18)) {
    migrated.push({
      code: MDF_CODE,
      category: "MDF 18 MM",
      material: "CHAPA MDF BRANCO BERNECK 18 MM",
      unit: "CHAPA",
      sourcePresentation: "CHAPA",
      unitsPerPackage: 1,
      sourceBalance: null,
      current: null,
      balanceKnown: false,
      minimum: 20,
      monthlyConsumption: 0,
      notes: "Berneck, branco, espessura 18 mm; confirmar saldo físico.",
      lastCountAt: null,
    });
  }

  return migrated.map((item) => ({ ...item, minimum: minimumFor(item) }));
}

function migrateBase(input) {
  const base = input && typeof input === "object" ? input : {};
  const suppliers = migrateSuppliers(base.suppliers);
  return {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    settings: {
      horizonDays: 90,
      safetyDays: 15,
      supplierLeadDays: 7,
      location: "Maringá/PR",
      marketRadiusKm: 100,
      ...(base.settings || {}),
    },
    stock: migrateStock(base.stock, base.schemaVersion, {
      allowImplicitMdf: base.explicitStockSet !== true,
    }),
    invoiceItems: Array.isArray(base.invoiceItems) ? base.invoiceItems : [],
    invoices: Array.isArray(base.invoices) ? base.invoices : [],
    movements: Array.isArray(base.movements) ? base.movements : [],
    stockCounts: Array.isArray(base.stockCounts) ? base.stockCounts : [],
    stockBackups: Array.isArray(base.stockBackups) ? base.stockBackups : [],
    appliedStockResets: Array.isArray(base.appliedStockResets) ? base.appliedStockResets : [],
    appliedStockSupplements: Array.isArray(base.appliedStockSupplements) ? base.appliedStockSupplements : [],
    stockSupplementHistory: Array.isArray(base.stockSupplementHistory) ? base.stockSupplementHistory : [],
    quotations: Array.isArray(base.quotations) ? base.quotations : [],
    marketSearches: migrateMarketSearches(base.marketSearches, suppliers),
    suppliers,
  };
}

function materialsMatch(item, entry) {
  const material = normalize(item.material);
  const candidate = normalize(entry.normalizedMaterial || entry.description);
  if (!material || !candidate) return false;
  if (material === candidate || material.includes(candidate) || candidate.includes(material)) return true;
  const materialTokens = material.split(" ").filter((token) => token.length >= 3);
  if (materialTokens.length < 2) return false;
  const hits = materialTokens.filter((token) => candidate.includes(token)).length;
  return hits >= Math.max(2, Math.ceil(materialTokens.length * 0.7));
}

function quoteSupplier(quote, suppliers) {
  return suppliers.find((supplier) => supplier.id === quote.supplierId)
    || suppliers.find((supplier) => normalize(supplier.name) === normalize(quote.supplierName))
    || null;
}

function rankQuotations(quotes, suppliers) {
  const usable = quotes.filter((quote) => Number(quote.unitPrice) > 0 && Number(quote.quantity) > 0);
  if (!usable.length) return [];
  const prepared = usable.map((quote) => {
    const supplier = quoteSupplier(quote, suppliers);
    const quantity = Number(quote.quantity);
    const freightValue = finiteOrNull(quote.freight);
    const freightKnown = quote.freightKnown === false ? false : freightValue !== null;
    const freight = freightKnown ? Math.max(0, freightValue) : null;
    const totalCost = (Number(quote.unitPrice) * quantity) + (freightKnown ? freight : 0);
    const landedUnitCost = totalCost / quantity;
    const deliveryDays = Math.max(0, Number(quote.deliveryDays) || 0);
    const reliability = sanitizeText(quote.reliability || supplier?.reliability || "NÃO AVALIADA", 30);
    return {
      ...quote,
      supplierName: sanitizeText(quote.supplierName || supplier?.name || "Fornecedor não informado", 120),
      reliability,
      quantity,
      freight,
      freightKnown,
      totalCost,
      landedUnitCost,
      deliveryDays,
      sourceUrl: safeUrl(quote.sourceUrl),
    };
  });
  const lowestCost = Math.min(...prepared.map((quote) => quote.landedUnitCost));
  const knownDelivery = prepared.map((quote) => quote.deliveryDays).filter((days) => days > 0);
  const fastestDelivery = knownDelivery.length ? Math.min(...knownDelivery) : null;
  return prepared.map((quote) => {
    const costScore = lowestCost / quote.landedUnitCost;
    const deliveryScore = fastestDelivery && quote.deliveryDays
      ? fastestDelivery / quote.deliveryDays
      : 0.5;
    const freightConfidence = quote.freightKnown ? 1 : 0.72;
    const paymentScore = Number.isFinite(Number(quote.paymentScore))
      ? Math.max(0, Math.min(1, Number(quote.paymentScore)))
      : 0.5;
    const score = (costScore * freightConfidence * 0.5)
      + (deliveryScore * 0.2)
      + (reliabilityScore(quote.reliability) * 0.2)
      + (paymentScore * 0.1);
    return { ...quote, score };
  }).sort((left, right) => right.score - left.score || left.landedUnitCost - right.landedUnitCost);
}

function enrich(input) {
  const base = migrateBase(input);
  const history = base.invoiceItems;

  const stock = base.stock.map((raw) => {
    const matches = history
      .filter((entry) => materialsMatch(raw, entry))
      .sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const prices = matches.map((entry) => Number(entry.unitPrice)).filter((value) => value > 0);
    const buyNow = raw.current === null || raw.minimum === null || raw.requiresReview === true
      ? null
      : Math.max(0, Number(raw.minimum) - Number(raw.current));
    const rankedQuotations = rankQuotations(
      base.quotations.filter((quote) => quote.materialCode === raw.code && quote.active !== false),
      base.suppliers,
    );
    const recommendedQuotation = rankedQuotations[0] || null;
    const lastPrice = prices.length ? prices.at(-1) : 0;
    const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0;
    const lowestPrice = prices.length ? Math.min(...prices) : 0;
    const referenceUnitPrice = recommendedQuotation?.landedUnitCost || lastPrice || averagePrice || 0;
    const forecastCost = buyNow === null ? 0 : buyNow * referenceUnitPrice;
    const quotedPrices = rankedQuotations.map((quote) => quote.landedUnitCost);
    const potentialSaving = buyNow && quotedPrices.length > 1
      ? buyNow * Math.max(0, Math.max(...quotedPrices) - Math.min(...quotedPrices))
      : buyNow * Math.max(0, lastPrice - lowestPrice);

    return {
      ...raw,
      balanceKnown: raw.current !== null,
      minimum: minimumFor(raw),
      buyNow,
      status: statusFor(raw),
      lastPrice,
      averagePrice,
      lowestPrice,
      forecastCost,
      potentialSaving,
      historyCount: matches.length,
      quotationCount: rankedQuotations.length,
      quotations: rankedQuotations,
      recommendedQuotation,
    };
  });

  const invoices = base.invoices;
  const knownStock = stock.filter((item) => item.current !== null);
  const buyItems = stock.filter((item) => Number(item.buyNow) > 0);
  const verifyItems = stock.filter((item) => item.current === null
    || item.requiresReview === true
    || item.minimum === null
    || item.minimumKnown === false);
  const marketSearches = [...base.marketSearches]
    .sort((left, right) => String(right.searchedAt).localeCompare(String(left.searchedAt)))
    .slice(0, 50);
  const movements = [...base.movements]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const stockCounts = [...base.stockCounts]
    .sort((left, right) => String(right.importedAt).localeCompare(String(left.importedAt)))
    .slice(0, STOCK_COUNT_HISTORY_LIMIT);

  return {
    ...base,
    stock,
    invoices,
    movements,
    stockCounts,
    marketSearches,
    summary: {
      materialCount: stock.length,
      knownCount: knownStock.length,
      adequateCount: stock.filter((item) => item.status === "ESTOQUE ADEQUADO").length,
      buyCount: buyItems.length,
      urgentCount: stock.filter((item) => item.status === "COMPRA URGENTE").length,
      criticalCount: stock.filter((item) => ["COMPRA URGENTE", "COMPRAR MATERIAL"].includes(item.status)).length,
      verifyCount: verifyItems.length,
      actionCount: buyItems.length + verifyItems.length,
      forecastCost: stock.reduce((sum, item) => sum + Number(item.forecastCost || 0), 0),
      potentialSaving: stock.reduce((sum, item) => sum + Number(item.potentialSaving || 0), 0),
      pricedCount: stock.filter((item) => item.lastPrice > 0 || item.quotationCount > 0).length,
      unpricedBuyCount: buyItems.filter((item) => !item.lastPrice && !item.quotationCount).length,
      invoiceCount: invoices.length,
      invoiceTotal: invoices.reduce((sum, item) => sum + Number(item.total || 0), 0),
      pendingInvoices: invoices.filter((item) => item.status !== "CONFIRMADA").length,
      movementCount: movements.length,
      lastMovementAt: movements[0]?.createdAt || null,
      stockCountCount: stockCounts.length,
      lastStockCountAt: stockCounts[0]?.importedAt || null,
      quotationCount: base.quotations.filter((item) => item.active !== false).length,
      supplierCount: base.suppliers.length,
    },
  };
}

function locateStockTableInRows(rows) {
  let best = null;
  const limit = Math.min(rows.length, 80);
  for (let headerIndex = 0; headerIndex < limit; headerIndex += 1) {
    const mapping = stockColumnMapping(rows, headerIndex);
    if (!mapping.material || !mapping.current || mapping.material.stats.filled === 0) continue;
    const genericQuantity = mapping.current.aliasIndex >= STOCK_HEADER_ALIASES.current.indexOf("QUANTIDADE");
    if (genericQuantity && mapping.current.stats.numeric === 0 && mapping.current.stats.quantityLike === 0) continue;
    const optionalColumns = ["code", "unit", "multiplier", "category", "checkedAt", "notes", "location"]
      .filter((key) => Boolean(mapping[key])).length;
    const score = 500
      + mapping.material.stats.filled * 4
      + mapping.current.stats.numeric * 7
      + mapping.current.stats.quantityLike * 5
      + optionalColumns * 12
      - headerIndex;
    if (!best || score > best.score) best = { headerIndex, mapping, score };
  }
  return best;
}

function locateStockTable(workbook) {
  let best = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const located = locateStockTableInRows(rows);
    if (!located) continue;
    const candidate = { ...located, sheetName, rows };
    if (!best || candidate.score > best.score) best = candidate;
  }
  if (!best) {
    throw new Error("Não encontrei uma tabela de levantamento com as colunas MATERIAL e ESTOQUE ATUAL/QUANTIDADE.");
  }
  return best;
}

function isGenericStockSheetName(sheetName) {
  const name = normalize(sheetName);
  return !name
    || /^PLANILHA\s*\d*$/.test(name)
    || ["ESTOQUE", "BALANCO", "RESUMO", "GERAL", "BASE"].includes(name);
}

function categoryFromSheetName(sheetName) {
  const name = normalize(sheetName);
  if (name === "FERRAGEM" || name === "FERRAGENS") return "FERRAGEM";
  if (name === "MDF") return "MDF";
  if (name === "MATERIAL GERAL" || name === "MATERIAIS GERAIS") return "MATERIAL GERAL";
  return sanitizeText(sheetName, 80);
}

function consolidateParsedParts(parts) {
  const stock = [];
  const byMaterial = new Map();
  let crossSheetDuplicates = 0;

  for (const part of parts) {
    for (const item of part.stock) {
      const key = normalize(item.material);
      const existingIndex = byMaterial.get(key);
      if (existingIndex === undefined) {
        byMaterial.set(key, stock.length);
        stock.push({ ...item });
        continue;
      }
      crossSheetDuplicates += 1;
      const previous = stock[existingIndex];
      const compatible = normalize(previous.unit) === normalize(item.unit)
        && Number(previous.unitsPerPackage || 1) === Number(item.unitsPerPackage || 1);
      if (compatible && previous.balanceKnown && item.balanceKnown) {
        previous.current += item.current;
        previous.sourceBalance = Number(previous.sourceBalance || 0) + Number(item.sourceBalance || 0);
      } else if (!previous.balanceKnown && item.balanceKnown) {
        previous.current = item.current;
        previous.sourceBalance = item.sourceBalance;
        previous.balanceKnown = true;
      } else if (!compatible) {
        previous.current = null;
        previous.sourceBalance = null;
        previous.balanceKnown = false;
      }
      previous.quantityDetail = [previous.quantityDetail, item.quantityDetail].filter(Boolean).join(" + ");
      previous.quantityComponents = [
        ...(previous.quantityComponents || []),
        ...(item.quantityComponents || []),
      ].slice(0, 12);
      previous.requiresReview = previous.requiresReview || item.requiresReview || !compatible;
      previous.sourceRows = [...(previous.sourceRows || []), ...(item.sourceRows || [])];
      previous.sourceLocations = [...(previous.sourceLocations || []), ...(item.sourceLocations || [])];
      if (previous.minimumKnown && item.minimumKnown) {
        previous.minimum = Math.max(Number(previous.minimum) || 0, Number(item.minimum) || 0);
      } else if (!previous.minimumKnown && item.minimumKnown) {
        previous.minimum = item.minimum;
        previous.minimumKnown = true;
      }
      previous.minimumDetail = [...new Set([previous.minimumDetail, item.minimumDetail].filter(Boolean))].join(" / ");
    }
  }

  const warnings = parts.flatMap((part) => part.warnings || []);
  if (parts.length > 1) warnings.unshift(`${parts.length} abas categorizadas foram consolidadas em uma única base de estoque.`);
  if (crossSheetDuplicates) warnings.push(`${crossSheetDuplicates} materiais repetidos entre abas foram consolidados.`);
  return {
    sheetName: parts.map((part) => part.sheetName).join(" + "),
    sheetNamesUsed: parts.map((part) => part.sheetName),
    headerRow: parts[0]?.headerRow || 1,
    sourceRowCount: parts.reduce((sum, part) => sum + Number(part.sourceRowCount || 0), 0),
    validRowCount: stock.length,
    columns: parts[0]?.columns || {},
    columnsBySheet: Object.fromEntries(parts.map((part) => [part.sheetName, part.columns])),
    stock,
    ignoredRows: parts.flatMap((part) => (part.ignoredRows || []).map((row) => ({ ...row, sheetName: part.sheetName }))),
    warnings: [...new Set(warnings)],
  };
}

function parseStockRows(rows, options = {}) {
  const located = options.headerIndex === undefined
    ? locateStockTableInRows(rows)
    : {
        headerIndex: Number(options.headerIndex),
        mapping: options.mapping || stockColumnMapping(rows, Number(options.headerIndex)),
      };
  if (!located?.mapping?.material || !located?.mapping?.current) {
    throw new Error("Não encontrei as colunas necessárias para o levantamento de estoque.");
  }

  const { headerIndex, mapping } = located;
  const stock = [];
  const ignoredRows = [];
  const warnings = [];
  const byMaterial = new Map();
  let pendingBalances = 0;
  let invalidBalances = 0;
  let reviewBalances = 0;
  let duplicateRows = 0;

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const rawMaterial = row[mapping.material.columnIndex];
    if (isBlank(rawMaterial)) {
      const hasOtherData = row.some((value) => !isBlank(value));
      if (hasOtherData) ignoredRows.push({ row: rowIndex + 1, reason: "Linha sem identificação do material." });
      continue;
    }
    const material = sanitizeText(rawMaterial, 180);
    if (!material || ["TOTAL", "TOTAIS", "SUBTOTAL"].includes(normalize(material))) continue;

    const rawBalance = row[mapping.current.columnIndex];
    const parsedQuantity = parseStockQuantity(rawBalance);
    const invalidBalance = !isBlank(rawBalance) && !parsedQuantity.balanceKnown;
    const balanceKnown = parsedQuantity.balanceKnown;
    if (!balanceKnown) pendingBalances += 1;
    if (invalidBalance) invalidBalances += 1;
    if (parsedQuantity.requiresReview) reviewBalances += 1;

    const rawPresentation = mapping.unit ? row[mapping.unit.columnIndex] : null;
    const sourcePresentation = sanitizeText(rawPresentation || parsedQuantity.sourcePresentation || "UN.", 40) || "UN.";
    const explicitMultiplier = mapping.multiplier
      ? parseStockNumber(row[mapping.multiplier.columnIndex])
      : null;
    const unitsPerPackage = explicitMultiplier && explicitMultiplier > 0
      ? explicitMultiplier
      : packageSizeFrom({ sourcePresentation }) || 1;
    const sourceBalance = balanceKnown ? parsedQuantity.current : null;
    const sourceCode = mapping.code ? sanitizeText(row[mapping.code.columnIndex], 40) : "";
    const minimumCell = mapping.minimum ? row[mapping.minimum.columnIndex] : null;
    const parsedMinimum = mapping.minimum && !isBlank(minimumCell)
      ? parseStockMinimum(minimumCell)
      : {
          minimum: minimumFor({ code: sourceCode, material }),
          minimumKnown: true,
          minimumDetail: "",
          minimumRequiresReview: false,
        };
    const item = {
      code: sourceCode,
      sourceCode,
      category: sanitizeText(mapping.category ? row[mapping.category.columnIndex] : options.defaultCategory, 80)
        || (isMdfWhiteBerneck18({ code: sourceCode, material }) ? "MDF 18 MM" : "MATERIAL GERAL"),
      material,
      unit: unitsPerPackage > 1 ? "UN." : sourcePresentation,
      sourcePresentation,
      unitsPerPackage,
      sourceBalance,
      current: balanceKnown ? sourceBalance * unitsPerPackage : null,
      balanceKnown,
      minimum: parsedMinimum.minimum,
      minimumKnown: parsedMinimum.minimumKnown,
      minimumDetail: parsedMinimum.minimumDetail,
      minimumRequiresReview: parsedMinimum.minimumRequiresReview,
      monthlyConsumption: 0,
      notes: sanitizeText(mapping.notes ? row[mapping.notes.columnIndex] : "", 500),
      quantityDetail: parsedQuantity.quantityDetail,
      quantityComponents: parsedQuantity.quantityComponents,
      requiresReview: parsedQuantity.requiresReview || parsedMinimum.minimumRequiresReview,
      storageLocation: sanitizeText(mapping.location ? row[mapping.location.columnIndex] : "", 120),
      lastCountAt: normalizedDate(mapping.checkedAt ? row[mapping.checkedAt.columnIndex] : null),
      invalidBalance,
      sourceRow: rowIndex + 1,
      sourceRows: [rowIndex + 1],
      sourceLocations: [`${sanitizeText(options.sheetName || "Planilha1", 100)}!${rowIndex + 1}`],
    };

    const duplicateKey = normalize(material);
    const previousIndex = byMaterial.get(duplicateKey);
    if (previousIndex === undefined) {
      byMaterial.set(duplicateKey, stock.length);
      stock.push(item);
      continue;
    }

    duplicateRows += 1;
    const previous = stock[previousIndex];
    const compatiblePackage = previous.unitsPerPackage === item.unitsPerPackage
      && normalize(previous.sourcePresentation) === normalize(item.sourcePresentation);
    if (compatiblePackage && previous.balanceKnown && item.balanceKnown) {
      previous.sourceBalance += item.sourceBalance;
      previous.current += item.current;
    } else if (!previous.balanceKnown && item.balanceKnown) {
      previous.sourceBalance = item.sourceBalance;
      previous.current = item.current;
      previous.balanceKnown = true;
      previous.invalidBalance = false;
    } else if (!compatiblePackage) {
      previous.current = null;
      previous.sourceBalance = null;
      previous.balanceKnown = false;
      previous.invalidBalance = true;
      invalidBalances += 1;
    }
    previous.quantityDetail = [previous.quantityDetail, item.quantityDetail].filter(Boolean).join(" + ");
    previous.quantityComponents = [
      ...(previous.quantityComponents || []),
      ...(item.quantityComponents || []),
    ].slice(0, 12);
    previous.requiresReview = previous.requiresReview || item.requiresReview || !compatiblePackage;
    if (previous.minimumKnown && item.minimumKnown) {
      previous.minimum = Math.max(Number(previous.minimum) || 0, Number(item.minimum) || 0);
    } else if (!previous.minimumKnown && item.minimumKnown) {
      previous.minimum = item.minimum;
      previous.minimumKnown = true;
    }
    previous.minimumDetail = [...new Set([previous.minimumDetail, item.minimumDetail].filter(Boolean))].join(" / ");
    previous.sourceRows.push(rowIndex + 1);
    previous.sourceLocations.push(`${sanitizeText(options.sheetName || "Planilha1", 100)}!${rowIndex + 1}`);
  }

  if (!stock.length) throw new Error("A planilha não contém materiais utilizáveis.");
  if (pendingBalances) warnings.push(`${pendingBalances} ${pendingBalances === 1 ? "material está" : "materiais estão"} sem saldo válido e ficarão como VERIFICAR NO ESTOQUE.`);
  if (invalidBalances) warnings.push(`${invalidBalances} ${invalidBalances === 1 ? "saldo inválido foi identificado" : "saldos inválidos foram identificados"}; valores negativos ou textos não serão aplicados como quantidade.`);
  if (reviewBalances) warnings.push(`${reviewBalances} ${reviewBalances === 1 ? "material possui" : "materiais possuem"} quantidades compostas; o detalhamento original será preservado para conferência.`);
  if (duplicateRows) warnings.push(`${duplicateRows} ${duplicateRows === 1 ? "linha repetida foi consolidada" : "linhas repetidas foram consolidadas"} pelo nome do material.`);
  if (ignoredRows.length) warnings.push(`${ignoredRows.length} ${ignoredRows.length === 1 ? "linha foi ignorada" : "linhas foram ignoradas"} por não identificar um material.`);

  const header = rows[headerIndex] || [];
  const columnInfo = {};
  for (const [key, column] of Object.entries(mapping)) {
    if (!column) continue;
    columnInfo[key] = {
      column: columnAddress(column),
      header: sanitizeText(header[column.columnIndex], 100),
    };
  }

  return {
    sheetName: sanitizeText(options.sheetName || "Planilha1", 100),
    headerRow: headerIndex + 1,
    sourceRowCount: Math.max(0, rows.length - headerIndex - 1),
    validRowCount: stock.length,
    columns: columnInfo,
    stock,
    ignoredRows,
    warnings,
  };
}

function parseStockWorkbookDetailed(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const candidates = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const located = locateStockTableInRows(rows);
    if (!located) continue;
    const parsedSheet = parseStockRows(rows, {
      sheetName,
      headerIndex: located.headerIndex,
      mapping: located.mapping,
      defaultCategory: categoryFromSheetName(sheetName),
    });
    candidates.push({ ...parsedSheet, score: located.score, generic: isGenericStockSheetName(sheetName) });
  }
  if (!candidates.length) {
    throw new Error("Não encontrei uma tabela de levantamento com as colunas MATERIAL e ESTOQUE ATUAL/QUANTIDADE.");
  }
  const categorized = candidates.filter((candidate) => !candidate.generic);
  const selected = categorized.length >= 2
    ? categorized
    : [candidates.sort((left, right) => right.score - left.score)[0]];
  const parsed = consolidateParsedParts(selected);
  const extension = path.extname(filePath).toLowerCase();
  return {
    ...parsed,
    fileName: path.basename(filePath),
    fileType: extension.replace(".", "").toUpperCase() || "PLANILHA",
    fileHash: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
    sheetNames: [...workbook.SheetNames],
  };
}

function parseStockWorkbook(filePath) {
  const parsed = parseStockWorkbookDetailed(filePath);
  return migrateStock(parsed.stock.map((item, index) => ({
    ...item,
    code: item.sourceCode || `MAT-${String(index + 1).padStart(3, "0")}`,
  })), SCHEMA_VERSION, { allowImplicitMdf: false });
}

function materialIdentity(value) {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.length >= 5 && token.endsWith("S") ? token.slice(0, -1) : token)
    .join(" ");
}

function stockMatchIndex(item, stock) {
  const sourceCode = normalize(item.sourceCode || item.code);
  if (sourceCode) {
    const byCode = stock.findIndex((candidate) => normalize(candidate.code) === sourceCode);
    if (byCode >= 0) return byCode;
  }
  const material = normalize(item.material);
  const exact = stock.findIndex((candidate) => normalize(candidate.material) === material);
  if (exact >= 0) return exact;
  const identity = materialIdentity(item.material);
  const compatible = stock
    .map((candidate, index) => ({ index, identity: materialIdentity(candidate.material) }))
    .filter((candidate) => candidate.identity === identity);
  return compatible.length === 1 ? compatible[0].index : -1;
}

function stockCodeAllocator(stock) {
  const used = new Set(stock.map((item) => normalize(item.code)).filter(Boolean));
  let sequence = stock.reduce((highest, item) => {
    const match = String(item.code || "").match(/^MAT-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return (preferred) => {
    const safePreferred = sanitizeText(preferred, 40);
    if (safePreferred && !used.has(normalize(safePreferred))) {
      used.add(normalize(safePreferred));
      return safePreferred;
    }
    let code;
    do {
      code = `MAT-${String(sequence).padStart(3, "0")}`;
      sequence += 1;
    } while (used.has(normalize(code)));
    used.add(normalize(code));
    return code;
  };
}

function stockImportMode(value) {
  return normalize(value) === "REPLACE" ? "REPLACE" : "MERGE";
}

function buildStockImportPreview(parsed, current, options = {}) {
  const base = enrich(current);
  const mode = stockImportMode(options.mode || parsed.mode);
  const matchedIndexes = new Set();
  const rows = parsed.stock.map((item) => {
    const index = stockMatchIndex(item, base.stock);
    const previous = index >= 0 ? base.stock[index] : null;
    if (index >= 0) matchedIndexes.add(index);
    const before = previous?.current ?? null;
    const after = item.current;
    let action = "UPDATE";
    if (!item.balanceKnown) action = "VERIFY";
    else if (!previous) action = "NEW";
    else if (before === after) action = "UNCHANGED";
    return {
      material: item.material,
      materialCode: previous?.code || item.sourceCode || "NOVO",
      sourceRow: item.sourceRow,
      sourceRows: item.sourceRows,
      sourceLocations: item.sourceLocations,
      sourcePresentation: item.sourcePresentation,
      unit: item.unit,
      before,
      after,
      difference: before !== null && after !== null ? after - before : null,
      action,
      isNew: !previous,
      invalidBalance: item.invalidBalance === true,
      quantityDetail: item.quantityDetail || "",
      minimum: item.minimum,
      minimumKnown: item.minimumKnown !== false,
      requiresReview: item.requiresReview === true,
    };
  });
  const duplicate = base.stockCounts.find((count) => count.fileHash && count.fileHash === parsed.fileHash) || null;
  const totals = {
    sourceRows: parsed.sourceRowCount,
    validItems: parsed.stock.length,
    matchedItems: matchedIndexes.size,
    newItems: rows.filter((row) => row.isNew).length,
    changedItems: rows.filter((row) => row.action === "UPDATE").length,
    unchangedItems: rows.filter((row) => row.action === "UNCHANGED").length,
    pendingItems: rows.filter((row) => row.action === "VERIFY").length,
    preservedItems: mode === "REPLACE" ? 0 : Math.max(0, base.stock.length - matchedIndexes.size),
    removedItems: mode === "REPLACE" ? base.stock.length : 0,
    replacedBaseItems: mode === "REPLACE" ? base.stock.length : 0,
    ignoredRows: parsed.ignoredRows.length,
  };
  const warnings = [...parsed.warnings];
  if (mode === "REPLACE") {
    warnings.unshift(`SUBSTITUIÇÃO TOTAL: os ${base.stock.length} materiais ativos e os históricos vinculados ao estoque atual serão arquivados em backup antes da troca.`);
  }
  if (duplicate) warnings.unshift(`Este mesmo arquivo já foi aplicado em ${new Date(duplicate.importedAt).toLocaleString("pt-BR")} por ${duplicate.registeredBy}.`);
  return {
    ...parsed,
    mode,
    rows,
    totals,
    duplicate: duplicate
      ? { id: duplicate.id, importedAt: duplicate.importedAt, registeredBy: duplicate.registeredBy }
      : null,
    warnings,
  };
}

function previewStockImport(filePath, current, options = {}) {
  return buildStockImportPreview(parseStockWorkbookDetailed(filePath), current, options);
}

function cleanImportedStockItem(imported, code, importedAt, previous = null) {
  const minimumKnown = imported.minimumKnown !== false;
  const nextItem = {
    ...previous,
    ...imported,
    code,
    category: imported.category || previous?.category || "MATERIAL GERAL",
    notes: imported.notes || previous?.notes || "",
    storageLocation: imported.storageLocation || previous?.storageLocation || "",
    minimum: minimumKnown ? imported.minimum : (previous?.minimum ?? null),
    minimumKnown: minimumKnown || previous?.minimumKnown === true,
    current: imported.balanceKnown ? imported.current : null,
    balanceKnown: imported.balanceKnown === true && imported.current !== null,
    lastCountAt: imported.balanceKnown && imported.current !== null
      ? importedAt
      : previous?.lastCountAt || null,
    lastCountAttemptAt: importedAt,
  };
  delete nextItem.sourceCode;
  delete nextItem.sourceRow;
  delete nextItem.sourceRows;
  delete nextItem.sourceLocations;
  delete nextItem.invalidBalance;
  return nextItem;
}

function applyStockReplacement(base, preview, registeredBy, options = {}) {
  const importedAt = options.importedAt || new Date().toISOString();
  const countId = `LEV-${crypto.randomUUID()}`;
  const backup = {
    id: `BKP-${crypto.randomUUID()}`,
    createdAt: importedAt,
    reason: sanitizeText(options.reason || `Substituição total por ${preview.fileName}`, 240),
    sourceFile: preview.fileName,
    registeredBy,
    stock: base.stock,
    movements: base.movements,
    stockCounts: base.stockCounts,
    quotations: base.quotations,
    marketSearches: base.marketSearches,
    stockSource: base.stockSource || null,
  };
  const allocateCode = stockCodeAllocator([]);
  const stock = preview.stock.map((imported) => {
    const code = allocateCode(imported.sourceCode || imported.code);
    return cleanImportedStockItem(imported, code, importedAt);
  });
  const movements = stock.map((item) => ({
    id: `MOV-${crypto.randomUUID()}`,
    stockCountId: countId,
    materialCode: item.code,
    material: item.material,
    unit: item.unit,
    type: item.current === null ? "CONTAGEM PENDENTE" : "ESTOQUE INICIAL",
    quantity: item.current,
    before: null,
    after: item.current,
    reason: item.current === null
      ? `Saldo não convertido com segurança no levantamento ${preview.fileName}`
      : `Saldo inicial criado pela substituição total ${preview.fileName}`,
    registeredBy,
    document: preview.fileName,
    createdAt: importedAt,
  }));
  const historyRecord = {
    id: countId,
    mode: "REPLACE",
    fileName: preview.fileName,
    fileType: preview.fileType,
    fileHash: preview.fileHash,
    sheetName: preview.sheetName,
    sheetNamesUsed: preview.sheetNamesUsed || [],
    headerRow: preview.headerRow,
    columns: preview.columns,
    importedAt,
    registeredBy,
    backupId: backup.id,
    totals: {
      ...preview.totals,
      appliedMovements: movements.length,
      removedItems: base.stock.length,
      replacedBaseItems: base.stock.length,
    },
    warnings: (preview.warnings || []).slice(0, 30),
  };
  return enrich({
    ...base,
    explicitStockSet: true,
    stock,
    movements,
    stockCounts: [historyRecord],
    quotations: [],
    marketSearches: [],
    stockBackups: [backup, ...(base.stockBackups || [])].slice(0, 10),
    updatedAt: importedAt,
    stockSource: preview.fileName,
    stockSourceHash: preview.fileHash,
  });
}

function applyStockImport(current, preview, registeredByValue, options = {}) {
  const base = enrich(current);
  const registeredBy = sanitizeText(registeredByValue, 100);
  if (registeredBy.length < 2) throw new Error("Informe o nome do responsável pelo levantamento.");
  if (!preview?.fileHash || !Array.isArray(preview.stock) || !preview.stock.length) {
    throw new Error("A prévia do levantamento não é válida. Selecione a planilha novamente.");
  }
  const duplicate = options.allowDuplicate === true
    ? null
    : base.stockCounts.find((count) => count.fileHash === preview.fileHash);
  if (duplicate) {
    throw new Error(`Este mesmo arquivo já foi aplicado em ${new Date(duplicate.importedAt).toLocaleString("pt-BR")} por ${duplicate.registeredBy}.`);
  }

  if (stockImportMode(preview.mode) === "REPLACE") {
    return applyStockReplacement(base, preview, registeredBy, options);
  }

  const importedAt = new Date().toISOString();
  const countId = `LEV-${crypto.randomUUID()}`;
  const stock = base.stock.map((item) => ({ ...item }));
  const allocateCode = stockCodeAllocator(stock);
  const newMovements = [];

  for (const imported of preview.stock) {
    const index = stockMatchIndex(imported, stock);
    const previous = index >= 0 ? stock[index] : null;
    const code = previous?.code || allocateCode(imported.sourceCode || imported.code);
    const before = previous?.current ?? null;
    const after = imported.balanceKnown ? imported.current : null;
    const nextItem = {
      ...cleanImportedStockItem(imported, code, importedAt, previous),
      lastCountSource: preview.fileName,
    };

    if (index >= 0) stock[index] = nextItem;
    else stock.push(nextItem);

    if (before !== after) {
      newMovements.push({
        id: `MOV-${crypto.randomUUID()}`,
        stockCountId: countId,
        materialCode: code,
        material: imported.material,
        unit: nextItem.unit,
        type: after === null ? "CONTAGEM PENDENTE" : "CONTAGEM",
        quantity: after,
        before,
        after,
        reason: after === null
          ? `Saldo ausente ou inválido no levantamento ${preview.fileName}`
          : `Saldo atualizado pelo levantamento ${preview.fileName}`,
        registeredBy,
        document: preview.fileName,
        createdAt: importedAt,
      });
    }
  }

  const historyRecord = {
    id: countId,
    fileName: preview.fileName,
    fileType: preview.fileType,
    fileHash: preview.fileHash,
    sheetName: preview.sheetName,
    headerRow: preview.headerRow,
    columns: preview.columns,
    importedAt,
    registeredBy,
    totals: {
      ...preview.totals,
      appliedMovements: newMovements.length,
    },
    warnings: (preview.warnings || []).slice(0, 20),
  };

  return enrich({
    ...base,
    stock,
    movements: [...newMovements, ...base.movements],
    stockCounts: [historyRecord, ...base.stockCounts].slice(0, STOCK_COUNT_HISTORY_LIMIT),
    updatedAt: importedAt,
    stockSource: preview.fileName,
  });
}

function applyStockSnapshot(current, snapshot, registeredByValue = "Atualização automática") {
  const migrationId = sanitizeText(snapshot?.migrationId, 120);
  if (!migrationId) throw new Error("A atualização de estoque não possui identificador.");
  const base = enrich(current);
  if ((base.appliedStockResets || []).includes(migrationId)) {
    return { state: base, applied: false };
  }
  if (!Array.isArray(snapshot?.stock) || !snapshot.stock.length) {
    throw new Error("A atualização de estoque não contém materiais válidos.");
  }
  const parsed = {
    sheetName: snapshot.sheetName || "ESTOQUE NOVO",
    sheetNamesUsed: snapshot.sheetNamesUsed || [],
    headerRow: snapshot.headerRow || 1,
    columns: snapshot.columns || {},
    sourceRowCount: Number(snapshot.sourceRowCount) || snapshot.stock.length,
    validRowCount: snapshot.stock.length,
    ignoredRows: snapshot.ignoredRows || [],
    warnings: snapshot.warnings || [],
    fileName: snapshot.sourceFile || "estoque-atualizado.xlsx",
    fileType: snapshot.fileType || "XLSX",
    fileHash: snapshot.sourceHash || migrationId,
    stock: snapshot.stock,
    mode: "REPLACE",
  };
  const preview = buildStockImportPreview(parsed, base, { mode: "REPLACE" });
  preview.duplicate = null;
  const state = applyStockImport(base, preview, registeredByValue, {
    allowDuplicate: true,
    importedAt: snapshot.importedAt || new Date().toISOString(),
    reason: snapshot.reason || `Migração automática ${migrationId}`,
  });
  state.appliedStockResets = [migrationId, ...(state.appliedStockResets || [])].slice(0, 30);
  return { state: enrich(state), applied: true };
}

function mergeSupplementNotes(existing, addition, legacyCode, usedAlternateCode) {
  const notes = [
    sanitizeText(existing?.notes, 500),
    sanitizeText(addition?.notes, 500),
    usedAlternateCode ? `Código da base anterior: ${legacyCode}.` : "",
  ].filter(Boolean);
  return [...new Set(notes)].join(" ").slice(0, 500);
}

function normalizeSupplementItem(raw, code) {
  const source = raw && typeof raw === "object" ? raw : {};
  const item = {
    code,
    category: sanitizeText(source.category, 80) || "MATERIAL GERAL",
    material: sanitizeText(source.material, 180),
    unit: sanitizeText(source.unit || source.sourcePresentation || "UN.", 30) || "UN.",
    sourcePresentation: sanitizeText(source.sourcePresentation || source.unit || "UN.", 40) || "UN.",
    unitsPerPackage: Math.max(1, finiteOrNull(source.unitsPerPackage) || 1),
    sourceBalance: finiteOrNull(source.sourceBalance),
    current: source.balanceKnown === false ? null : finiteOrNull(source.current),
    balanceKnown: source.balanceKnown !== false && finiteOrNull(source.current) !== null,
    minimum: source.minimumKnown === false ? null : finiteOrNull(source.minimum),
    minimumKnown: source.minimumKnown !== false && finiteOrNull(source.minimum) !== null,
    minimumDetail: sanitizeText(source.minimumDetail, 160),
    monthlyConsumption: Math.max(0, finiteOrNull(source.monthlyConsumption) || 0),
    notes: sanitizeText(source.notes, 500),
    quantityDetail: sanitizeText(source.quantityDetail, 300),
    quantityComponents: Array.isArray(source.quantityComponents) ? source.quantityComponents : [],
    requiresReview: source.requiresReview === true || source.balanceKnown === false || source.minimumKnown === false,
    storageLocation: sanitizeText(source.storageLocation, 120),
    lastCountAt: source.lastCountAt || null,
  };
  return migrateStock([item], SCHEMA_VERSION, { allowImplicitMdf: false })[0];
}

function applyStockSupplement(current, supplement, registeredByValue = "Atualização automática") {
  const migrationId = sanitizeText(supplement?.migrationId, 120);
  if (!migrationId) throw new Error("O complemento de estoque não possui identificador.");

  const base = enrich(current);
  if (base.appliedStockSupplements.includes(migrationId)) {
    return { state: base, applied: false, additions: [], corrections: [] };
  }
  if (!Array.isArray(supplement?.stock) || !supplement.stock.length) {
    throw new Error("O complemento de estoque não contém materiais válidos.");
  }

  const stock = base.stock.map((item) => ({ ...item }));
  const allocateCode = stockCodeAllocator(stock);
  const additions = [];
  const corrections = [];

  for (const raw of supplement.stock) {
    const legacyCode = sanitizeText(raw?.legacyCode || raw?.code, 40);
    const material = sanitizeText(raw?.material, 180);
    if (!legacyCode || !material) continue;

    const codeIndex = stock.findIndex((item) => normalize(item.code) === normalize(legacyCode));
    const materialIndex = stock.findIndex((item) => normalize(item.material) === normalize(material));

    if (raw?.correctionOnly === true && codeIndex >= 0) {
      const existing = stock[codeIndex];
      const corrected = normalizeSupplementItem({
        ...existing,
        category: raw.category || existing.category,
        material,
        storageLocation: raw.storageLocation || existing.storageLocation,
        notes: mergeSupplementNotes(existing, raw, legacyCode, false),
      }, existing.code);
      stock[codeIndex] = corrected;
      corrections.push({ code: existing.code, material, type: "DESCRIÇÃO E LOCALIZAÇÃO" });
      continue;
    }

    if (materialIndex >= 0) {
      const existing = stock[materialIndex];
      if (!existing.storageLocation && raw?.storageLocation) {
        stock[materialIndex] = normalizeSupplementItem({
          ...existing,
          storageLocation: raw.storageLocation,
          notes: mergeSupplementNotes(existing, raw, legacyCode, false),
        }, existing.code);
        corrections.push({ code: existing.code, material: existing.material, type: "LOCALIZAÇÃO" });
      }
      continue;
    }

    const usedAlternateCode = codeIndex >= 0;
    const code = allocateCode(usedAlternateCode ? "" : legacyCode);
    const next = normalizeSupplementItem({
      ...raw,
      notes: mergeSupplementNotes(null, raw, legacyCode, usedAlternateCode),
    }, code);
    stock.push(next);
    additions.push({ code, legacyCode, material: next.material, category: next.category });
  }

  const registeredBy = sanitizeText(registeredByValue, 100) || "Atualização automática";
  const historyRecord = {
    id: `SUP-${crypto.randomUUID()}`,
    migrationId,
    sourceFile: sanitizeText(supplement?.sourceFile, 240),
    reason: sanitizeText(supplement?.reason, 500),
    appliedAt: new Date().toISOString(),
    registeredBy,
    additions: additions.length,
    corrections: corrections.length,
  };
  const nextState = enrich({
    ...base,
    stock,
    appliedStockSupplements: [migrationId, ...base.appliedStockSupplements].slice(0, 30),
    stockSupplementHistory: [historyRecord, ...base.stockSupplementHistory].slice(0, 30),
    updatedAt: historyRecord.appliedAt,
  });
  return { state: nextState, applied: true, additions, corrections, historyRecord };
}

function importStock(filePath, current) {
  const preview = previewStockImport(filePath, current);
  return applyStockImport(current, preview, "Importação de planilha");
}

function recordMovement(current, input) {
  const base = enrich(current);
  const materialCode = sanitizeText(input?.materialCode, 40);
  const type = normalize(input?.type);
  if (!["ENTRADA", "SAIDA", "CONTAGEM"].includes(type)) throw new Error("Tipo de movimentação inválido.");
  const stockIndex = base.stock.findIndex((item) => item.code === materialCode);
  if (stockIndex < 0) throw new Error("Material não encontrado.");
  const material = base.stock[stockIndex];
  const quantity = finiteOrNull(input?.quantity);
  if (quantity === null || quantity < 0 || (type !== "CONTAGEM" && quantity === 0)) {
    throw new Error("Informe uma quantidade válida.");
  }
  const before = material.current;
  const calculationBase = before === null ? 0 : Number(before);
  let after = quantity;
  if (type === "ENTRADA") after = calculationBase + quantity;
  if (type === "SAIDA") after = calculationBase - quantity;

  const createdAt = new Date().toISOString();
  const reason = sanitizeText(input?.reason, 300);
  if (!reason) throw new Error("Informe o motivo da movimentação.");
  const registeredBy = sanitizeText(input?.registeredBy, 100);
  if (!registeredBy) throw new Error("Informe quem está registrando.");

  const stock = base.stock.map((item, index) => index === stockIndex ? {
    ...item,
    current: after,
    balanceKnown: true,
    lastCountAt: type === "CONTAGEM" ? createdAt : item.lastCountAt,
  } : item);
  const movement = {
    id: `MOV-${crypto.randomUUID()}`,
    materialCode,
    material: material.material,
    unit: material.unit,
    type: type === "SAIDA" ? "SAÍDA" : type,
    quantity,
    before,
    after,
    reason,
    registeredBy,
    requestedBy: sanitizeText(input?.requestedBy || registeredBy, 100),
    requestedById: sanitizeText(input?.requestedById, 100),
    authorizedBy: sanitizeText(input?.authorizedBy, 100),
    authorizedById: sanitizeText(input?.authorizedById, 100),
    authorizationAt: input?.authorizationAt && !Number.isNaN(new Date(input.authorizationAt).getTime())
      ? new Date(input.authorizationAt).toISOString()
      : null,
    document: sanitizeText(input?.document, 120),
    warning: before === null && type !== "CONTAGEM"
      ? "Saldo anterior desconhecido: o cálculo desta movimentação foi iniciado em zero."
      : after < 0
        ? "Saldo negativo registrado: conferir fisicamente o material."
        : "",
    unitCost: Math.max(0, finiteOrNull(input?.unitCost) || 0),
    createdAt,
  };
  return enrich({
    ...base,
    stock,
    movements: [movement, ...base.movements],
    updatedAt: createdAt,
  });
}

function registerManualMaterial(current, input = {}) {
  const base = enrich(current);
  const materialName = sanitizeText(input.material, 180);
  if (materialName.length < 2) throw new Error("Informe o nome do material.");
  const category = sanitizeText(input.category, 80) || "MATERIAL GERAL";
  const unit = sanitizeText(input.unit, 30) || "UN.";
  const currentQuantity = finiteOrNull(input.current);
  const minimum = finiteOrNull(input.minimum);
  if (currentQuantity === null || currentQuantity < 0) throw new Error("Informe o saldo inicial do material.");
  if (minimum === null || minimum < 0) throw new Error("Informe o estoque mínimo do material.");
  const duplicate = base.stock.find((item) => normalize(item.material) === normalize(materialName) && normalize(item.category) === normalize(category));
  if (duplicate) throw new Error(`Este material já está cadastrado: ${duplicate.material} (${duplicate.code}).`);

  const allocateCode = stockCodeAllocator(base.stock);
  const code = allocateCode(input.code);
  const createdAt = new Date().toISOString();
  const registeredBy = sanitizeText(input.registeredBy, 100);
  if (!registeredBy) throw new Error("Informe quem está cadastrando o material.");
  const material = normalizeSupplementItem({
    code,
    material: materialName,
    category,
    unit,
    sourcePresentation: unit,
    unitsPerPackage: 1,
    current: currentQuantity,
    balanceKnown: true,
    minimum,
    minimumKnown: true,
    storageLocation: sanitizeText(input.storageLocation, 120),
    notes: sanitizeText(input.notes, 500),
    lastCountAt: createdAt,
  }, code);
  const movement = {
    id: `MOV-${crypto.randomUUID()}`,
    materialCode: code,
    material: material.material,
    unit: material.unit,
    type: "CADASTRO INICIAL",
    quantity: currentQuantity,
    before: null,
    after: currentQuantity,
    reason: sanitizeText(input.reason, 300) || "Cadastro manual de material",
    registeredBy,
    requestedBy: registeredBy,
    requestedById: sanitizeText(input.registeredById, 100),
    authorizedBy: "",
    authorizedById: "",
    authorizationAt: null,
    document: sanitizeText(input.document, 120),
    warning: "",
    unitCost: 0,
    createdAt,
  };
  return enrich({
    ...base,
    explicitStockSet: true,
    stock: [material, ...base.stock],
    movements: [movement, ...base.movements],
    updatedAt: createdAt,
  });
}

function registerQuotation(current, input) {
  const base = enrich(current);
  const materialCode = sanitizeText(input?.materialCode, 40);
  const material = base.stock.find((item) => item.code === materialCode);
  if (!material) throw new Error("Material não encontrado.");
  if (!Number(material.buyNow)) throw new Error("Este material não precisa de compra no saldo atual.");
  const supplierId = sanitizeText(input?.supplierId, 80);
  const supplier = base.suppliers.find((item) => item.id === supplierId);
  const supplierName = sanitizeText(input?.supplierName || supplier?.name, 120);
  if (!supplierName) throw new Error("Informe o fornecedor.");
  const unitPrice = finiteOrNull(input?.unitPrice);
  const quantity = finiteOrNull(input?.quantity);
  const deliveryDays = finiteOrNull(input?.deliveryDays);
  if (!unitPrice || unitPrice <= 0) throw new Error("Informe um preço unitário válido.");
  if (!quantity || quantity <= 0) throw new Error("Informe a quantidade cotada.");
  if (deliveryDays === null || deliveryDays < 0) throw new Error("Informe o prazo de entrega em dias.");
  const sourceUrl = safeUrl(input?.sourceUrl);
  if (input?.sourceUrl && !sourceUrl) throw new Error("O link da cotação deve começar com http:// ou https://.");

  const createdAt = new Date().toISOString();
  const freightValue = finiteOrNull(input?.freight);
  const freightKnown = input?.freightKnown === false ? false : freightValue !== null;
  const quotation = {
    id: `COT-${crypto.randomUUID()}`,
    materialCode,
    material: material.material,
    supplierId: supplier?.id || "",
    supplierName,
    quantity,
    unitPrice,
    freight: freightKnown ? Math.max(0, freightValue) : null,
    freightKnown,
    deliveryDays,
    reliability: sanitizeText(input?.reliability || supplier?.reliability || "NÃO AVALIADA", 30),
    stockAvailable: input?.stockAvailable !== false,
    sourceUrl,
    note: sanitizeText(input?.note, 400),
    researchedAt: input?.researchedAt || createdAt,
    createdAt,
    active: true,
  };
  return enrich({
    ...base,
    quotations: [quotation, ...base.quotations],
    updatedAt: createdAt,
  });
}

function saveMarketSearch(current, materialCode, search) {
  const base = enrich(current);
  const material = base.stock.find((item) => item.code === materialCode);
  if (!material) throw new Error("Material não encontrado.");
  const allowedResults = (Array.isArray(search?.results) ? search.results : [])
    .filter((item) => item?.locationConfirmed === true
      && item?.stateCode === "PR"
      && item?.distanceStatus === "WITHIN_RADIUS")
    .slice(0, 60);
  const uniqueSuppliers = (items) => new Set(items.map((item) => normalize(item.supplierName)).filter(Boolean)).size;
  const record = {
    id: `PES-${crypto.randomUUID()}`,
    materialCode,
    material: material.material,
    query: sanitizeText(search?.query, 300),
    queries: {
      local: sanitizeText(search?.queries?.local || search?.queries?.places, 400),
      offers: sanitizeText(search?.queries?.offers || search?.queries?.shopping, 400),
      contacts: sanitizeText(search?.queries?.contacts, 600),
      reserve: sanitizeText(search?.queries?.reserve || search?.queries?.web, 400),
    },
    provider: sanitizeText(search?.provider || "GRATUITO", 40),
    searchedAt: search?.searchedAt || new Date().toISOString(),
    radiusKm: Math.max(1, Math.min(5000, finiteOrNull(search?.radiusKm) || 100)),
    origin: {
      label: sanitizeText(search?.origin?.label || "Maringá/PR", 120),
      latitude: finiteOrNull(search?.origin?.latitude),
      longitude: finiteOrNull(search?.origin?.longitude),
    },
    boundary: {
      strict: true,
      stateCode: "PR",
      stateName: "Paraná",
    },
    counts: {
      resultCount: allowedResults.length,
      newSuppliers: uniqueSuppliers(allowedResults.filter((item) => item.isKnown !== true)),
      localWithinRadius: uniqueSuppliers(allowedResults),
      offersWithPrice: allowedResults.filter((item) => item.kind === "OFFER" && Number(item.price) > 0).length,
      knownSuppliers: uniqueSuppliers(allowedResults.filter((item) => item.isKnown === true)),
      suppliersWithSite: uniqueSuppliers(allowedResults.filter((item) => item.officialSiteConfirmed && item.officialSiteUrl)),
      suppliersWithPhone: uniqueSuppliers(allowedResults.filter((item) => item.phoneNumber)),
      suppliersWithWhatsapp: uniqueSuppliers(allowedResults.filter((item) => item.whatsappUrl)),
      outsideRadius: 0,
    },
    diagnostics: {
      tavilyPages: Math.max(0, finiteOrNull(search?.diagnostics?.tavilyPages) || 0),
      contactPages: Math.max(0, finiteOrNull(search?.diagnostics?.contactPages) || 0),
      contactTargets: Math.max(0, finiteOrNull(search?.diagnostics?.contactTargets) || 0),
      contactLookupOk: search?.diagnostics?.contactLookupOk === true,
      suppliersWithSite: Math.max(0, finiteOrNull(search?.diagnostics?.suppliersWithSite) || 0),
      suppliersWithPhone: Math.max(0, finiteOrNull(search?.diagnostics?.suppliersWithPhone) || 0),
      suppliersWithWhatsapp: Math.max(0, finiteOrNull(search?.diagnostics?.suppliersWithWhatsapp) || 0),
      reservePages: Math.max(0, finiteOrNull(search?.diagnostics?.reservePages) || 0),
      mapSuppliers: Math.max(0, finiteOrNull(search?.diagnostics?.mapSuppliers) || 0),
      nominatimSuppliers: Math.max(0, finiteOrNull(search?.diagnostics?.nominatimSuppliers) || 0),
      overpassSuppliers: Math.max(0, finiteOrNull(search?.diagnostics?.overpassSuppliers) || 0),
      registeredSuppliers: Math.max(0, finiteOrNull(search?.diagnostics?.registeredSuppliers) || 0),
      locationCandidates: Math.max(0, finiteOrNull(search?.diagnostics?.locationCandidates) || 0),
      locationPagesExtracted: Math.max(0, finiteOrNull(search?.diagnostics?.locationPagesExtracted) || 0),
      locationVerificationOk: search?.diagnostics?.locationVerificationOk === true,
      confirmedWebResults: Math.max(0, finiteOrNull(search?.diagnostics?.confirmedWebResults) || 0),
      displayedResults: allowedResults.length,
    },
    warnings: (Array.isArray(search?.warnings) ? search.warnings : []).slice(0, 6).map((item) => sanitizeText(item, 300)),
    searchSources: (Array.isArray(search?.searchSources) ? search.searchSources : []).slice(0, 8).map((item) => ({
      key: sanitizeText(item?.key, 30),
      label: sanitizeText(item?.label, 80),
      ok: item?.ok === true,
    })),
    results: allowedResults.map((item, index) => {
      const kind = item.kind === "SUPPLIER" ? "SUPPLIER" : "OFFER";
      const officialSiteUrl = verifiedSupplierSite({ ...item, kind }, base.suppliers);
      const offerUrl = verifiedOfferUrl({ ...item, kind });
      return {
        id: sanitizeText(item.id || `${materialCode}-${index}`, 120),
        kind,
        title: sanitizeText(item.title, 300),
        supplierName: sanitizeText(item.supplierName, 120),
        supplierStatus: item.isKnown === true || item.supplierStatus === "CADASTRADO" ? "CADASTRADO" : "NOVO",
        isKnown: item.isKnown === true,
        price: Math.max(0, finiteOrNull(item.price) || 0),
        freight: item.freightKnown === true ? Math.max(0, finiteOrNull(item.freight) || 0) : null,
        freightKnown: item.freightKnown === true,
        totalPrice: Math.max(0, finiteOrNull(item.totalPrice) || 0),
        delivery: sanitizeText(item.delivery, 180),
        deliveryDays: finiteOrNull(item.deliveryDays),
        reliability: sanitizeText(item.reliability || "NÃO AVALIADA", 30),
        confidenceScore: Math.max(0, Math.min(100, finiteOrNull(item.confidenceScore) || 0)),
        matchConfidence: ["ALTA", "MÉDIA", "BAIXA"].includes(item.matchConfidence)
          ? item.matchConfidence
          : "BAIXA",
        materialMatch: finiteOrNull(item.materialMatch),
        crossChecked: item.crossChecked === true,
        sourceUrl: kind === "SUPPLIER" ? officialSiteUrl : offerUrl,
        officialSiteUrl,
        offerUrl,
        officialSiteConfirmed: Boolean(officialSiteUrl),
        offerUrlConfirmed: kind === "OFFER" && Boolean(offerUrl),
        locationConfirmed: true,
        stateCode: "PR",
        stateName: "Paraná",
        note: sanitizeText(item.note, 300),
        address: sanitizeText(item.address, 220),
        phoneNumber: sanitizeText(item.phoneNumber, 80),
        phoneDigits: sanitizeText(item.phoneDigits, 20).replace(/\D/g, ""),
        whatsappUrl: safeWhatsappUrl(item.whatsappUrl),
        whatsappConfirmed: item.whatsappConfirmed === true && Boolean(safeWhatsappUrl(item.whatsappUrl)),
        contactSource: sanitizeText(item.contactSource, 80),
        rating: finiteOrNull(item.rating),
        ratingCount: finiteOrNull(item.ratingCount),
        distanceKm: finiteOrNull(item.distanceKm),
        distanceStatus: "WITHIN_RADIUS",
        sourceType: sanitizeText(item.sourceType, 80),
        category: sanitizeText(item.category, 80),
      };
    }),
  };
  return enrich({
    ...base,
    settings: { ...base.settings, marketRadiusKm: record.radiusKm },
    marketSearches: [record, ...base.marketSearches.filter((item) => item.materialCode !== materialCode)],
    updatedAt: record.searchedAt,
  });
}

function setInvoiceStatus(current, number, status) {
  const base = enrich(current);
  const allowed = new Set(["PENDENTE DE CONFERÊNCIA", "CONFIRMADA", "REJEITADA"]);
  if (!allowed.has(status)) throw new Error("Status de nota inválido.");
  const invoices = base.invoices.map((invoice) => invoice.number === number ? { ...invoice, status } : invoice);
  return enrich({ ...base, invoices, updatedAt: new Date().toISOString() });
}

function loadSeed(seedPath) {
  return enrich(JSON.parse(fs.readFileSync(seedPath, "utf8")));
}

module.exports = {
  DEFAULT_SUPPLIERS,
  applyStockImport,
  applyStockSnapshot,
  applyStockSupplement,
  buildStockImportPreview,
  enrich,
  importStock,
  loadSeed,
  normalize,
  parseStockWorkbook,
  parseStockWorkbookDetailed,
  parseStockNumber,
  parseStockQuantity,
  parseStockMinimum,
  parseStockRows,
  previewStockImport,
  registerManualMaterial,
  recordMovement,
  registerQuotation,
  saveMarketSearch,
  setInvoiceStatus,
};
