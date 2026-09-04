const CACHE_NAME = "equipment-map-photo-edition-r25";
const TILE_CACHE_NAME = "equipment-map-tiles-v1";
const TILE_CACHE_MAX = 2500;
const TILE_CACHE_TRIM = 2000;
const APP_SHELLS = ["./index.html"];
const STATIC_ASSETS = [
  ...APP_SHELLS,
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./cadastre-config.js",
  "./cadastre.js",
  "./cadastre.css",
  "./address-search.js",
  "./sync.js",
  "./archive-worker.js",
  // points.json 不預快取：由 Worker 以 networkFirst 載入，避免舊檔卡住
  "../data/meta.json",
  "../data/cadastral-dropdowns-tw.json",
];
const REMOTE_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        [...STATIC_ASSETS, ...REMOTE_ASSETS].map(asset => cache.add(asset).catch(error => {
          console.warn("離線資源快取失敗：", asset, error);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => (key.startsWith("equipment-map-v2-photo-") || key.startsWith("equipment-map-photo-edition-")) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const isV2Navigation = request.mode === "navigate"
    && (/\/index\.html$|\/indexV2\.html$/).test(new URL(request.url).pathname);
  const url = new URL(request.url);
  const isMetaData = /\/data\/meta\.json$/.test(url.pathname);
  const isPointsData = /\/data\/points\.json$/.test(url.pathname);
  const isDropdownData = /\/data\/cadastral-dropdowns-tw\.json$/.test(url.pathname);
  const isCadastreAsset = /\/cadastre(-config)?\.(js|css)$/.test(url.pathname);
  const isSyncAsset = /\/sync\.js$/.test(url.pathname);
  const isArchiveWorker = /\/archive-worker\.js$/.test(url.pathname);
  const isRemoteAsset = REMOTE_ASSETS.some(asset => asset === request.url);
  const isTileRequest = /^(https:\/\/wmts\.nlsc\.gov\.tw\/|https:\/\/[a-z]\.tile\.openstreetmap\.org\/)/.test(url.href);
  if (!isV2Navigation && !isMetaData && !isPointsData && !isDropdownData && !isCadastreAsset && !isSyncAsset && !isArchiveWorker && !isRemoteAsset && !isTileRequest) return;

  event.respondWith(
    (isV2Navigation
      ? fetch(request, { cache: "no-store" })
          .then((response) => {
            if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            return response;
          })
          .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
      : isPointsData
        // points.json：networkFirst + cacheFallback（Worker 載入用，確保拿最新）
        ? fetch(request, { cache: "no-store" })
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                return caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, clone))
                  .then(() => response)
                  .catch(() => response);
              }
              return response;
            })
            .catch(() => caches.match(request.url))
        : (isMetaData || isDropdownData || isCadastreAsset || isSyncAsset || isArchiveWorker)
        ? fetch(request, { cache: "no-store" })
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                return caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, clone))
                  .then(() => response)
                  .catch(() => response);
              }
              return response;
            })
            .catch(() => caches.match(request.url))
        : isTileRequest
          ? caches.open(TILE_CACHE_NAME)
              .then(cache => cache.match(request.url))
              .then(cached => cached || fetch(request).then((response) => {
                  if (response.ok) {
                    const clone = response.clone();
                    caches.open(TILE_CACHE_NAME).then((cache) => {
                      cache.put(request, clone).catch(() => {});
                      trimTileCache(cache);
                    });
                  }
                  return response;
                }))
          : caches.match(request.url).then(cached => cached || fetch(request).then(response => {
              if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
              return response;
            })))
      .catch(() => new Response("", { status: 503, statusText: "Offline" }))
  );
});

function trimTileCache(cache) {
  cache.keys().then((keys) => {
    if (keys.length <= TILE_CACHE_MAX) return;
    // keys 依插入順序，前面的最舊；保留最新的 TRIM 個，刪掉其餘舊的
    Promise.all(keys.slice(0, keys.length - TILE_CACHE_TRIM).map(key => cache.delete(key))).catch(() => {});
  }).catch(() => {});
}
