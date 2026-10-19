const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FREE_SEARCH_ENDPOINTS,
  MARINGA_ORIGIN,
  PARANA_REGION,
  contactDetails,
  distanceKm,
  isLocationServiceUrl,
  materialMatchScore,
  officialSupplierSiteUrl,
  paranaMunicipalityFromText,
  parseDeliveryDays,
  parseFreight,
  parsePrice,
  researchMarket,
  safeWhatsappUrl,
  testTavilyKey,
} = require("../core/market.cjs");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => status >= 400 ? JSON.stringify(payload) : "",
  };
}

function osmPayload() {
  return [
    {
      osm_type: "node",
      osm_id: 101,
      name: "Ferragens Nova Era",
      display_name: "Ferragens Nova Era, Maringá, Paraná, Brasil",
      lat: "-23.431",
      lon: "-51.940",
      importance: 0.62,
      address: { city: "Maringá", state: "Paraná", country: "Brasil", "ISO3166-2-lvl4": "BR-PR" },
      extratags: { website: "https://novaera.com.br/", phone: "+55 44 3000-1000", contact_whatsapp: "+55 44 99999-1000" },
    },
    {
      osm_type: "way",
      osm_id: 102,
      name: "Multiparafusos",
      display_name: "Multiparafusos, Maringá, Paraná, Brasil",
      lat: "-23.420",
      lon: "-51.930",
      importance: 0.58,
      address: { city: "Maringá", state: "Paraná", country: "Brasil", "ISO3166-2-lvl4": "BR-PR" },
      extratags: { website: "https://98app.com.br/multiparafusos" },
    },
    {
      osm_type: "node",
      osm_id: 104,
      name: "Distribuidora Alfa",
      display_name: "Distribuidora Alfa, Sarandi, Paraná, Brasil",
      lat: "-23.443",
      lon: "-51.873",
      importance: 0.56,
      address: { city: "Sarandi", state: "Paraná", country: "Brasil", "ISO3166-2-lvl4": "BR-PR" },
      extratags: { website: "https://distribuidoraalfa.example/", phone: "+55 44 3000-2000" },
    },
    {
      osm_type: "node",
      osm_id: 105,
      name: "Ferragens Sem Site",
      display_name: "Ferragens Sem Site, Paiçandu, Paraná, Brasil",
      lat: "-23.457",
      lon: "-52.048",
      importance: 0.4,
      address: { city: "Paiçandu", state: "Paraná", country: "Brasil", "ISO3166-2-lvl4": "BR-PR" },
      extratags: {
        website: "https://www.solutudo.com.br/empresas/pr/paicandu/ferragens/ferragens-sem-site",
        phone: "+55 44 3000-3000",
      },
    },
    {
      osm_type: "node",
      osm_id: 103,
      name: "Ferragens Curitiba",
      display_name: "Ferragens Curitiba, Curitiba, Paraná, Brasil",
      lat: "-25.4284",
      lon: "-49.2733",
      importance: 0.45,
      address: { city: "Curitiba", state: "Paraná", country: "Brasil", "ISO3166-2-lvl4": "BR-PR" },
      extratags: { website: "https://ferragenscuritiba.example/" },
    },
    {
      osm_type: "node",
      osm_id: 106,
      name: "Ferragens Catarinense",
      display_name: "Ferragens Catarinense, Joinville, Santa Catarina, Brasil",
      lat: "-26.3044",
      lon: "-48.8487",
      importance: 0.52,
      address: { city: "Joinville", state: "Santa Catarina", country: "Brasil", "ISO3166-2-lvl4": "BR-SC" },
      extratags: { website: "https://ferragenscatarinense.example/" },
    },
    {
      osm_type: "node",
      osm_id: 107,
      name: "Ferragens Paulista",
      display_name: "Ferragens Paulista, Presidente Prudente, São Paulo, Brasil",
      lat: "-22.1207",
      lon: "-51.3925",
      importance: 0.48,
      address: { city: "Presidente Prudente", state: "São Paulo", country: "Brasil", "ISO3166-2-lvl4": "BR-SP" },
      extratags: { website: "https://ferragenspaulista.example/" },
    },
  ];
}

