const {
  normalizeTavilyKey,
  validateTavilyKey,
} = require("./credential-vault.cjs");
const PARANA_MUNICIPALITIES_DATA = require("../assets/parana-municipalities.json");

const FREE_SEARCH_ENDPOINTS = Object.freeze({
  tavily: "https://api.tavily.com/search",
  tavilyExtract: "https://api.tavily.com/extract",
  tavilyUsage: "https://api.tavily.com/usage",
  nominatim: "https://nominatim.openstreetmap.org/search",
  overpass: "https://overpass-api.de/api/interpreter",
  searxInstances: "https://searx.space/data/instances.json",
});

const MARINGA_ORIGIN = Object.freeze({
  label: "Maringá/PR",
  latitude: -23.4209995,
  longitude: -51.9330558,
});

const PARANA_REGION = Object.freeze({
  code: "PR",
  name: "Paraná",
  normalizedName: "PARANA",
  bounds: Object.freeze({
    west: -54.64,
    north: -22.5,
    east: -48.02,
    south: -26.72,
  }),
});

const BRAZILIAN_STATE_NAMES = new Map([
  ["ACRE", "AC"], ["ALAGOAS", "AL"], ["AMAPA", "AP"], ["AMAZONAS", "AM"],
  ["BAHIA", "BA"], ["CEARA", "CE"], ["DISTRITO FEDERAL", "DF"],
  ["ESPIRITO SANTO", "ES"], ["GOIAS", "GO"], ["MARANHAO", "MA"],
  ["MATO GROSSO", "MT"], ["MATO GROSSO DO SUL", "MS"], ["MINAS GERAIS", "MG"],
  ["PARA", "PA"], ["PARAIBA", "PB"], ["PARANA", "PR"], ["PERNAMBUCO", "PE"],
  ["PIAUI", "PI"], ["RIO DE JANEIRO", "RJ"], ["RIO GRANDE DO NORTE", "RN"],
  ["RIO GRANDE DO SUL", "RS"], ["RONDONIA", "RO"], ["RORAIMA", "RR"],
  ["SANTA CATARINA", "SC"], ["SAO PAULO", "SP"], ["SERGIPE", "SE"],
  ["TOCANTINS", "TO"],
]);

const BRAZILIAN_STATE_CODES = new Set(BRAZILIAN_STATE_NAMES.values());

const LOCATION_SERVICE_HOSTS = new Set([
  "openstreetmap.org",
  "google.com",
  "google.com.br",
  "waze.com",
  "mapcarta.com",
  "foursquare.com",
  "yelp.com",
  "guiamais.com.br",
  "apontador.com.br",
  "solutudo.com.br",
  "econodata.com.br",
  "cnpj.biz",
  "casadosdados.com.br",
  "consultacnpj.com",
]);

const GENERIC_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "google.com",
  "google.com.br",
  "mercadolivre.com.br",
  "amazon.com.br",
  "shopee.com.br",
  "magazineluiza.com.br",
]);

const BLOCKED_DISCOVERY_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "google.com",
  "google.com.br",
  "youtube.com",
  "wikipedia.org",
  "pinterest.com",
]);

const MATERIAL_STOP_WORDS = new Set([
  "A", "AS", "COM", "DA", "DAS", "DE", "DO", "DOS", "E", "EM", "PARA", "POR",
  "UN", "UNIDADE", "UNIDADES", "PC", "PCA", "PECAS", "CX", "CAIXA", "PACOTE",
]);

const LOCATION_MARKER_PATTERN = /\b(?:ENDEREC\w*|LOCALIZ\w*|SED[EA]|MATRIZ|FILIAL|UNIDADE|RUA|AVENIDA|RODOVIA|CEP|CNPJ)\b/;
const SHIPPING_MARKER_PATTERN = /\b(?:ENTREGA|ENTREGAMOS|ENVIO|ENVIAMOS|FRETE|ATENDEMOS|DESPACHAMOS)\b/;

const NON_OFFICIAL_SITE_HOSTS = new Set([
  ...LOCATION_SERVICE_HOSTS,
  ...GENERIC_HOSTS,
  "bing.com",
  "goo.gl",
  "apple.com",
  "mapquest.com",
  "here.com",
  "linktr.ee",
  "bio.site",
  "meulink.bio",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "wa.me",
  "whatsapp.com",
  "telelistas.net",
  "cylex.com.br",
  "listamais.com.br",
  "buscja.com",
  "eguias.net",
  "benditoguia.com.br",
  "cidadesdomeubrasil.com.br",
  "descubraonline.com",
  "empresascnpj.com",
  "brfirmas.org",
  "guiatelefone.com",
  "diariocidade.com",
  "encontramaringa.com.br",
  "qualcnpj.com.br",
  "cnpj.info",
  "consultasocio.com",
  "reclameaqui.com.br",
]);

const WHATSAPP_HOSTS = new Set([
  "wa.me",
  "whatsapp.com",
]);

const CONTACT_MARKER_PATTERN = /\b(?:ATENDIMENTO|CELULAR|CONTATO|FONE|LIGUE|TELEFONE|TEL|WHATSAPP|ZAP)\b/;
const WHATSAPP_MARKER_PATTERN = /\b(?:WHATSAPP|ZAP)\b/;

const BUSINESS_NAME_STOP_WORDS = new Set([
  "ACESSORIOS", "ATACADO", "BRASIL", "COMERCIO", "DISTRIBUIDOR", "DISTRIBUIDORA",
  "CIDADE", "EIRELI", "EMPRESA", "ESTADO", "FERRAGEM", "FERRAGENS", "INDUSTRIA", "LOJA", "LOJAS",
  "LTDA", "MADEIRA", "MADEIRAS", "MADEIREIRA", "MATERIAL", "MATERIAIS", "ME",
  "MARCENARIA", "PARANA", "REDE", "SERVICOS", "SOBRE", "SUPRIMENTOS", "TUDO",
]);

const SUPPLIER_BUSINESS_PATTERN = /\b(?:ADESIV\w*|ATACAD\w*|COLA\w*|CONSTRUCAO|DISTRIBUID\w*|FERRAGEM\w*|FERRAMENT\w*|FIXADOR\w*|HIDRAUL\w*|MADEIR\w*|MARCENARI\w*|PARAFUS\w*|SELANTE\w*|SILICONE\w*|VIDRAC\w*)\b/;
const UNRELATED_RESULT_TITLE_PATTERN = /\b(?:CONCURSO|EMPREGO|IMOVEIS?|LEILAO|NOTICIAS?|PREFEITURA|TURISMO|VAGAS?)\b|\bTUDO SOBRE (?:A )?CIDADE\b|\bGUIA DA CIDADE\b/;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const PARANA_MUNICIPALITIES = Object.freeze(PARANA_MUNICIPALITIES_DATA
  .map((municipality) => Object.freeze({
    codigoIbge: Number(municipality.codigoIbge),
    name: safeText(municipality.nome, 100),
    normalizedName: normalize(municipality.nome),
    latitude: Number(municipality.latitude),
    longitude: Number(municipality.longitude),
  }))
  .filter((municipality) => municipality.normalizedName
    && Number.isFinite(municipality.latitude)
    && Number.isFinite(municipality.longitude))
  .sort((left, right) => right.normalizedName.length - left.normalizedName.length));

