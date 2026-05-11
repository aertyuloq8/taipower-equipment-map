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
  points: null,
  staticMode: new URLSearchParams(window.location.search).has("static") || !["localhost", "127.0.0.1"].includes(window.location.hostname),
  markers: L.layerGroup().addTo(map),
  labelLayer: L.layerGroup().addTo(map),
  selectedArea: "",
  searchText: "",
  requestId: 0,
};

const summary = document.querySelector("#summary");
const statusBox = document.querySelector("#status");
const areaSelect = document.querySelector("#areaSelect");
const searchInput = document.querySelector("#searchInput");
const fitButton = document.querySelector("#fitButton");
const locateButton = document.querySelector("#locateButton");
const filterToggle = document.querySelector("#filterToggle");
const mapControls = document.querySelector("#mapControls");
const results = document.querySelector("#results");
const resultTemplate = document.querySelector("#resultTemplate");
const clusterIconCache = new Map();
let locationMarker = null;
let locationCircle = null;

function assetPath(path) {
  const prefix = window.location.pathname.includes("/web/") ? "../" : "";
  return `${prefix}${path}`;
}

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

function currentBounds() {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

function boundsParams() {
  const bounds = currentBounds();
  const size = map.getSize();
  return new URLSearchParams({
    south: bounds.south.toFixed(7),
    west: bounds.west.toFixed(7),
    north: bounds.north.toFixed(7),
    east: bounds.east.toFixed(7),
    zoom: String(map.getZoom()),
    width: String(size.x),
    height: String(size.y),
    area: state.selectedArea,
    q: state.searchText,
    limit: window.innerWidth < 760 ? "1000" : "2200",
  });
}

function pointInBounds(point, bounds) {
  return point.lat >= bounds.south && point.lat <= bounds.north && point.lng >= bounds.west && point.lng <= bounds.east;
}

function filteredStaticPoints(bounds = currentBounds()) {
  const query = state.searchText.trim().toLowerCase();
  return state.points.filter((point) => {
    if (!pointInBounds(point, bounds)) return false;
    if (state.selectedArea && point.area !== state.selectedArea) return false;
    if (query && !point.name.toLowerCase().includes(query) && !point.code.toLowerCase().includes(query)) return false;
    return true;
  });
}

function clusterStaticPoints(points) {
  const bounds = currentBounds();
  const size = map.getSize();
  const zoom = map.getZoom();
  const cellPx = zoom <= 10 ? 72 : zoom <= 12 ? 60 : 48;
  const latCell = Math.max((bounds.north - bounds.south) / Math.max(1, size.y / cellPx), 0.00008);
  const lngCell = Math.max((bounds.east - bounds.west) / Math.max(1, size.x / cellPx), 0.00008);
  const buckets = new Map();

  for (const point of points) {
    const key = `${Math.floor(point.lat / latCell)}:${Math.floor(point.lng / lngCell)}`;
    const cluster = buckets.get(key);
    if (cluster) {
      cluster.count += 1;
      cluster.latSum += point.lat;
      cluster.lngSum += point.lng;
      continue;
    }
    buckets.set(key, {
      type: "cluster",
      count: 1,
      latSum: point.lat,
      lngSum: point.lng,
      sample: point.name,
      area: point.area,
    });
  }

  return [...buckets.values()].map((cluster) => ({
    type: "cluster",
    count: cluster.count,
    lat: cluster.latSum / cluster.count,
    lng: cluster.lngSum / cluster.count,
    sample: cluster.sample,
    area: cluster.area,
  }));
}

function staticPointsPayload() {
  const zoom = map.getZoom();
  const limit = window.innerWidth < 760 ? 1000 : 2200;
  const filtered = filteredStaticPoints();

  if (zoom >= 15 || filtered.length <= limit) {
    return {
      mode: "points",
      total: filtered.length,
      returned: Math.min(filtered.length, limit),
      items: filtered.slice(0, limit).map((point) => ({ ...point, type: "point" })),
    };
  }

  let clusters = clusterStaticPoints(filtered);
  if (clusters.length > limit) {
    clusters = clusters.sort((a, b) => b.count - a.count).slice(0, limit);
  }
  return {
    mode: "clusters",
    total: filtered.length,
    returned: clusters.length,
    items: clusters,
  };
}

function clusterIcon(count) {
  const bucket =
    count >= 10000 ? "10000" : count >= 5000 ? "5000" : count >= 1000 ? "1000" : count >= 500 ? "500" : count >= 100 ? "100" : count >= 20 ? "20" : "small";
  const cacheKey = `${bucket}:${count}`;
  if (clusterIconCache.has(cacheKey)) return clusterIconCache.get(cacheKey);

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
  clusterIconCache.set(cacheKey, icon);
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
  const marker = L.marker([item.lat, item.lng], {
    interactive: true,
    keyboard: true,
    title: item.name || "設備",
    icon: L.divIcon({
      className: "point-label",
      html: `<span class="point-label-text">${escapeHtml(item.name || "")}</span>`,
      iconSize: null,
      iconAnchor: [-8, 20],
    }),
  });
  marker.bindPopup(popupHtml(item));
  marker.on("click", () => marker.openPopup());
  return marker;
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
    if (showLabels) labelFor(item).addTo(state.labelLayer);
  }

  const modeText = payload.mode === "clusters" ? "聚合顯示" : showLabels ? "顯示實際點與標籤" : "顯示實際點";
  const clipped = payload.total > payload.returned ? `，目前繪製 ${formatNumber(payload.returned)} 個` : "";
  setStatus(`${modeText}：視窗內 ${formatNumber(payload.total)} 筆${clipped}`);
}

