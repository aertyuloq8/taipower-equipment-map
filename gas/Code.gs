/**
 * V3 臺南市地籍圖形 Adapter for Google Apps Script
 *
 * 公開入口支援 action=parcel（GeoJSON）與 action=parcelImage（國土測繪 PNG 圖層），
 * 查詢條件固定為「臺南市 + 行政區 + 地段 + 地號」。
 * 它不是通用 HTTP Proxy，也絕不把上游 ArcGIS Token 回傳給瀏覽器。
 *
 * 部署為 Web App 後，GitHub Pages 以 JSONP 呼叫本檔的 doGet()。GAS 無法為
 * ContentService 自訂 CORS 標頭，JSONP 可避免這個瀏覽器限制。
 */

var CADASTRE_CONFIG = {
  cityCode: "D",
  cityNames: ["臺南市", "台南市"],
  landmapPageUrl: "https://landmap.tainan.gov.tw/gis/",
  tokenUrl: "https://landmap.tainan.gov.tw/gis/assist/ARGISHandler.ashx",
  parcelQueryUrl: "https://ldmap.tainan.gov.tw/arcgis/rest/services/MapData/TN_Measure/MapServer/17/query",
  resurveyMapUrl: "https://landmap.tainan.gov.tw/landwa/api/RVANO",
  mergeMapUrl: "https://landmap.tainan.gov.tw/landwa/api/RUADI",
  resurveyTokenUrl: "https://landmap.tainan.gov.tw/landwa/api/Token",
  resurveyBearerProperty: "CADASTRE_RESURVEY_BEARER",
  resurveyTokenCacheKey: "tainan-landwa-session-token-v1",
  nationalSectionUrl: "https://easymap.moi.gov.tw/Z10Web/City_json_getSectionList",
  nationalMapImageUrl: "https://easymap.moi.gov.tw/Z10Web/Land_json_getMapImageLayers",
  tokenCacheKey: "tainan-arcgis-session-token-v1",
  // v2 會回傳完整地籍屬性；變更前綴可避免沿用只含少數欄位的舊快取。
  queryCachePrefix: "tainan-parcel-v2:",
  imageCachePrefix: "tainan-image-parcel-v1:",
  sectionCachePrefix: "tainan-national-section-v1:",
  maxQueriesPerMinute: 80,
  tokenCacheSeconds: 300,
  queryCacheSeconds: 300,
};

var CADASTRE_FIELD_ALIASES = {
  OBJECTID: "地籍編號",
  LANDCODE: "地所代碼",
  TNAME: "鄉鎮名",
  SECT: "地段號",
  SECNAME: "地段名",
  LANDNO8: "地號",
  LAND_NO: "地號(母子號)",
  AREA: "面積",
  AA05: "登記日期",
  AA06: "登記原因",
  AA08: "地目",
  AA11: "使用分區",
  AA12: "使用地類別",
  AA16: "公告現值",
  AA17: "公告地價",
  BB09: "所有權人",
  Mng: "管理者",
  BBType: "所有權類別",
  TEMP_: "分段分幅名",
};

var TAINAN_TOWNS = [
  "北區", "安平區", "中西區", "安南區", "東區", "南區", "新營區", "鹽水區", "柳營區", "白河區",
  "後壁區", "東山區", "麻豆區", "下營區", "六甲區", "官田區", "大內區", "佳里區", "西港區", "七股區",
  "將軍區", "北門區", "學甲區", "新化區", "善化區", "新市區", "安定區", "山上區", "左鎮區", "仁德區",
  "歸仁區", "關廟區", "龍崎區", "玉井區", "楠西區", "南化區", "永康區",
];

/**
 * GAS Web App entry point.
 * 支援普通 JSON（方便除錯）與 JSONP（供 GitHub Pages 使用）。
 */
function doGet(e) {
  var parameters = (e && e.parameter) || {};
  var callback = validJsonpCallback_(parameters.callback) ? parameters.callback : "";
  try {
    var action = String(parameters.action || "");
    if (action !== "parcel" && action !== "parcelImage") {
      throw appError_("只支援 action=parcel 或 action=parcelImage。", "INVALID_ACTION");
    }
    enforceRateLimit_();
    var query = validateParcelRequest_(parameters);
    if (action === "parcelImage") {
      var imageLayers = findParcelImageLayers_(query);
      return output_({ ok: true, type: "imageLayers", imageLayers: imageLayers }, callback);
    }
    var geojson = findParcelGeoJson_(query);
    return output_({ ok: true, geojson: geojson }, callback);
  } catch (error) {
    return output_({ ok: false, error: publicErrorMessage_(error) }, callback);
  }
}

