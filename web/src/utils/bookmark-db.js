/**
 * IndexedDB bookmark storage utility.
 * Uses the existing APP_DATA_STORE_NAME ("appData") object store
 * with keys: "cadastre-bookmarks" and "address-bookmarks".
 *
 * Falls back to localStorage for backward compatibility.
 */
const BOOKMARK_KEYS = {
  cadastre: "cadastre-bookmarks",
  address: "address-bookmarks",
};

const LS_KEYS = {
  cadastre: "tp_cadastre_bookmarks_v1",
  address: "tp_address_bookmarks_v1",
};

async function getDb() {
  // Reuse shared handle from app-db.js to avoid dual-handle race condition
  if (window.__getSharedDb) return window.__getSharedDb();
  if (window.__bookmarkDb) return window.__bookmarkDb;
  const PHOTO_DB_NAME = window.PHOTO_DB_NAME || "taipower_inspection_photos_v2";
  const APP_DATA_STORE_NAME = window.APP_DATA_STORE_NAME || "appData";
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_DATA_STORE_NAME)) {
        db.createObjectStore(APP_DATA_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      window.__bookmarkDb = request.result;
      request.result.onversionchange = () => { window.__bookmarkDb = null; request.result.close(); };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("無法開啟 IndexedDB"));
  });
}

async function idbGet(key) {
  const APP_DATA_STORE_NAME = window.APP_DATA_STORE_NAME || "appData";
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_DATA_STORE_NAME, "readonly");
    const req = tx.objectStore(APP_DATA_STORE_NAME).get(key);
    tx.oncomplete = () => resolve(req.result?.value ?? null);
    tx.onerror = () => reject(tx.error || req?.error);
  });
}

async function idbPut(key, value) {
  const APP_DATA_STORE_NAME = window.APP_DATA_STORE_NAME || "appData";
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_DATA_STORE_NAME, "readwrite");
    tx.objectStore(APP_DATA_STORE_NAME).put({ id: key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load bookmarks from IndexedDB, falling back to localStorage.
 * Migrates to IndexedDB if only localStorage has data.
 */
async function loadBookmarks(type) {
  const idbKey = BOOKMARK_KEYS[type];
  const lsKey = LS_KEYS[type];
  let data = null;
  try { data = await idbGet(idbKey); } catch {}
  if (Array.isArray(data)) return data;
  // Fallback: migrate from localStorage
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey) || "[]");
    if (Array.isArray(raw) && raw.length > 0) {
      await saveBookmarks(type, raw);
      return raw;
    }
  } catch {}
  return [];
}

/**
 * Save bookmarks to both IndexedDB and localStorage (dual-write for safety).
 */
async function saveBookmarks(type, data) {
  const idbKey = BOOKMARK_KEYS[type];
  const lsKey = LS_KEYS[type];
  try { await idbPut(idbKey, data); } catch {}
  try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch {}
}

/**
 * Load bookmarks synchronously from localStorage (for initial render).
 */
function loadBookmarksSync(type) {
  const lsKey = LS_KEYS[type];
  try {
    const raw = JSON.parse(localStorage.getItem(lsKey) || "[]");
    return Array.isArray(raw) ? raw : null;
  } catch { return null; }
}

// Expose to window for non-module scripts (cadastre.js, address-search.js)
window.__bookmarkDB = { loadBookmarks, saveBookmarks, loadBookmarksSync };
window.__BOOKMARK_LS_KEYS = LS_KEYS;
