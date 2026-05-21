const portableMode = Boolean(window.PORTABLE_MAP_POINTS && window.PORTABLE_MAP_META);
const portableTiles = window.PORTABLE_TILE_MANIFEST || null;

const map = L.map("map", {
  preferCanvas: true,
  zoomControl: true,
  attributionControl: true,
});

if (portableMode && portableTiles) {
  L.tileLayer("tiles/{z}/{x}/{y}.png", {
    minZoom: portableTiles.minZoom,
    maxZoom: portableTiles.maxZoom,
    bounds: portableTiles.bounds,
    noWrap: true,
    attribution: portableTiles.attribution || "本機離線圖磚",
  }).addTo(map);
} else if (portableMode) {
  L.control.attribution({ prefix: "Leaflet" }).addAttribution("離線可攜版：道路底圖需網路").addTo(map);
} else {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
}

const SHOW_POINTS_ZOOM = 15;
const MAX_POINT_LABELS = 1200;
const MAX_DIRECT_POINTS = 3500;

const state = {
  points: [],
  meta: null,
  area: "",
  query: "",
  search: { prefixes: [], terms: [] },
  visiblePoints: [],
  drawnItems: [],
  equipmentColorMap: new Map(),
  displayMode: "prefix",
  prefixTotal: 0,
};

const totalCount = document.querySelector("#totalCount");
const visibleCount = document.querySelector("#visibleCount");
const drawCount = document.querySelector("#drawCount");
const statusBox = document.querySelector("#status");
const areaSelect = document.querySelector("#areaSelect");
const searchInput = document.querySelector("#searchInput");
const results = document.querySelector("#results");
const resultTemplate = document.querySelector("#resultTemplate");
const fitButton = document.querySelector("#fitButton");
const locateButton = document.querySelector("#locateButton");
const app = document.querySelector(".app");
const panel = document.querySelector("#panel");
const panelToggle = document.querySelector("#panelToggle");

let labelsLayer = L.layerGroup().addTo(map);
let locationMarker = null;
let locationCircle = null;
let locationWatchId = null;
let locationActive = false;
let locationHasCentered = false;

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

function debounce(fn, wait = 180) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function codePrefix(code) {
  const normalized = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^([A-Z]\d{4})/);
  return match ? match[1] : normalized.slice(0, 5) || "未知";
}