function output_(payload, callback) {
  var body = JSON.stringify(payload);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + body + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function validateParcelRequest_(parameters) {
  var city = normalizeText_(parameters.city);
  var cityName = normalizeText_(parameters.cityName);
  var town = normalizeText_(parameters.town);
  var townCode = normalizeTownCode_(parameters.townCode);
  var sectionCode = normalizeSectionCode_(parameters.sectionCode || parameters.section);
  var sectionName = normalizeSectionName_(parameters.sectionName);
  var parcelNo8 = normalizeParcelNumber_(parameters.number);

  if (city !== CADASTRE_CONFIG.cityCode || CADASTRE_CONFIG.cityNames.indexOf(cityName) === -1) {
    throw appError_("目前 GAS 地籍 adapter 僅支援臺南市。", "UNSUPPORTED_CITY");
  }
  if (TAINAN_TOWNS.indexOf(town) === -1) {
    throw appError_("請選擇有效的臺南市行政區。", "INVALID_TOWN");
  }
  if (!sectionCode || !sectionName) {
    throw appError_("請選擇有效的地段。", "INVALID_SECTION");
  }
  if (!parcelNo8) {
    throw appError_("請輸入有效地號，例如 10、10-1 或 00000010。", "INVALID_PARCEL");
  }
  return {
    city: city,
    cityName: cityName,
    town: town,
    townCode: townCode,
    sectionCode: sectionCode,
    sectionName: sectionName,
    parcelNo8: parcelNo8,
  };
}

function findParcelGeoJson_(query) {
  var cache = CacheService.getScriptCache();
  var cacheKey = parcelCacheKey_(query);
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (ignore) {
      // 快取資料若被截斷或更新，直接重新向上游查詢。
    }
  }

  var token = getArcGisToken_();
  var payload = queryParcelFeatures_(token, buildWhereClause_(query));
  var currentSection = query.sectionCode;
  var currentParcel = query.parcelNo8;
  var resolution = null;

  // 舊地號在圖台直接查不到時，依官方「重測」對照表轉為目前地號。
  // landwa 的工作階段 Token 會由 getResurveyBearer_() 自動更新；必要時仍可
  // 以 Script Property 提供備援 Token，且不會傳到瀏覽器或寫入 Git。
  if (!hasParcelFeatures_(payload)) {
    var resurvey = findResurveyMapping_(query.town, currentSection, currentParcel);
    if (resurvey) {
      currentSection = resurvey.sectionCode;
      currentParcel = resurvey.parcelNo8;
      payload = queryParcelFeatures_(token, buildResolvedWhereClause_(query.town, currentSection, currentParcel));
      if (hasParcelFeatures_(payload)) {
        resolution = {
          type: "resurvey",
          sourceSection: query.sectionCode,
          sourceParcelNo8: query.parcelNo8,
          resolvedSection: currentSection,
          resolvedParcelNo8: currentParcel,
        };
      }
    }
  }

  // 有些地號會在重測後再合併；沿用 LINE 的第二段對照流程。
  if (!hasParcelFeatures_(payload)) {
    var merge = findMergeMapping_(query.town, currentSection, currentParcel);
    if (merge) {
      payload = queryParcelFeatures_(token, buildResolvedWhereClause_(query.town, merge.sectionCode, merge.parcelNo8));
      if (hasParcelFeatures_(payload)) {
        resolution = {
          type: "merge",
          sourceSection: query.sectionCode,
          sourceParcelNo8: query.parcelNo8,
          resolvedSection: merge.sectionCode,
          resolvedParcelNo8: merge.parcelNo8,
        };
      }
    }
  }

  var geojson = esriResultToGeoJson_(payload);
  if (resolution) {
    geojson.meta = geojson.meta || {};
    geojson.meta.resolution = resolution;
  }
  var serialized = JSON.stringify(geojson);
  // CacheService 單筆資料有大小上限；大面積或多部件地號仍可正常回傳，只是不快取。
  if (serialized.length < 90000) cache.put(cacheKey, serialized, CADASTRE_CONFIG.queryCacheSeconds);
  return geojson;
}

