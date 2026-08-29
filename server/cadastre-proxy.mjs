/**
 * 安全的地籍查詢 Proxy
 *
 * 此服務只回傳下拉選單與公開地籍 GeoJSON；任何 Token 都只存在於伺服器環境變數。
 * 使用 Node.js 20+（本專案目前的 Node 24 可直接執行）。
 */
import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const host = process.env.HOST || "127.0.0.1";
const apiPrefix = "/api/cadastre";

const parcelQueryUrl = (
  process.env.CADASTRE_ARCGIS_PARCEL_URL
  || "https://ldmap.tainan.gov.tw/arcgis/rest/services/MapData/TN_Measure/MapServer/17/query"
).trim();
const parcelToken = (process.env.CADASTRE_ARCGIS_TOKEN || "").trim();
const sectionsUrl = (process.env.CADASTRE_SECTIONS_URL || "").trim();
const sectionsToken = (process.env.CADASTRE_SECTIONS_TOKEN || "").trim();
const allowedOrigins = new Set(
  (process.env.CADASTRE_ALLOWED_ORIGINS || "http://localhost:8000,http://127.0.0.1:8000")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);

const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_LIMIT_PER_MINUTE = 60;
const cache = new Map();
const requestWindows = new Map();

// 與府城南籍圈「地號定位」頁面相同的行政區清單。地段仍一律由授權資料服務取得。
const TAINAN_TOWNS = [
  "北區", "安平區", "中西區", "安南區", "東區", "南區", "新營區", "鹽水區", "柳營區", "白河區",
  "後壁區", "東山區", "麻豆區", "下營區", "六甲區", "官田區", "大內區", "佳里區", "西港區", "七股區",
  "將軍區", "北門區", "學甲區", "新化區", "善化區", "新市區", "安定區", "山上區", "左鎮區", "仁德區",
  "歸仁區", "關廟區", "龍崎區", "玉井區", "楠西區", "南化區", "永康區",
];

function sendJson(response, status, body, request) {
  const origin = request.headers.origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

function sendNoContent(response, request) {
  const origin = request.headers.origin;
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  response.writeHead(204, headers);
  response.end();
}

function getClientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function isRateLimited(request) {
  const address = getClientAddress(request);
  const now = Date.now();
  const cutoff = now - 60_000;
  const recent = (requestWindows.get(address) || []).filter(timestamp => timestamp > cutoff);
  recent.push(now);
  requestWindows.set(address, recent);
  return recent.length > REQUEST_LIMIT_PER_MINUTE;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function putCached(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (cache.size > 250) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return value;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeSection(value) {
  const section = normalizeText(value).toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(section) ? section : null;
}

function normalizeParcelNumber(value) {
  const raw = normalizeText(value).replace(/[－—–]/g, "-");
  if (/^\d{8}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
  if (!match) return null;
  return `${match[1].padStart(4, "0")}${(match[2] || "0").padStart(4, "0")}`;
}

function formatParcelNumber(value) {
  const landNo8 = String(value || "");
  if (!/^\d{8}$/.test(landNo8)) return landNo8 || "--";
  const parent = String(Number.parseInt(landNo8.slice(0, 4), 10));
  const child = Number.parseInt(landNo8.slice(4), 10);
  return child ? `${parent}-${child}` : parent;
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function isPermittedOrigin(request) {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.has(origin);
}

function friendlyProviderError(error) {
  const message = String(error?.message || "");
  if (/timeout|abort/i.test(message)) return "地籍資料服務逾時，請稍後再試。";
  return "地籍資料服務暫時無法查詢。";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("資料服務回傳格式無法辨識");
  }
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || payload?.message || `資料服務回應 ${response.status}`);
  }
  return payload;
}

function publicProperties(attributes = {}) {
  const parcelNo8 = attributes.LANDNO8 || attributes.AA49 || attributes.parcelNo8 || "";
  return {
    town: attributes.TNAME || attributes.town || "",
    section: attributes.SECT || attributes.AA48 || attributes.section || "",
    sectionName: attributes.SECNAME || attributes.KCNT || attributes.sectionName || "",
    parcelNo8,
    parcelNumber: attributes.parcelNumber || attributes.LAND_NO || formatParcelNumber(parcelNo8),
    area: attributes.AREA || attributes.AA05 || attributes.area || "",
    landUse: attributes.LUSE || attributes.AA06 || attributes.landUse || "",
  };
}

function ringSignedArea(ring) {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + ((Number(point[0]) * Number(next[1])) - (Number(next[0]) * Number(point[1])));
  }, 0) / 2;
}

function pointIsInRing(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    const crosses = ((currentY > point[1]) !== (previousY > point[1]))
      && (point[0] < ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX);
    if (crosses) inside = !inside;
  }
  return inside;
}