function tavilyLocalPayload() {
  return {
    results: [
      {
        title: "Distribuidora Alfa — Parafuso 4x16 para marcenaria",
        url: "https://distribuidoraalfa.example/catalogo/parafuso-4x16",
        content: "Distribuidor atacadista de parafuso 4x16 com entrega para Maringá. Solicite cotação.",
        raw_content: "Endereço: Avenida Central, 200, Sarandi/PR. Telefone (44) 3030-2020. WhatsApp (44) 99999-2020.",
        score: 0.89,
      },
      {
        title: "Conteúdo sem relação",
        url: "https://irrelevante.example/",
        content: "Equipamentos de jardinagem.",
        score: 0.1,
      },
      {
        title: "Ferragens Catarinense — Parafuso 4x16",
        url: "https://ferragenscatarinense.example/parafuso-4x16",
        content: "Endereço da loja: Rua Central, 100, Joinville/SC. Parafuso 4x16 para marcenaria.",
        score: 0.92,
      },
      {
        title: "Distribuidor sem endereço confirmado — Parafuso 4x16",
        url: "https://semlocalizacao.example/parafuso-4x16",
        content: "Parafuso 4x16 com entrega para Maringá PR. Solicite cotação.",
        score: 0.8,
      },
    ],
  };
}

function tavilyOffersPayload() {
  return {
    results: [
      {
        title: "Parafuso 4x16 caixa com 1000",
        url: "https://novaera.com.br/parafuso-4x16",
        content: "Parafuso 4x16 por R$ 29,90. Frete grátis e entrega em 3 dias para Maringá.",
        score: 0.94,
      },
      {
        title: "Parafuso 4x16 atacado",
        url: "https://ofertanacional.example/parafuso-4x16",
        content: "Parafuso 4x16 por R$ 27,50. Entrega em 5 dias. Consulte o frete.",
        score: 0.82,
      },
    ],
  };
}