function queryParcelFeatures_(token, where) {
  var url = buildUrl_(CADASTRE_CONFIG.parcelQueryUrl, {
    f: "json",
    where: where,
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    token: token,
  });
  return fetchJson_(url, {
    Accept: "application/json",
    Referer: CADASTRE_CONFIG.landmapPageUrl,
  });
}

function hasParcelFeatures_(payload) {
  return Array.isArray(payload && payload.features) && payload.features.length > 0;
}

function findResurveyMapping_(town, sectionCode, parcelNo8) {
  return findEvolutionMapping_(CADASTRE_CONFIG.resurveyMapUrl, town, sectionCode, parcelNo8, "VN48", "VN49");
}

function findMergeMapping_(town, sectionCode, parcelNo8) {
  return findEvolutionMapping_(CADASTRE_CONFIG.mergeMapUrl, town, sectionCode, parcelNo8, "UI48_S", "UI49_S");
}

function getResurveyBearer_() {
  var properties = PropertiesService.getScriptProperties();
  var configured = String(properties.getProperty(CADASTRE_CONFIG.resurveyBearerProperty) || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  var cache = CacheService.getScriptCache();
  var cached = String(cache.get(CADASTRE_CONFIG.resurveyTokenCacheKey) || "").trim();

  // The official web map refreshes this short-lived landwa token once per day.
  // Prefer the current token so a stale copied token does not silently disable
  // resurvey lookup.  A configured/cached token remains a safe fallback when
  // the token endpoint is temporarily unavailable.
  try {
    var taiwanDate = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd");
    var response = UrlFetchApp.fetch(CADASTRE_CONFIG.resurveyTokenUrl, {
      method: "post",
      payload: { TD: taiwanDate },
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: CADASTRE_CONFIG.landmapPageUrl,
      },
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      var payload = JSON.parse(response.getContentText());
      var token = String(payload && payload.token || "").trim();
      if (token.length >= 16 && (payload.Result === true || payload.result === true || payload.Result === "true")) {
        cache.put(CADASTRE_CONFIG.resurveyTokenCacheKey, token, CADASTRE_CONFIG.tokenCacheSeconds);
        return token;
      }
    }
  } catch (ignore) {
    // Fall through to the explicitly configured/cached token.
  }
  return configured || cached || "";
}

function findEvolutionMapping_(endpoint, town, sectionCode, parcelNo8, sectionField, parcelField) {
  var bearer = getResurveyBearer_();
  if (!bearer) return null;
  try {
    var url = buildUrl_(endpoint, { TName: town, AA48: sectionCode, AA49: parcelNo8 });
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + bearer,
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return null;
    var parsed = JSON.parse(response.getContentText());
    var rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed && parsed.data) ? parsed.data : []);
    var first = Array.isArray(rows) ? rows[0] : null;
    var resolvedSection = normalizeSectionCode_(first && first[sectionField]);
    var resolvedParcel = normalizeParcelNumber_(first && first[parcelField]);
    return resolvedSection && resolvedParcel ? { sectionCode: resolvedSection, parcelNo8: resolvedParcel } : null;
  } catch (ignore) {
    return null;
  }
}

/**
 * 取得國土測繪圖資服務雲回傳的 PNG 圖層。
 * 上游回傳的是 Base64 圖片與 [minLng, minLat, maxLng, maxLat] 範圍；
 * 前端只收到可繪製的最小資料，不會收到任何 Token 或上游原始回應。
 */
