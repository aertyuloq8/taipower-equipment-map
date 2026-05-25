// ==========================================
// PWA 離線快取控制核心
// 負責在背景下載所需檔案，提供無網路時的基礎運作
// ==========================================

const CACHE_NAME = 'taipower-map-v1';

// 這裡列出斷網時也必須能讀取到的檔案
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // 快取 Leaflet 地圖套件與 SheetJS Excel 套件
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
];

// 安裝階段：將上述檔案存入手機快取
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 離線檔案已快取');
        return cache.addAll(urlsToCache);
      })
  );
  // 強制立即啟用新版本，不用等下次重開
  self.skipWaiting();
});

// 啟動階段：清除舊版快取，確保容量不浪費
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 清除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 攔截網路請求：斷網時優先從快取讀取
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取裡有，就回傳快取；沒有的話才去網路抓
        return response || fetch(event.request);
      })
  );
});