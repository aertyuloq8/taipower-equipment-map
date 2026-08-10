(() => {
  "use strict";

  const fixedCityCode = "D";
  const fixedCityNames = new Set(["臺南市", "台南市"]);
  const requestTimeoutMs = 45_000;
  const controls = {
    panel: document.getElementById("v2CadastrePanel"),
    toggle: document.getElementById("v2CadastreToggle"),
    close: document.getElementById("v2CadastreClose"),
    form: document.getElementById("v2CadastreForm"),
    town: document.getElementById("v2CadastreTown"),
    section: document.getElementById("v2CadastreSection"),
    sectionSearch: document.getElementById("v2CadastreSectionSearch"),
    sectionSelect: document.getElementById("v2CadastreSectionSelect"),
    matches: document.getElementById("v2CadastreMatches"),
    hint: document.getElementById("v2CadastreHint"),
    parcel: document.getElementById("v2CadastreParcel"),
    submit: document.getElementById("v2CadastreSubmit"),
    clear: document.getElementById("v2CadastreClear"),
    status: document.getElementById("v2CadastreStatus"),
    result: document.getElementById("v2CadastreResult"),
  };
  const state = {
    city: null,
    cities: [],
    dropdownPromise: null,
    overlayLayer: null,
    requestSequence: 0,
  };

  function normalizeText(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  }

  function normalizeParcel(value) {
    const raw = normalizeText(value).replace(/[－—–]/g, "-");
    if (/^\d{8}$/.test(raw)) return raw;
    return /^(\d{1,4})(?:-(\d{1,4}))?$/.test(raw) ? raw : "";
  }

  function parcelNo8(value) {
    const raw = normalizeParcel(value);
    if (!raw) return "";
    if (/^\d{8}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    return `${match[1].padStart(4, "0")}${(match[2] || "0").padStart(4, "0")}`;
  }

  function formatParcel(value) {
    const raw = String(value || "");
    if (!/^\d{8}$/.test(raw)) return raw || "--";
    const parent = String(Number.parseInt(raw.slice(0, 4), 10));
    const child = Number.parseInt(raw.slice(4), 10);
    return child ? `${parent}-${child}` : parent;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[char]));
  }

  function featureMapCenter(feature) {
    const points = [];
    const visit = value => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        points.push([Number(value[0]), Number(value[1])]);
        return;
      }
      value.forEach(visit);
    };
    visit(feature?.geometry?.coordinates);
    if (!points.length) return null;
    const longitudes = points.map(point => point[0]);
    const latitudes = points.map(point => point[1]);
    return {
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    };
  }

  function googleNavigationUrl(center) {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return "";
    const query = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function getMap() {
    return window.__v2LeafletMap || null;
  }

  function setStatus(message = "", options = {}) {
    if (!controls.status) return;
    controls.status.textContent = message;
    controls.status.classList.toggle("is-error", Boolean(options.error));
    controls.status.classList.toggle("is-loading", Boolean(options.loading));
  }

  function setBusy(busy) {
    if (controls.submit) controls.submit.disabled = busy;
  }

  function closeOtherFloatingPanels() {
    const search = document.getElementById("mapSearchPanel");
    const searchToggle = document.getElementById("mapSearchToggle");
    const layerPanel = document.getElementById("layerMenuPanel");
    const layerToggle = document.getElementById("layerMenuToggle");
    search?.classList.remove("is-open");
    searchToggle?.classList.remove("is-active");
    searchToggle?.setAttribute("aria-expanded", "false");
    if (layerPanel) layerPanel.hidden = true;
    layerToggle?.classList.remove("is-active");
    layerToggle?.setAttribute("aria-expanded", "false");
  }

  function setPanelOpen(open) {
    if (!controls.panel || !controls.toggle) return;
    if (open && !controls.panel.classList.contains("is-open")) {
      const event = new CustomEvent("v2-cadastre-open", { cancelable: true });
      if (!document.dispatchEvent(event)) return;
    }
    controls.panel.classList.toggle("is-open", open);
    controls.panel.setAttribute("aria-hidden", String(!open));
    controls.toggle.classList.toggle("is-active", open);
    controls.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      closeOtherFloatingPanels();
      ensureDropdowns();
      window.setTimeout(() => controls.town?.focus(), 0);
    }
  }

  document.addEventListener("v2-inspection-open", () => setPanelOpen(false));

  function normalizeCatalog(payload) {
    const seenCities = new Set();
    return (Array.isArray(payload?.cities) ? payload.cities : []).reduce((cities, city) => {
      const cityCode = String(city?.code || "").trim();
      const cityName = String(city?.name || "").trim();
      if (!cityCode || !cityName || seenCities.has(cityCode)) return cities;
      seenCities.add(cityCode);
      const seenTowns = new Set();
      const towns = (Array.isArray(city?.towns) ? city.towns : []).reduce((items, town) => {
        const townCode = String(town?.code || "").trim();
        const townName = String(town?.name || "").trim();
        if (!townCode || !townName || seenTowns.has(townCode)) return items;
        seenTowns.add(townCode);
        const seenSections = new Set();
        const sections = (Array.isArray(town?.sections) ? town.sections : []).reduce((sectionItems, section) => {
          const code = String(section?.code || "").trim();
          const name = String(section?.name || "").trim();
          if (!code || !name || seenSections.has(code)) return sectionItems;
          seenSections.add(code);
          sectionItems.push({ code, name });
          return sectionItems;
        }, []);
        items.push({ code: townCode, name: townName, sections });
        return items;
      }, []);
      cities.push({ code: cityCode, name: cityName, towns });
      return cities;
    }, []);
  }

  function replaceOptions(select, items, placeholder) {
    if (!select) return;
    select.replaceChildren(new Option(placeholder, ""));
    for (const item of items) select.add(new Option(item.label || item.name, item.code));
  }

  function selectedTown() {
    return state.city?.towns?.find(town => town.code === controls.town?.value) || null;
  }

  function selectedSection(town = selectedTown()) {
    return town?.sections?.find(section => section.code === controls.section?.value) || null;
  }

  function setHint(message) {
    if (controls.hint) controls.hint.textContent = message;
  }

  function setMatchesOpen(open) {
    if (controls.matches) controls.matches.hidden = !open;
    controls.sectionSearch?.setAttribute("aria-expanded", String(open));
  }

  function resetSections() {
    if (controls.section) controls.section.value = "";
    if (controls.sectionSearch) {
      controls.sectionSearch.value = "";
      controls.sectionSearch.disabled = true;
      controls.sectionSearch.placeholder = "先選行政區，再輸入地段關鍵字";
    }
    replaceOptions(controls.sectionSelect, [], "請先選擇行政區");
    if (controls.sectionSelect) controls.sectionSelect.disabled = true;
    setMatchesOpen(false);
    setHint("請先選擇鄉鎮市區。");
  }

  async function ensureDropdowns() {
    if (state.city) return state.city;
    if (state.dropdownPromise) return state.dropdownPromise;
    state.dropdownPromise = (async () => {
      try {
        const dataUrl = String(window.CADASTRE_DROPDOWN_DATA_URL || "../data/cadastral-dropdowns-tw.json").trim();
        const response = await fetch(new URL(dataUrl, window.location.href), { cache: "force-cache", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`地籍下拉資料無法載入（HTTP ${response.status}）。`);
        state.cities = normalizeCatalog(await response.json());
        state.city = state.cities.find(city => city.code === fixedCityCode && fixedCityNames.has(city.name)) || null;
        if (!state.city) throw new Error("地籍下拉資料沒有臺南市。" );
        replaceOptions(controls.town, state.city.towns, "請選擇臺南市行政區");
        controls.town.disabled = false;
        resetSections();
        setStatus("已固定為臺南市；請選擇鄉鎮市區後輸入地段關鍵字。" );
        return state.city;
      } catch (error) {
        controls.town.disabled = true;
        resetSections();
        setStatus(String(error?.message || "地籍下拉資料無法載入。"), { error: true });
        state.dropdownPromise = null;
        throw error;
      }
    })();
    return state.dropdownPromise;
  }

  function matchesForKeyword() {
    const town = selectedTown();
    const keyword = normalizeText(controls.sectionSearch?.value);
    if (!town || !keyword) return [];
    return town.sections.filter(section => normalizeText(section.name).includes(keyword) || normalizeText(section.code).includes(keyword)).slice(0, 16);
  }

  function renderMatches() {
    const town = selectedTown();
    const keyword = normalizeText(controls.sectionSearch?.value);
    if (!controls.matches || !town) {
      setMatchesOpen(false);
      return [];
    }
    controls.matches.replaceChildren();
    if (!keyword) {
      setMatchesOpen(false);
      setHint(`此行政區有 ${town.sections.length} 個地段；輸入名稱或代碼可快速選取。`);
      return [];
    }
    const matches = matchesForKeyword();
    if (!matches.length) {
      setMatchesOpen(false);
      setHint("找不到符合的地段，請更換關鍵字。");
      return matches;
    }
    const selectedCode = controls.section?.value || "";
    matches.forEach(section => {
      const button = document.createElement("button");
      const name = document.createElement("span");
      const code = document.createElement("span");
      button.type = "button";
      button.className = "v2-cadastre-match";
      button.classList.toggle("is-selected", section.code === selectedCode);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(section.code === selectedCode));
      name.textContent = section.name;
      code.className = "v2-cadastre-match-code";
      code.textContent = section.code;
      button.append(name, code);
      button.addEventListener("click", () => chooseSection(section));
      controls.matches.append(button);
    });
    setMatchesOpen(true);
    setHint(`找到 ${matches.length} 個符合地段，點選即可套用。`);
    return matches;
  }

  function chooseSection(section) {
    if (!section || !controls.section) return;
    controls.section.value = section.code;
    if (controls.sectionSearch) controls.sectionSearch.value = section.name;
    if (controls.sectionSelect) controls.sectionSelect.value = section.code;
    setMatchesOpen(false);
    setHint(`已選擇「${section.name}」，可直接輸入地號。`);
    window.setTimeout(() => controls.parcel?.focus(), 0);
  }

  function prepareNextQuery() {
    state.requestSequence += 1;
    clearOverlay({ keepStatus: true });
    setBusy(false);
  }

  function clearOverlay({ keepStatus = false } = {}) {
    const map = getMap();
    if (map && state.overlayLayer) map.removeLayer(state.overlayLayer);
    state.overlayLayer = null;
    controls.result?.replaceChildren();
    if (controls.result) controls.result.hidden = true;
    if (!keepStatus) setStatus("已清除地籍套繪結果。" );
  }

  function clearQuery({ focusParcel = true } = {}) {
    state.requestSequence += 1;
    clearOverlay();
    if (controls.parcel) {
      controls.parcel.value = "";
      if (focusParcel) controls.parcel.focus();
    }
    setBusy(false);
  }

  function adapterUrl() {
    return String(window.CADASTRE_ADAPTER_URL || window.CADASTRE_GAS_URL || "").trim();
  }

  function adapterMode() {
    return String(window.CADASTRE_ADAPTER_MODE || window.CADASTRE_GAS_MODE || "geojson").trim().toLowerCase() === "image"
      ? "image"
      : "geojson";
  }

  function requestParcel(params) {
    const baseUrl = adapterUrl();
    if (!baseUrl) throw new Error("尚未設定地籍查詢服務網址。" );
    return new Promise((resolve, reject) => {
      const callbackName = `__v2CadastreJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const script = document.createElement("script");
      let settled = false;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        script.remove();
        try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
      };
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };
      const timeoutId = window.setTimeout(() => {
        settle(reject, new Error("地籍查詢服務逾時，請稍後再試。原有設備圖層未受影響。"));
      }, requestTimeoutMs);
      window[callbackName] = payload => {
        if (payload?.ok === false || payload?.error) {
          settle(reject, new Error(String(payload?.error || "地籍查詢服務沒有回傳資料。")));
          return;
        }
        settle(resolve, payload);
      };
      try {
        const url = new URL(baseUrl, window.location.href);
        url.searchParams.set("action", adapterMode() === "image" ? "parcelImage" : "parcel");
        url.searchParams.set("callback", callbackName);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
        });
        script.async = true;
        script.referrerPolicy = "no-referrer";
        script.onerror = () => settle(reject, new Error("地籍查詢服務無法連線，請稍後再試。"));
        script.src = url.toString();
        document.head.append(script);
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function imageLayers(payload) {
    const candidates = Array.isArray(payload?.imageLayers) ? payload.imageLayers : (Array.isArray(payload?.layers) ? payload.layers : []);
    return candidates.map(item => {
      const image = String(item?.image || item?.base64 || item?.IMG || "").replace(/\s+/g, "");
      const extent = (Array.isArray(item?.extent) ? item.extent : item?.EXT || []).slice(0, 4).map(Number);
      if (!image || extent.length !== 4 || !extent.every(Number.isFinite) || extent[2] <= extent[0] || extent[3] <= extent[1]) return null;
      return { image, mimeType: String(item?.mimeType || "image/png"), extent };
    }).filter(Boolean);
  }

  function showImageResult(layers, town, section, number) {
    if (!controls.result) return;
    const extent = layers[0]?.extent || [];
    const extentText = extent.length === 4
      ? `${extent[0].toFixed(6)}, ${extent[1].toFixed(6)} ～ ${extent[2].toFixed(6)}, ${extent[3].toFixed(6)}`
      : "--";
    controls.result.innerHTML = `<strong>已套繪：${escapeHtml(section.name)} ${escapeHtml(formatParcel(number))} 地號</strong><span>國土測繪圖片已依 EXT 經緯度範圍套繪。</span><dl><dt>縣市</dt><dd>臺南市</dd><dt>鄉鎮市區</dt><dd>${escapeHtml(town.name)}</dd><dt>地段</dt><dd>${escapeHtml(section.name)}（${escapeHtml(section.code)}）</dd><dt>地號</dt><dd>${escapeHtml(formatParcel(number))}</dd><dt>圖片範圍</dt><dd class="v2-cadastre-extent">${escapeHtml(extentText)}</dd></dl>`;
    controls.result.hidden = false;
  }

  function drawImageOverlay(payload, town, section, number) {
    const map = getMap();
    if (!map || !window.L) throw new Error("地圖尚未完成初始化。" );
    const layers = imageLayers(payload);
    if (!layers.length) throw new Error("國土測繪服務未回傳可套繪的圖片圖層。" );
    clearOverlay({ keepStatus: true });
    const paneName = "cadastrePaneV2";
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
    }
    map.getPane(paneName).style.zIndex = "450";
    map.getPane(paneName).style.pointerEvents = "none";
    const group = L.featureGroup();
    const bounds = L.latLngBounds([]);
    layers.forEach(layer => {
      const [west, south, east, north] = layer.extent;
      const imageBounds = [[south, west], [north, east]];
      const source = layer.image.startsWith("data:") ? layer.image : `data:${layer.mimeType};base64,${layer.image}`;
      L.imageOverlay(source, imageBounds, { pane: paneName, opacity: 0.82, interactive: false }).addTo(group);
      bounds.extend(L.latLngBounds(imageBounds));
    });
    group.addTo(map);
    state.overlayLayer = group;
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 20 });
    showImageResult(layers, town, section, number);
  }

  function geoJsonCollection(payload) {
    if (payload?.type === "FeatureCollection" && Array.isArray(payload.features)) return payload;
    if (payload?.geojson?.type === "FeatureCollection" && Array.isArray(payload.geojson.features)) return payload.geojson;
    throw new Error("地籍查詢服務未回傳可套繪的 GeoJSON。" );
  }

  function featureProperty(feature, names) {
    const properties = feature?.properties || {};
    for (const name of names) {
      const value = properties[name];
      if (value !== undefined && value !== null && value !== "") return String(value);
    }
    return "";
  }

  // Keep the official field codes so the result card can show the same
  // attributes as the government map, while still accepting the normalized
  // names returned by older GAS deployments.
  const CADASTRE_DETAIL_FIELDS = [
    { key: "TNAME", label: "鄉鎮名", aliases: ["TNAME", "town"] },
    { key: "SECT", label: "地段號", aliases: ["SECT", "section"] },
    { key: "SECNAME", label: "地段名", aliases: ["SECNAME", "sectionName"] },
    { key: "LANDNO8", label: "地號", aliases: ["LANDNO8", "parcelNo8"] },
    { key: "LAND_NO", label: "地號(母子號)", aliases: ["LAND_NO", "parcelNumber"] },
    { key: "AREA", label: "面積", aliases: ["AREA", "area"] },
    { key: "AA05", label: "登記日期", aliases: ["AA05", "registrationDate"] },
    { key: "AA06", label: "登記原因", aliases: ["AA06", "landUse"] },
    { key: "AA08", label: "地目", aliases: ["AA08", "landCategory"] },
    { key: "AA11", label: "使用分區", aliases: ["AA11", "useZone"] },
    { key: "AA12", label: "使用地類別", aliases: ["AA12", "landClass"] },
    { key: "BB09", label: "所有權人", aliases: ["BB09", "owner"] },
    { key: "Mng", label: "管理者", aliases: ["Mng", "manager"] },
    { key: "BBType", label: "所有權類別", aliases: ["BBType", "ownershipType"] },
    { key: "OBJECTID", label: "地籍編號", aliases: ["OBJECTID"] },
    { key: "LANDCODE", label: "地所代碼", aliases: ["LANDCODE"] },
    { key: "AA16", label: "公告現值", aliases: ["AA16", "publicLandValue"] },
    { key: "AA17", label: "公告地價", aliases: ["AA17", "publicLandPrice"] },
    { key: "TEMP_", label: "分段分幅名", aliases: ["TEMP_", "mapSheet"] },
  ];

  function formatCadastreDate(value) {
    const text = String(value || "").trim();
    const digits = text.replace(/\D/g, "");
    if (/^\d{7}$/.test(digits)) {
      return `${digits.slice(0, 3)}年${digits.slice(3, 5)}月${digits.slice(5, 7)}日`;
    }
    if (/^0\d{7}$/.test(digits)) {
      return `${digits.slice(1, 4)}年${digits.slice(4, 6)}月${digits.slice(6, 8)}日`;
    }
    return text;
  }

  function formatCadastreValue(field, value) {
    const text = String(value ?? "").trim();
    if (!text) return "-";
    if (field.key === "AA05") return formatCadastreDate(text);
    if (["AREA", "AA16", "AA17"].includes(field.key)) {
      const number = Number(text.replace(/,/g, ""));
      if (Number.isFinite(number)) {
        return number.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
      }
    }
    return text;
  }

  function detailRowsHtml(feature) {
    return CADASTRE_DETAIL_FIELDS.map(field => {
      const value = featureProperty(feature, field.aliases);
      return `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatCadastreValue(field, value))}</dd>`;
    }).join("");
  }

  function parcelResolution(payload) {
    return payload?.geojson?.meta?.resolution || payload?.meta?.resolution || null;
  }

  function resolutionText(resolution) {
    if (resolution?.type === "resurvey") return "此筆已由重測前地號轉為目前地號。";
    if (resolution?.type === "merge") return "此筆已由合併前地號轉為目前地號。";
    return "";
  }

  function parcelPopupHtml(feature, town, section, number, resolution) {
    const featureTown = featureProperty(feature, ["town", "TNAME"]) || town?.name || "--";
    const sectionName = featureProperty(feature, ["sectionName", "SECNAME", "KCNT"]) || section?.name || "--";
    const sectionCode = featureProperty(feature, ["section", "SECT", "AA48"]) || section?.code || "--";
    const parcelNo8 = featureProperty(feature, ["parcelNo8", "LANDNO8", "AA49"]);
    const parcel = featureProperty(feature, ["parcelNumber", "LAND_NO"])
      || (parcelNo8 ? formatParcel(parcelNo8) : formatParcel(number));
    const area = featureProperty(feature, ["area", "AREA"]);
    const evolution = resolutionText(resolution);
    const navigationUrl = googleNavigationUrl(featureMapCenter(feature));
    const actions = `<div class="v2-cadastre-popup-actions">${navigationUrl ? `<a class="popup-navigation-link" href="${navigationUrl}" target="_blank" rel="noopener">🗺️ 導航</a>` : ""}<button class="popup-clear-location-button" type="button" data-clear-cadastre-overlay>✕ 清除</button></div>`;
    return `<div class="v2-cadastre-popup"><strong>${escapeHtml(sectionName)} ${escapeHtml(parcel)} 地號</strong><br><span>${escapeHtml(featureTown)} · ${escapeHtml(sectionCode)}</span>${evolution ? `<br><span class="v2-cadastre-popup-evolution">↳ ${escapeHtml(evolution)}</span>` : ""}${area ? `<br><span>面積：${escapeHtml(formatCadastreValue({ key: "AREA" }, area))}</span>` : ""}<details class="v2-cadastre-popup-details"><summary>詳細屬性</summary><dl class="v2-cadastre-detail-list">${detailRowsHtml(feature)}</dl></details>${actions}</div>`;
  }

  function showGeoJsonResult(feature, town, section, number, resolution) {
    if (!controls.result) return;
    const featureTown = featureProperty(feature, ["town", "TNAME"]) || town?.name || "--";
    const sectionName = featureProperty(feature, ["sectionName", "SECNAME", "KCNT"]) || section?.name || "--";
    const sectionCode = featureProperty(feature, ["section", "SECT", "AA48"]) || section?.code || "--";
    const parcelNo8 = featureProperty(feature, ["parcelNo8", "LANDNO8", "AA49"]);
    const parcel = featureProperty(feature, ["parcelNumber", "LAND_NO"])
      || (parcelNo8 ? formatParcel(parcelNo8) : formatParcel(number));
    const area = featureProperty(feature, ["area", "AREA"]);
    const landUse = featureProperty(feature, ["landUse", "LUSE", "AA06"]);
    const evolution = resolutionText(resolution);
    controls.result.innerHTML = `<strong>已套繪：${escapeHtml(sectionName)} ${escapeHtml(parcel)} 地號</strong><span>${evolution ? escapeHtml(evolution) : "地籍範圍已顯示在目前地圖上。"}</span><dl class="v2-cadastre-summary"><dt>縣市</dt><dd>臺南市</dd><dt>鄉鎮市區</dt><dd>${escapeHtml(featureTown)}</dd><dt>地段</dt><dd>${escapeHtml(sectionName)}（${escapeHtml(sectionCode)}）</dd><dt>地號</dt><dd>${escapeHtml(parcel)}${parcelNo8 ? `（${escapeHtml(parcelNo8)}）` : ""}</dd>${evolution ? `<dt>資料演進</dt><dd>${escapeHtml(evolution)}</dd>` : ""}${area ? `<dt>面積</dt><dd>${escapeHtml(formatCadastreValue({ key: "AREA" }, area))}</dd>` : ""}${landUse ? `<dt>登記原因</dt><dd>${escapeHtml(landUse)}</dd>` : ""}</dl><details class="v2-cadastre-details" open><summary>完整地籍屬性</summary><dl class="v2-cadastre-detail-list">${detailRowsHtml(feature)}</dl></details>`;
    controls.result.hidden = false;
  }

  function drawGeoJsonOverlay(payload, town, section, number) {
    const map = getMap();
    if (!map || !window.L) throw new Error("地圖尚未完成初始化。" );
    const collection = geoJsonCollection(payload);
    const resolution = parcelResolution(payload);
    const features = collection.features.filter(feature => feature?.geometry?.coordinates?.length);
    if (!features.length) throw new Error("查無這筆地號的地籍圖形。" );
    clearOverlay({ keepStatus: true });
    const paneName = "cadastrePaneV2";
    if (!map.getPane(paneName)) map.createPane(paneName);
    map.getPane(paneName).style.zIndex = "450";
    map.getPane(paneName).style.pointerEvents = "auto";
    state.overlayLayer = L.geoJSON({ type: "FeatureCollection", features }, {
      pane: paneName,
      style: {
        color: "#b45309",
        fillColor: "#fbbf24",
        fillOpacity: 0.28,
        weight: 3,
      },
      onEachFeature: (feature, layer) => layer.bindPopup(parcelPopupHtml(feature, town, section, number, resolution)),
    }).addTo(map);
    const bounds = state.overlayLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 20 });
    showGeoJsonResult(features[0], town, section, number, resolution);
    const firstFeatureLayer = state.overlayLayer.getLayers()[0];
    window.setTimeout(() => firstFeatureLayer?.openPopup(), 350);
  }

  function drawParcelOverlay(payload, town, section, number) {
    if (adapterMode() === "image" || payload?.type === "imageLayers" || Array.isArray(payload?.imageLayers) || Array.isArray(payload?.layers)) {
      drawImageOverlay(payload, town, section, number);
      return;
    }
    drawGeoJsonOverlay(payload, town, section, number);
  }

  async function submit(event) {
    event.preventDefault();
    const city = state.city;
    const town = selectedTown();
    const section = selectedSection(town);
    const number = parcelNo8(controls.parcel?.value);
    if (!city) {
      setStatus("臺南市地籍下拉清單尚未載入，請稍後再試。", { error: true });
      return;
    }
    if (!town) {
      setStatus("請選擇鄉鎮市區。", { error: true });
      controls.town?.focus();
      return;
    }
    if (!section) {
      setStatus("請輸入關鍵字並選擇地段。", { error: true });
      controls.sectionSearch?.focus();
      return;
    }
    if (!number) {
      setStatus("請輸入地號，例如 10、10-1 或 00000010。", { error: true });
      controls.parcel?.focus();
      return;
    }
    const requestSequence = ++state.requestSequence;
    clearOverlay({ keepStatus: true });
    setBusy(true);
    const imageMode = adapterMode() === "image";
    setStatus(imageMode ? "查詢地籍圖片並套繪中…" : "查詢地籍範圍並套繪中…", { loading: true });
    try {
      const payload = await requestParcel({
        city: city.code,
        cityName: city.name,
        town: town.name,
        townCode: town.code,
        sectionCode: section.code,
        sectionName: section.name,
        number,
      });
      if (requestSequence !== state.requestSequence) return;
      drawParcelOverlay(payload, town, section, number);
      const resolution = parcelResolution(payload);
      setStatus(imageMode
        ? "已完成國土測繪圖片套繪。"
        : (resolution?.type === "resurvey" ? "已完成重測後地籍面套繪。" : "已完成地籍範圍套繪。"));
      setPanelOpen(false);
    } catch (error) {
      if (requestSequence !== state.requestSequence) return;
      setStatus(String(error?.message || "地籍查詢失敗。"), { error: true });
    } finally {
      if (requestSequence === state.requestSequence) setBusy(false);
    }
  }

  function bindEvents() {
    controls.toggle?.addEventListener("click", () => setPanelOpen(!controls.panel?.classList.contains("is-open")));
    controls.close?.addEventListener("click", () => setPanelOpen(false));
    controls.form?.addEventListener("submit", submit);
    controls.clear?.addEventListener("click", clearQuery);
    document.addEventListener("click", event => {
      const clearButton = event.target instanceof Element ? event.target.closest("[data-clear-cadastre-overlay]") : null;
      if (!clearButton) return;
      event.preventDefault();
      getMap()?.closePopup();
      clearQuery({ focusParcel: false });
      setPanelOpen(false);
    });
    controls.town?.addEventListener("change", () => {
      prepareNextQuery();
      const town = selectedTown();
      if (!town || !controls.sectionSearch) {
        resetSections();
        return;
      }
      controls.section.value = "";
      controls.sectionSearch.value = "";
      controls.sectionSearch.disabled = !town.sections.length;
      controls.sectionSearch.placeholder = town.sections.length ? "輸入地段關鍵字，例如 二王、永康" : "此行政區沒有可用地段";
      replaceOptions(controls.sectionSelect, town.sections.map(section => ({
        ...section,
        label: `${section.name}（${section.code}）`,
      })), town.sections.length ? "請從地段清單選取" : "此行政區沒有可用地段");
      if (controls.sectionSelect) controls.sectionSelect.disabled = !town.sections.length;
      setMatchesOpen(false);
      setHint(town.sections.length ? `此行政區有 ${town.sections.length} 個地段。` : "此行政區沒有可用地段。" );
    });
    controls.sectionSearch?.addEventListener("input", () => {
      prepareNextQuery();
      if (controls.section) controls.section.value = "";
      if (controls.sectionSelect) controls.sectionSelect.value = "";
      renderMatches();
    });
    controls.sectionSearch?.addEventListener("focus", () => {
      if (normalizeText(controls.sectionSearch?.value)) renderMatches();
    });
    controls.sectionSearch?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        const [first] = matchesForKeyword();
        if (first) {
          event.preventDefault();
          chooseSection(first);
        }
      }
      if (event.key === "Escape") setMatchesOpen(false);
    });
    controls.sectionSelect?.addEventListener("change", () => {
      const town = selectedTown();
      const section = town?.sections?.find(item => item.code === controls.sectionSelect?.value) || null;
      prepareNextQuery();
      if (!section) {
        if (controls.section) controls.section.value = "";
        if (controls.sectionSearch) controls.sectionSearch.value = "";
        setMatchesOpen(false);
        setHint(town ? `此行政區有 ${town.sections.length} 個地段；可輸入關鍵字或從清單選取。` : "請先選擇鄉鎮市區。");
        return;
      }
      chooseSection(section);
    });
    controls.parcel?.addEventListener("input", prepareNextQuery);
    document.addEventListener("click", event => {
      if (!controls.panel?.classList.contains("is-open")) return;
      if (event.target.closest("#mapSearchToggle") || event.target.closest("#layerMenuToggle")) setPanelOpen(false);
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        setMatchesOpen(false);
        if (controls.panel?.classList.contains("is-open")) setPanelOpen(false);
      }
    });
  }

  function boot(attempt = 0) {
    if (!getMap() && attempt < 40) {
      window.setTimeout(() => boot(attempt + 1), 100);
      return;
    }
    if (!getMap()) {
      setStatus("地圖尚未完成初始化，請重新整理後再試。", { error: true });
      return;
    }
    bindEvents();
  }

  boot();
})();
