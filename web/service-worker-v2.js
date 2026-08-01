const CACHE_NAME = "equipment-map-v2-photo-v1";
const APP_SHELL = "./indexV2.html";
const STATIC_ASSETS = [
  APP_SHELL,
  "./manifest-v2.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("equipment-map-v2-photo-") && key !== CACHE_NAME)
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
  if (!isV2Navigation) return;

  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL, response.clone()));
        return response;
      })
      .catch(() => caches.match(APP_SHELL))
  );
});
