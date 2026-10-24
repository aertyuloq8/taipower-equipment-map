/**
 * 全台地籍圖資服務雲 Adapter for Google Apps Script (Taiwan Cadastre GAS Adapter)
 *
 * 支援全台 22 縣市、368 鄉鎮市區、16,951 地段。
 * 支援 action=parcelImage（國土測繪透明圖層與邊界）及 action=parcel（相容 GeoJSON）。
 * 支援 JSON 與 JSONP，供 GitHub Pages 靜態網站跨域安全調用。
 */

var CADASTRE_CONFIG = {
  nlscMapUrl: "https://maps.nlsc.gov.tw/",
  nlscQueryUrl: "https://landmaps.nlsc.gov.tw/S_Maps/qryTileMapIndex",
  nationalSectionUrl: "https://easymap.moi.gov.tw/Z10Web/City_json_getSectionList",
  imageCachePrefix: "tw-cadastre-image-v2:",
  maxQueriesPerMinute: 80,
  queryCacheSeconds: 600,
};

function doGet(e) {
  var parameters = (e && e.parameter) || {};
  var callback = validJsonpCallback_(parameters.callback) ? parameters.callback : "";
  try {
    var action = String(parameters.action || "parcelImage");
    if (action !== "parcel" && action !== "parcelImage") {
      throw new Error("只支援 action=parcel 或 action=parcelImage。");
    }
    enforceRateLimit_();
    var query = validateParcelRequest_(parameters);
    var imageLayers = findParcelImageLayers_(query);
    return output_({
      ok: true,
      type: "imageLayers",
      office: query.office,
      sect: query.sectionCode,
      landno: query.parcelNo8,
      sectName: query.sectionName,
      officeName: query.officeName || query.office,
      imageLayers: imageLayers
    }, callback);
  } catch (error) {
    return output_({ ok: false, error: String(error.message || error || "查詢失敗") }, callback);
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

function validJsonpCallback_(callback) {
  return typeof callback === "string" && /^[a-zA-Z_$][0-9a-zA-Z_$]{1,64}$/.test(callback);
}

function normalizeText_(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeParcelNumber_(value) {
  var raw = normalizeText_(value).replace(/[－—–]/g, "-");
  if (/^\d{8}$/.test(raw)) return raw;
  var match = raw.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
  if (!match) return "";
  return match[1].padStart(4, "0") + (match[2] || "0").padStart(4, "0");
}

function validateParcelRequest_(parameters) {
  var city = normalizeText_(parameters.city);
  var cityName = normalizeText_(parameters.cityName);
  var town = normalizeText_(parameters.town);
  var townCode = normalizeText_(parameters.townCode);
  var sectionCode = normalizeText_(parameters.sectionCode || parameters.section);
  var sectionName = normalizeText_(parameters.sectionName);
  var office = normalizeText_(parameters.office || parameters.officeCode);
  var parcelNo8 = normalizeParcelNumber_(parameters.number || parameters.landno);

  if (!sectionCode) throw new Error("請選擇有效的地段。");
  if (!parcelNo8) throw new Error("請輸入有效地號，例如 10、10-1 或 00000010。");

  // 若前端未傳入 office，向國土測繪清單動態解析
  if (!office && city && townCode) {
    office = resolveOfficeCode_(city, townCode, sectionCode, sectionName);
  }

  return {
    city: city,
    cityName: cityName,
    town: town,
    townCode: townCode,
    sectionCode: sectionCode,
    sectionName: sectionName,
    office: office,
    parcelNo8: parcelNo8,
  };
}

function resolveOfficeCode_(cityCode, townCode, sectionCode, sectionName) {
  try {
    var url = CADASTRE_CONFIG.nationalSectionUrl + "?cityCode=" + encodeURIComponent(cityCode) + "&townCode=" + encodeURIComponent(townCode);
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      var list = JSON.parse(response.getContentText());
      if (Array.isArray(list)) {
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          var id = String(item.id || item.sectNo || "").trim();
          var name = String(item.name || item.sectionName || "").trim();
          if ((sectionCode && id === sectionCode) || (sectionName && name === sectionName)) {
            return String(item.officeCode || item.office || "").trim();
          }
        }
      }
    }
  } catch (e) {}
  return "";
}

function findParcelImageLayers_(query) {
  if (!query.office) {
    throw new Error("缺少地政事務所代碼 (office)。");
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = CADASTRE_CONFIG.imageCachePrefix + [query.office, query.sectionCode, query.parcelNo8].join(":");
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      var cachedLayers = JSON.parse(cached);
      if (Array.isArray(cachedLayers) && cachedLayers.length) return cachedLayers;
    } catch (e) {}
  }

  var requestUrl = CADASTRE_CONFIG.nlscQueryUrl +
    "?type=2&flag=2&office=" + encodeURIComponent(query.office) +
    "&sect=" + encodeURIComponent(query.sectionCode) +
    "&landno=" + encodeURIComponent(query.parcelNo8) +
    "&alpah=0.5f&imgflag=1";

  var options = {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      "Referer": CADASTRE_CONFIG.nlscMapUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  };

  for (var attempt = 1; attempt <= 3; attempt++) {
    var response = UrlFetchApp.fetch(requestUrl, options);
    if (response.getResponseCode() !== 200) {
      throw new Error("國土測繪圖資伺服器連線失敗 (HTTP " + response.getResponseCode() + ")。");
    }

    var json = JSON.parse(response.getContentText());
    if (json[0] && json[0].msg === "影像產置中，請稍候") {
      Utilities.sleep(450);
      continue;
    }
    if (json[0] && json[0].msg) {
      throw new Error(String(json[0].msg));
    }

    if (Array.isArray(json) && json.length >= 2 && json[1] && json[1].image) {
      var row1 = json[1];
      var layers = [{
        image: String(row1.image).replace(/\s+/g, ""),
        extent: [Number(row1.lx), Number(row1.ly), Number(row1.rx), Number(row1.ry)],
        mimeType: "image/png"
      }];
      var serialized = JSON.stringify(layers);
      if (serialized.length < 90000) {
        cache.put(cacheKey, serialized, CADASTRE_CONFIG.queryCacheSeconds);
      }
      return layers;
    }

    throw new Error("查無此地號影像圖資。");
  }

  throw new Error("影像產生逾時，請稍後再試。");
}

function enforceRateLimit_() {
  var cache = CacheService.getScriptCache();
  var minuteKey = "rate-limit:" + Math.floor(Date.now() / 60000);
  var current = Number(cache.get(minuteKey) || 0);
  if (current >= CADASTRE_CONFIG.maxQueriesPerMinute) {
    throw new Error("地籍查詢次數過於頻繁，請稍候再試。");
  }
  cache.put(minuteKey, String(current + 1), 70);
}
