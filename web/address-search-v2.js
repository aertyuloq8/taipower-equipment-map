(() => {
  "use strict";

  const INDEX_URL = "../data/addr-index.json";
  const VARIANTS_URL = "../data/addr-variants.json";
  const DISTRICT_DIR = "../data/addr";

  const controls = {
    panel: document.getElementById("v2AddressPanel"),
    toggle: document.getElementById("v2AddressToggle"),
    close: document.getElementById("v2AddressClose"),
    input: document.getElementById("addrSearchInput"),
    status: document.getElementById("addrSearchStatus"),
    results: document.getElementById("addrSearchResults"),
  };

  const state = {
    index: null,
    normTable: null,
    indexPromise: null,
    districtCache: new Map(),
    platesByKey: new Map(),
    marker: null,
    timer: null,
  };

  if (!controls.panel || !controls.toggle || !controls.input) return;

  function getMap() {
    return window.__v2LeafletMap || null;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[char]));
  }

  // ---------------- 正規化（與 tools/build_address_index.py 相同邏輯） ----------------
  function normalize(value) {
    const s = String(value || "").normalize("NFKC");
    const table = state.normTable;
    let out = "";
    for (const ch of s) out += (table && table[ch]) || ch;
    out = out.replace(/[()\[\]（）\s]+/g, "");
    out = out.replace(/[-–—－]/g, "之");
    return out.replace(/號/g, "");
  }

  // ---------------- 資料載入 ----------------
  function loadIndex() {
    if (state.indexPromise) return state.indexPromise;
    state.indexPromise = Promise.all([
      fetch(INDEX_URL).then(resp => {
        if (!resp.ok) throw new Error(`index ${resp.status}`);
        return resp.json();
      }),
      fetch(VARIANTS_URL).then(resp => {
        if (!resp.ok) throw new Error(`variants ${resp.status}`);
        return resp.json();
      }),
    ]).then(([index, variantData]) => {
      state.index = index;
      state.normTable = variantData.variants || {};
      return state.index;
    }).catch(error => {
      state.indexPromise = null;
      throw error;
    });
    return state.indexPromise;
  }

  function loadDistrict(code) {
    let promise = state.districtCache.get(code);
    if (!promise) {
      promise = fetch(`${DISTRICT_DIR}/${code}.json`).then(resp => {
        if (!resp.ok) throw new Error(`${code} ${resp.status}`);
        return resp.json();
      }).then(plates => {
        const districtName = state.index?.districts?.[code] || "";
        const prefix = normalize(`臺南市${districtName}`);
        return plates.map(plate => {
          const p = {
            r: plate.r,
            d: districtName,
            la: plate.la,
            ln: plate.ln,
            k: prefix + normalize(plate.r),
          };
          state.platesByKey.set(p.k, p);
          return p;
        });
      }).catch(error => {
        state.districtCache.delete(code);
        throw error;
      });
      state.districtCache.set(code, promise);
    }
    return promise;
  }

  // ---------------- 搜尋 ----------------
  function roadPrefixFor(q, roads) {
    if (!q) return "";
    if (roads.some(r => r.k.includes(q))) return q;
    for (let end = q.length - 1; end >= 2; end--) {
      const sub = q.slice(0, end);
      if (roads.some(r => r.k.includes(sub))) return sub;
    }
    return "";
  }

  async function performSearch() {
    const q = normalize(controls.input.value).trim();
    const resultsEl = controls.results;
    if (!q) {
      resultsEl.innerHTML = "";
      setStatus("");
      return;
    }
    const roads = state.index.roads || [];
    const prefix = roadPrefixFor(q, roads);
    if (!prefix) {
      resultsEl.innerHTML = `<p class="v2-address-empty">查無符合「${escapeHtml(q)}」的門牌。可試試路名或村里名，例如「竹子腳」「塩埕」；號碼中的「之」可用「-」代替（如 98-22）。</p>`;
      setStatus("查無結果");
      return;
    }
    const textLen = q.replace(/[0-9之]+/g, "").length;
    const unlimited = /[0-9]/.test(q) && textLen >= 2;
    const hitRoads = roads.filter(r => r.k.includes(prefix));
    const codes = [...new Set(hitRoads.map(r => r.d))];
    const selected = unlimited ? codes : codes.slice(0, 6);

    let plates = [];
    let plateCount = 0;
    try {
      const lists = [];
      for (let i = 0; i < selected.length; i++) {
        lists.push(await loadDistrict(selected[i]));
        if (selected.length > 3) setStatus(`載入門牌資料 ${i + 1}/${selected.length}…`);
      }
      const all = lists.flat();
      plates = all.filter(p => p.k.includes(q)).slice(0, 50);
      plateCount = all.reduce((n, p) => n + (p.k.includes(q) ? 1 : 0), 0);
    } catch (error) {
      console.error("門牌資料載入失敗", error);
      setStatus("門牌資料載入失敗，請稍後再試。");
      return;
    }

    renderResults(q, plates, plateCount, unlimited);
  }

  function renderResults(q, plates, plateCount, unlimited) {
    const resultsEl = controls.results;
    if (!plates.length) {
      resultsEl.innerHTML = `<p class="v2-address-empty">查無符合「${escapeHtml(q)}」的門牌${unlimited ? "。" : "。輸入門牌號碼（如 587）可跨區查詢。"}可試試路名或村里名；號碼中的「之」可用「-」代替（如 98-22）。</p>`;
      setStatus(unlimited ? "查無結果" : "請輸入門牌號碼");
      return;
    }
    let html = `<p class="v2-address-section">門牌（${plateCount}${plateCount > 50 ? "，顯示前 50" : ""}）</p>`;
    for (const plate of plates) {
      html += `<button type="button" class="v2-address-item" data-plate="${escapeHtml(plate.k)}">
        <span class="v2-address-item-name">${escapeHtml(plate.d)}${escapeHtml(plate.r)}</span>
      </button>`;
    }
    if (plateCount > 50) html += `<p class="v2-address-more">請繼續輸入門牌號碼縮小範圍。</p>`;
    resultsEl.innerHTML = html;
    setStatus(`門牌 ${plateCount} 筆`);
  }

  function setStatus(message) {
    controls.status.textContent = message;
  }

  // ---------------- 定位 ----------------
  function ensureMarker(map) {
    if (!state.marker) {
      state.marker = L.circleMarker([0, 0], {
        radius: 8,
        color: "#b91c1c",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: 0.95,
      }).addTo(map);
    }
    if (!map.hasLayer(state.marker)) state.marker.addTo(map);
    return state.marker;
  }

  function googleNavUrl(lat, lng) {
    const query = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function showPlate(map, plate) {
    const marker = ensureMarker(map);
    marker.setLatLng([plate.la, plate.ln]);
    map.flyTo([plate.la, plate.ln], Math.max(map.getZoom(), 18), { duration: 0.5 });
    const content = `<div class="v2-cadastre-popup">
        <strong>${escapeHtml(plate.d)}${escapeHtml(plate.r)}</strong>
        <br><span>門牌位置僅供參考，實際位置請依政府電子門牌為準</span>
        <div class="v2-cadastre-popup-actions">
          <a class="popup-navigation-link" href="${googleNavUrl(plate.la, plate.ln)}" target="_blank" rel="noopener">🗺️ 導航</a>
          <button class="popup-clear-location-button" type="button" onclick="window.__v2AddressClearMarker()">✕ 清除</button>
        </div>
      </div>`;
    marker.bindPopup(content, { autoPanPadding: [10, 10] });
    marker.on("click", () => marker.openPopup());
    window.setTimeout(() => marker.openPopup(), 520);
  }

  window.__v2AddressClearMarker = () => {
    const map = getMap();
    if (!map) return;
    map.closePopup();
    if (state.marker) {
      map.removeLayer(state.marker);
      state.marker = null;
    }
  };

  // ---------------- 面板開關 ----------------
  function closeOtherFloatingPanels() {
    const search = document.getElementById("mapSearchPanel");
    const searchToggle = document.getElementById("mapSearchToggle");
    const layerPanel = document.getElementById("layerMenuPanel");
    const layerToggle = document.getElementById("layerMenuToggle");
    const cadastrePanel = document.getElementById("v2CadastrePanel");
    const cadastreToggle = document.getElementById("v2CadastreToggle");
    search?.classList.remove("is-open");
    searchToggle?.classList.remove("is-active");
    searchToggle?.setAttribute("aria-expanded", "false");
    if (layerPanel) layerPanel.hidden = true;
    layerToggle?.classList.remove("is-active");
    layerToggle?.setAttribute("aria-expanded", "false");
    cadastrePanel?.classList.remove("is-open");
    cadastrePanel?.setAttribute("aria-hidden", "true");
    cadastreToggle?.classList.remove("is-active");
    cadastreToggle?.setAttribute("aria-expanded", "false");
  }

  function setPanelOpen(open) {
    if (!controls.panel || !controls.toggle) return;
    if (open && !controls.panel.classList.contains("is-open")) {
      const event = new CustomEvent("v2-address-open", { cancelable: true });
      if (!document.dispatchEvent(event)) return;
    }
    controls.panel.classList.toggle("is-open", open);
    controls.panel.setAttribute("aria-hidden", String(!open));
    controls.toggle.classList.toggle("is-active", open);
    controls.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      closeOtherFloatingPanels();
      controls.input.focus();
    }
  }

  document.addEventListener("v2-inspection-open", () => setPanelOpen(false));

  // ---------------- 事件 ----------------
  controls.toggle.addEventListener("click", () => {
    setPanelOpen(!controls.panel.classList.contains("is-open"));
  });
  controls.close?.addEventListener("click", () => setPanelOpen(false));

  controls.input.addEventListener("input", () => {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      if (!state.index) {
        setStatus("載入門牌資料中…");
        loadIndex().then(() => performSearch()).catch(error => {
          console.error("門牌索引載入失敗", error);
          setStatus("門牌資料載入失敗，請重新整理頁面。");
        });
        return;
      }
      performSearch();
    }, 250);
  });

  controls.input.addEventListener("keydown", event => {
    if (event.key === "Escape") setPanelOpen(false);
    if (event.key === "Enter") {
      const firstButton = controls.results.querySelector("button.v2-address-item");
      firstButton?.click();
    }
  });

  controls.results.addEventListener("click", event => {
    const button = event.target.closest("button.v2-address-item");
    if (!button || !button.dataset.plate) return;
    const map = getMap();
    if (!map) return;
    const plate = state.platesByKey.get(button.dataset.plate);
    if (!plate) return;
    showPlate(map, plate);
    setPanelOpen(false);
  });
})();