function safeText(value, maxLength = 600) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeHttpUrl(value) {
  const raw = safeText(value, 1800);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function rootHost(value) {
  const url = safeHttpUrl(value);
  if (!url) return "";
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    const brazilianSecondLevel = parts.at(-1) === "br" && ["com", "net", "org"].includes(parts.at(-2));
    return brazilianSecondLevel ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

function domainLabel(value) {
  const host = rootHost(value);
  if (!host) return "Fornecedor não identificado";
  const first = host.split(".")[0] || host;
  return first
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isLocationServiceUrl(value) {
  const host = rootHost(value);
  return Boolean(host && LOCATION_SERVICE_HOSTS.has(host));
}

function commercialSiteUrl(value) {
  const url = safeHttpUrl(value);
  if (!url || isLocationServiceUrl(url)) return "";
  return url;
}

function supplierIdentityTokens(value) {
  return normalize(value)
    .split(" ")
    .filter((token) => token && !BUSINESS_NAME_STOP_WORDS.has(token));
}

function businessNamesMatch(left, right) {
  const leftName = normalize(left);
  const rightName = normalize(right);
  if (!leftName || !rightName) return false;
  const leftCompact = leftName.replace(/\s+/g, "");
  const rightCompact = rightName.replace(/\s+/g, "");
  return leftName === rightName
    || (leftName.length >= 5 && rightName.includes(leftName))
    || (rightName.length >= 5 && leftName.includes(rightName))
    || (leftCompact.length >= 5 && rightCompact.includes(leftCompact))
    || (rightCompact.length >= 5 && leftCompact.includes(rightCompact));
}

function siteMatchesSupplierName(value, supplierName) {
  const url = safeHttpUrl(value);
  const tokens = supplierIdentityTokens(supplierName);
  if (!url || !tokens.length) return false;
  let identity = "";
  try {
    const parsed = new URL(url);
    identity = normalize(parsed.hostname)
      .split(" ")
      .filter((token) => !["WWW", "COM", "BR", "NET", "ORG", "LOJA", "SITE"].includes(token))
      .join("");
  } catch {
    return false;
  }
  if (!identity) return false;
  const compactName = tokens.join("");
  if (compactName.length >= 4 && identity.includes(compactName)) return true;
  return tokens.some((token) => token.length >= 4 && identity.includes(token));
}

function officialSupplierSiteUrl(value, supplierName, { trusted = false } = {}) {
  const url = commercialSiteUrl(value);
  const host = rootHost(url);
  if (!url || !host || NON_OFFICIAL_SITE_HOSTS.has(host)) return "";
  if (trusted) return url;
  return siteMatchesSupplierName(url, supplierName) ? url : "";
}

function normalizeBrazilPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0800") && digits.length === 11) {
    return {
      digits,
      e164: "",
      display: `0800 ${digits.slice(4, 7)} ${digits.slice(7)}`,
      mobile: false,
    };
  }
  if (digits.startsWith("55") && [12, 13].includes(digits.length)) digits = digits.slice(2);
  if (![10, 11].includes(digits.length)) return null;
  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (!/^[1-9]\d$/.test(ddd) || !/^\d{8,9}$/.test(subscriber)) return null;
  if (/^(\d)\1+$/.test(subscriber)) return null;
  const mobile = subscriber.length === 9 && subscriber.startsWith("9");
  const formattedSubscriber = subscriber.length === 9
    ? `${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
    : `${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  return {
    digits: `55${ddd}${subscriber}`,
    e164: `55${ddd}${subscriber}`,
    display: `(${ddd}) ${formattedSubscriber}`,
    mobile,
  };
}

function phoneCandidatesFromText(value) {
  const text = String(value || "");
  const matches = [];
  const patterns = [
    /(?:\+?\s*55[\s().-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}/g,
    /\b0800[\s.-]*\d{3}[\s.-]*\d{4}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const phone = normalizeBrazilPhone(match[0]);
      if (!phone || matches.some((candidate) => candidate.phone.digits === phone.digits)) continue;
      const context = normalize(text.slice(Math.max(0, match.index - 70), Math.min(text.length, match.index + match[0].length + 70)));
      matches.push({
        phone,
        index: match.index,
        contactMarked: CONTACT_MARKER_PATTERN.test(context),
        whatsappMarked: WHATSAPP_MARKER_PATTERN.test(context),
      });
    }
  }
  return matches;
}

function safeWhatsappUrl(value) {
  const raw = safeText(value, 500);
  if (!raw) return "";
  const directPhone = /^https?:/i.test(raw) ? null : normalizeBrazilPhone(raw);
  if (directPhone?.e164) return `https://wa.me/${directPhone.e164}`;
  const url = safeHttpUrl(raw);
  if (!url || !WHATSAPP_HOSTS.has(rootHost(url))) return "";
  try {
    const parsed = new URL(url);
    const candidate = parsed.searchParams.get("phone") || parsed.pathname;
    const phone = normalizeBrazilPhone(candidate);
    return phone?.e164 ? `https://wa.me/${phone.e164}` : "";
  } catch {
    return "";
  }
}

function contactDetails({ phoneValues = [], whatsappValues = [], text = "", source = "" } = {}) {
  const explicitPhones = phoneValues
    .flatMap((value) => phoneCandidatesFromText(value))
    .map((candidate) => ({ ...candidate, explicit: true }));
  const textPhones = phoneCandidatesFromText(text).map((candidate) => ({ ...candidate, explicit: false }));
  const explicitWhatsappUrls = whatsappValues.map(safeWhatsappUrl).filter(Boolean);
  const explicitWhatsappPhones = explicitWhatsappUrls
    .map((url) => normalizeBrazilPhone(url))
    .filter(Boolean);
  const allPhones = [...explicitPhones, ...textPhones];
  const whatsappCandidate = explicitWhatsappPhones[0]
    || allPhones.find((candidate) => candidate.whatsappMarked && candidate.phone.mobile)?.phone
    || allPhones.find((candidate) => candidate.whatsappMarked)?.phone
    || allPhones.find((candidate) => candidate.phone.mobile)?.phone
    || null;
  const preferred = explicitPhones[0]?.phone
    || allPhones.find((candidate) => candidate.contactMarked)?.phone
    || whatsappCandidate
    || allPhones[0]?.phone
    || null;
  const whatsappUrl = explicitWhatsappUrls[0]
    || (whatsappCandidate?.e164 ? `https://wa.me/${whatsappCandidate.e164}` : "");
  return {
    phoneNumber: preferred?.display || "",
    phoneDigits: preferred?.digits || "",
    whatsappUrl,
    whatsappConfirmed: Boolean(explicitWhatsappUrls.length
      || allPhones.some((candidate) => candidate.whatsappMarked && candidate.phone.e164 === whatsappCandidate?.e164)),
    contactSource: preferred || whatsappUrl ? safeText(source, 80) : "",
  };
}

function contactDetailsFromResult(result) {
  return {
    phoneNumber: safeText(result?.phoneNumber, 80),
    phoneDigits: safeText(result?.phoneDigits, 20).replace(/\D/g, ""),
    whatsappUrl: safeWhatsappUrl(result?.whatsappUrl),
    whatsappConfirmed: result?.whatsappConfirmed === true,
    contactSource: safeText(result?.contactSource, 80),
  };
}

function mergeContactDetails(...items) {
  const contacts = items.filter(Boolean).map(contactDetailsFromResult);
  const phone = contacts.find((contact) => contact.phoneNumber) || {};
  const whatsapp = contacts.find((contact) => contact.whatsappUrl && contact.whatsappConfirmed)
    || contacts.find((contact) => contact.whatsappUrl)
    || {};
  return {
    phoneNumber: phone.phoneNumber || "",
    phoneDigits: phone.phoneDigits || "",
    whatsappUrl: whatsapp.whatsappUrl || "",
    whatsappConfirmed: whatsapp.whatsappConfirmed === true,
    contactSource: phone.contactSource || whatsapp.contactSource || "",
  };
}

function parsePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let cleaned = String(value || "").replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const negative = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, "");
  } else if (/^\d{1,3}\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(".", "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function priceFromText(value) {
  const text = String(value || "");
  const matches = [...text.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)];
  for (const match of matches) {
    const context = normalize(text.slice(Math.max(0, match.index - 24), match.index));
    if (/(?:FRETE|ENTREGA)\s*$/.test(context)) continue;
    const price = Math.max(0, parsePrice(match[1]));
    if (price > 0) return price;
  }
  return 0;
}

function parseFreight(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return { known: true, cost: value, label: value === 0 ? "Frete grátis" : `Frete informado: R$ ${value.toFixed(2)}` };
  }
  const text = safeText(value, 360);
  const normalized = normalize(text);
  if (!text) return { known: false, cost: null, label: "Frete a confirmar" };
  if (normalized.includes("FRETE GRATIS") || normalized.includes("ENTREGA GRATIS")) {
    return { known: true, cost: 0, label: "Frete grátis" };
  }
  const explicit = text.match(/(?:frete|entrega)[^R$]{0,24}R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (explicit) {
    const cost = Math.max(0, parsePrice(explicit[1]));
    return { known: true, cost, label: `Frete informado: R$ ${cost.toFixed(2)}` };
  }
  return { known: false, cost: null, label: "Frete a confirmar" };
}

function parseDeliveryDays(value) {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes("ENTREGA HOJE")) return 0;
  if (text.includes("ENTREGA AMANHA")) return 1;
  const matches = [...text.matchAll(/(\d{1,3})\s*(?:A\s*(\d{1,3})\s*)?DIAS?/g)];
  if (!matches.length) return null;
  return Math.max(...matches.map((match) => Number(match[2] || match[1])).filter(Number.isFinite));
}

function toCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(from, to) {
  const lat1 = toCoordinate(from?.latitude);
  const lon1 = toCoordinate(from?.longitude);
  const lat2 = toCoordinate(to?.latitude);
  const lon2 = toCoordinate(to?.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;
  const radians = (degrees) => degrees * (Math.PI / 180);
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = (Math.sin(deltaLat / 2) ** 2)
    + (Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * (Math.sin(deltaLon / 2) ** 2));
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function supplierFor(name, url, suppliers) {
  const candidate = normalize(name);
  const candidateHost = rootHost(url);
  return (suppliers || []).find((supplier) => {
    const known = normalize(supplier.name);
    const nameMatches = candidate && known && businessNamesMatch(candidate, known);
    const knownHosts = [supplier.commercialUrl, supplier.reputationUrl]
      .map(rootHost)
      .filter((host) => host && !GENERIC_HOSTS.has(host));
    const domainMatches = candidateHost && !GENERIC_HOSTS.has(candidateHost) && knownHosts.includes(candidateHost);
    return nameMatches || domainMatches;
  }) || null;
}

function searchArea(radiusKm) {
  if (radiusKm <= 50) return `Maringá e cidades em até ${Math.round(radiusKm)} km`;
  if (radiusKm <= 150) return `noroeste do Paraná em até ${Math.round(radiusKm)} km de Maringá`;
  if (radiusKm <= 500) return `Paraná em até ${Math.round(radiusKm)} km de Maringá`;
  return `todo o estado do Paraná, respeitando o limite de ${Math.round(radiusKm)} km de Maringá`;
}

function municipalitiesWithinRadius(origin, radiusKm, limit = 14) {
  return PARANA_MUNICIPALITIES
    .map((municipality) => ({ municipality, distance: distanceKm(origin, municipality) }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(1, limit))
    .map(({ municipality }) => `${municipality.name}/PR`);
}

function distanceState(value, radiusKm) {
  if (!Number.isFinite(value)) return "UNCONFIRMED";
  return value <= radiusKm ? "WITHIN_RADIUS" : "OUTSIDE_RADIUS";
}

function stateCodeFromName(value) {
  const normalized = normalize(value);
  if (!normalized) return "";
  if (BRAZILIAN_STATE_CODES.has(normalized)) return normalized;
  return BRAZILIAN_STATE_NAMES.get(normalized) || "";
}

function stateCodeFromPlace(place) {
  const address = place?.address || {};
  const isoValue = safeText(
    address["ISO3166-2-lvl4"]
      || address["ISO3166-2-lvl3"]
      || address["ISO3166-2-lvl2"],
    30,
  ).toUpperCase();
  const isoMatch = isoValue.match(/(?:^|,)\s*BR-([A-Z]{2})(?:\s*,|$)/);
  if (isoMatch && BRAZILIAN_STATE_CODES.has(isoMatch[1])) return isoMatch[1];

  const explicit = stateCodeFromName(address.state || address.region || address.state_district);
  if (explicit) return explicit;

  const display = ` ${normalize(place?.display_name)} `;
  for (const [stateName, stateCode] of BRAZILIAN_STATE_NAMES) {
    if (display.includes(` ${stateName} `)) return stateCode;
  }
  return "";
}

function stateCodesFromWebText(value) {
  const raw = safeText(value, 12000);
  const normalized = ` ${normalize(raw)} `;
  const codes = new Set();

  for (const match of raw.matchAll(/(?:\/|,|\s[-–—]\s)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/gi)) {
    const context = normalize(raw.slice(Math.max(0, match.index - 140), Math.min(raw.length, match.index + 60)));
    if (!SHIPPING_MARKER_PATTERN.test(context) || LOCATION_MARKER_PATTERN.test(context)) codes.add(match[1].toUpperCase());
  }

  for (const [stateName, stateCode] of BRAZILIAN_STATE_NAMES) {
    let index = normalized.indexOf(` ${stateName} `);
    while (index >= 0) {
      const context = normalized.slice(Math.max(0, index - 150), Math.min(normalized.length, index + stateName.length + 80));
      if (!SHIPPING_MARKER_PATTERN.test(context) || LOCATION_MARKER_PATTERN.test(context)) codes.add(stateCode);
      index = normalized.indexOf(` ${stateName} `, index + stateName.length + 2);
    }
  }
  return [...codes];
}

function supplierLocationStateCode(supplier) {
  const codes = stateCodesFromWebText(supplier?.location || "");
  return codes.length === 1 ? codes[0] : "";
}

function paranaMunicipalityFromText(value, { trustedLocation = false } = {}) {
  const normalized = ` ${normalize(safeText(value, 12000))} `;
  if (!normalized.trim()) return null;

  for (const municipality of PARANA_MUNICIPALITIES) {
    const needle = ` ${municipality.normalizedName} `;
    let index = normalized.indexOf(needle);
    while (index >= 0) {
      const context = normalized.slice(
        Math.max(0, index - 180),
        Math.min(normalized.length, index + needle.length + 180),
      );
      const hasParanaMarker = /\b(?:PR|PARANA)\b/.test(context);
      const hasLocationMarker = LOCATION_MARKER_PATTERN.test(context);
      const shippingOnly = SHIPPING_MARKER_PATTERN.test(context) && !hasLocationMarker;
      if (!shippingOnly && (trustedLocation || hasParanaMarker)) {
        return municipality;
      }
      index = normalized.indexOf(needle, index + needle.length);
    }
  }
  return null;
}

function municipalityLocationEvidence(municipality, origin, radiusKm, address, source) {
  if (!municipality) return null;
  const calculatedDistance = distanceKm(origin, municipality);
  const state = distanceState(calculatedDistance, radiusKm);
  return {
    stateCode: PARANA_REGION.code,
    stateName: PARANA_REGION.name,
    locationConfirmed: true,
    distanceKm: Number.isFinite(calculatedDistance) ? Number(calculatedDistance.toFixed(1)) : null,
    distanceStatus: state,
    distanceApproximate: true,
    municipality: municipality.name,
    address: safeText(address, 220) || `${municipality.name}/PR`,
    locationSource: source,
  };
}

function statewideRadiusCoversParana(origin, radiusKm) {
  return PARANA_MUNICIPALITIES.every((municipality) => {
    const calculatedDistance = distanceKm(origin, municipality);
    return Number.isFinite(calculatedDistance) && calculatedDistance <= radiusKm;
  });
}

function webLocationEvidence({ place, knownSupplier, combinedText, origin, radiusKm }) {
  if (place) {
    return {
      stateCode: place.stateCode,
      stateName: place.stateName,
      locationConfirmed: place.locationConfirmed === true,
      distanceKm: place.distanceKm,
      distanceStatus: place.distanceStatus,
      distanceApproximate: false,
      municipality: safeText(place.municipality, 100),
      address: safeText(place.address, 220),
      locationSource: "OPENSTREETMAP",
    };
  }

  const knownStateCode = supplierLocationStateCode(knownSupplier);
  if (knownStateCode === PARANA_REGION.code) {
    const knownMunicipality = paranaMunicipalityFromText(knownSupplier?.location, { trustedLocation: true });
    const evidence = municipalityLocationEvidence(
      knownMunicipality,
      origin,
      radiusKm,
      knownSupplier?.location,
      "CADASTRO_INTERNO",
    );
    if (evidence) return evidence;
  }

  const municipality = paranaMunicipalityFromText(combinedText);
  const municipalEvidence = municipalityLocationEvidence(
    municipality,
    origin,
    radiusKm,
    municipality ? `${municipality.name}/PR` : "",
    "CONTEUDO_SITE",
  );
  if (municipalEvidence) return municipalEvidence;

  const stateCodes = stateCodesFromWebText(combinedText);
  const stateOnlyIsParana = stateCodes.length === 1 && stateCodes[0] === PARANA_REGION.code;
  const normalized = normalize(combinedText);
  if (stateOnlyIsParana
    && LOCATION_MARKER_PATTERN.test(normalized)
    && statewideRadiusCoversParana(origin, radiusKm)) {
    return {
      stateCode: PARANA_REGION.code,
      stateName: PARANA_REGION.name,
      locationConfirmed: true,
      distanceKm: null,
      distanceStatus: "WITHIN_RADIUS",
      distanceApproximate: true,
      municipality: "",
      address: "Paraná · cidade não identificada no resultado",
      locationSource: "ESTADO_CONFIRMADO",
    };
  }
  return null;
}

function makeId(prefix, index, value) {
  const encoded = Buffer.from(`${prefix}:${index}:${value || "resultado"}`).toString("base64url").slice(0, 42);
  return `${prefix}-${encoded}`;
}

function supplierNameFromWeb(item) {
  const explicit = safeText(item?.source || item?.seller, 120);
  if (explicit) return explicit;
  const titleLead = safeText(String(item?.title || "").split(/\s+[|–—]\s+|\s+-\s+/)[0], 120);
  const fromDomain = domainLabel(item?.url || item?.link || item?.product_link);
  const genericTitle = /^(?:CATALOGO|CONTATO|FALE CONOSCO|HOME|INICIO|LOJA ONLINE|PAGINA INICIAL|PRODUTOS?|QUEM SOMOS|SITE OFICIAL)$/i.test(normalize(titleLead));
  if (titleLead && titleLead !== safeText(item?.title, 120) && !genericTitle) return titleLead;
  if (fromDomain !== "Fornecedor não identificado") return fromDomain;
  return titleLead || "Fornecedor não identificado";
}

function materialTokens(material) {
  return normalize(material)
    .split(" ")
    .filter((token) => token && !MATERIAL_STOP_WORDS.has(token) && (token.length > 1 || /\d/.test(token)));
}

function tokenWeight(token) {
  if (/\d/.test(token)) return 2.4;
  if (token.length >= 7) return 1.5;
  return 1;
}

function materialMatchScore(material, value) {
  const tokens = materialTokens(material);
  if (!tokens.length) return 0;
  const haystack = ` ${normalize(value)} `;
  const totalWeight = tokens.reduce((sum, token) => sum + tokenWeight(token), 0);
  const matchedWeight = tokens.reduce((sum, token) => sum + (haystack.includes(` ${token} `) ? tokenWeight(token) : 0), 0);
  return totalWeight ? matchedWeight / totalWeight : 0;
}

function isPlausibleSupplierPage(title, content) {
  const normalizedTitle = normalize(title);
  if (UNRELATED_RESULT_TITLE_PATTERN.test(normalizedTitle)) return false;
  return SUPPLIER_BUSINESS_PATTERN.test(normalize(`${title} ${content}`));
}

function confidenceLabel(score) {
  if (score >= 75) return "ALTA";
  if (score >= 50) return "MÉDIA";
  return "BAIXA";
}

function resultConfidence({ providerScore = 0, matchScore = 0, directDomain = false, price = 0, freightKnown = false, locationConfirmed = false }) {
  const score = Math.max(0, Math.min(100,
    18
    + (Math.max(0, Math.min(1, Number(providerScore) || 0)) * 32)
    + (Math.max(0, Math.min(1, Number(matchScore) || 0)) * 34)
    + (directDomain ? 7 : 0)
    + (price > 0 ? 4 : 0)
    + (freightKnown ? 2 : 0)
    + (locationConfirmed ? 3 : 0),
  ));
  return { score: Math.round(score), label: confidenceLabel(score) };
}

function businessSearchTerm(material) {
  const value = normalize(material);
  if (/MDF|CHAPA|MADEIRA|LAMINADO|COMPENSADO/.test(value)) return "madeireira";
  if (/PARAFUS|DOBRADIC|CORREDIC|PUXADOR|FERRAGEM|CAVILHA|PREGO/.test(value)) return "loja de ferragens";
  if (/COLA|ADESIV|SILICONE|SELANTE/.test(value)) return "material de construção";
  if (/VIDRO|ESPELHO/.test(value)) return "vidraçaria";
  return "loja de ferragens";
}

function radiusViewbox(origin, radiusKm) {
  const latitude = Number(origin?.latitude) || MARINGA_ORIGIN.latitude;
  const longitude = Number(origin?.longitude) || MARINGA_ORIGIN.longitude;
  const latitudeDelta = Math.min(89, radiusKm / 110.574);
  const longitudeScale = Math.max(0.15, Math.cos(latitude * (Math.PI / 180)));
  const longitudeDelta = Math.min(179, radiusKm / (111.320 * longitudeScale));
  const top = Math.min(89.9, latitude + latitudeDelta);
  const bottom = Math.max(-89.9, latitude - latitudeDelta);
  const left = Math.max(-179.9, longitude - longitudeDelta);
  const right = Math.min(179.9, longitude + longitudeDelta);
  return `${left.toFixed(6)},${top.toFixed(6)},${right.toFixed(6)},${bottom.toFixed(6)}`;
}

function paranaViewbox(origin, radiusKm) {
  const [radiusLeft, radiusTop, radiusRight, radiusBottom] = radiusViewbox(origin, radiusKm)
    .split(",")
    .map(Number);
  const left = Math.max(PARANA_REGION.bounds.west, radiusLeft);
  const top = Math.min(PARANA_REGION.bounds.north, radiusTop);
  const right = Math.min(PARANA_REGION.bounds.east, radiusRight);
  const bottom = Math.max(PARANA_REGION.bounds.south, radiusBottom);
  return `${left.toFixed(6)},${top.toFixed(6)},${right.toFixed(6)},${bottom.toFixed(6)}`;
}

async function jsonRequest(url, options, fetchImpl, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response?.ok) {
      const detail = typeof response?.text === "function" ? await response.text().catch(() => "") : "";
      const status = Number(response?.status) || 0;
      if ([429, 432].includes(status)) throw new Error("limite gratuito temporário atingido");
      throw new Error(`erro ${status || "desconhecido"}${detail ? `: ${safeText(detail, 180)}` : ""}`);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("tempo de resposta excedido");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function tavilyRequest(query, fetchImpl, rawApiKey = "", { includeRawContent = false } = {}) {
  const apiKey = normalizeTavilyKey(rawApiKey);
  if (apiKey) validateTavilyKey(apiKey);
  return jsonRequest(FREE_SEARCH_ENDPOINTS.tavily, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey
        ? { Authorization: `Bearer ${apiKey}` }
        : { "X-Tavily-Access-Mode": "keyless" }),
    },
    body: JSON.stringify({
      query,
      search_depth: "fast",
      max_results: 15,
      topic: "general",
      include_answer: false,
      include_raw_content: includeRawContent ? "text" : false,
      include_images: false,
      include_usage: true,
      auto_parameters: false,
    }),
  }, fetchImpl, 15000);
}

async function tavilyRequestWithFallback(query, fetchImpl, rawApiKey = "", options = {}) {
  const apiKey = normalizeTavilyKey(rawApiKey);
  if (!apiKey) {
    return {
      payload: await tavilyRequest(query, fetchImpl, "", options),
      accessMode: "KEYLESS",
      fallbackUsed: false,
      fallbackReason: "",
    };
  }
  try {
    return {
      payload: await tavilyRequest(query, fetchImpl, apiKey, options),
      accessMode: "KEYED",
      fallbackUsed: false,
      fallbackReason: "",
    };
  } catch (keyedError) {
    try {
      return {
        payload: await tavilyRequest(query, fetchImpl, "", options),
        accessMode: "KEYLESS_FALLBACK",
        fallbackUsed: true,
        fallbackReason: safeText(keyedError?.message || keyedError, 180),
      };
    } catch (keylessError) {
      throw new Error(`chave configurada: ${safeText(keyedError?.message || keyedError, 150)}; modo Keyless: ${safeText(keylessError?.message || keylessError, 150)}`);
    }
  }
}

async function tavilyExtractRequest(urls, fetchImpl, rawApiKey = "") {
  const apiKey = normalizeTavilyKey(rawApiKey);
  if (apiKey) validateTavilyKey(apiKey);
  const selectedUrls = [...new Set((urls || []).map(safeHttpUrl).filter(Boolean))].slice(0, 20);
  if (!selectedUrls.length) return { results: [], failed_results: [] };
  return jsonRequest(FREE_SEARCH_ENDPOINTS.tavilyExtract, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey
        ? { Authorization: `Bearer ${apiKey}` }
        : { "X-Tavily-Access-Mode": "keyless" }),
    },
    body: JSON.stringify({
      urls: selectedUrls,
      query: "Endereço físico da empresa, sede, filial, cidade, estado, CEP, CNPJ, site oficial, telefone e WhatsApp. Identifique com precisão se existe unidade no Paraná e os canais diretos de atendimento.",
      chunks_per_source: 5,
      extract_depth: "basic",
      include_images: false,
      include_favicon: false,
      format: "text",
      timeout: 20,
      include_usage: true,
    }),
  }, fetchImpl, 28000);
}

