/**
 * IndexedDB inspection-records storage utility.
 * Uses the existing APP_DATA_STORE_NAME ("appData") object store
 * with key: "inspection-records".
 *
 * Dual-writes to localStorage for backward compatibility.
 */
const INSPECTION_IDB_KEY = "inspection-records";

async function getAppDb() {
  if (window.__appDb) return window.__appDb;
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
      window.__appDb = request.result;
      request.result.onversionchange = () => { window.__appDb = null; request.result.close(); };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("無法開啟 IndexedDB"));
  });
}

async function idbGetInspection() {
  const APP_DATA_STORE_NAME = window.APP_DATA_STORE_NAME || "appData";
  const db = await getAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_DATA_STORE_NAME, "readonly");
    const req = tx.objectStore(APP_DATA_STORE_NAME).get(INSPECTION_IDB_KEY);
    tx.oncomplete = () => resolve(req.result?.value ?? null);
    tx.onerror = () => reject(tx.error || req?.error);
  });
}

async function idbPutInspection(value) {
  const APP_DATA_STORE_NAME = window.APP_DATA_STORE_NAME || "appData";
  const db = await getAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_DATA_STORE_NAME, "readwrite");
    tx.objectStore(APP_DATA_STORE_NAME).put({ id: INSPECTION_IDB_KEY, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load inspection records from IndexedDB, falling back to localStorage.
 * Migrates to IndexedDB if only localStorage has data.
 */
export async function loadInspectionRecords(storageKey, legacyKeys) {
  // Try IndexedDB first
  try {
    const data = await idbGetInspection();
    if (data && Array.isArray(data.folders) && Array.isArray(data.records)) return data;
  } catch {}
  // Fallback: migrate from localStorage
  try {
    let dataStr = localStorage.getItem(storageKey);
    if (!dataStr) {
      dataStr = legacyKeys.map(key => localStorage.getItem(key)).find(Boolean) || null;
    }
    if (dataStr) {
      const parsed = JSON.parse(dataStr);
      if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.records)) {
        await saveInspectionRecords(storageKey, parsed);
        return parsed;
      }
    }
  } catch {}
  return null;
}

/**
 * Save inspection records to both IndexedDB and localStorage.
 */
export async function saveInspectionRecords(storageKey, data) {
  try { await idbPutInspection(data); } catch {}
  try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
}

// Expose to window for main.js
window.__inspectionDB = { loadInspectionRecords, saveInspectionRecords };