function parseSearchQuery(query) {
  const tokens = String(query || "")
    .trim()
    .split(/[.\s,，、;；|｜/／]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const prefixes = [];
  const terms = [];
  for (const token of tokens) {
    const normalized = token.toUpperCase();
    if (/^[A-Z]\d{4}$/.test(normalized)) {
      if (!prefixes.includes(normalized)) prefixes.push(normalized);
    } else {
      terms.push(token.toLowerCase());
    }
  }
  return { prefixes, terms };
}

function pointSearchText(point) {
  return `${point.name || ""} ${point.code || ""} ${codePrefix(point.code)}`.toLowerCase();
}

function hasSearchTerm(point, terms) {
  if (!terms.length) return false;
  const text = pointSearchText(point);
  return terms.some((term) => text.includes(term));
}

function matchesSearch(point, search) {
  if (!search.prefixes.length && !search.terms.length) return true;
  const prefix = codePrefix(point.code);
  return search.prefixes.includes(prefix) || hasSearchTerm(point, search.terms);
}

function pointInBounds(point, bounds) {
  return point.lat >= bounds.getSouth() && point.lat <= bounds.getNorth() && point.lng >= bounds.getWest() && point.lng <= bounds.getEast();
}

function matchesFilters(point) {
  if (state.area && point.area !== state.area) return false;
  return matchesSearch(point, state.search);
}

function visibleFilteredPoints() {
  const bounds = map.getBounds();
  const output = [];
  for (const point of state.points) {
    if (pointInBounds(point, bounds) && matchesFilters(point)) output.push(point);
  }
  return output;
}

function googleNavUrl(point) {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
}

function streetViewUrl(point) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`;
}

function popupHtml(point) {
  return `
    <div class="popup-title">${escapeHtml(point.name || "未命名設備")}</div>
    <div class="popup-meta">圖號：${escapeHtml(point.code || "")}</div>
    <div class="popup-meta">前綴：${escapeHtml(codePrefix(point.code))}</div>
    <div class="popup-meta">區域：${escapeHtml(point.area || "")}</div>
    <div class="popup-meta">${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</div>
    <div class="popup-actions">
      <a href="${googleNavUrl(point)}" target="_blank" rel="noopener">Google 導航</a>
      <a href="${streetViewUrl(point)}" target="_blank" rel="noopener">Google 街景</a>
    </div>
  `;
}

function buildPrefixItems(points) {
  const groups = new Map();
  for (const point of points) {
    const prefix = codePrefix(point.code);
    let group = groups.get(prefix);
    if (!group) {
      group = {
        type: "prefix",
        prefix,
        count: 0,
        latSum: 0,
        lngSum: 0,
        sample: point,
      };
      groups.set(prefix, group);
    }
    group.count += 1;
    group.latSum += point.lat;
    group.lngSum += point.lng;
  }

  return [...groups.values()]
    .map((group) => {
      const lat = group.latSum / group.count;
      const lng = group.lngSum / group.count;
      const pixel = map.latLngToContainerPoint([lat, lng]);
      return { ...group, lat, lng, x: pixel.x, y: pixel.y };
    })
    .sort((a, b) => b.count - a.count);
}

function buildPointItems(points) {
  return points.map((point) => {
    const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
    return { type: "point", point, x: pixel.x, y: pixel.y, count: 1 };
  });
}

function shouldShowPoints(points) {
  return map.getZoom() >= SHOW_POINTS_ZOOM && points.length <= MAX_DIRECT_POINTS;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

const PREFIX_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#be123c",
  "#c2410c",
  "#15803d",
  "#0369a1",
  "#a16207",
  "#6d28d9",
  "#0e7490",
  "#b45309",
  "#047857",
];
const UNKNOWN_EQUIPMENT_PREFIX = "未分類";
const UNKNOWN_EQUIPMENT_COLOR = "#64748b";
const LOCAL_COLOR_DISTANCE = 90;

function hashText(value) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function colorForPrefix(prefix) {
  return PREFIX_COLORS[hashText(prefix) % PREFIX_COLORS.length];
}

function equipmentNamePrefix(name) {
  const normalized = String(name || "").trim();
  const match = normalized.match(/^[\u3400-\u9fff]+/);
  return match ? match[0].slice(0, 4) : UNKNOWN_EQUIPMENT_PREFIX;
}

function buildEquipmentColorMap(items) {
  const groups = new Map();
  for (const item of items) {
    const prefix = equipmentNamePrefix(item.point.name);
    if (prefix === UNKNOWN_EQUIPMENT_PREFIX) continue;
    let group = groups.get(prefix);
    if (!group) {
      group = {
        prefix,
        count: 0,
        xSum: 0,
        ySum: 0,
        minX: item.x,
        maxX: item.x,
        minY: item.y,
        maxY: item.y,
        color: "",
      };
      groups.set(prefix, group);
    }
    group.count += 1;
    group.xSum += item.x;
    group.ySum += item.y;
    group.minX = Math.min(group.minX, item.x);
    group.maxX = Math.max(group.maxX, item.x);
    group.minY = Math.min(group.minY, item.y);
    group.maxY = Math.max(group.maxY, item.y);
  }

  const assignedGroups = [];
  const colorMap = new Map([[UNKNOWN_EQUIPMENT_PREFIX, UNKNOWN_EQUIPMENT_COLOR]]);
  const colorUse = new Map(PREFIX_COLORS.map((color) => [color, 0]));
  const sortedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      x: group.xSum / group.count,
      y: group.ySum / group.count,
    }))
    .sort((a, b) => b.count - a.count || naturalSorter.compare(a.prefix, b.prefix));

  for (const group of sortedGroups) {
    const nearbyColors = new Set();
    for (const other of assignedGroups) {
      const horizontalGap = Math.max(0, other.minX - group.maxX, group.minX - other.maxX);
      const verticalGap = Math.max(0, other.minY - group.maxY, group.minY - other.maxY);
      const distance = Math.hypot(horizontalGap, verticalGap);
      if (distance < LOCAL_COLOR_DISTANCE) nearbyColors.add(other.color);
    }
    const start = hashText(group.prefix) % PREFIX_COLORS.length;
    const rankedColors = PREFIX_COLORS.map((_, index) => PREFIX_COLORS[(start + index) % PREFIX_COLORS.length]).sort((a, b) => {
      const nearbyCompare = Number(nearbyColors.has(a)) - Number(nearbyColors.has(b));
      if (nearbyCompare !== 0) return nearbyCompare;
      return (colorUse.get(a) || 0) - (colorUse.get(b) || 0);
    });
    group.color = rankedColors[0];
    colorMap.set(group.prefix, group.color);
    colorUse.set(group.color, (colorUse.get(group.color) || 0) + 1);
    assignedGroups.push(group);
  }

  return colorMap;
}

function colorForEquipmentName(name) {
  const prefix = equipmentNamePrefix(name);
  return state.equipmentColorMap.get(prefix) || (prefix === UNKNOWN_EQUIPMENT_PREFIX ? UNKNOWN_EQUIPMENT_COLOR : colorForPrefix(prefix));
}

function placePrefixLabels(items) {
  const occupied = new Set();
  const output = [];
  const gridWidth = map.getZoom() <= 10 ? 52 : map.getZoom() <= 12 ? 44 : 36;
  const gridHeight = map.getZoom() <= 10 ? 28 : map.getZoom() <= 12 ? 24 : 20;
  for (const item of items) {
    const key = `${Math.floor(item.x / gridWidth)}:${Math.floor(item.y / gridHeight)}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    output.push(item);
    if (output.length >= 900) break;
  }
  return output;
}