async function tavilyExtractWithFallback(urls, fetchImpl, rawApiKey = "") {
  const apiKey = normalizeTavilyKey(rawApiKey);
  if (!apiKey) {
    return {
      payload: await tavilyExtractRequest(urls, fetchImpl, ""),
      accessMode: "KEYLESS",
      fallbackUsed: false,
      fallbackReason: "",
    };
  }
  try {
    return {
      payload: await tavilyExtractRequest(urls, fetchImpl, apiKey),
      accessMode: "KEYED",
      fallbackUsed: false,
      fallbackReason: "",
    };
  } catch (keyedError) {
    try {
      return {
        payload: await tavilyExtractRequest(urls, fetchImpl, ""),
        accessMode: "KEYLESS_FALLBACK",
        fallbackUsed: true,
        fallbackReason: safeText(keyedError?.message || keyedError, 180),
      };
    } catch (keylessError) {
      throw new Error(`chave configurada: ${safeText(keyedError?.message || keyedError, 150)}; modo Keyless: ${safeText(keylessError?.message || keylessError, 150)}`);
    }
  }
}

async function testTavilyKey(rawApiKey, fetchImpl = globalThis.fetch) {
  const apiKey = validateTavilyKey(rawApiKey);
  if (typeof fetchImpl !== "function") throw new Error("Conexão online indisponível para testar a chave Tavily.");
  let payload;
  try {
    payload = await jsonRequest(FREE_SEARCH_ENDPOINTS.tavilyUsage, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }, fetchImpl, 12000);
  } catch (error) {
    if (/erro\s+401/i.test(String(error?.message || error))) {
      throw new Error("A Tavily recusou esta chave. Copie novamente a chave completa no painel da Tavily.");
    }
    throw new Error(`Não foi possível validar a chave Tavily: ${safeText(error?.message || error, 220)}`);
  }
  const usage = Number(payload?.key?.usage);
  const limit = Number(payload?.key?.limit);
  const normalizedUsage = Number.isFinite(usage) ? usage : null;
  const normalizedLimit = Number.isFinite(limit) ? limit : null;
  return {
    ok: true,
    testedAt: new Date().toISOString(),
    plan: safeText(payload?.account?.current_plan || "Plano Tavily", 80),
    usage: normalizedUsage,
    limit: normalizedLimit,
    remaining: normalizedUsage !== null && normalizedLimit !== null
      ? Math.max(0, normalizedLimit - normalizedUsage)
      : null,
  };
}

