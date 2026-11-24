/**
 * 批次電表獨立照片儲存與浮水印模組 (Batch Photo IndexedDB Storage Module)
 * 專屬於批次電表巡檢外勤存證使用，徹底與 localStorage 及系統其他資料庫隔離 (Zero-Pollution)
 */
(() => {
  "use strict";

  const DB_NAME = "taipower_batch_meter_db";
  const DB_VERSION = 1;
  const STORE_NAME = "photos";

  let _dbPromise = null;

  function getDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("uid", "uid", { unique: false });
          store.createIndex("custNo", "custNo", { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          _dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        _dbPromise = null;
        reject(req.error || new Error("無法開啟批次照片資料庫"));
      };
    });
    return _dbPromise;
  }

  // 格式化當前時間字串：YYYY-MM-DD HH:mm:ss
  function formatNowTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // 載入圖片轉為 HTMLImageElement
  function loadImage(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err || new Error("圖片載入失敗"));
      };
      img.src = url;
    });
  }

  function formatCustNo(val) {
    if (!val) return "";
    const s = String(val).trim();
    const digits = s.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 11)}`;
    } else if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 9)}`;
    } else if (digits.length === 8) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 8)}`;
    }
    return s;
  }

  function wrapWatermarkSegments(ctx, segments, maxWidth) {
    const lines = [];
    let current = "";
    const pushCharWrapped = (str) => {
      let buf = "";
      for (const ch of str) {
        if (buf && ctx.measureText(buf + ch).width > maxWidth) {
          lines.push(buf);
          buf = ch;
        } else {
          buf += ch;
        }
      }
      return buf;
    };
    segments.filter(Boolean).forEach((seg) => {
      const candidate = current ? `${current} | ${seg}` : seg;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = ctx.measureText(seg).width <= maxWidth ? seg : pushCharWrapped(seg);
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  // 壓縮圖片並壓製現場防偽浮水印（自動依畫寬折行，確保長地址與經緯度完整顯示不裁切）
  async function compressAndWatermark(fileOrBlob, meta = {}) {
    const img = await loadImage(fileOrBlob);
    const maxSide = 1600; // 存檔與報表輸出之高畫質尺寸 (足供 13x18cm 巨幅列印)
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    // 繪製原始影像
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // 浮水印參數設定（電號統一套用 '-' 分段格式）
    const formattedCust = formatCustNo(meta.custNo);
    const custNoText = formattedCust ? `電號: ${formattedCust}` : "";
    const timeText = meta.timeStr || formatNowTime();
    const addrText = meta.addr ? `地址: ${meta.addr}` : "";
    const poleText = meta.pole ? `桿名: ${meta.pole}` : "";
    const codeText = meta.code ? `圖號: ${meta.code}` : "";
    const gpsText = meta.gps ? `GPS: ${meta.gps}` : "";

    // 依照畫布大小自適應字體尺寸與安全邊距
    const fontSize = Math.max(13, Math.round(targetW * 0.022));
    const subFontSize = Math.max(12, Math.round(fontSize * 0.88));
    const lineHeight1 = Math.round(fontSize * 1.38);
    const lineHeight2 = Math.round(subFontSize * 1.38);
    const padding = Math.max(10, Math.round(fontSize * 0.75));
    const maxTextW = Math.max(80, targetW - padding * 2);

    const font1 = `600 ${fontSize}px "Microsoft JhengHei", -apple-system, BlinkMacSystemFont, sans-serif`;
    const font2 = `400 ${subFontSize}px "Microsoft JhengHei", -apple-system, BlinkMacSystemFont, sans-serif`;

    ctx.font = font1;
    const lines1 = wrapWatermarkSegments(ctx, ["現場拍照", custNoText, `時間: ${timeText}`], maxTextW);

    ctx.font = font2;
    const lines2 = wrapWatermarkSegments(ctx, [addrText, codeText, poleText, gpsText], maxTextW);

    const boxH = padding * 2 + lines1.length * lineHeight1 + lines2.length * lineHeight2;
    const boxTop = Math.max(0, targetH - boxH);

    // 半透明黑底遮罩
    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    ctx.fillRect(0, boxTop, targetW, targetH - boxTop);

    // 醒目黃色標示線
    ctx.fillStyle = "#eab308";
    ctx.fillRect(0, boxTop, targetW, 3);

    // 繪製逐行文字
    ctx.textBaseline = "middle";
    let curY = boxTop + padding;

    ctx.font = font1;
    ctx.fillStyle = "#ffffff";
    lines1.forEach((line) => {
      ctx.fillText(line, padding, curY + lineHeight1 * 0.5);
      curY += lineHeight1;
    });

    ctx.font = font2;
    ctx.fillStyle = "#f3f4f6";
    lines2.forEach((line) => {
      ctx.fillText(line, padding, curY + lineHeight2 * 0.5);
      curY += lineHeight2;
    });

    // 轉換為 JPEG Blob (品質 0.85，兼顧清晰度與輕量)
    const blob = await new Promise((res) => {
      canvas.toBlob((b) => res(b), "image/jpeg", 0.85);
    });

    return {
      blob,
      width: targetW,
      height: targetH,
      size: blob.size,
      timeStr: timeText
    };
  }

  // 模組公開 API
  const BatchPhotoDB = {
    // 儲存照片 (支援電表照 "meter" 或現場照 "scene")
    async savePhoto(uid, custNo, type, fileOrBlob, meta = {}) {
      if (!uid) throw new Error("缺少唯一識別碼 (UID)");
      if (!type || (type !== "meter" && type !== "scene")) {
        throw new Error("照片類別必須為 'meter' 或 'scene'");
      }

      const mergedMeta = { ...meta, uid, custNo, type };
      const processed = await compressAndWatermark(fileOrBlob, mergedMeta);

      const record = {
        id: `${uid}_${type}`,
        uid,
        custNo: custNo || "",
        type,
        blob: processed.blob,
        width: processed.width,
        height: processed.height,
        size: processed.size,
        createdAt: Date.now(),
        timeStr: processed.timeStr,
        meta: mergedMeta
      };

      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
      });
    },

    // 取得單張照片
    async getPhoto(uid, type) {
      if (!uid || !type) return null;
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(`${uid}_${type}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    // 取得指定電表之雙槽照片 { meter: record|null, scene: record|null }
    async getPhotosForUid(uid) {
      if (!uid) return { meter: null, scene: null };
      const [meter, scene] = await Promise.all([
        this.getPhoto(uid, "meter"),
        this.getPhoto(uid, "scene")
      ]);
      return { meter, scene };
    },

    // 取得資料庫中全部照片記錄清單
    async getAllPhotos() {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    // 刪除指定照片
    async deletePhoto(uid, type) {
      if (!uid || !type) return;
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(`${uid}_${type}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // 刪除指定電表之所有照片
    async deletePhotosForUid(uid) {
      if (!uid) return;
      await Promise.all([
        this.deletePhoto(uid, "meter"),
        this.deletePhoto(uid, "scene")
      ]);
    },

    // 清空批次照片資料庫全部內容
    async clearAllPhotos() {
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // 批次匯入照片 (供雲端 Drive / ZIP 還原時使用)
    async importPhotoEntries(entries = []) {
      if (!Array.isArray(entries) || !entries.length) return 0;
      const db = await getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        let count = 0;
        for (const entry of entries) {
          if (entry && entry.id && entry.blob) {
            store.put(entry);
            count++;
          }
        }
        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
      });
    }
  };

  window.BatchPhotoDB = BatchPhotoDB;
})();
