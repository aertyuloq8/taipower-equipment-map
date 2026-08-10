const CACHE_NAME = "equipment-map-photo-edition-v2-r5";
const APP_SHELL = "./indexV2.html";
const STATIC_ASSETS = [
  APP_SHELL,
  "./manifest-v2.json",
  "./icon-192.png",
  "./icon-512.png",
  "./cadastre-config-v2.js",
  "./cadastre-v2.js",
  "./cadastre-v2.css",
  "../data/meta.json",
  "../data/points.json",
  "../data/cadastral-dropdowns-tw.json",
];
const REMOTE_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
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
    && new URL(request.url).pathname.endsWith("/indexV2.html");
  const url = new URL(request.url);
  const isEquipmentData = /\/data\/(meta|points|cadastral-dropdowns-tw)\.json$/.test(url.pathname);
  const isCadastreAsset = /\/cadastre-(config-v2|v2)\.(js|css)$/.test(url.pathname);
  const isRemoteAsset = REMOTE_ASSETS.some(asset => asset === request.url);
  if (!isV2Navigation && !isEquipmentData && !isCadastreAsset && !isRemoteAsset) return;

  event.respondWith(
    (isV2Navigation
      ? fetch(request, { cache: "no-store" })
          .then((response) => {
            if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL, response.clone()));
            return response;
          })
          .catch(() => caches.match(APP_SHELL))
      : (isEquipmentData || isCadastreAsset)
        ? fetch(request, { cache: "no-store" })
            .then((response) => {
              if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
              return response;
            })
            .catch(() => caches.match(request))
      : caches.match(request).then(cached => cached || fetch(request).then(response => {
          if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        })))
      .catch(() => new Response("", { status: 503, statusText: "Offline" }))
  );
});