function findParcelImageLayers_(query) {
  if (!query.townCode) {
    throw appError_("圖片地籍查詢缺少行政區代碼，請重新載入 V3 的下拉清單。", "INVALID_TOWN_CODE");
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = imageParcelCacheKey_(query);
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var cachedLayers = JSON.parse(cached);
      if (Array.isArray(cachedLayers) && cachedLayers.length) return cachedLayers;
    } catch (ignore) {
      // 快取資料若被截斷或更新，直接重新向上游查詢。
    }
  }

  var section = resolveNationalSection_(query);
  var payload = fetchNationalJson_(CADASTRE_CONFIG.nationalMapImageUrl, {
    sectNo: section.sectNo,
    office: section.officeCode,
    // 國土測繪圖片端點接受使用者可讀的地號（例如 10、10-1），而非八碼 LANDNO8。
    landNo: formatParcelNumber_(query.parcelNo8),
  });
  var layers = normalizeImageLayers_(payload);
  if (!layers.length) {
    throw appError_("查無這筆地號的國土測繪圖片。", "IMAGE_NOT_FOUND");
  }

  var serialized = JSON.stringify(layers);
  // GAS CacheService 單筆有大小上限；較大的圖片仍可正常回傳，只是不快取。
  if (serialized.length < 90000) cache.put(cacheKey, serialized, CADASTRE_CONFIG.queryCacheSeconds);
  return layers;
}

/**
 * 國土測繪端點需要 officeCode；下拉快照只保存地段代碼與名稱，
 * 因此在 GAS 端向官方公開清單確認地段並取得辦事處代碼。
 */
function resolveNationalSection_(query) {
  var cache = CacheService.getScriptCache();
  var cacheKey = CADASTRE_CONFIG.sectionCachePrefix + [query.city, query.townCode, query.sectionCode].join(":");
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var cachedSection = JSON.parse(cached);
      if (cachedSection && cachedSection.sectNo && cachedSection.officeCode) return cachedSection;
    } catch (ignore) {
      // 快取資料無法解析時重新查詢。
    }
  }

  var sections = fetchNationalJson_(CADASTRE_CONFIG.nationalSectionUrl, {
    cityCode: query.city,
    townCode: query.townCode,
  });
  if (!Array.isArray(sections)) {
    throw appError_("國土測繪地段清單格式無法辨識。", "SECTION_RESPONSE_INVALID");
  }

  var wantedCode = String(query.sectionCode || "");
  var wantedName = normalizeText_(query.sectionName);
  var match = sections.find(function (item) {
    var id = String(item && (item.id || item.sectNo || ""));
    var name = normalizeText_(item && (item.name || item.sectionName || ""));
    return (wantedCode && id === wantedCode) || (wantedName && name === wantedName);
  });
  var officeCode = String(match && (match.officeCode || match.office || "")).trim();
  var sectNo = String(match && (match.id || match.sectNo || "")).trim();
  if (!sectNo || !officeCode) {
    throw appError_("找不到國土測繪對應的地段或辦事處代碼。", "SECTION_NOT_FOUND");
  }

  var resolved = { sectNo: sectNo, officeCode: officeCode };
  cache.put(cacheKey, JSON.stringify(resolved), 3600);
  return resolved;
}

function fetchNationalJson_(url, parameters) {
  // 這兩個公開端點目前接受固定參數的 GET，且不需要工作階段或 Token。
  // 先前的 session + POST 流程會讓 GAS 卡在國土測繪站台，導致 V3 沒有回應。
  // URL 仍由本檔固定，前端不能指定任何代理目標。
  var requestUrl = buildUrl_(url, parameters || {});
  var response = UrlFetchApp.fetch(requestUrl, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { Accept: "application/json" },
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw appError_("國土測繪圖資服務目前無法查詢，請稍後再試。", "NATIONAL_HTTP_" + status);
  }
  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    throw appError_("國土測繪圖資服務回傳格式無法辨識。", "NATIONAL_RESPONSE_INVALID");
  }
  if (payload && (payload.error || payload.msg)) {
    throw appError_("國土測繪圖資服務目前無法查詢，請稍後再試。", "NATIONAL_REQUEST_FAILED");
  }
  return payload;
}

function normalizeImageLayers_(payload) {
  var rawLayers = [];
  if (Array.isArray(payload && payload.IMG)) {
    rawLayers = payload.IMG;
  } else if (payload && typeof payload.IMG === "string") {
    rawLayers = [payload];
  }

  return rawLayers.map(function (item) {
    var image = typeof item === "string" ? item : String(item && (item.IMG || item.image || ""));
    var extent = item && Array.isArray(item.EXT) ? item.EXT : payload && payload.EXT;
    if (!image || !Array.isArray(extent) || extent.length < 4) return null;
    var numbers = extent.slice(0, 4).map(Number);
    var validNumbers = numbers.every(function (value) { return isFinite(value); });
    if (!validNumbers || numbers[2] <= numbers[0] || numbers[3] <= numbers[1]) return null;
    return {
      image: image.replace(/\s+/g, ""),
      mimeType: "image/png",
      extent: numbers,
    };
  }).filter(function (layer) { return layer; });
}