const canvasLayer = L.Layer.extend({
  onAdd(currentMap) {
    this.canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
    this.canvas.style.pointerEvents = "none";
    this.context = this.canvas.getContext("2d");
    currentMap.getPanes().overlayPane.appendChild(this.canvas);
    currentMap.on("moveend zoomend resize", this.redraw, this);
    this.redraw();
  },
  onRemove(currentMap) {
    L.DomUtil.remove(this.canvas);
    currentMap.off("moveend zoomend resize", this.redraw, this);
  },
  redraw() {
    if (!this.canvas || !state.points.length) return;
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvas, topLeft);
    this.canvas.width = size.x;
    this.canvas.height = size.y;
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;

    const ctx = this.context;
    ctx.clearRect(0, 0, size.x, size.y);

    state.visiblePoints = visibleFilteredPoints();
    if (shouldShowPoints(state.visiblePoints)) {
      state.displayMode = "point";
      state.drawnItems = buildPointItems(state.visiblePoints);
      state.equipmentColorMap = buildEquipmentColorMap(state.drawnItems);
      drawPoints(ctx, state.drawnItems);
    } else {
      state.displayMode = "prefix";
      state.equipmentColorMap = new Map();
      state.drawnItems = placePrefixLabels(buildPrefixItems(state.visiblePoints));
      drawPrefixLabels(ctx, state.drawnItems);
    }

    updateLabels();
    updateStats();
  },
});

const renderer = new canvasLayer().addTo(map);

