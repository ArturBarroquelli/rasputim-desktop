const test = require("node:test");
const assert = require("node:assert/strict");
const {
  enrich,
  registerQuotation,
  saveMarketSearch,
} = require("../core/procurement.cjs");

function baseState() {
  return {
    schemaVersion: 7,
    settings: { location: "Maringá/PR", marketRadiusKm: 100 },
    stock: [{
      code: "MAT-001",
      category: "Parafusos",
      material: "PARAFUSO 4X16",
      unit: "UN.",
      sourcePresentation: "UN.",
      unitsPerPackage: 1,
      current: 0,
      balanceKnown: true,
      minimum: 100,
    }],
    invoiceItems: [],
    invoices: [],
    movements: [],
    quotations: [],
    marketSearches: [],
    suppliers: [],
  };
}

test("preserva raio, origem e fornecedores novos no histórico", () => {
  const updated = saveMarketSearch(baseState(), "MAT-001", {
    query: "parafuso fornecedor Paraná",
    queries: { places: "local", shopping: "preço", web: "distribuidor" },
    radiusKm: 175,
    origin: { label: "Maringá/PR", latitude: -23.42, longitude: -51.93 },
    searchedAt: "2026-08-05T12:00:00.000Z",
    diagnostics: { tavilyPages: 7, reservePages: 2, mapSuppliers: 3, registeredSuppliers: 1, confirmedWebResults: 4 },
    counts: { resultCount: 1, newSuppliers: 1, localWithinRadius: 1, offersWithPrice: 0, knownSuppliers: 0, outsideRadius: 0 },
    warnings: [],
    searchSources: [{ key: "places", label: "empresas locais", ok: true }],
    results: [{
      id: "NOVO-1",
      kind: "SUPPLIER",
      title: "Novo Fornecedor",
      supplierName: "Novo Fornecedor",
      supplierStatus: "NOVO",
      isKnown: false,
      price: 0,
      freight: null,
      freightKnown: false,
      delivery: "A consultar",
      reliability: "NÃO AVALIADA",
      sourceUrl: "https://novo-fornecedor.example/",
      officialSiteConfirmed: true,
      locationConfirmed: true,
      stateCode: "PR",
      stateName: "Paraná",
      note: "Encontrado na busca aberta",
      address: "Maringá/PR",
      phoneNumber: "(44) 3000-0000",
      distanceKm: 4.2,
      distanceStatus: "WITHIN_RADIUS",
      sourceType: "EMPRESA LOCAL",
      category: "NEW_LOCAL_SUPPLIER",
    }],
  });

  assert.equal(updated.settings.marketRadiusKm, 175);
  assert.equal(updated.marketSearches[0].radiusKm, 175);
  assert.equal(updated.marketSearches[0].counts.newSuppliers, 1);
  assert.equal(updated.marketSearches[0].results[0].supplierStatus, "NOVO");
  assert.equal(updated.marketSearches[0].results[0].freight, null);
  assert.equal(updated.marketSearches[0].results[0].distanceKm, 4.2);
  assert.equal(updated.marketSearches[0].results[0].stateCode, "PR");
  assert.equal(updated.marketSearches[0].results[0].officialSiteConfirmed, true);
  assert.equal(updated.marketSearches[0].results[0].officialSiteUrl, "https://novo-fornecedor.example/");
  assert.equal(updated.marketSearches[0].diagnostics.tavilyPages, 7);
  assert.equal(updated.marketSearches[0].diagnostics.displayedResults, 1);
});

test("histórico descarta resultado de outro estado e link de mapa", () => {
  const updated = saveMarketSearch(baseState(), "MAT-001", {
    radiusKm: 5000,
    results: [
      {
        id: "SC-1",
        kind: "SUPPLIER",
        supplierName: "Fornecedor SC",
        locationConfirmed: true,
        stateCode: "SC",
        distanceStatus: "WITHIN_RADIUS",
        sourceUrl: "https://fornecedor-sc.example/",
        officialSiteConfirmed: true,
      },
      {
        id: "MAPA-1",
        kind: "SUPPLIER",
        supplierName: "Fornecedor PR sem site",
        locationConfirmed: true,
        stateCode: "PR",
        distanceStatus: "WITHIN_RADIUS",
        sourceUrl: "https://www.openstreetmap.org/node/123",
        officialSiteConfirmed: false,
      },
    ],
  });

  assert.equal(updated.marketSearches[0].results.length, 1);
  assert.equal(updated.marketSearches[0].results[0].supplierName, "Fornecedor PR sem site");
  assert.equal(updated.marketSearches[0].results[0].sourceUrl, "");
});