function esriPolygonToGeoJson(geometry) {
  const rings = Array.isArray(geometry?.rings) ? geometry.rings.filter(ring => Array.isArray(ring) && ring.length >= 4) : [];
  if (!rings.length) return null;

  // ArcGIS polygon exterior rings are clockwise. Keep a safe fallback for services
  // that return a different winding order or a simple one-ring parcel.
  const exteriorRings = rings.filter(ring => ringSignedArea(ring) < 0);
  const holeRings = rings.filter(ring => ringSignedArea(ring) >= 0);
  if (!exteriorRings.length) return { type: "Polygon", coordinates: rings };

  const polygons = exteriorRings.map(ring => [ring]);
  for (const hole of holeRings) {
    const owner = exteriorRings.findIndex(exterior => pointIsInRing(hole[0], exterior));
    if (owner >= 0) polygons[owner].push(hole);
    else polygons.push([hole]);
  }
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function asFeatureCollection(payload) {
  if (payload?.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return {
      type: "FeatureCollection",
      features: payload.features.map(feature => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: publicProperties(feature.properties),
      })),
    };
  }
  if (Array.isArray(payload?.features)) {
    const features = payload.features
      .map(feature => ({
        type: "Feature",
        geometry: feature?.geometry?.rings ? esriPolygonToGeoJson(feature.geometry) : feature?.geometry || null,
        properties: publicProperties(feature?.attributes || feature?.properties),
      }))
      .filter(feature => feature.geometry);
    return { type: "FeatureCollection", features };
  }
  throw new Error("地籍服務未回傳可繪製的 GeoJSON");
}

async function getSections(town) {
  if (!sectionsUrl || !sectionsToken) {
    const error = new Error("尚未設定地段清單服務的正式授權。");
    error.statusCode = 503;
    throw error;
  }
  const cacheKey = `sections:${town}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = new URL(sectionsUrl);
  url.searchParams.set("TName", town);
  const payload = await fetchJson(url, {
    headers: { Authorization: `Bearer ${sectionsToken}` },
  });
  if (!Array.isArray(payload)) throw new Error("地段清單格式不正確");

  const sections = payload
    .map(item => ({
      code: normalizeSection(item.KCDE_2 || item.code || ""),
      name: String(item.KCNT || item.name || "").trim(),
    }))
    .filter(item => item.code && item.name && !item.name.startsWith("X") && !item.name.includes("代碼") && item.name !== "測試段")
    .sort((a, b) => a.code.localeCompare(b.code, "en"))
    .map(item => ({ ...item, label: `[${item.code}] ${item.name}` }));
  return putCached(cacheKey, { town, sections }, 24 * 60 * 60 * 1000);
}

async function getParcel(section, parcelNo8) {
  if (!parcelToken) {
    const error = new Error("尚未設定地籍圖服務的正式授權。");
    error.statusCode = 503;
    throw error;
  }
  const cacheKey = `parcel:${section}:${parcelNo8}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const safeSection = escapeSqlString(section);
  const safeParcelNo8 = escapeSqlString(parcelNo8);
  const buildQueryUrl = format => {
    const url = new URL(parcelQueryUrl);
    url.searchParams.set("f", format);
    url.searchParams.set("where", `(SECT = '${safeSection}' OR SECNAME = '${safeSection}') AND LANDNO8 = '${safeParcelNo8}'`);
    url.searchParams.set("outFields", "SECT,SECNAME,LANDNO8,LAND_NO,TNAME,AREA,LUSE,AA05,AA06,AA48,AA49");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("token", parcelToken);
    return url;
  };

  let result;
  try {
    result = asFeatureCollection(await fetchJson(buildQueryUrl("geojson")));
  } catch (geoJsonError) {
    // 部分 ArcGIS MapServer 未啟用 f=geojson，改以標準 Esri JSON 再轉為 GeoJSON。
    result = asFeatureCollection(await fetchJson(buildQueryUrl("json")));
  }
  return putCached(cacheKey, result, 5 * 60 * 1000);
}

const server = createServer(async (request, response) => {
  try {
    if (!isPermittedOrigin(request)) {
      sendJson(response, 403, { error: "此網站來源未獲允許使用地籍查詢服務。" }, request);
      return;
    }
    if (request.method === "OPTIONS") {
      sendNoContent(response, request);
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "只支援 GET 查詢。" }, request);
      return;
    }
    if (isRateLimited(request)) {
      sendJson(response, 429, { error: "查詢太頻繁，請稍後一分鐘再試。" }, request);
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname === `${apiPrefix}/health`) {
      sendJson(response, 200, {
        status: "ok",
        configured: Boolean(parcelToken && sectionsUrl && sectionsToken),
        capabilities: { towns: true, sections: Boolean(sectionsUrl && sectionsToken), parcels: Boolean(parcelToken) },
      }, request);
      return;
    }
    if (url.pathname === `${apiPrefix}/towns`) {
      sendJson(response, 200, { towns: TAINAN_TOWNS }, request);
      return;
    }
    if (url.pathname === `${apiPrefix}/sections`) {
      const town = String(url.searchParams.get("town") || "").trim();
      if (!TAINAN_TOWNS.includes(town)) {
        sendJson(response, 400, { error: "請提供有效的臺南市行政區。" }, request);
        return;
      }
      sendJson(response, 200, await getSections(town), request);
      return;
    }
    if (url.pathname === `${apiPrefix}/parcel`) {
      const section = normalizeSection(url.searchParams.get("section"));
      const parcelNo8 = normalizeParcelNumber(url.searchParams.get("number"));
      if (!section || !parcelNo8) {
        sendJson(response, 400, { error: "請提供有效地段代碼與地號（例如 G701、10 或 10-1）。" }, request);
        return;
      }
      sendJson(response, 200, await getParcel(section, parcelNo8), request);
      return;
    }
    sendJson(response, 404, { error: "找不到地籍查詢端點。" }, request);
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
    const message = status === 503 ? error.message : friendlyProviderError(error);
    console.error(`[cadastre-proxy] ${request.method} ${request.url} failed:`, error?.message || error);
    sendJson(response, status, { error: message }, request);
  }
});

server.listen(port, host, () => {
  console.log(`Cadastre proxy listening on http://${host}:${port}${apiPrefix}`);
});
