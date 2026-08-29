// 應用全域常數（從 indexV2.html 內聯主邏輯抽離，值完全不動）
export const STORAGE_KEY         = "taipower_inspection_v8_photos";
export const LEGACY_STORAGE_KEYS = ["taipower_inspection_v7", "taipower_inspection_v6", "taipower_inspection_v5"];
export const PHOTO_DB_NAME       = "taipower_inspection_photos_v2";
export const PHOTO_STORE_NAME    = "photos";
export const DRAFT_STORE_NAME    = "drafts";
export const APP_DATA_STORE_NAME = "appData";
export const DRAFT_ACTIVE_ID     = "active";
export const EQUIPMENT_CACHE_ID  = "equipment-cache";
export const BACKUP_SUMMARY_KEY  = "taipower_inspection_last_backup_v1";
export const BACKUP_FORMAT_VERSION = 3;
export const MAX_DIRECT_POINTS   = 3500;
export const MAX_ROUTE_POINTS    = 20000;

// 掛到全域，讓舊有內聯邏輯的 const 解構可沿用
window.STORAGE_KEY         = STORAGE_KEY;
window.LEGACY_STORAGE_KEYS = LEGACY_STORAGE_KEYS;
window.PHOTO_DB_NAME       = PHOTO_DB_NAME;
window.PHOTO_STORE_NAME    = PHOTO_STORE_NAME;
window.DRAFT_STORE_NAME    = DRAFT_STORE_NAME;
window.APP_DATA_STORE_NAME = APP_DATA_STORE_NAME;
window.DRAFT_ACTIVE_ID     = DRAFT_ACTIVE_ID;
window.EQUIPMENT_CACHE_ID  = EQUIPMENT_CACHE_ID;
window.BACKUP_SUMMARY_KEY  = BACKUP_SUMMARY_KEY;
window.BACKUP_FORMAT_VERSION = BACKUP_FORMAT_VERSION;
window.MAX_DIRECT_POINTS   = MAX_DIRECT_POINTS;
window.MAX_ROUTE_POINTS    = MAX_ROUTE_POINTS;
