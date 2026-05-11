const map = L.map("map", {
  preferCanvas: true,
  zoomControl: true,
  attributionControl: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const state = {
  meta: null,
  markers: L.layerGroup().addTo(map),
  labelLayer: L.layerGroup().addTo(map),
  selectedArea: "",
  searchText: "",
  requestId: 0,
  activePoint: null,
};

const summary = document.querySelector("#summary");
const statusBox = document.querySelector("#status");
const areaSelect = document.querySelector("#areaSelect");
const searchInput = document.querySelector("#searchInput");
const fitButton = document.querySelector("#fitButton");
const results = document.querySelector("#results");
const resultTemplate = document.querySelector("#resultTemplate");

const clusterIconCache = new Map();

function formatNumber(value) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function setStatus(text) {
  statusBox.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, wait = 260) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function boundsParams() {
  const bounds = map.getBounds();
  const size = map.getSize();
  return new URLSearchParams({
    south: bounds.getSouth().toFixed(7),
    west: bounds.getWest().toFixed(7),
    north: bounds.getNorth().toFixed(7),
    east: bounds.getEast().toFixed(7),
    zoom: String(map.getZoom()),
    width: String(size.x),
    height: String(size.y),
    area: state.selectedArea,
    q: state.searchText,
    limit: window.innerWidth < 760 ? "1000" : "2200",
  });
}

function clusterIcon(count) {
  const bucket =
    count >= 10000 ? "10000" : count >= 5000 ? "5000" : count >= 1000 ? "1000" : count >= 500 ? "500" : count >= 100 ? "100" : count >= 20 ? "20" : "small";
  if (clusterIconCache.has(bucket + count)) {
    return clusterIconCache.get(bucket + count);
  }

  const size = Math.max(28, Math.min(62, 24 + Math.log10(count + 1) * 15));
  const color = count >= 1000 ? "#bf4e30" : count >= 100 ? "#d88922" : "#087f8c";
  const icon = L.divIcon({
    className: "",
    html: `<div style="
      align-items:center;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 3px 12px rgba(0,0,0,.25);
      color:#fff;
      display:flex;
      font-size:12px;
      font-weight:800;
      height:${size}px;
      justify-content:center;
      width:${size}px;
    ">${count > 999 ? `${Math.round(count / 1000)}k` : count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  clusterIconCache.set(bucket + count, icon);
  return icon;
}

function pointIcon() {
  return L.circleMarker([0, 0], {
    radius: 5,
    color: "#ffffff",
    weight: 1.5,
    fillColor: "#087f8c",
    fillOpacity: 0.9,
  });
}

function googleNavUrl(item) {
  return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
}

function osmUrl(item) {
  return `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=18/${item.lat}/${item.lng}`;
}

function popupHtml(item) {
  if (item.type === "cluster") {
    return `
      <div class="popup-title">${formatNumber(item.count)} 筆設備</div>
      <div class="popup-meta">${escapeHtml(item.area || "未分類")} / 範例：${escapeHtml(item.sample || "")}</div>
      <div class="popup-meta">${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}</div>
    `;
  }
  return `
    <div class="popup-title">${escapeHtml(item.name || "未命名設備")}</div>
    <div class="popup-meta">圖號：${escapeHtml(item.code || "")}</div>
    <div class="popup-meta">區域：${escapeHtml(item.area || "")}</div>
    <div class="popup-meta">${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}</div>
    <div class="popup-actions">
      <a href="${googleNavUrl(item)}" target="_blank" rel="noopener">Google 導航</a>
      <a href="${osmUrl(item)}" target="_blank" rel="noopener">OSM 查看</a>
    </div>
  `;
}

function labelFor(item) {
  return L.marker([item.lat, item.lng], {
    interactive: true,
    keyboard: true,
    title: `${item.name || "設備"} 導航`,
    icon: L.divIcon({
      className: "point-label",
      html: `<a class="point-label-link" href="${googleNavUrl(item)}" target="_blank" rel="noopener">${escapeHtml(item.name || "")}</a>`,
      iconSize: null,
      iconAnchor: [-8, 20],
    }),
  });
}

function renderItems(payload) {
  state.markers.clearLayers();
  state.labelLayer.clearLayers();

  const showLabels = payload.mode === "points" && map.getZoom() >= 16 && payload.returned <= 1200;

  for (const item of payload.items) {
    if (item.type === "cluster") {
      const marker = L.marker([item.lat, item.lng], { icon: clusterIcon(item.count) });
      marker.bindPopup(popupHtml(item));
      marker.on("click", () => {
        map.flyTo([item.lat, item.lng], Math.min(map.getZoom() + 2, 17), { duration: 0.35 });
      });
      marker.addTo(state.markers);
      continue;
    }

    const marker = pointIcon();
    marker.setLatLng([item.lat, item.lng]);
    marker.bindPopup(popupHtml(item));
    marker.addTo(state.markers);
    if (showLabels) {
      labelFor(item).addTo(state.labelLayer);
    }
  }

  const modeText = payload.mode === "clusters" ? "聚合顯示" : showLabels ? "顯示實際點與標籤" : "顯示實際點";
  const clipped = payload.total > payload.returned ? `，目前繪製 ${formatNumber(payload.returned)} 個` : "";
  setStatus(`${modeText}：視窗內 ${formatNumber(payload.total)} 筆${clipped}`);
}

async function loadPoints() {
  if (!state.meta) return;
  const requestId = ++state.requestId;
  setStatus("讀取目前視窗資料...");
  const response = await fetch(`/api/points?${boundsParams().toString()}`);
  const payload = await response.json();
  if (requestId !== state.requestId) return;
  renderItems(payload);
}

const debouncedLoadPoints = debounce(loadPoints, 180);

function fitAll() {
  if (!state.meta?.bounds) return;
  map.fitBounds(state.meta.bounds, { padding: [26, 26] });
}

function fillAreas(areas) {
  for (const area of areas || []) {
    const option = document.createElement("option");
    option.value = area.name;
    option.textContent = `${area.name} (${formatNumber(area.count)})`;
    areaSelect.append(option);
  }
}

function showResults(items) {
  results.innerHTML = "";
  if (!items.length) {
    results.hidden = true;
    return;
  }

  for (const item of items) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    fragment.querySelector("strong").textContent = item.name || "未命名設備";
    fragment.querySelector("span").textContent = `${item.area || ""} / ${item.code || ""}`;
    button.addEventListener("click", () => {
      results.hidden = true;
      state.activePoint = item;
      map.flyTo([item.lat, item.lng], 17, { duration: 0.45 });
      L.popup().setLatLng([item.lat, item.lng]).setContent(popupHtml({ ...item, type: "point" })).openOn(map);
    });
    results.append(fragment);
  }
  results.hidden = false;
}

async function searchNow() {
  const q = searchInput.value.trim();
  state.searchText = q;
  if (q.length < 2) {
    results.hidden = true;
    debouncedLoadPoints();
    return;
  }
  const params = new URLSearchParams({
    q,
    area: state.selectedArea,
    limit: "20",
  });
  const response = await fetch(`/api/search?${params.toString()}`);
  const payload = await response.json();
  showResults(payload.items);
  debouncedLoadPoints();
}

const debouncedSearch = debounce(searchNow, 220);

async function init() {
  const response = await fetch("/api/meta");
  state.meta = await response.json();
  fillAreas(state.meta.areas);
  summary.textContent = `${formatNumber(state.meta.converted || state.meta.loaded)} 筆可用點位`;
  map.setView([23.7, 120.95], 8);
  fitAll();
  await loadPoints();
}

map.on("moveend zoomend", debouncedLoadPoints);
areaSelect.addEventListener("change", () => {
  state.selectedArea = areaSelect.value;
  results.hidden = true;
  debouncedLoadPoints();
});
searchInput.addEventListener("input", debouncedSearch);
fitButton.addEventListener("click", fitAll);

init().catch((error) => {
  console.error(error);
  setStatus("資料載入失敗，請確認已執行轉換程式並啟動 server.py");
});