function drawPoints(ctx, items) {
  for (const item of items) {
    ctx.beginPath();
    ctx.arc(item.x, item.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = colorForEquipmentName(item.point.name);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.stroke();
  }
}

function drawPrefixLabels(ctx, items) {
  for (const item of items) {
    const label = `${item.prefix} · ${formatNumber(item.count)}`;
    const width = Math.max(74, Math.min(128, 28 + label.length * 7));
    const height = 30;
    const x = item.x - width / 2;
    const y = item.y - height / 2;
    const fill = colorForPrefix(item.prefix);

    ctx.shadowColor = "rgba(20, 34, 46, 0.24)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    roundedRect(ctx, x, y, width, height, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, item.x, item.y + 0.5);
    item.hitBox = { x, y, width, height };
  }
}

function updateStats() {
  totalCount.textContent = formatNumber(state.points.length);
  visibleCount.textContent = formatNumber(state.visiblePoints.length);
  drawCount.textContent = formatNumber(state.drawnItems.length);
  if (state.displayMode === "point") {
    setStatus(`點位標籤：視窗內 ${formatNumber(state.visiblePoints.length)} 筆，顯示 ${formatNumber(state.drawnItems.length)} 個點位；相近中文前綴會盡量避色，無中文前綴為灰色`);
  } else {
    setStatus(`圖號前綴：視窗內 ${formatNumber(state.visiblePoints.length)} 筆，顯示 ${formatNumber(state.drawnItems.length)} 個前綴標籤；顏色用來分辨前綴，筆數看標籤數字`);
  }
}

function updateLabels() {
  labelsLayer.clearLayers();
  if (state.displayMode !== "point" || state.visiblePoints.length > MAX_POINT_LABELS) return;
  for (const point of state.visiblePoints) {
    const labelColor = colorForEquipmentName(point.name);
    L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        className: "point-label",
        html: `<span class="point-label-chip" style="--label-color: ${labelColor}">${escapeHtml(point.name)}</span>`,
        iconSize: null,
        iconAnchor: [-8, 20],
      }),
    })
      .bindPopup(popupHtml(point))
      .addTo(labelsLayer);
  }
}

function fillAreas() {
  for (const area of state.meta.areas || []) {
    const option = document.createElement("option");
    option.value = area.name;
    option.textContent = `${area.name} (${formatNumber(area.count)})`;
    areaSelect.append(option);
  }
}

function fitAll() {
  if (!state.meta?.bounds) return;
  map.fitBounds(state.meta.bounds, { padding: [28, 28] });
}

const naturalSorter = new Intl.Collator("zh-Hant", {
  numeric: true,
  sensitivity: "base",
});

function comparePointsByName(a, b) {
  const aHasName = Boolean(String(a.name || "").trim().replaceAll("?", ""));
  const bHasName = Boolean(String(b.name || "").trim().replaceAll("?", ""));
  if (aHasName !== bHasName) return aHasName ? -1 : 1;
  const nameCompare = naturalSorter.compare(a.name || "", b.name || "");
  if (nameCompare !== 0) return nameCompare;
  return naturalSorter.compare(a.code || "", b.code || "");
}

function searchResultRank(point, search) {
  if (hasSearchTerm(point, search.terms)) return 0;
  if (search.prefixes.includes(codePrefix(point.code))) return 1;
  return 2;
}

function searchMatches(search) {
  if (!search.prefixes.length && !search.terms.some((term) => term.length >= 2)) return [];
  const output = [];
  for (const point of state.points) {
    if (state.area && point.area !== state.area) continue;
    if (matchesSearch(point, search)) {
      output.push(point);
    }
  }
  return output
    .sort((a, b) => {
      const rankCompare = searchResultRank(a, search) - searchResultRank(b, search);
      if (rankCompare !== 0) return rankCompare;
      return comparePointsByName(a, b);
    })
    .slice(0, 30);
}

function renderResults(items) {
  results.innerHTML = "";
  if (!items.length) {
    results.innerHTML = '<p class="popup-meta">可用 .、空白、逗號分隔關鍵字；多個關鍵字採任一符合，例如 Q1295.尖峰.安南。</p>';
    return;
  }

  for (const point of items) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector("button");
    fragment.querySelector("strong").textContent = point.name || "未命名設備";
    fragment.querySelector("span").textContent = `${point.area || ""} / ${point.code || ""} / ${codePrefix(point.code)}`;
    button.addEventListener("click", () => {
      setPanelCollapsed(true);
      map.flyTo([point.lat, point.lng], 17, { duration: 0.45 });
      L.popup().setLatLng([point.lat, point.lng]).setContent(popupHtml(point)).openOn(map);
    });
    results.append(fragment);
  }
}

function applyFilter() {
  state.area = areaSelect.value;
  state.query = searchInput.value.trim();
  state.search = parseSearchQuery(state.query);
  renderResults(searchMatches(state.search));
  renderer.redraw();
}

function hitTestPrefix(event) {
  if (state.displayMode !== "prefix") return null;
  return state.drawnItems.find((item) => {
    const box = item.hitBox;
    return box && event.containerPoint.x >= box.x && event.containerPoint.x <= box.x + box.width && event.containerPoint.y >= box.y && event.containerPoint.y <= box.y + box.height;
  });
}