function mockFreeFetch({ failLocal = false, failOffers = false, failMap = false, fallback = false, rejectKeyed = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) {
      return failMap ? jsonResponse({ message: "mapa fora" }, 503) : jsonResponse(osmPayload());
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavilyUsage) {
      if (rejectKeyed) return jsonResponse({ detail: "Unauthorized" }, 401);
      return jsonResponse({
        key: { usage: 125, limit: 1000 },
        account: { current_plan: "Bootstrap" },
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavilyExtract) {
      if (rejectKeyed && options.headers?.Authorization) return jsonResponse({ detail: "Unauthorized" }, 401);
      return jsonResponse({ results: [], failed_results: [] });
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      if (rejectKeyed && options.headers?.Authorization) return jsonResponse({ detail: "Unauthorized" }, 401);
      const body = JSON.parse(options.body || "{}");
      if (["fast", "ultra-fast"].includes(body.search_depth) && Object.hasOwn(body, "country")) {
        return jsonResponse({
          detail: { error: "Country parameter is not supported for fast or ultra-fast search depth." },
        }, 400);
      }
      const isOffers = String(body.query).startsWith("Comprar exatamente");
      if (isOffers && failOffers) return jsonResponse({ detail: "limite" }, 429);
      if (!isOffers && failLocal) return jsonResponse({ detail: "limite" }, 429);
      return jsonResponse(isOffers ? tavilyOffersPayload() : tavilyLocalPayload());
    }
    if (url === FREE_SEARCH_ENDPOINTS.searxInstances) {
      if (!fallback) return jsonResponse({ message: "indisponível" }, 503);
      return jsonResponse({
        instances: {
          "https://search.example/": {
            main: true,
            network_type: "normal",
            http: { status_code: 200 },
            uptime: { uptimeDay: 100 },
            timing: { search: { success_percentage: 100, all: { mean: 0.8 } } },
          },
        },
      });
    }
    if (String(url).startsWith("https://search.example/search?")) {
      return jsonResponse({
        results: [{
          title: "Parafuso 4x16 direto do distribuidor",
          url: "https://distribuidoraalfa.example/oferta/parafuso-4x16",
          content: "Parafuso 4x16 por R$ 24,00; frete a consultar para Maringá.",
          score: 0.73,
        }],
      });
    }
    return jsonResponse({}, 404);
  };
  return { fetchImpl, calls };
}

const knownSuppliers = [{
  id: "SUP-MULTIPARAFUSOS",
  name: "Multiparafusos",
  reliability: "MÉDIA",
  commercialUrl: "https://98app.com.br/multiparafusos",
}];

test("normaliza moeda, frete, prazo e aderência ao material", () => {
  assert.equal(parsePrice("R$ 1.299,90"), 1299.9);
  assert.equal(parsePrice("29,90"), 29.9);
  assert.equal(parsePrice(42.5), 42.5);
  assert.deepEqual(parseFreight("Frete grátis para Maringá"), { known: true, cost: 0, label: "Frete grátis" });
  assert.equal(parseFreight("frete R$ 18,50").cost, 18.5);
  assert.equal(parseFreight("consulte a loja").known, false);
  assert.equal(parseDeliveryDays("Entrega de 2 a 5 dias úteis"), 5);
  assert.equal(materialMatchScore("PARAFUSO 4X16", "Comprar parafuso 4x16"), 1);
  assert.equal(materialMatchScore("PARAFUSO 4X16", "cola branca"), 0);
});

test("calcula distância aproximada a partir de Maringá", () => {
  assert.equal(distanceKm(MARINGA_ORIGIN, MARINGA_ORIGIN), 0);
  const curitiba = distanceKm(MARINGA_ORIGIN, { latitude: -25.4284, longitude: -49.2733 });
  assert.ok(curitiba > 300 && curitiba < 500);
});

test("reconhece e bloqueia links de mapas como site de fornecedor", () => {
  assert.equal(isLocationServiceUrl("https://www.openstreetmap.org/node/123"), true);
  assert.equal(isLocationServiceUrl("https://www.google.com/maps/place/loja"), true);
  assert.equal(isLocationServiceUrl("https://novaera.com.br/"), false);
});

test("aceita somente domínio oficial compatível com o fornecedor", () => {
  assert.equal(
    officialSupplierSiteUrl("https://www.novaera.com.br/catalogo", "Ferragens Nova Era"),
    "https://www.novaera.com.br/catalogo",
  );
  assert.equal(
    officialSupplierSiteUrl("https://portalqualquer.example/empresas/ferragens-nova-era", "Ferragens Nova Era"),
    "",
  );
  assert.equal(
    officialSupplierSiteUrl("https://www.solutudo.com.br/empresas/pr/maringa/ferragens", "Ferragens Nova Era"),
    "",
  );
  assert.equal(
    officialSupplierSiteUrl("https://www.instagram.com/ferragensnovaera/", "Ferragens Nova Era"),
    "",
  );
  assert.equal(
    officialSupplierSiteUrl("Av. Brasil, 2178 - Maringá/PR", "Multiparafusos"),
    "",
  );
  assert.equal(
    officialSupplierSiteUrl("https://98app.com.br/multiparafusos", "Multiparafusos", { trusted: true }),
    "https://98app.com.br/multiparafusos",
  );
});

test("extrai telefone e WhatsApp sem confundir mapa ou página de terceiro", () => {
  const contact = contactDetails({
    text: "Atendimento comercial. Telefone (44) 3030-2020. WhatsApp: +55 (44) 99999-2020.",
    source: "SITE OFICIAL",
  });
  assert.equal(contact.phoneNumber, "(44) 3030-2020");
  assert.equal(contact.phoneDigits, "554430302020");
  assert.equal(contact.whatsappUrl, "https://wa.me/5544999992020");
  assert.equal(contact.whatsappConfirmed, true);
  assert.equal(safeWhatsappUrl("https://wa.me/5544999992020"), "https://wa.me/5544999992020");
  assert.equal(safeWhatsappUrl("https://maps.example/5544999992020"), "");
});

test("distingue endereço do fornecedor de simples entrega para Maringá", () => {
  assert.equal(
    paranaMunicipalityFromText("Endereço físico: Rua Sergipe, 1000, Londrina/PR")?.name,
    "Londrina",
  );
  assert.equal(
    paranaMunicipalityFromText("Loja online de São Paulo com entrega para Maringá/PR"),
    null,
  );
});

test("mantém pesquisa útil quando Tavily e mapa usam empresas diferentes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) return jsonResponse([]);
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      const body = JSON.parse(options.body || "{}");
      const offers = String(body.query).startsWith("Comprar exatamente");
      return jsonResponse({
        results: offers
          ? [
            {
              title: "Parafuso 4x16 caixa com 1000",
              url: "https://ferragenslondrina.example/ofertas/parafuso-4x16",
              content: "Endereço da empresa: Rua Sergipe, 1000, Londrina/PR. Parafuso 4x16 por R$ 31,90; frete a confirmar.",
              score: 0.91,
            },
            {
              title: "Parafuso 4x16 com entrega rápida",
              url: "https://fornecedorpaulista.example/parafuso-4x16",
              content: "Empresa de Presidente Prudente/SP. Entrega para Maringá/PR por R$ 25,00.",
              score: 0.95,
            },
          ]
          : [
            {
              title: "Ferragens Londrina — Parafuso 4x16",
              url: "https://ferragenslondrina.example/catalogo/parafuso-4x16",
              content: "Catálogo de ferragens e fixadores para marcenaria.",
              raw_content: "Atendimento comercial. Endereço físico: Rua Sergipe, 1000, Londrina/PR. CNPJ e telefone disponíveis.",
              score: 0.9,
            },
            {
              title: "Ferragens Catarinense — Parafuso 4x16",
              url: "https://ferragenscatarinense.example/parafuso-4x16",
              content: "Endereço físico: Rua Central, 100, Joinville/SC.",
              score: 0.93,
            },
          ],
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.searxInstances) return jsonResponse({ instances: {} });
    return jsonResponse({}, 404);
  };

  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 150,
    suppliers: [{
      id: "SUP-LOCAL",
      name: "Fornecedor Local Cadastrado",
      location: "Av. Brasil, 1000 — Maringá/PR",
      commercialUrl: "https://fornecedorlocal.example/",
      reliability: "MÉDIA",
    }],
    fetchImpl,
  });

  const localBody = calls
    .filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily)
    .map((call) => JSON.parse(call.options.body || "{}"))
    .find((body) => !String(body.query).startsWith("Comprar exatamente"));
  assert.equal(localBody.include_raw_content, "text");
  assert.equal(search.diagnostics.mapSuppliers, 0);
  assert.ok(search.results.some((item) => item.supplierName === "Fornecedor Local Cadastrado"));
  assert.ok(search.results.some((item) => item.sourceUrl.includes("ferragenslondrina.example") && !item.isKnown));
  assert.ok(search.results.some((item) => item.kind === "OFFER" && item.price === 31.9));
  assert.equal(search.results.some((item) => item.sourceUrl.includes("fornecedorpaulista.example")), false);
  assert.equal(search.results.some((item) => item.sourceUrl.includes("ferragenscatarinense.example")), false);
  assert.ok(search.results.every((item) => item.stateCode === "PR" && item.distanceStatus === "WITHIN_RADIUS"));
});