function getArcGisToken_() {
  // 若資料提供者提供可供服務端使用的正式 Token，僅放在 Script Properties，絕不寫入 Git。
  var configuredToken = String(PropertiesService.getScriptProperties().getProperty("CADASTRE_ARCGIS_TOKEN") || "").trim();
  if (configuredToken) return configuredToken;

  var cache = CacheService.getScriptCache();
  var cached = cache.get(CADASTRE_CONFIG.tokenCacheKey);
  if (cached) return cached;

  // 此段只依照官方公開網頁的短效工作階段流程嘗試取得 Token。部分上游 Token
  // 會綁定來源或 IP；若 MapServer 拒絕，會以可讀訊息回傳，不應嘗試繞過限制。
  var landingResponse = UrlFetchApp.fetch(CADASTRE_CONFIG.landmapPageUrl, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (landingResponse.getResponseCode() < 200 || landingResponse.getResponseCode() >= 300) {
    throw appError_("臺南圖台首頁目前無法建立查詢工作階段。", "LANDING_REQUEST_FAILED");
  }
  var cookie = responseCookies_(landingResponse);
  var tokenHeaders = {
    Accept: "application/json, text/plain, */*",
    Referer: CADASTRE_CONFIG.landmapPageUrl,
  };
  if (cookie) tokenHeaders.Cookie = cookie;
  var tokenResponse = UrlFetchApp.fetch(
    CADASTRE_CONFIG.tokenUrl + "?t=" + new Date().getTime(),
    {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: tokenHeaders,
    }
  );
  if (tokenResponse.getResponseCode() < 200 || tokenResponse.getResponseCode() >= 300) {
    throw appError_("臺南圖台暫時無法建立公開查詢工作階段。", "TOKEN_REQUEST_FAILED");
  }

  var tokenPayload;
  try {
    tokenPayload = JSON.parse(tokenResponse.getContentText());
  } catch (error) {
    throw appError_("臺南圖台的 Token 回應格式無法辨識。", "TOKEN_RESPONSE_INVALID");
  }
  var token = String(tokenPayload && tokenPayload.token || "").trim();
  if (token.length < 16) {
    throw appError_("臺南圖台未提供可用的查詢 Token。", "TOKEN_MISSING");
  }

  var expiresAt = Number(tokenPayload.expires || 0);
  var secondsUntilExpiry = expiresAt > new Date().getTime()
    ? Math.floor((expiresAt - new Date().getTime() - 60000) / 1000)
    : CADASTRE_CONFIG.tokenCacheSeconds;
  var cacheSeconds = Math.max(30, Math.min(CADASTRE_CONFIG.tokenCacheSeconds, secondsUntilExpiry));
  cache.put(CADASTRE_CONFIG.tokenCacheKey, token, cacheSeconds);
  return token;
}

function fetchJson_(url, headers) {
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true,
    headers: headers || { Accept: "application/json" },
  });
  var status = response.getResponseCode();
  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    throw appError_("地籍圖台回傳的資料格式無法辨識。", "UPSTREAM_INVALID_JSON");
  }
  if (status < 200 || status >= 300 || payload.error) {
    var code = Number(payload && payload.error && payload.error.code || status || 0);
    if (code === 400 || code === 498 || code === 499) {
      throw appError_("官方 MapServer 未接受本次服務端查詢（可能是公開短效 Token 的來源限制）。請改用主管機關核可的服務端 Token，或稍後重試。", "UPSTREAM_TOKEN_REJECTED");
    }
    throw appError_("地籍圖台目前無法查詢，請稍後再試。", "UPSTREAM_REQUEST_FAILED");
  }
  return payload;
}