async function loadPoints() {
  if (!state.meta) return;
  const requestId = ++state.requestId;
  setStatus("讀取目前視窗資料...");

  let payload;
  if (state.staticMode) {
    payload = staticPointsPayload();
  } else {
    const response = await fetch(`/api/points?${boundsParams().toString()}`);
    payload = await response.json();
  }

  if (requestId !== state.requestId) return;
  renderItems(payload);
}

const debouncedLoadPoints = debounce(loadPoints, 180);

function fitAll() {
  if (!state.meta?.bounds) return;
  map.fitBounds(state.meta.bounds, { padding: [26, 26] });
}

function fillAreas(areas) {
  areaSelect.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
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
      map.flyTo([item.lat, item.lng], 17, { duration: 0.45 });
      L.popup().setLatLng([item.lat, item.lng]).setContent(popupHtml({ ...item, type: "point" })).openOn(map);
    });
    results.append(fragment);
  }
  results.hidden = false;
}

function searchStaticItems(q) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const matches = [];
  for (const point of state.points) {
    if (state.selectedArea && point.area !== state.selectedArea) continue;
    if (point.name.toLowerCase().includes(query) || point.code.toLowerCase().includes(query)) {
      matches.push(point);
      if (matches.length >= 20) break;
    }
  }
  return matches;
}

async function searchNow() {
  const q = searchInput.value.trim();
  state.searchText = q;
  if (q.length < 2) {
    results.hidden = true;
    debouncedLoadPoints();
    return;
  }

  if (state.staticMode) {
    showResults(searchStaticItems(q));
  } else {
    const params = new URLSearchParams({ q, area: state.selectedArea, limit: "20" });
    const response = await fetch(`/api/search?${params.toString()}`);
    const payload = await response.json();
    showResults(payload.items);
  }
  debouncedLoadPoints();
}

const debouncedSearch = debounce(searchNow, 220);

function setControlsOpen(open) {
  mapControls.classList.toggle("is-open", open);
  filterToggle.setAttribute("aria-expanded", String(open));
}

function locateCurrentPosition() {
  if (!navigator.geolocation) {
    setStatus("此瀏覽器不支援目前位置定位。");
    return;
  }

  locateButton.disabled = true;
  setStatus("正在定位目前位置...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const latlng = [latitude, longitude];
      if (!locationMarker) {
        locationMarker = L.circleMarker(latlng, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 0.95,
        }).addTo(map);
      } else {
        locationMarker.setLatLng(latlng);
      }

      if (!locationCircle) {
        locationCircle = L.circle(latlng, {
          radius: accuracy || 30,
          color: "#2563eb",
          weight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        locationCircle.setLatLng(latlng);
        locationCircle.setRadius(accuracy || 30);
      }

      locationMarker.bindPopup(`<div class="popup-title">目前位置</div><div class="popup-meta">精準度：約 ${Math.round(accuracy || 0)} 公尺</div>`).openPopup();
      map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 0.45 });
      setStatus(`已定位目前位置，精準度約 ${Math.round(accuracy || 0)} 公尺。`);
      locateButton.disabled = false;
    },
    () => {
      setStatus("無法取得目前位置，請確認瀏覽器定位權限已允許。");
      locateButton.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    },
  );
}

async function loadStaticData() {
  setStatus("第一次載入 GitHub Pages 資料，請稍候...");
  const [metaResponse, pointsResponse] = await Promise.all([fetch(assetPath("data/meta.json")), fetch(assetPath("data/points.json"))]);
  state.meta = await metaResponse.json();
  state.points = await pointsResponse.json();
}

async function init() {
  if (state.staticMode) {
    await loadStaticData();
  } else {
    const response = await fetch("/api/meta");
    state.meta = await response.json();
  }

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
locateButton.addEventListener("click", locateCurrentPosition);
filterToggle.addEventListener("click", () => {
  setControlsOpen(!mapControls.classList.contains("is-open"));
});

init().catch((error) => {
  console.error(error);
  setStatus("資料載入失敗，請確認 data/points.json 是否存在，或本機 server.py 是否正在執行。");
});