test("migração limpa endereço e página de terceiro salvos como site", () => {
  const current = baseState();
  current.schemaVersion = 6;
  current.marketSearches = [{
    materialCode: "MAT-001",
    searchedAt: "2026-08-05T12:00:00.000Z",
    results: [
      {
        id: "DIRETORIO-1",
        kind: "SUPPLIER",
        supplierName: "Ferragens Sem Site",
        locationConfirmed: true,
        stateCode: "PR",
        distanceStatus: "WITHIN_RADIUS",
        sourceUrl: "https://www.solutudo.com.br/empresas/pr/maringa/ferragens/ferragens-sem-site",
        officialSiteConfirmed: true,
        address: "Av. Brasil, 100 - Maringá/PR",
      },
      {
        id: "TERCEIRO-1",
        kind: "SUPPLIER",
        supplierName: "Ferragens Nova Era",
        locationConfirmed: true,
        stateCode: "PR",
        distanceStatus: "WITHIN_RADIUS",
        sourceUrl: "https://portalqualquer.example/empresas/ferragens-nova-era",
        officialSiteConfirmed: true,
        address: "Maringá/PR",
      },
    ],
  }];

  const updated = enrich(current);
  assert.equal(updated.schemaVersion, 10);
  assert.ok(updated.marketSearches[0].results.every((item) => item.sourceUrl === ""));
  assert.ok(updated.marketSearches[0].results.every((item) => item.officialSiteConfirmed === false));
  assert.equal(updated.marketSearches[0].results[0].address, "Av. Brasil, 100 - Maringá/PR");
});

test("cadastro conhecido expõe site oficial separado do endereço", () => {
  const updated = enrich(baseState());
  const multiparafusos = updated.suppliers.find((supplier) => supplier.name === "Multiparafusos");
  const jfFerragens = updated.suppliers.find((supplier) => supplier.name === "JF Ferragens");
  assert.equal(multiparafusos.officialSiteUrl, "https://98app.com.br/multiparafusos");
  assert.match(multiparafusos.location, /Maringá\/PR/);
  assert.equal(jfFerragens.officialSiteUrl, "");
  assert.match(jfFerragens.location, /Maringá\/PR/);
});

test("frete desconhecido não vence automaticamente uma cotação completa", () => {
  const current = baseState();
  current.quotations = [
    {
      id: "COT-COMPLETA",
      materialCode: "MAT-001",
      supplierName: "Fornecedor Completo",
      quantity: 100,
      unitPrice: 10,
      freight: 0,
      freightKnown: true,
      deliveryDays: 3,
      reliability: "MÉDIA",
      active: true,
    },
    {
      id: "COT-SEM-FRETE",
      materialCode: "MAT-001",
      supplierName: "Fornecedor Sem Frete",
      quantity: 100,
      unitPrice: 9.8,
      freight: null,
      freightKnown: false,
      deliveryDays: 3,
      reliability: "MÉDIA",
      active: true,
    },
  ];
  const updated = enrich(current);
  const material = updated.stock.find((item) => item.code === "MAT-001");
  assert.equal(material.recommendedQuotation.supplierName, "Fornecedor Completo");
  assert.equal(material.quotations.find((item) => item.id === "COT-SEM-FRETE").freightKnown, false);
});

test("cotação manual pode guardar frete ainda não informado", () => {
  const updated = registerQuotation(baseState(), {
    materialCode: "MAT-001",
    supplierName: "Fornecedor Novo",
    quantity: 100,
    unitPrice: 8.5,
    freight: null,
    freightKnown: false,
    deliveryDays: 5,
    reliability: "NÃO AVALIADA",
    sourceUrl: "https://fornecedor-novo.example/",
  });
  const quote = updated.quotations.find((item) => item.supplierName === "Fornecedor Novo");
  assert.equal(quote.freightKnown, false);
  assert.equal(quote.freight, null);
});