function buildWhereClause_(query) {
  var town = escapeSqlString_(query.town);
  var sectionCode = escapeSqlString_(query.sectionCode);
  var sectionName = escapeSqlString_(query.sectionName);
  var parcelNo8 = escapeSqlString_(query.parcelNo8);
  // 國家地圖平臺的地段代碼與臺南 MapServer 的 SECT 代碼不完全相同；所以同時以
  // SECT 和 SECNAME 比對，讓 V3 的下拉選單能直接對應官方圖台資料。
  return "(TNAME = '" + town + "' AND (SECT = '" + sectionCode + "' OR SECNAME = '" + sectionName + "') AND LANDNO8 = '" + parcelNo8 + "')";
}

function buildResolvedWhereClause_(townName, sectionCode, parcelNo8) {
  var town = escapeSqlString_(townName);
  var section = escapeSqlString_(sectionCode);
  var parcel = escapeSqlString_(parcelNo8);
  return "(TNAME = '" + town + "' AND SECT = '" + section + "' AND LANDNO8 = '" + parcel + "')";
}

function esriResultToGeoJson_(payload) {
  var features = Array.isArray(payload && payload.features) ? payload.features : [];
  return {
    type: "FeatureCollection",
    meta: { fieldAliases: CADASTRE_FIELD_ALIASES },
    features: features.map(function (feature) {
      var attributes = feature && (feature.attributes || feature.properties) || {};
      return {
        type: "Feature",
        geometry: esriGeometryToGeoJson_(feature && feature.geometry),
        properties: publicProperties_(attributes),
      };
    }).filter(function (feature) {
      return feature.geometry;
    }),
  };
}

function publicProperties_(attributes) {
  // 保留官方欄位代碼，讓前端可以依 F12 顯示的欄位別名呈現完整屬性。
  var properties = {};
  Object.keys(CADASTRE_FIELD_ALIASES).forEach(function (key) {
    properties[key] = firstValue_(attributes, [key]);
  });

  var parcelNo8 = properties.LANDNO8 || firstValue_(attributes, ["AA49", "parcelNo8"]);
  properties.LANDNO8 = parcelNo8;
  properties.TNAME = properties.TNAME || firstValue_(attributes, ["town"]);
  properties.SECT = properties.SECT || firstValue_(attributes, ["AA48", "section"]);
  properties.SECNAME = properties.SECNAME || firstValue_(attributes, ["KCNT", "sectionName"]);
  properties.LAND_NO = properties.LAND_NO || firstValue_(attributes, ["parcelNumber"]) || formatParcelNumber_(parcelNo8);
  properties.AA06 = properties.AA06 || firstValue_(attributes, ["LUSE", "landUse"]);

  // 舊版前端仍使用這組語意化欄位；保留它們可讓舊快取／其他用戶端平滑升級。
  properties.town = properties.TNAME;
  properties.section = properties.SECT;
  properties.sectionName = properties.SECNAME;
  properties.parcelNo8 = properties.LANDNO8;
  properties.parcelNumber = properties.LAND_NO;
  properties.area = properties.AREA;
  properties.landUse = properties.AA06;
  return properties;
}