function findNearestPoint(event) {
  if (state.displayMode !== "point" || !state.visiblePoints.length) return null;
  let best = null;
  let bestDistance = 16;
  for (const point of state.visiblePoints.slice(0, 6000)) {
    const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
    const distance = pixel.distanceTo(event.containerPoint);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function setLocateButton(active, loading = false) {
  locateButton.disabled = loading;
  locateButton.classList.toggle("is-active", active);
  locateButton.setAttribute("aria-pressed", String(active));
  locateButton.textContent = loading ? "定位中" : active ? "關閉定位" : "定位";
  locateButton.title = active ? "關閉目前位置顯示" : "定位目前位置";
}

function clearLocation() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  if (locationMarker) {
    map.removeLayer(locationMarker);
    locationMarker = null;
  }
  if (locationCircle) {
    map.removeLayer(locationCircle);
    locationCircle = null;
  }
  locationActive = false;
  locationHasCentered = false;
  setLocateButton(false);
  setStatus("已關閉目前位置顯示。");
}

function updateCurrentPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latlng = [latitude, longitude];
  if (!locationMarker) {
    locationMarker = L.circleMarker(latlng, {
      radius: 7,
      color: "#fff",
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
  locationActive = true;
  setLocateButton(true);
  if (!locationHasCentered) {
    locationHasCentered = true;
    map.flyTo(latlng, Math.max(map.getZoom(), 17), { duration: 0.45 });
  }
  setStatus(`定位已開啟，精準度約 ${Math.round(accuracy || 0)} 公尺；藍色圓圈為可能誤差範圍。`);
}

function toggleCurrentPosition() {
  if (locationActive || locationWatchId !== null) {
    clearLocation();
    return;
  }
  if (!navigator.geolocation) {
    setStatus("此瀏覽器不支援定位。");
    return;
  }
  locationHasCentered = false;
  setLocateButton(false, true);
  setStatus("正在啟動高精準度定位...");
  locationWatchId = navigator.geolocation.watchPosition(
    updateCurrentPosition,
    () => {
      setStatus("無法取得目前位置，請確認瀏覽器定位權限。");
      if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
      }
      setLocateButton(false);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  );
}

areaSelect.addEventListener("change", applyFilter);
searchInput.addEventListener("input", debounce(applyFilter, 180));
fitButton.addEventListener("click", fitAll);
locateButton.addEventListener("click", toggleCurrentPosition);
function setPanelCollapsed(collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  app.classList.toggle("is-panel-collapsed", collapsed);
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  panelToggle.title = collapsed ? "展開面板" : "收合面板";
  window.setTimeout(() => map.invalidateSize(), 220);
}

panelToggle.addEventListener("click", () => {
  setPanelCollapsed(!panel.classList.contains("is-collapsed"));
});

map.on("click", (event) => {
  const prefix = hitTestPrefix(event);
  if (prefix) {
    map.flyTo([prefix.lat, prefix.lng], Math.max(map.getZoom() + 2, SHOW_POINTS_ZOOM), { duration: 0.45 });
    return;
  }
  const point = findNearestPoint(event);
  if (point) L.popup().setLatLng([point.lat, point.lng]).setContent(popupHtml(point)).openOn(map);
});

async function init() {
  setStatus("載入 238,104 筆設備資料...");
  if (portableMode) {
    state.meta = window.PORTABLE_MAP_META;
    state.points = window.PORTABLE_MAP_POINTS;
  } else {
    const [metaResponse, pointsResponse] = await Promise.all([fetch("../data/meta.json"), fetch("../data/points.json")]);
    state.meta = await metaResponse.json();
    state.points = await pointsResponse.json();
  }
  state.prefixTotal = new Set(state.points.map((point) => codePrefix(point.code))).size;
  fillAreas();
  renderResults([]);
  map.setView([23.7, 120.95], 8);
  fitAll();
  renderer.redraw();
}

init().catch((error) => {
  console.error(error);
  setStatus("資料載入失敗，請確認是從 GitHub Pages、本機伺服器或 USB 可攜版開啟。");
});