async function nominatimRequest(material, origin, radiusKm, fetchImpl) {
  const params = new URLSearchParams({
    q: `${businessSearchTerm(material)}, Paraná, Brasil`,
    format: "jsonv2",
    addressdetails: "1",
    extratags: "1",
    namedetails: "1",
    countrycodes: "br",
    dedupe: "1",
    limit: "50",
    bounded: "1",
    viewbox: paranaViewbox(origin, radiusKm),
    "accept-language": "pt-BR",
  });
  return jsonRequest(`${FREE_SEARCH_ENDPOINTS.nominatim}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "User-Agent": "RasputimTecnologis/0.4.15 (pesquisa de compras sob comando)",
    },
  }, fetchImpl, 12000);
}

function overpassShopPattern(material) {
  const normalized = normalize(material);
  if (/VIDRO|ESPELHO/.test(normalized)) return "hardware|doityourself|trade|glaziery";
  if (/TINTA|VERNIZ|SOLVENTE/.test(normalized)) return "hardware|doityourself|trade|paint";
  return "hardware|doityourself|trade|paint";
}

function overpassQuery(material, origin, radiusKm) {
  const latitude = toCoordinate(origin?.latitude) ?? MARINGA_ORIGIN.latitude;
  const longitude = toCoordinate(origin?.longitude) ?? MARINGA_ORIGIN.longitude;
  const radiusMeters = Math.max(1000, Math.round(Number(radiusKm) * 1000));
  const shops = overpassShopPattern(material);
  return `[out:json][timeout:25];
area["boundary"="administrative"]["ISO3166-2"="BR-PR"]->.parana;
(
  nwr["shop"~"^(${shops})$"](area.parana)(around:${radiusMeters},${latitude},${longitude});
);
out center tags;`;
}

async function overpassRequest(material, origin, radiusKm, fetchImpl) {
  return jsonRequest(FREE_SEARCH_ENDPOINTS.overpass, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "RasputimTecnologis/0.4.15 (pesquisa de compras sob comando)",
    },
    body: new URLSearchParams({ data: overpassQuery(material, origin, radiusKm) }).toString(),
  }, fetchImpl, 30000);
}

function overpassAddress(tags) {
  const street = safeText(tags?.["addr:street"], 100);
  const number = safeText(tags?.["addr:housenumber"], 30);
  const district = safeText(tags?.["addr:suburb"] || tags?.["addr:district"], 80);
  const city = safeText(tags?.["addr:city"] || tags?.["addr:municipality"], 100);
  const postcode = safeText(tags?.["addr:postcode"], 20);
  return [
    [street, number].filter(Boolean).join(", "),
    district,
    city ? `${city}/PR` : "Paraná",
    postcode ? `CEP ${postcode}` : "",
  ].filter(Boolean).join(" · ");
}

function overpassPlaceResults(payload, suppliers, origin, radiusKm) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements.slice(0, 100).map((element, index) => {
    const tags = element?.tags || {};
    const explicitState = stateCodeFromName(tags["addr:state"] || tags["is_in:state"] || tags.state);
    if (explicitState && explicitState !== PARANA_REGION.code) return null;
    const latitude = toCoordinate(element?.lat ?? element?.center?.lat);
    const longitude = toCoordinate(element?.lon ?? element?.center?.lon);
    const calculatedDistance = distanceKm(origin, { latitude, longitude });
    const state = distanceState(calculatedDistance, radiusKm);
    if (state !== "WITHIN_RADIUS") return null;

    const supplierName = safeText(tags.name || tags.brand || tags.operator, 120);
    if (!supplierName) return null;
    const rawWebsite = tags.website || tags["contact:website"] || tags.url;
    const knownSupplier = supplierFor(supplierName, rawWebsite, suppliers);
    const knownWebsite = officialSupplierSiteUrl(
      knownSupplier?.commercialUrl,
      knownSupplier?.name || supplierName,
      { trusted: true },
    );
    const discoveredWebsite = officialSupplierSiteUrl(rawWebsite, supplierName);
    const officialSiteUrl = knownWebsite || discoveredWebsite;
    const contact = contactDetails({
      phoneValues: [tags.phone, tags["contact:phone"], tags.mobile, tags["contact:mobile"]],
      whatsappValues: [tags.whatsapp, tags["contact:whatsapp"]],
      source: "OPENSTREETMAP",
    });
    const municipality = safeText(tags["addr:city"] || tags["addr:municipality"], 100);
    const confidence = resultConfidence({
      providerScore: 0.58,
      matchScore: 0.55,
      directDomain: Boolean(officialSiteUrl),
      locationConfirmed: true,
    });
    return {
      id: makeId("OVERPASS", index, `${element?.type}:${element?.id}`),
      kind: "SUPPLIER",
      title: supplierName,
      supplierName,
      supplierStatus: knownSupplier ? "CADASTRADO" : "NOVO",
      isKnown: Boolean(knownSupplier),
      price: 0,
      freight: null,
      freightKnown: false,
      totalPrice: 0,
      delivery: "Preço, estoque, frete e prazo devem ser cotados",
      deliveryDays: null,
      reliability: knownSupplier?.reliability || "NÃO AVALIADA",
      confidenceScore: confidence.score,
      matchConfidence: confidence.label,
      materialMatch: null,
      sourceUrl: officialSiteUrl,
      officialSiteUrl,
      offerUrl: "",
      officialSiteConfirmed: Boolean(officialSiteUrl),
      locationConfirmed: true,
      stateCode: PARANA_REGION.code,
      stateName: PARANA_REGION.name,
      note: officialSiteUrl
        ? "Loja compatível com esta categoria, localizada no Paraná e com canal comercial identificado. Confirme se vende exatamente este material antes de cotar."
        : "Loja compatível com esta categoria e localizada no Paraná. O site comercial não foi confirmado; use o telefone ou endereço antes de cotar.",
      address: overpassAddress(tags) || `${municipality || "Paraná"}/PR`,
      ...contact,
      rating: null,
      ratingCount: null,
      distanceKm: Number(calculatedDistance.toFixed(1)),
      distanceStatus: state,
      distanceApproximate: false,
      municipality,
      locationSource: "OPENSTREETMAP_OVERPASS",
      sourceType: "OPENSTREETMAP · LOJA NO PARANÁ",
      category: knownSupplier ? "KNOWN_SUPPLIER" : "NEW_LOCAL_SUPPLIER",
    };
  }).filter(Boolean);
}

function osmPlaceResults(payload, suppliers, origin, radiusKm) {
  const places = Array.isArray(payload) ? payload : [];
  return places.slice(0, 50).map((place, index) => {
    const stateCode = stateCodeFromPlace(place);
    if (stateCode !== PARANA_REGION.code) return null;
    const latitude = toCoordinate(place.lat);
    const longitude = toCoordinate(place.lon);
    const calculatedDistance = distanceKm(origin, { latitude, longitude });
    const state = distanceState(calculatedDistance, radiusKm);
    if (state !== "WITHIN_RADIUS") return null;
    const supplierName = safeText(place?.name || place?.namedetails?.name || String(place?.display_name || "").split(",")[0], 120);
    const rawWebsite = place?.extratags?.website || place?.extratags?.contact_website;
    const knownSupplier = supplierFor(supplierName, rawWebsite, suppliers);
    const knownWebsite = officialSupplierSiteUrl(knownSupplier?.commercialUrl, knownSupplier?.name || supplierName, { trusted: true });
    const discoveredWebsite = officialSupplierSiteUrl(rawWebsite, supplierName);
    const officialSiteUrl = knownWebsite || discoveredWebsite;
    const contact = contactDetails({
      phoneValues: [
        place?.extratags?.phone,
        place?.extratags?.contact_phone,
        place?.extratags?.mobile,
        place?.extratags?.contact_mobile,
      ],
      whatsappValues: [place?.extratags?.whatsapp, place?.extratags?.contact_whatsapp],
      source: "OPENSTREETMAP",
    });
    const confidence = resultConfidence({
      providerScore: Number(place?.importance) || 0.35,
      matchScore: 0.55,
      directDomain: Boolean(officialSiteUrl),
      locationConfirmed: true,
    });
    return {
      id: makeId("OSM", index, `${place?.osm_type}:${place?.osm_id}`),
      kind: "SUPPLIER",
      title: supplierName || "Fornecedor local",
      supplierName: supplierName || "Fornecedor local",
      supplierStatus: knownSupplier ? "CADASTRADO" : "NOVO",
      isKnown: Boolean(knownSupplier),
      price: 0,
      freight: null,
      freightKnown: false,
      totalPrice: 0,
      delivery: "Preço, estoque, frete e prazo devem ser cotados",
      deliveryDays: null,
      reliability: knownSupplier?.reliability || "NÃO AVALIADA",
      confidenceScore: confidence.score,
      matchConfidence: confidence.label,
      materialMatch: null,
      sourceUrl: officialSiteUrl,
      officialSiteUrl,
      offerUrl: "",
      officialSiteConfirmed: Boolean(officialSiteUrl),
      locationConfirmed: true,
      stateCode: PARANA_REGION.code,
      stateName: PARANA_REGION.name,
      note: officialSiteUrl
        ? "Fornecedor com localização confirmada no Paraná e canal comercial identificado. Confirme se vende exatamente este material antes de cotar."
        : "Fornecedor com localização confirmada no Paraná. O site comercial não foi confirmado; use o telefone ou endereço antes de cotar.",
      address: safeText(place?.display_name, 220),
      ...contact,
      rating: null,
      ratingCount: null,
      distanceKm: Number.isFinite(calculatedDistance) ? Number(calculatedDistance.toFixed(1)) : null,
      distanceStatus: state,
      distanceApproximate: false,
      municipality: safeText(place?.address?.city || place?.address?.town || place?.address?.municipality, 100),
      locationSource: "OPENSTREETMAP",
      sourceType: "FORNECEDOR NO PARANÁ",
      category: knownSupplier ? "KNOWN_SUPPLIER" : "NEW_LOCAL_SUPPLIER",
    };
  }).filter((result) => result?.supplierName);
}

function registeredSupplierResults(suppliers, origin, radiusKm) {
  return (suppliers || []).map((supplier, index) => {
    if (supplierLocationStateCode(supplier) !== PARANA_REGION.code) return null;
    const municipality = paranaMunicipalityFromText(supplier.location, { trustedLocation: true });
    const location = municipalityLocationEvidence(
      municipality,
      origin,
      radiusKm,
      supplier.location,
      "CADASTRO_INTERNO",
    );
    if (!location || location.distanceStatus !== "WITHIN_RADIUS") return null;
    const supplierName = safeText(supplier.name, 120);
    const officialSiteUrl = officialSupplierSiteUrl(supplier.commercialUrl, supplierName, { trusted: true });
    const contact = contactDetails({
      phoneValues: [supplier.phoneNumber, supplier.phone, supplier.mobile],
      whatsappValues: [supplier.whatsappUrl, supplier.whatsapp],
      source: "CADASTRO INTERNO",
    });
    const confidence = resultConfidence({
      providerScore: 0.65,
      matchScore: 0.45,
      directDomain: Boolean(officialSiteUrl),
      locationConfirmed: true,
    });
    return {
      id: makeId("CADASTRO", index, supplier.id || supplierName),
      kind: "SUPPLIER",
      title: supplierName,
      supplierName,
      supplierStatus: "CADASTRADO",
      isKnown: true,
      price: 0,
      freight: null,
      freightKnown: false,
      totalPrice: 0,
      delivery: "Preço, estoque, frete e prazo devem ser cotados",
      deliveryDays: null,
      reliability: supplier.reliability || "NÃO AVALIADA",
      confidenceScore: confidence.score,
      matchConfidence: confidence.label,
      materialMatch: null,
      sourceUrl: officialSiteUrl,
      officialSiteUrl,
      offerUrl: "",
      officialSiteConfirmed: Boolean(officialSiteUrl),
      note: safeText(supplier.evidence, 600)
        || "Fornecedor cadastrado com endereço confirmado no Paraná; confirme a disponibilidade deste material.",
      ...contact,
      rating: null,
      ratingCount: null,
      sourceType: "CADASTRO INTERNO · PARANÁ",
      category: "KNOWN_SUPPLIER",
      ...location,
    };
  }).filter(Boolean);
}

function findMatchingPlace(name, url, places) {
  const candidateName = normalize(name);
  const candidateHost = rootHost(url);
  return (places || []).find((place) => {
    const placeName = normalize(place.supplierName);
    const placeHost = rootHost(place.officialSiteUrl || place.sourceUrl);
    const namesMatch = candidateName && placeName && businessNamesMatch(candidateName, placeName);
    const domainsMatch = candidateHost && placeHost && !GENERIC_HOSTS.has(candidateHost) && candidateHost === placeHost;
    return namesMatch || domainsMatch;
  }) || null;
}

function freeWebResults(
  payload,
  queryKind,
  material,
  suppliers,
  places,
  provider = "TAVILY_KEYLESS",
  origin = MARINGA_ORIGIN,
  radiusKm = 100,
) {
  const sourceItems = Array.isArray(payload?.results) ? payload.results : [];
  return sourceItems.slice(0, 30).map((item, index) => {
    const discoveredUrl = safeHttpUrl(item.url || item.link);
    const host = rootHost(discoveredUrl);
    if (!discoveredUrl || isLocationServiceUrl(discoveredUrl) || BLOCKED_DISCOVERY_HOSTS.has(host)) return null;
    const title = safeText(item.title, 300);
    const content = safeText(item.content || item.snippet, 900);
    const rawContent = safeText(item.raw_content || item.rawContent, 12000);
    const combinedText = `${title} ${content} ${rawContent}`;
    const matchScore = materialMatchScore(material, combinedText);
    const providerScore = Number(item.score);
    const businessRelevant = isPlausibleSupplierPage(title, `${content} ${rawContent}`);
    const supplierName = supplierNameFromWeb(item);
    const knownSupplier = supplierFor(supplierName, discoveredUrl, suppliers);
    const place = findMatchingPlace(supplierName, discoveredUrl, places);
    if (queryKind === "offers") {
      if (matchScore < 0.6) return null;
    } else if (queryKind === "contacts") {
      if (!place && !knownSupplier && !businessRelevant) return null;
    } else if (matchScore < 0.55 && !businessRelevant) return null;

    const price = priceFromText(combinedText);
    const freight = parseFreight(combinedText);
    const kind = queryKind === "contacts" ? "SUPPLIER" : price > 0 ? "OFFER" : "SUPPLIER";
    if (kind === "SUPPLIER" && GENERIC_HOSTS.has(host)) return null;
    const location = webLocationEvidence({
      place,
      knownSupplier,
      combinedText,
      origin,
      radiusKm,
    });
    if (!location
      || location.stateCode !== PARANA_REGION.code
      || location.distanceStatus !== "WITHIN_RADIUS") return null;

    const knownWebsite = officialSupplierSiteUrl(knownSupplier?.commercialUrl, knownSupplier?.name || supplierName, { trusted: true });
    const placeWebsite = officialSupplierSiteUrl(place?.officialSiteUrl || place?.sourceUrl, place?.supplierName || supplierName, { trusted: true });
    const discoveredWebsite = officialSupplierSiteUrl(discoveredUrl, supplierName);
    const officialSiteUrl = placeWebsite || knownWebsite || discoveredWebsite;
    const offerUrl = kind === "OFFER" ? discoveredUrl : "";
    const sourceUrl = kind === "SUPPLIER" ? officialSiteUrl : offerUrl;
    const webContact = officialSiteUrl
      ? contactDetails({ text: combinedText, source: "SITE OFICIAL" })
      : null;
    const contact = mergeContactDetails(place, webContact);
    const confidence = resultConfidence({
      providerScore,
      matchScore,
      directDomain: Boolean(host && !GENERIC_HOSTS.has(host)),
      price,
      freightKnown: freight.known,
      locationConfirmed: true,
    });
    return {
      id: makeId(provider.startsWith("TAVILY") ? "TAVILY" : "RESERVA", index, sourceUrl),
      kind,
      title: title || supplierName,
      supplierName,
      supplierStatus: knownSupplier ? "CADASTRADO" : "NOVO",
      isKnown: Boolean(knownSupplier),
      price,
      freight: freight.cost,
      freightKnown: freight.known,
      totalPrice: price > 0 && freight.known ? price + freight.cost : price,
      delivery: freight.label,
      deliveryDays: parseDeliveryDays(combinedText),
      reliability: knownSupplier?.reliability || "NÃO AVALIADA",
      confidenceScore: confidence.score,
      matchConfidence: confidence.label,
      materialMatch: Number(matchScore.toFixed(3)),
      sourceUrl,
      officialSiteUrl: kind === "SUPPLIER" ? officialSiteUrl : (placeWebsite || knownWebsite || discoveredWebsite),
      offerUrl,
      officialSiteConfirmed: Boolean(officialSiteUrl),
      offerUrlConfirmed: kind === "OFFER" && Boolean(offerUrl),
      note: content || "Fornecedor encontrado na pesquisa aberta; confirme catálogo, CNPJ, preço e entrega.",
      ...contact,
      rating: place?.rating ?? null,
      ratingCount: place?.ratingCount ?? null,
      sourceType: provider.startsWith("TAVILY")
        ? `${provider === "TAVILY_KEYED" ? "TAVILY COM CHAVE" : "TAVILY KEYLESS"} · ${queryKind === "contacts" ? "CONTATO" : kind === "OFFER" ? "OFERTA" : "FORNECEDOR"}`
        : kind === "OFFER" ? "BUSCA RESERVA · OFERTA" : "BUSCA RESERVA · FORNECEDOR",
      category: knownSupplier ? "KNOWN_SUPPLIER" : kind === "OFFER" ? "MARKET_OFFER" : "NEW_LOCAL_SUPPLIER",
      ...location,
    };
  }).filter(Boolean);
}

function discoveryUrlsNeedingLocation(payloads, confirmedResults = []) {
  const confirmedHosts = new Set();
  for (const result of confirmedResults) {
    [result?.sourceUrl, result?.officialSiteUrl, result?.offerUrl]
      .map(rootHost)
      .filter(Boolean)
      .forEach((host) => confirmedHosts.add(host));
  }

  const selected = [];
  const selectedHosts = new Set();
  for (const payload of payloads || []) {
    for (const item of Array.isArray(payload?.results) ? payload.results : []) {
      const url = safeHttpUrl(item?.url || item?.link || item?.product_link);
      const host = rootHost(url);
      if (!url || !host
        || isLocationServiceUrl(url)
        || BLOCKED_DISCOVERY_HOSTS.has(host)
        || confirmedHosts.has(host)
        || selectedHosts.has(host)) continue;
      selectedHosts.add(host);
      selected.push(url);
      if (selected.length >= 20) return selected;
    }
  }
  return selected;
}

function enrichPayloadWithExtract(payload, extractPayload) {
  if (!payload || !Array.isArray(payload.results)) return payload;
  const exactContent = new Map();
  const hostContent = new Map();
  for (const extracted of Array.isArray(extractPayload?.results) ? extractPayload.results : []) {
    const url = safeHttpUrl(extracted?.url);
    const host = rootHost(url);
    const content = safeText(extracted?.raw_content || extracted?.rawContent || extracted?.content, 16000);
    if (!url || !host || !content) continue;
    exactContent.set(url, safeText(`${exactContent.get(url) || ""} ${content}`, 16000));
    hostContent.set(host, safeText(`${hostContent.get(host) || ""} ${content}`, 16000));
  }
  return {
    ...payload,
    results: payload.results.map((item) => {
      const url = safeHttpUrl(item?.url || item?.link || item?.product_link);
      const verification = exactContent.get(url) || hostContent.get(rootHost(url)) || "";
      if (!verification) return item;
      return {
        ...item,
        raw_content: safeText(`${item?.raw_content || item?.rawContent || ""} ${verification}`, 16000),
        location_verification: "TAVILY_EXTRACT",
      };
    }),
  };
}

function validSearxBase(value) {
  const url = safeHttpUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(hostname)) return "";
    return parsed.href.endsWith("/") ? parsed.href : `${parsed.href}/`;
  } catch {
    return "";
  }
}

function healthySearxInstances(payload) {
  return Object.entries(payload?.instances || {})
    .map(([url, info]) => ({ url: validSearxBase(url), info }))
    .filter(({ url, info }) => url
      && info?.main === true
      && info?.network_type === "normal"
      && info?.http?.status_code === 200
      && Number(info?.uptime?.uptimeDay) >= 95
      && Number(info?.timing?.search?.success_percentage) >= 60)
    .sort((left, right) => {
      const success = Number(right.info?.timing?.search?.success_percentage) - Number(left.info?.timing?.search?.success_percentage);
      if (success) return success;
      return Number(left.info?.timing?.search?.all?.mean || 99) - Number(right.info?.timing?.search?.all?.mean || 99);
    })
    .slice(0, 5);
}

async function searxFallbackRequest(query, fetchImpl) {
  const index = await jsonRequest(FREE_SEARCH_ENDPOINTS.searxInstances, {
    headers: { Accept: "application/json", "User-Agent": "RasputimTecnologis/0.4.15" },
  }, fetchImpl, 8000);
  const candidates = healthySearxInstances(index);
  if (!candidates.length) throw new Error("nenhuma instância gratuita saudável disponível");
  const failures = [];
  for (const candidate of candidates.slice(0, 3)) {
    try {
      const params = new URLSearchParams({ q: query, format: "json", language: "pt-BR", safesearch: "1", categories: "general" });
      const payload = await jsonRequest(`${candidate.url}search?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "RasputimTecnologis/0.4.15" },
      }, fetchImpl, 9000);
      if (!Array.isArray(payload?.results)) throw new Error("resposta sem resultados estruturados");
      return {
        results: payload.results.slice(0, 20).map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content,
          score: Number(item.score) || 0.45,
        })),
        instance: candidate.url,
      };
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(failures[0] || "fonte reserva não respondeu");
}