test("confirma o endereço em uma segunda etapa quando o resultado inicial mostra apenas o catálogo", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) return jsonResponse([]);
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      const body = JSON.parse(options.body || "{}");
      if (String(body.query).startsWith("Comprar exatamente")) return jsonResponse({ results: [] });
      return jsonResponse({
        results: [
          {
            title: "Casa do Marceneiro — Fixa Tudo",
            url: "https://casadomarceneiro.example/catalogo/fixa-tudo",
            content: "Catálogo de adesivos Fixa Tudo para móveis e marcenaria. Consulte disponibilidade.",
            score: 0.93,
          },
          {
            title: "Ferragens Paulista — Fixa Tudo",
            url: "https://ferragenspaulista.example/catalogo/fixa-tudo",
            content: "Catálogo de adesivos Fixa Tudo para marcenaria.",
            score: 0.9,
          },
        ],
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavilyExtract) {
      return jsonResponse({
        results: [
          {
            url: "https://casadomarceneiro.example/catalogo/fixa-tudo",
            raw_content: "Contato e endereço físico da loja: Avenida Brasil, 1500, Maringá/PR. CEP 87000-000. CNPJ disponível no rodapé.",
          },
          {
            url: "https://ferragenspaulista.example/catalogo/fixa-tudo",
            raw_content: "Sede e endereço físico: Rua Central, 100, Presidente Prudente/SP. CEP 19000-000.",
          },
        ],
        failed_results: [],
      });
    }
    return jsonResponse({}, 404);
  };

  const search = await researchMarket({ material: "FIXA TUDO", radiusKm: 20, fetchImpl });
  const extractCall = calls.find((call) => call.url === FREE_SEARCH_ENDPOINTS.tavilyExtract);
  assert.ok(extractCall);
  const extractBody = JSON.parse(extractCall.options.body || "{}");
  assert.equal(extractCall.options.headers["X-Tavily-Access-Mode"], "keyless");
  assert.equal(extractBody.urls.length, 2);
  assert.equal(extractBody.format, "text");
  assert.match(extractBody.query, /Endereço físico/i);
  assert.match(search.queries.local, /Maringá\/PR/);
  assert.ok(search.results.some((item) => item.supplierName === "Casa do Marceneiro" && !item.isKnown));
  assert.equal(search.results.some((item) => item.supplierName === "Ferragens Paulista"), false);
  assert.ok(search.results.every((item) => item.stateCode === "PR" && item.distanceStatus === "WITHIN_RADIUS"));
  assert.equal(search.diagnostics.locationCandidates, 2);
  assert.equal(search.diagnostics.locationPagesExtracted, 2);
  assert.equal(search.diagnostics.confirmedWebResults, 1);
  assert.ok(search.searchSources.some((source) => source.key === "location" && source.ok));
});