function esriGeometryToGeoJson_(geometry) {
  var rings = Array.isArray(geometry && geometry.rings)
    ? geometry.rings.map(normalizeRing_).filter(function (ring) { return ring.length >= 4; })
    : [];
  if (!rings.length) return null;

  // ArcGIS polygon 外環通常是順時針、洞環為逆時針；Leaflet 能繪製兩種方向，
  // 但仍要依包含關係把洞環放回正確面，以支援多部件地號。
  var outerRings = rings.filter(function (ring) { return ringSignedArea_(ring) < 0; });
  var holeRings = rings.filter(function (ring) { return ringSignedArea_(ring) >= 0; });
  if (!outerRings.length) return { type: "Polygon", coordinates: rings };

  var polygons = outerRings.map(function (ring) { return [ring]; });
  holeRings.forEach(function (hole) {
    var ownerIndex = -1;
    for (var index = 0; index < outerRings.length; index += 1) {
      if (pointInRing_(hole[0], outerRings[index])) {
        ownerIndex = index;
        break;
      }
    }
    if (ownerIndex >= 0) polygons[ownerIndex].push(hole);
    else polygons.push([hole]);
  });
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function normalizeRing_(ring) {
  if (!Array.isArray(ring)) return [];
  var normalized = ring.map(function (point) {
    var longitude = Number(point && point[0]);
    var latitude = Number(point && point[1]);
    return isFinite(longitude) && isFinite(latitude) ? [longitude, latitude] : null;
  }).filter(function (point) { return point; });
  if (normalized.length < 3) return [];
  var first = normalized[0];
  var last = normalized[normalized.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) normalized.push([first[0], first[1]]);
  return normalized;
}

function ringSignedArea_(ring) {
  var total = 0;
  for (var index = 0; index < ring.length - 1; index += 1) {
    total += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return total / 2;
}

function pointInRing_(point, ring) {
  var inside = false;
  for (var current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    var currentPoint = ring[current];
    var previousPoint = ring[previous];
    var intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]))
      && (point[0] < (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) / (previousPoint[1] - currentPoint[1]) + currentPoint[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function normalizeText_(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function normalizeSectionCode_(value) {
  var code = normalizeText_(value).toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : "";
}

function normalizeTownCode_(value) {
  var code = normalizeText_(value);
  return /^\d{2}$/.test(code) ? code : "";
}

function normalizeSectionName_(value) {
  var name = normalizeText_(value);
  return /^[\u4e00-\u9fffA-Za-z0-9()（）一二三四五六七八九十百零〇甲乙丙丁戊己庚辛壬癸_-]{1,50}$/.test(name) ? name : "";
}

function normalizeParcelNumber_(value) {
  var raw = normalizeText_(value).replace(/[－—–]/g, "-");
  if (/^\d{8}$/.test(raw)) return raw;
  var match = raw.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
  if (!match) return "";
  return leftPad_(match[1], 4) + leftPad_(match[2] || "0", 4);
}

function formatParcelNumber_(parcelNo8) {
  var value = String(parcelNo8 || "");
  if (!/^\d{8}$/.test(value)) return value;
  var parent = String(Number(value.slice(0, 4)));
  var child = Number(value.slice(4));
  return child ? parent + "-" + String(child) : parent;
}

function leftPad_(value, length) {
  return ("0000000000" + String(value)).slice(-length);
}

function firstValue_(source, keys) {
  for (var index = 0; index < keys.length; index += 1) {
    var value = source[keys[index]];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function escapeSqlString_(value) {
  return String(value).replace(/'/g, "''");
}

function buildUrl_(baseUrl, parameters) {
  var pairs = Object.keys(parameters).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(String(parameters[key]));
  });
  return baseUrl + (baseUrl.indexOf("?") === -1 ? "?" : "&") + pairs.join("&");
}

function responseCookies_(response) {
  var headers = response.getAllHeaders() || {};
  var values = [];
  Object.keys(headers).forEach(function (name) {
    if (String(name).toLowerCase() !== "set-cookie") return;
    var raw = headers[name];
    values = values.concat(Array.isArray(raw) ? raw : [raw]);
  });
  return values.filter(function (value) { return value; }).map(function (value) {
    return String(value).split(";")[0];
  }).join("; ");
}

function validJsonpCallback_(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(String(value || ""));
}

function parcelCacheKey_(query) {
  var source = [query.city, query.town, query.sectionCode, query.sectionName, query.parcelNo8].join("|");
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source);
  return CADASTRE_CONFIG.queryCachePrefix + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function imageParcelCacheKey_(query) {
  var source = [query.city, query.townCode, query.town, query.sectionCode, query.sectionName, query.parcelNo8].join("|");
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source);
  return CADASTRE_CONFIG.imageCachePrefix + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function enforceRateLimit_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var cache = CacheService.getScriptCache();
    var key = "tainan-parcel-rate-window-v1";
    var now = new Date().getTime();
    var previous;
    try {
      previous = JSON.parse(cache.get(key) || "{}");
    } catch (ignore) {
      previous = {};
    }
    var state = previous.startedAt && now - previous.startedAt < 60000
      ? previous
      : { startedAt: now, count: 0 };
    state.count = Number(state.count || 0) + 1;
    cache.put(key, JSON.stringify(state), 60);
    if (state.count > CADASTRE_CONFIG.maxQueriesPerMinute) {
      throw appError_("地籍查詢暫時較頻繁，請稍後一分鐘再試。", "RATE_LIMITED");
    }
  } finally {
    lock.releaseLock();
  }
}

function appError_(message, code) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function publicErrorMessage_(error) {
  var message = String(error && error.message || "").trim();
  if (message) return message;
  return "地籍查詢暫時無法完成，請稍後再試。";
}