function canonicalResultKey(result) {
  const supplierName = normalize(result.supplierName);
  const officialHost = rootHost(result.officialSiteUrl);
  if (result.kind === "SUPPLIER" && supplierName) return `SUPPLIER:${supplierName.replace(/\s+/g, "")}`;
  if (result.kind === "SUPPLIER" && officialHost) return `SUPPLIER:HOST:${officialHost}`;
  const url = safeHttpUrl(result.sourceUrl);
  if (url) {
    try {
      const parsed = new URL(url);
      ["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"].forEach((key) => parsed.searchParams.delete(key));
      return `${result.kind}:${parsed.hostname.toLowerCase()}:${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      // The URL was already validated; fall through to the textual key.
    }
  }
  return `${result.kind}:${normalize(result.supplierName)}:${normalize(result.title)}`;
}

function isAllowedParanaResult(result) {
  return result?.locationConfirmed === true
    && result?.stateCode === PARANA_REGION.code
    && result?.distanceStatus === "WITHIN_RADIUS";
}

function resultLinkQuality(result) {
  if (result.kind === "OFFER" && result.offerUrlConfirmed && result.sourceUrl) return 3;
  if (result.officialSiteConfirmed && result.officialSiteUrl) return 2;
  return result.sourceUrl ? 1 : 0;
}

function mergeAndSortResults(local, offers, suppliers) {
  const combined = [...local, ...offers, ...suppliers].filter(isAllowedParanaResult);
  const hostFrequency = new Map();
  for (const result of combined) {
    const host = rootHost(result.sourceUrl);
    if (host) hostFrequency.set(host, (hostFrequency.get(host) || 0) + 1);
  }
  const deduplicatedByKey = new Map();
  for (const result of combined) {
    const key = canonicalResultKey(result);
    const host = rootHost(result.sourceUrl);
    const crossChecked = host && (hostFrequency.get(host) || 0) > 1;
    const confidenceScore = Math.min(100, Number(result.confidenceScore || 0) + (crossChecked ? 8 : 0));
    const candidate = {
      ...result,
      confidenceScore,
      matchConfidence: confidenceLabel(confidenceScore),
      crossChecked,
    };
    const existing = deduplicatedByKey.get(key);
    if (!existing) {
      deduplicatedByKey.set(key, candidate);
      continue;
    }
    const candidateWins = resultLinkQuality(candidate) > resultLinkQuality(existing)
      || (resultLinkQuality(candidate) === resultLinkQuality(existing) && candidate.confidenceScore > existing.confidenceScore);
    const primary = candidateWins ? candidate : existing;
    const secondary = candidateWins ? existing : candidate;
    deduplicatedByKey.set(key, {
      ...secondary,
      ...primary,
      address: primary.address || secondary.address || "",
      phoneNumber: primary.phoneNumber || secondary.phoneNumber || "",
      phoneDigits: primary.phoneDigits || secondary.phoneDigits || "",
      whatsappUrl: primary.whatsappUrl || secondary.whatsappUrl || "",
      whatsappConfirmed: primary.whatsappConfirmed === true || secondary.whatsappConfirmed === true,
      contactSource: primary.contactSource || secondary.contactSource || "",
      officialSiteUrl: primary.officialSiteUrl || secondary.officialSiteUrl || "",
      officialSiteConfirmed: primary.officialSiteConfirmed === true || secondary.officialSiteConfirmed === true,
      distanceKm: primary.distanceKm ?? secondary.distanceKm ?? null,
    });
  }
  const deduplicated = [...deduplicatedByKey.values()];
  const priority = (result) => {
    if (result.category === "NEW_LOCAL_SUPPLIER") return 0;
    if (result.kind === "OFFER" && result.price > 0) return 1;
    if (result.category === "NEW_WEB_SUPPLIER") return 2;
    if (result.category === "KNOWN_SUPPLIER") return 3;
    return 4;
  };
  return deduplicated.sort((left, right) => {
    const group = priority(left) - priority(right);
    if (group) return group;
    const confidence = Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0);
    if (confidence) return confidence;
    if (left.kind === "OFFER" && right.kind === "OFFER") {
      const leftCost = left.totalPrice || left.price || Number.POSITIVE_INFINITY;
      const rightCost = right.totalPrice || right.price || Number.POSITIVE_INFINITY;
      return leftCost - rightCost;
    }
    const leftDistance = Number.isFinite(left.distanceKm) ? left.distanceKm : Number.POSITIVE_INFINITY;
    const rightDistance = Number.isFinite(right.distanceKm) ? right.distanceKm : Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance || left.supplierName.localeCompare(right.supplierName, "pt-BR");
  }).slice(0, 60);
}

function buildCounts(results) {
  const unique = (items) => new Set(items.map((item) => normalize(item.supplierName)).filter(Boolean)).size;
  return {
    resultCount: results.length,
    newSuppliers: unique(results.filter((item) => !item.isKnown)),
    localWithinRadius: unique(results.filter((item) => item.distanceStatus === "WITHIN_RADIUS")),
    offersWithPrice: results.filter((item) => item.kind === "OFFER" && item.price > 0).length,
    knownSuppliers: unique(results.filter((item) => item.isKnown)),
    suppliersWithSite: unique(results.filter((item) => item.officialSiteConfirmed && item.officialSiteUrl)),
    suppliersWithPhone: unique(results.filter((item) => item.phoneNumber)),
    suppliersWithWhatsapp: unique(results.filter((item) => item.whatsappUrl)),
    outsideRadius: unique(results.filter((item) => item.distanceStatus === "OUTSIDE_RADIUS")),
  };
}

function contactLookupTargets(results, limit = 12) {
  const selected = [];
  const names = new Set();
  for (const result of results || []) {
    if (!isAllowedParanaResult(result)) continue;
    const supplierName = safeText(result?.supplierName, 120);
    const normalizedName = normalize(supplierName);
    if (!normalizedName || normalizedName === "FORNECEDOR NAO IDENTIFICADO" || names.has(normalizedName)) continue;
    if (result.officialSiteUrl && result.phoneNumber && result.whatsappUrl) continue;
    names.add(normalizedName);
    selected.push({
      supplierName,
      municipality: safeText(result?.municipality, 100),
    });
    if (selected.length >= limit) break;
  }
  return selected;
}

function contactSearchQuery(targets, material, area) {
  const supplierNames = (targets || []).map((target) => `"${target.supplierName}"`).join(" OR ");
  const municipalities = [...new Set((targets || []).map((target) => target.municipality).filter(Boolean))]
    .slice(0, 8)
    .map((city) => `${city}/PR`)
    .join(", ");
  return `${supplierNames} site oficial telefone WhatsApp contato endereço físico no Paraná. ${municipalities ? `Cidades: ${municipalities}.` : ""} Material pesquisado: ${material}. Área: ${area}. Não use mapas, guias comerciais ou páginas de CNPJ como site oficial.`;
}

async function researchMarket({
  material,
  location = "Maringá/PR",
  radiusKm = 100,
  origin = MARINGA_ORIGIN,
  suppliers = [],
  tavilyApiKey = "",
  fetchImpl = globalThis.fetch,
}) {
  const normalizedMaterial = safeText(material, 180);
  if (!normalizedMaterial) throw new Error("Material inválido para pesquisa.");
  if (typeof fetchImpl !== "function") throw new Error("Pesquisa online indisponível nesta versão do sistema.");
  const chosenRadius = Number(radiusKm);
  if (!Number.isFinite(chosenRadius) || chosenRadius < 1 || chosenRadius > 5000) {
    throw new Error("Informe um raio entre 1 e 5.000 km.");
  }
  const apiKey = normalizeTavilyKey(tavilyApiKey);
  if (apiKey) validateTavilyKey(apiKey);

  const area = searchArea(chosenRadius);
  const businessTerm = businessSearchTerm(normalizedMaterial);
  const nearbyCities = municipalitiesWithinRadius(origin, chosenRadius);
  const cityScope = nearbyCities.length
    ? `Comece por estas cidades dentro do raio: ${nearbyCities.join(", ")}.`
    : "Confirme a cidade e o estado no endereço físico da empresa.";
  const queries = {
    local: `${businessTerm} que venda ou forneça ${normalizedMaterial}, exclusivamente no estado do Paraná, em ${area}. ${cityScope} Exclua empresas de outros estados. Priorize páginas do site oficial que mostrem endereço físico completo, cidade/PR, catálogo e contato da empresa.`,
    offers: `Comprar exatamente ${normalizedMaterial} de fornecedor localizado no estado do Paraná, com preço em R$, embalagem, estoque, frete e entrega para ${location}. ${cityScope} Não inclua fornecedor de SP, SC, MS ou qualquer outro estado.`,
    contacts: "",
    reserve: `${normalizedMaterial} fornecedor distribuidor site oficial endereço Paraná preço frete entrega Maringá PR -SP -SC -MS`,
  };
  const requests = [
    { key: "map", label: "validação territorial no Paraná", run: () => nominatimRequest(normalizedMaterial, origin, chosenRadius, fetchImpl) },
    { key: "stores", label: "lojas locais no Paraná", run: () => overpassRequest(normalizedMaterial, origin, chosenRadius, fetchImpl) },
    { key: "local", label: "Tavily · fornecedores", tavily: true, run: () => tavilyRequestWithFallback(queries.local, fetchImpl, apiKey, { includeRawContent: true }) },
    { key: "offers", label: "Tavily · preços e frete", tavily: true, run: () => tavilyRequestWithFallback(queries.offers, fetchImpl, apiKey, { includeRawContent: true }) },
  ];
  const settled = await Promise.allSettled(requests.map((request) => request.run()));
  const payloads = {};
  const accessModes = {};
  const warnings = [];
  settled.forEach((outcome, index) => {
    const request = requests[index];
    if (outcome.status === "fulfilled") {
      if (request.tavily) {
        payloads[request.key] = outcome.value.payload;
        accessModes[request.key] = outcome.value.accessMode;
        if (outcome.value.fallbackUsed) {
          warnings.push(`${request.label}: a chave falhou (${outcome.value.fallbackReason}); o modo Keyless respondeu.`);
        }
      } else {
        payloads[request.key] = outcome.value;
      }
    } else warnings.push(`${request.label}: ${safeText(outcome.reason?.message || outcome.reason, 220)}`);
  });

  let fallback = null;
  const tavilyRawCount = [payloads.local, payloads.offers]
    .reduce((sum, payload) => sum + (Array.isArray(payload?.results) ? payload.results.length : 0), 0);
  if ((!payloads.local && !payloads.offers) || tavilyRawCount === 0) {
    try {
      fallback = await searxFallbackRequest(queries.reserve, fetchImpl);
      payloads.reserve = fallback;
      warnings.push("A IA gratuita principal não respondeu; a fonte gratuita de reserva foi utilizada.");
    } catch (error) {
      warnings.push(`busca gratuita de reserva: ${safeText(error.message, 220)}`);
    }
  }
  if (!payloads.map && !payloads.stores && !payloads.local && !payloads.offers && !payloads.reserve) {
    throw new Error(`A pesquisa gratuita não respondeu neste momento. Tente novamente em alguns minutos. ${warnings.join(" | ")}`);
  }

  const registeredResults = registeredSupplierResults(suppliers, origin, chosenRadius);
  const mapResults = osmPlaceResults(payloads.map, suppliers, origin, chosenRadius);
  const structuredStoreResults = overpassPlaceResults(payloads.stores, suppliers, origin, chosenRadius);
  const localResults = mergeAndSortResults([...registeredResults, ...mapResults, ...structuredStoreResults], [], []);
  const buildWebResults = () => ({
    offerResults: freeWebResults(payloads.offers, "offers", normalizedMaterial, suppliers, localResults,
      accessModes.offers === "KEYED" ? "TAVILY_KEYED" : "TAVILY_KEYLESS", origin, chosenRadius),
    supplierResults: freeWebResults(payloads.local, "local", normalizedMaterial, suppliers, localResults,
      accessModes.local === "KEYED" ? "TAVILY_KEYED" : "TAVILY_KEYLESS", origin, chosenRadius),
    contactResults: freeWebResults(payloads.contacts, "contacts", normalizedMaterial, suppliers, localResults,
      accessModes.contacts === "KEYED" ? "TAVILY_KEYED" : "TAVILY_KEYLESS", origin, chosenRadius),
    reserveResults: freeWebResults(payloads.reserve, "reserve", normalizedMaterial, suppliers, localResults,
      "SEARXNG", origin, chosenRadius),
  });
  let { offerResults, supplierResults, contactResults, reserveResults } = buildWebResults();
  const contactTargets = contactLookupTargets([
    ...localResults,
    ...offerResults,
    ...supplierResults,
    ...reserveResults,
  ]);
  let contactLookup = null;
  if (contactTargets.length) {
    queries.contacts = contactSearchQuery(contactTargets, normalizedMaterial, area);
    try {
      const contactResponse = await tavilyRequestWithFallback(
        queries.contacts,
        fetchImpl,
        apiKey,
        { includeRawContent: true },
      );
      payloads.contacts = contactResponse.payload;
      accessModes.contacts = contactResponse.accessMode;
      contactLookup = {
        attempted: true,
        ok: true,
        targets: contactTargets.length,
        pages: Array.isArray(contactResponse.payload?.results) ? contactResponse.payload.results.length : 0,
        accessMode: contactResponse.accessMode,
      };
      if (contactResponse.fallbackUsed) {
        warnings.push(`Tavily · contatos diretos: a chave falhou (${contactResponse.fallbackReason}); o modo Keyless respondeu.`);
      }
      ({ offerResults, supplierResults, contactResults, reserveResults } = buildWebResults());
    } catch (error) {
      contactLookup = {
        attempted: true,
        ok: false,
        targets: contactTargets.length,
        pages: 0,
        accessMode: "",
      };
      warnings.push(`Tavily · contatos diretos: ${safeText(error?.message || error, 220)}`);
    }
  }
  const preliminaryWebResults = [...offerResults, ...supplierResults, ...contactResults, ...reserveResults];
  const locationUrls = discoveryUrlsNeedingLocation(
    [payloads.local, payloads.offers, payloads.contacts, payloads.reserve],
    preliminaryWebResults,
  );
  let locationVerification = null;
  if (locationUrls.length) {
    try {
      const extracted = await tavilyExtractWithFallback(locationUrls, fetchImpl, apiKey);
      locationVerification = {
        attempted: true,
        ok: true,
        accessMode: extracted.accessMode,
        requestedUrls: locationUrls.length,
        extractedUrls: Array.isArray(extracted.payload?.results) ? extracted.payload.results.length : 0,
        failedUrls: Array.isArray(extracted.payload?.failed_results) ? extracted.payload.failed_results.length : 0,
      };
      accessModes.location = extracted.accessMode;
      if (extracted.fallbackUsed) {
        warnings.push(`Tavily · confirmação de endereço: a chave falhou (${extracted.fallbackReason}); o modo Keyless respondeu.`);
      }
      payloads.local = enrichPayloadWithExtract(payloads.local, extracted.payload);
      payloads.offers = enrichPayloadWithExtract(payloads.offers, extracted.payload);
      payloads.contacts = enrichPayloadWithExtract(payloads.contacts, extracted.payload);
      payloads.reserve = enrichPayloadWithExtract(payloads.reserve, extracted.payload);
      ({ offerResults, supplierResults, contactResults, reserveResults } = buildWebResults());
    } catch (error) {
      locationVerification = {
        attempted: true,
        ok: false,
        accessMode: "",
        requestedUrls: locationUrls.length,
        extractedUrls: 0,
        failedUrls: locationUrls.length,
      };
      warnings.push(`Tavily · confirmação de endereço: ${safeText(error?.message || error, 220)}`);
    }
  }
  const results = mergeAndSortResults(localResults, [...offerResults, ...reserveResults.filter((item) => item.kind === "OFFER")], [
    ...supplierResults,
    ...contactResults,
    ...reserveResults.filter((item) => item.kind === "SUPPLIER"),
  ]);
  const confirmedWebCount = offerResults.length + supplierResults.length + contactResults.length + reserveResults.length;
  const contactRawCount = Array.isArray(payloads.contacts?.results) ? payloads.contacts.results.length : 0;
  const reserveRawCount = Array.isArray(payloads.reserve?.results) ? payloads.reserve.results.length : 0;
  if ((tavilyRawCount + reserveRawCount) > 0 && confirmedWebCount === 0) {
    warnings.push(`A busca web encontrou ${tavilyRawCount + reserveRawCount} páginas, mas nenhuma comprovou endereço no Paraná dentro do raio. Elas foram ocultadas para não misturar fornecedores de outros estados.`);
  }
  if (!results.length) {
    warnings.push("Nenhum fornecedor apresentou localização paranaense comprovável dentro do raio informado. A pesquisa respondeu, mas não exibiu resultados incertos.");
  }
  const searchSources = requests.map((request, index) => {
    const accessMode = accessModes[request.key] || "";
    return {
      key: request.key,
      label: accessMode ? `${request.label} · ${accessMode === "KEYED" ? "CHAVE" : "KEYLESS"}` : request.label,
      ok: settled[index].status === "fulfilled",
      accessMode,
    };
  });
  if (fallback) searchSources.push({ key: "reserve", label: "busca gratuita de reserva", ok: true });
  if (contactLookup?.attempted) {
    searchSources.push({
      key: "contacts",
      label: contactLookup.accessMode
        ? `Tavily · sites e telefones · ${contactLookup.accessMode === "KEYED" ? "CHAVE" : "KEYLESS"}`
        : "Tavily · sites e telefones",
      ok: contactLookup.ok,
      accessMode: contactLookup.accessMode,
    });
  }
  if (locationVerification?.attempted) {
    searchSources.push({
      key: "location",
      label: locationVerification.accessMode
        ? `Tavily · confirmação de endereço · ${locationVerification.accessMode === "KEYED" ? "CHAVE" : "KEYLESS"}`
        : "Tavily · confirmação de endereço",
      ok: locationVerification.ok,
      accessMode: locationVerification.accessMode,
    });
  }

  const tavilyModes = Object.values(accessModes);
  const provider = tavilyModes.includes("KEYLESS_FALLBACK")
    ? "TAVILY_HÍBRIDO"
    : tavilyModes.includes("KEYED") ? "TAVILY_COM_CHAVE" : "GRATUITO";

  return {
    query: queries.local,
    queries,
    provider,
    tavilyAccess: {
      configured: Boolean(apiKey),
      local: accessModes.local || "INDISPONÍVEL",
      offers: accessModes.offers || "INDISPONÍVEL",
      contacts: accessModes.contacts || "INDISPONÍVEL",
    },
    searchedAt: new Date().toISOString(),
    origin: { ...origin, label: safeText(origin?.label || location, 120) },
    radiusKm: chosenRadius,
    boundary: {
      strict: true,
      stateCode: PARANA_REGION.code,
      stateName: PARANA_REGION.name,
    },
    results,
    counts: buildCounts(results),
    diagnostics: {
      tavilyPages: tavilyRawCount,
      contactPages: contactRawCount,
      contactTargets: contactTargets.length,
      contactLookupOk: contactLookup?.ok ?? null,
      suppliersWithSite: results.filter((item) => item.officialSiteUrl).length,
      suppliersWithPhone: results.filter((item) => item.phoneNumber).length,
      suppliersWithWhatsapp: results.filter((item) => item.whatsappUrl).length,
      reservePages: reserveRawCount,
      mapSuppliers: mapResults.length + structuredStoreResults.length,
      nominatimSuppliers: mapResults.length,
      overpassSuppliers: structuredStoreResults.length,
      registeredSuppliers: registeredResults.length,
      locationCandidates: locationUrls.length,
      locationPagesExtracted: locationVerification?.extractedUrls || 0,
      locationVerificationOk: locationVerification?.ok ?? null,
      confirmedWebResults: confirmedWebCount,
      displayedResults: results.length,
    },
    warnings,
    searchSources,
  };
}

module.exports = {
  FREE_SEARCH_ENDPOINTS,
  MARINGA_ORIGIN,
  PARANA_REGION,
  buildCounts,
  contactDetails,
  distanceKm,
  isAllowedParanaResult,
  isLocationServiceUrl,
  materialMatchScore,
  mergeAndSortResults,
  normalizeBrazilPhone,
  officialSupplierSiteUrl,
  paranaMunicipalityFromText,
  parseDeliveryDays,
  parseFreight,
  parsePrice,
  researchMarket,
  rootHost,
  safeWhatsappUrl,
  stateCodeFromPlace,
  tavilyRequest,
  testTavilyKey,
};