test("rejeita páginas de cidade e preserva uma ferragem local mesmo sem anúncio do material", async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) return jsonResponse([]);
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      const body = JSON.parse(options.body || "{}");
      if (String(body.query).startsWith("Comprar exatamente")) return jsonResponse({ results: [] });
      return jsonResponse({
        results: [
          {
            title: "Tudo sobre a cidade de Maringá Estado do Paraná",
            url: "https://www.cidadesdomeubrasil.com.br/pr/maringa",
            content: "Tudo o que você precisa saber sobre Maringá/PR. Endereço da prefeitura e notícias.",
            score: 0.99,
          },
          {
            title: "Felipe Ferragens e Ferramentas — Atacado em Maringá",
            url: "https://www.buscja.example/felipe-ferragens",
            content: "Atacado e fabricação de ferragens. Telefones e endereço: Avenida Paissandu, 442, Maringá/PR.",
            score: 0.72,
          },
        ],
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavilyExtract) return jsonResponse({ results: [], failed_results: [] });
    return jsonResponse({}, 404);
  };

  const search = await researchMarket({ material: "FIXA TUDO", radiusKm: 20, fetchImpl });
  const localSupplier = search.results.find((item) => item.supplierName === "Felipe Ferragens e Ferramentas");
  assert.ok(localSupplier);
  assert.equal(localSupplier.stateCode, "PR");
  assert.equal(localSupplier.officialSiteConfirmed, false);
  assert.equal(localSupplier.sourceUrl, "");
  assert.equal(search.results.some((item) => /Tudo sobre a cidade/i.test(item.supplierName)), false);
});

test("usa lojas estruturadas dentro do Paraná quando a busca web não comprova endereços", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) return jsonResponse([]);
    if (url === FREE_SEARCH_ENDPOINTS.overpass) {
      return jsonResponse({
        elements: [
          {
            type: "node",
            id: 9001,
            lat: -23.425,
            lon: -51.94,
            tags: {
              name: "Ferragens Avenida",
              shop: "hardware",
              website: "https://ferragensavenida.example/",
              phone: "+55 44 3000-9001",
              "addr:street": "Avenida Brasil",
              "addr:housenumber": "900",
              "addr:city": "Maringá",
              "addr:state": "Paraná",
            },
          },
          {
            type: "node",
            id: 9002,
            lat: -22.12,
            lon: -51.39,
            tags: {
              name: "Ferragens Paulista",
              shop: "hardware",
              "addr:city": "Presidente Prudente",
              "addr:state": "São Paulo",
            },
          },
          {
            type: "node",
            id: 9003,
            lat: -25.4284,
            lon: -49.2733,
            tags: {
              name: "Ferragens Fora do Raio",
              shop: "hardware",
              "addr:city": "Curitiba",
              "addr:state": "Paraná",
            },
          },
        ],
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.tavily) return jsonResponse({ results: [] });
    if (url === FREE_SEARCH_ENDPOINTS.searxInstances) return jsonResponse({ instances: {} });
    return jsonResponse({}, 404);
  };

  const search = await researchMarket({ material: "FIXA TUDO", radiusKm: 20, fetchImpl });
  const localStore = search.results.find((item) => item.supplierName === "Ferragens Avenida");
  assert.ok(localStore);
  assert.equal(localStore.stateCode, "PR");
  assert.equal(localStore.distanceStatus, "WITHIN_RADIUS");
  assert.equal(localStore.officialSiteUrl, "https://ferragensavenida.example/");
  assert.equal(search.results.some((item) => /Paulista|Fora do Raio/.test(item.supplierName)), false);
  assert.equal(search.diagnostics.overpassSuppliers, 1);

  const overpassCall = calls.find((call) => call.url === FREE_SEARCH_ENDPOINTS.overpass);
  assert.ok(overpassCall);
  assert.match(overpassCall.options.body, /BR-PR/);
  assert.match(decodeURIComponent(overpassCall.options.body), /around:20000/);
});

test("busca site, telefone e WhatsApp para loja local que veio sem contato", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) {
      return jsonResponse([{
        osm_type: "node",
        osm_id: 991,
        name: "Ferragens Sem Site",
        display_name: "Ferragens Sem Site, Maringá, Paraná, Brasil",
        lat: "-23.43",
        lon: "-51.94",
        importance: 0.55,
        address: { city: "Maringá", state: "Paraná", "ISO3166-2-lvl4": "BR-PR" },
        extratags: {},
      }]);
    }
    if (url === FREE_SEARCH_ENDPOINTS.overpass) return jsonResponse({ elements: [] });
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      const body = JSON.parse(options.body || "{}");
      if (String(body.query).startsWith("Comprar exatamente")) return jsonResponse({ results: [] });
      if (String(body.query).startsWith('"Ferragens Sem Site"')) {
        return jsonResponse({ results: [{
          title: "Ferragens Sem Site — Contato",
          url: "https://ferragenssemsite.example/contato",
          content: "Loja de ferragens e ferramentas em Maringá/PR.",
          raw_content: "Endereço: Av. Brasil, 500, Maringá/PR. Telefone (44) 3020-5050. WhatsApp (44) 99999-5050.",
          score: 0.96,
        }] });
      }
      return jsonResponse({ results: [] });
    }
    return jsonResponse({}, 404);
  };

  const search = await researchMarket({ material: "FIXA TUDO", radiusKm: 20, fetchImpl });
  const supplier = search.results.find((item) => item.supplierName === "Ferragens Sem Site");
  assert.ok(supplier);
  assert.equal(supplier.officialSiteUrl, "https://ferragenssemsite.example/contato");
  assert.equal(supplier.officialSiteConfirmed, true);
  assert.equal(supplier.phoneNumber, "(44) 3020-5050");
  assert.equal(supplier.whatsappUrl, "https://wa.me/5544999995050");
  assert.equal(supplier.whatsappConfirmed, true);
  assert.equal(search.diagnostics.contactTargets, 1);
  assert.equal(search.diagnostics.contactPages, 1);
  const contactCall = calls
    .filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily)
    .map((call) => JSON.parse(call.options.body || "{}"))
    .find((body) => String(body.query).startsWith('"Ferragens Sem Site"'));
  assert.ok(contactCall);
  assert.equal(contactCall.include_raw_content, "text");
});

test("município paranaense encontrado na web ainda respeita o raio", async () => {
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith(FREE_SEARCH_ENDPOINTS.nominatim)) return jsonResponse([]);
    if (url === FREE_SEARCH_ENDPOINTS.tavily) {
      const body = JSON.parse(options.body || "{}");
      if (String(body.query).startsWith("Comprar exatamente")) return jsonResponse({ results: [] });
      return jsonResponse({
        results: [{
          title: "Ferragens Londrina — Parafuso 4x16",
          url: "https://ferragenslondrina.example/parafuso-4x16",
          content: "Endereço físico: Rua Sergipe, 1000, Londrina/PR.",
          score: 0.92,
        }],
      });
    }
    if (url === FREE_SEARCH_ENDPOINTS.searxInstances) return jsonResponse({ instances: {} });
    return jsonResponse({}, 404);
  };
  const search = await researchMarket({ material: "PARAFUSO 4X16", radiusKm: 50, fetchImpl });
  assert.equal(search.results.some((item) => item.sourceUrl.includes("ferragenslondrina.example")), false);
  assert.ok(search.warnings.some((warning) => /ocultadas/i.test(warning)));
});

test("pesquisa sem chave em IA gratuita, preços e localização aberta", async () => {
  const { fetchImpl, calls } = mockFreeFetch();
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 100,
    suppliers: knownSuppliers,
    fetchImpl,
  });

  assert.equal(calls.filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily).length, 3);
  assert.equal(calls.filter((call) => call.url.startsWith(FREE_SEARCH_ENDPOINTS.nominatim)).length, 1);
  assert.equal(search.provider, "GRATUITO");
  assert.equal(search.radiusKm, 100);
  assert.equal(search.boundary.stateCode, PARANA_REGION.code);
  assert.equal(search.boundary.strict, true);
  assert.ok(search.counts.newSuppliers >= 3);
  assert.ok(search.counts.localWithinRadius >= 3);
  assert.equal(search.counts.offersWithPrice, 1);
  assert.ok(search.results.some((item) => item.supplierName === "Multiparafusos" && item.isKnown));
  assert.ok(search.results.some((item) => item.sourceUrl.includes("distribuidoraalfa.example") && item.kind === "SUPPLIER"));
  assert.ok(search.results.every((item) => item.stateCode === "PR"));
  assert.ok(search.results.every((item) => item.locationConfirmed === true));
  assert.ok(search.results.every((item) => item.distanceStatus === "WITHIN_RADIUS"));
  assert.ok(search.results.every((item) => !item.sourceUrl.includes("openstreetmap.org")));
  assert.ok(search.results.every((item) => Number(item.confidenceScore) >= 0));

  const freeShipping = search.results.find((item) => item.sourceUrl.includes("novaera.com.br/parafuso"));
  assert.equal(freeShipping.price, 29.9);
  assert.equal(freeShipping.freightKnown, true);
  assert.equal(freeShipping.freight, 0);
  assert.equal(freeShipping.totalPrice, 29.9);
  assert.equal(freeShipping.distanceStatus, "WITHIN_RADIUS");

  assert.equal(search.results.some((item) => item.sourceUrl.includes("ofertanacional.example")), false);
  assert.equal(search.results.some((item) => item.sourceUrl.includes("ferragenscatarinense.example")), false);
  assert.equal(search.results.some((item) => item.sourceUrl.includes("semlocalizacao.example")), false);

  const noSite = search.results.find((item) => item.supplierName === "Ferragens Sem Site");
  assert.ok(noSite);
  assert.equal(noSite.sourceUrl, "");
  assert.equal(noSite.officialSiteConfirmed, false);
  assert.equal(noSite.phoneNumber, "(44) 3000-3000");

  const directContact = search.results.find((item) => item.supplierName === "Distribuidora Alfa");
  assert.equal(directContact.phoneNumber, "(44) 3000-2000");
  assert.equal(directContact.whatsappUrl, "https://wa.me/5544999992020");
  assert.ok(search.counts.suppliersWithPhone > 0);
  assert.ok(search.counts.suppliersWithWhatsapp > 0);
});

test("não envia country junto da pesquisa fast e evita o erro 400 da Tavily", async () => {
  const { fetchImpl, calls } = mockFreeFetch();
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 200,
    suppliers: knownSuppliers,
    tavilyApiKey: "tvly-valid_test_key_1234567890",
    fetchImpl,
  });

  const tavilyBodies = calls
    .filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily)
    .map((call) => JSON.parse(call.options.body || "{}"));
  assert.equal(tavilyBodies.length, 3);
  assert.ok(tavilyBodies.every((body) => body.search_depth === "fast"));
  assert.ok(tavilyBodies.every((body) => !Object.hasOwn(body, "country")));
  assert.ok(tavilyBodies.every((body) => /Paran[aá]/i.test(body.query)));
  assert.ok(search.results.length > 0);
  assert.ok(search.results.every((item) => item.stateCode === "PR"));
});

test("não mostra SC, SP ou outro estado mesmo quando o raio alcança todo o Brasil", async () => {
  const { fetchImpl } = mockFreeFetch();
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 5000,
    suppliers: knownSuppliers,
    fetchImpl,
  });

  assert.ok(search.results.length > 0);
  assert.ok(search.results.every((item) => item.stateCode === "PR"));
  assert.equal(search.results.some((item) => /Catarinense|Paulista/i.test(item.supplierName)), false);
  assert.equal(search.results.some((item) => /Joinville|Santa Catarina|São Paulo/i.test(item.address)), false);
});

test("usa a chave Tavily por Bearer quando ela está configurada", async () => {
  const apiKey = "tvly-valid_test_key_1234567890";
  const { fetchImpl, calls } = mockFreeFetch();
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 100,
    suppliers: knownSuppliers,
    tavilyApiKey: apiKey,
    fetchImpl,
  });

  const tavilyCalls = calls.filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily);
  assert.equal(tavilyCalls.length, 3);
  assert.ok(tavilyCalls.every((call) => call.options.headers.Authorization === `Bearer ${apiKey}`));
  assert.ok(tavilyCalls.every((call) => !("X-Tavily-Access-Mode" in call.options.headers)));
  assert.equal(search.provider, "TAVILY_COM_CHAVE");
  assert.equal(search.tavilyAccess.configured, true);
  assert.equal(search.tavilyAccess.local, "KEYED");
  assert.ok(search.results.some((item) => item.sourceType.includes("TAVILY COM CHAVE")));
});

test("retorna automaticamente ao Keyless quando a chave configurada falha", async () => {
  const { fetchImpl, calls } = mockFreeFetch({ rejectKeyed: true });
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 100,
    tavilyApiKey: "tvly-invalid_but_well_formed_12345",
    fetchImpl,
  });

  const tavilyCalls = calls.filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily);
  assert.equal(tavilyCalls.length, 6);
  assert.equal(tavilyCalls.filter((call) => call.options.headers.Authorization).length, 3);
  assert.equal(tavilyCalls.filter((call) => call.options.headers["X-Tavily-Access-Mode"] === "keyless").length, 3);
  assert.equal(search.provider, "TAVILY_HÍBRIDO");
  assert.equal(search.tavilyAccess.local, "KEYLESS_FALLBACK");
  assert.ok(search.warnings.some((warning) => /modo Keyless respondeu/i.test(warning)));
});

test("testa a chave no endpoint oficial de uso sem executar pesquisa", async () => {
  const apiKey = "tvly-valid_test_key_1234567890";
  const { fetchImpl, calls } = mockFreeFetch();
  const result = await testTavilyKey(apiKey, fetchImpl);

  assert.equal(result.ok, true);
  assert.equal(result.plan, "Bootstrap");
  assert.equal(result.usage, 125);
  assert.equal(result.limit, 1000);
  assert.equal(result.remaining, 875);
  const usageCall = calls.find((call) => call.url === FREE_SEARCH_ENDPOINTS.tavilyUsage);
  assert.equal(usageCall.options.method, "GET");
  assert.equal(usageCall.options.headers.Authorization, `Bearer ${apiKey}`);
  assert.equal(calls.filter((call) => call.url === FREE_SEARCH_ENDPOINTS.tavily).length, 0);
});

test("recusa chave Tavily malformada antes de acessar a rede", async () => {
  let called = false;
  await assert.rejects(
    testTavilyKey("chave-sem-prefixo", async () => { called = true; }),
    /iniciada por tvly-/i,
  );
  assert.equal(called, false);
});

test("mantém resultados úteis quando uma das buscas de IA falha", async () => {
  const { fetchImpl } = mockFreeFetch({ failLocal: true });
  const search = await researchMarket({
    material: "PARAFUSO 4X16",
    radiusKm: 100,
    suppliers: knownSuppliers,
    fetchImpl,
  });
  assert.ok(search.warnings.some((warning) => warning.includes("fornecedores")));
  assert.ok(search.results.some((item) => item.kind === "OFFER"));
  assert.ok(search.results.some((item) => item.distanceStatus === "WITHIN_RADIUS"));
});

test("usa uma fonte gratuita de reserva quando a IA keyless atinge o limite", async () => {
  const { fetchImpl, calls } = mockFreeFetch({ failLocal: true, failOffers: true, fallback: true });
  const search = await researchMarket({ material: "PARAFUSO 4X16", radiusKm: 100, fetchImpl });
  assert.ok(calls.some((call) => call.url === FREE_SEARCH_ENDPOINTS.searxInstances));
  assert.ok(search.searchSources.some((source) => source.key === "reserve" && source.ok));
  assert.ok(search.results.some((item) => item.sourceUrl.includes("distribuidoraalfa.example/oferta")));
});

test("informa falha somente quando nenhuma fonte gratuita responde", async () => {
  const { fetchImpl } = mockFreeFetch({ failLocal: true, failOffers: true, failMap: true, fallback: false });
  await assert.rejects(
    researchMarket({ material: "PARAFUSO 4X16", radiusKm: 100, fetchImpl }),
    /pesquisa gratuita não respondeu/i,
  );
});

test("recusa raio fora do limite operacional", async () => {
  await assert.rejects(
    researchMarket({ material: "COLA", radiusKm: 0, fetchImpl: async () => jsonResponse({}) }),
    /1 e 5\.000 km/i,
  );
});
