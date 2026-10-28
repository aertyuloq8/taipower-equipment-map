/**
 * 批次電表清單標記模組 (Batch Meter Marker Module)
 * 專為台電抄表、換表、抽查、巡檢等任務打造之高階批次定位工具
 *
 * 核心功能：
 * 1. 智慧分流：
 *    - 有路名門牌地址 ➔ 國土測繪 (NLSC) 電子門牌定位用戶住家
 *    - 地號地址（段/小段/號）➔ 台電 CPS 圖號座標秒級反推現場電桿
 *    - 門牌查無結果 ➔ 自動由圖號座標保底定位，確保 100% 定位
 * 2. 視野淨化與醒目標註：
 *    - 自動隱藏底圖設備文字標籤，突顯批次解析之地址定位標記
 *    - 每顆電表浮動顯示專屬清晰標籤（#1 地址/電號/桿名）
 * 3. 電腦到手機無縫轉移：
 *    - 📱 產生 QR Code：手機相機一掃秒開，免登入免傳檔立即開始導航
 *    - ☁️ Google Drive 雲端同步：支援上傳至 Drive 與從 Drive 還原
 *    - ⭐ 轉存門牌收藏：一鍵併入現有門牌收藏體系
 */
(() => {
  "use strict";

  function showToast(msg, type) {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
      padding: "10px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: "700",
      color: "#fff", zIndex: "99999", opacity: "0", transition: "opacity 0.3s ease",
      pointerEvents: "none", maxWidth: "90vw", textAlign: "center",
      background: type === "error" ? "#dc2626" : type === "dup" ? "#d97706" : "#0f766e",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 2400);
  }

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[c]));
  }

  function getMap() {
    const candidate = window.__v2LeafletMap || window.map;
    return candidate && typeof candidate.getPane === "function" ? candidate : null;
  }

  // 導航連結：100% 與台南巡檢設備、門牌導航一致，直接以 WGS84 精確座標傳入 Google Maps
  function googleNavUrl(lat, lng) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    const query = (Number.isFinite(nLat) && Number.isFinite(nLng))
      ? `${nLat.toFixed(6)},${nLng.toFixed(6)}`
      : `${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  // 門牌與設備導航統一依座標導航，徹底確保現場點位精準直達
  function googleAddrNavUrl(addr, lat, lng) {
    return googleNavUrl(lat, lng);
  }

  // 依位數格式化電號顯示（11位: 00-00-0000-00-0、9位: 00-0000-00-0、8位: 00-0000-00）
  // 僅供介面顯示使用，底層原始資料完全不變動
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

  // 取得該筆記錄之完整自訂欄位清單（過濾掉頂部已常駐顯示之核心基礎欄位）
  function getAllCustomFields(r) {
    if (!r) return [];
    const list = [];
    const seen = new Set();
    const skipKeys = new Set([
      "電號", "custno", "用電地址", "地址", "addr", "address",
      "土木設備", "桿名", "設備", "pole", "圖號座標", "圖號", "code", "定位型態"
    ]);

    if (r.extra && typeof r.extra === "object") {
      for (const [k, v] of Object.entries(r.extra)) {
        const cleanK = String(k || "").trim();
        const cleanV = String(v ?? "").trim();
        if (!cleanK || !cleanV) continue;
        if (skipKeys.has(cleanK.toLowerCase()) || skipKeys.has(cleanK)) continue;
        seen.add(cleanK);
        list.push({ key: cleanK, val: cleanV });
      }
    }

    // 補齊可能未在 extra 但已解析出之 meterNo 或 inspectTerm
    if (r.meterNo && !seen.has("電表表號") && !seen.has("表號")) {
      list.push({ key: "電表表號", val: String(r.meterNo).trim() });
    }
    if (r.inspectTerm && !seen.has("檢定期限") && !seen.has("檢定")) {
      list.push({ key: "檢定期限", val: String(r.inspectTerm).trim() });
    }

    return list;
  }

  async function ensureXLSX() {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error("無法載入 Excel 處理模組"));
      document.head.appendChild(script);
    });
  }

  // 判定是否為「地號」（例如：永就段911號、新化段太子廟小段2334號、唪口段1532號）
  function isLandParcelAddress(addr) {
    if (!addr) return false;
    const s = String(addr).normalize("NFKC").trim();
    // 含有「段」、「小段」或「地號」，且「沒有」路、街、大道
    if (/(?:段|小段|地號)/.test(s)) {
      if (!/(?:路|街|大道)/.test(s)) return true;
    }
    // 含有縣市區後直接接地段號（無一般路名）
    if (!/(?:路|街|巷|弄|大道)/.test(s) && /(?:段|小段)/.test(s)) {
      return true;
    }
    return false;
  }

  // 電子門牌經緯度查詢（支援 Adapter 與 GAS JSONP 雙通道）
  function gasJsonpDoorplate(addr) {
    return new Promise((resolve) => {
      const gasBase = String(window.CADASTRE_GAS_URL || "").trim();
      if (!gasBase) return resolve(null);
      const cb = `__bm_gas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => { cleanup(); resolve(null); }, 8000);
      const cleanup = () => {
        try { delete window[cb]; } catch (e) {}
        script.remove();
        clearTimeout(timer);
      };
      window[cb] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => { cleanup(); resolve(null); };
      const usp = new URLSearchParams({ action: "addrGeo", word: addr, callback: cb });
      script.src = gasBase + "?" + usp.toString();
      document.head.appendChild(script);
    });
  }

  // 建立門牌與桿號查詢快取，避免重複地址反覆呼叫網路
  const doorplateCache = new Map();
  const poleSearchCache = new Map();

  const digitToChinese = {
    "1": "一", "2": "二", "3": "三", "4": "四", "5": "五",
    "6": "六", "7": "七", "8": "八", "9": "九", "10": "十"
  };

  function cleanAddrStr(s) {
    let str = String(s || "").normalize("NFKC")
      .replace(/[台臺]/g, "台")
      .replace(/[腳脚]/g, "腳")
      .replace(/[峰峯]/g, "峰")
      .replace(/[庄莊]/g, "庄")
      .replace(/[館舘]/g, "館")
      .replace(/[廓廍]/g, "廍")
      .replace(/[溝沟]/g, "溝")
      .replace(/[灣湾]/g, "灣")
      .replace(/[()\[\]（）\s]+/g, "");

    // 支援「第1段 / 第一段」去除「第」字
    str = str.replace(/第([一二三四五六七八九十\d]+)段/g, "$1段");
    // 將阿拉伯數字段 (1段~10段) 自動轉換為國字段 (一段~十段)，100% 契合內政部國土測繪圖資
    str = str.replace(/([1-9]|10)段/g, (_, num) => `${digitToChinese[num]}段`);

    return str;
  }

  function extractCountyDistrict(addr) {
    const norm = cleanAddrStr(addr);
    let county = "";
    let district = "";

    const cm = norm.match(/(台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/);
    if (cm) {
      county = cm[1];
      const rest = norm.slice(cm.index + cm[1].length);
      const dm = rest.match(/^([^市縣]+?[區鄉鎮市])/);
      if (dm) district = dm[1];
    } else {
      const dm = norm.match(/^([^市縣]+?[區鄉鎮市])/);
      if (dm) district = dm[1];
    }
    return { county, district };
  }

  function extractStreetOrVillage(addr) {
    let s = cleanAddrStr(addr);
    s = s.replace(/^.*?[縣市]/, "").replace(/^.*?[區鄉鎮市]/, "");
    s = s.replace(/^.*?里(?:\d+鄰)?/, "");
    s = s.replace(/\d.*$/, "");
    return s;
  }

  function extractDoorplateNumber(addr) {
    let s = cleanAddrStr(addr).replace(/\d+鄰/g, "");
    // 1. 帶子號：例如 47-1號、47號之1、47號-1、47之1號
    const mSub = s.match(/(\d+)(?:號[-－之]|[-－之])(\d+)(?:號)?/);
    if (mSub) {
      return { parent: mSub[1], sub: mSub[2], full: `${mSub[1]}-${mSub[2]}` };
    }
    // 2. 標準單號：例如 47號、311號 (排除 363巷、36弄 等巷弄干擾)
    const mSingle = s.match(/(\d+)號/);
    if (mSingle) {
      return { parent: mSingle[1], sub: "", full: mSingle[1] };
    }
    // 3. 無「號」字保底：取末尾數字 (例如 洋子20)
    const mTrailing = s.match(/(\d+)(?:[-－之](\d+))?$/);
    if (mTrailing) {
      return { parent: mTrailing[1], sub: mTrailing[2] || "", full: mTrailing[2] ? `${mTrailing[1]}-${mTrailing[2]}` : mTrailing[1] };
    }
    return null;
  }

  function canonicalAddr(s) {
    let str = cleanAddrStr(s);
    str = str.replace(/[^區鄉鎮市]+?里(?:\d+鄰)?/g, "");
    str = str.replace(/(\d+)號[-－之](\d+)(?:號)?/g, "$1-$2號");
    str = str.replace(/(\d+)[-－之](\d+)號?/g, "$1-$2號");
    str = str.replace(/[號].*?(?:[一二三四五六七八九十\d]+(?:[-－至到、][一二三四五六七八九十\d]+)?(?:樓|層|[Ff])).*$/g, "號");
    str = str.replace(/(?:[一二三四五六七八九十\d]+(?:[-－至到、][一二三四五六七八九十\d]+)?(?:樓|層|[Ff])).*$/g, "");
    str = str.replace(/號.*$/g, "");
    return str;
  }

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findBestDoorplateMatch(rawAddr, results, expectedPt) {
    if (!Array.isArray(results) || results.length === 0) return null;
    const { county, district } = extractCountyDistrict(rawAddr);
    const targetCanonical = canonicalAddr(rawAddr);
    const targetStreet = extractStreetOrVillage(rawAddr);
    const targetNum = extractDoorplateNumber(rawAddr);

    if (!targetNum) return null;

    // 1. 第一優先：同縣市區、路/地名相符，且標準化門牌完全相符（含異體字、子號 158-3、80-11、98-1 等）
    for (const item of results) {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const itemAddr = cleanAddrStr(item.address);
      if (county && !itemAddr.includes(county)) continue;
      if (district && !itemAddr.includes(district)) continue;
      if (canonicalAddr(item.address) === targetCanonical) {
        if (expectedPt && getDistanceKm(item.y, item.x, expectedPt.lat, expectedPt.lng) > 0.3) {
          console.warn(`[Batch] 門牌與現場電桿相差 ${getDistanceKm(item.y, item.x, expectedPt.lat, expectedPt.lng).toFixed(2)} km，自動以電桿現場為準`);
          return null; // 回傳 null 自動觸發保底使用現場電桿圖號定位
        }
        return item;
      }
    }

    // 2. 第二優先：同縣市區、路/地名相符，完整號碼一致（例如「158號之3」比對「158-3號」）
    for (const item of results) {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const itemAddr = cleanAddrStr(item.address);
      if (county && !itemAddr.includes(county)) continue;
      if (district && !itemAddr.includes(district)) continue;
      if (targetStreet && !itemAddr.includes(targetStreet)) continue;

      const itemNum = extractDoorplateNumber(item.address);
      if (itemNum && itemNum.full === targetNum.full) {
        if (expectedPt && getDistanceKm(item.y, item.x, expectedPt.lat, expectedPt.lng) > 0.3) {
          continue;
        }
        return item;
      }
    }

    // 3. 第三優先：母號相同（例如查詢 91號，回傳 91號之1），且距離現場電桿 <= 300 公尺
    for (const item of results) {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const itemAddr = cleanAddrStr(item.address);
      if (county && !itemAddr.includes(county)) continue;
      if (district && !itemAddr.includes(district)) continue;
      if (targetStreet && !itemAddr.includes(targetStreet)) continue;

      const itemNum = extractDoorplateNumber(item.address);
      if (itemNum && itemNum.parent === targetNum.parent) {
        if (expectedPt && getDistanceKm(item.y, item.x, expectedPt.lat, expectedPt.lng) > 0.3) {
          continue;
        }
        return item;
      }
    }

    // 4. 嚴格安全原則：母號若不相同（如查 9號 卻只有 43號），或偏差逾 300 公尺，嚴禁採用別家門牌！
    return null;
  }

  async function geocodeDoorplate(addr, expectedPt) {
    const cleanAddr = cleanAddrStr(addr);
    if (!cleanAddr) return null;

    if (doorplateCache.has(cleanAddr)) {
      const cached = doorplateCache.get(cleanAddr);
      if (cached && expectedPt && getDistanceKm(cached.lat, cached.lng, expectedPt.lat, expectedPt.lng) > 0.3) {
        return null;
      }
      return cached;
    }

    // 優先管道：GAS JSONP 經由代理向內政部國土測繪圖資查詢（無 CORS 限制）
    try {
      const data = await gasJsonpDoorplate(cleanAddr);
      if (data && (data.ok || Array.isArray(data.results)) && Array.isArray(data.results) && data.results.length > 0) {
        const item = findBestDoorplateMatch(cleanAddr, data.results, expectedPt);
        if (item && Number.isFinite(item.x) && Number.isFinite(item.y)) {
          const res = { lat: item.y, lng: item.x, fullAddr: item.address || cleanAddr };
          doorplateCache.set(cleanAddr, res);
          return res;
        }
      }
    } catch (e) {
      console.warn("門牌查詢失敗：", e.message);
    }
    doorplateCache.set(cleanAddr, null);
    return null;
  }

  // 自動解析 Excel 複製出來的文字 (TSV/CSV/Tab 分隔)
  function parseBatchInputText(text) {
    if (!text || typeof text !== "string") return [];

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) return [];

    const firstLine = lines[0];
    const isTab = firstLine.includes("\t");
    const delimiter = isTab ? "\t" : (firstLine.includes(",") ? "," : /\s+/);

    const rows = lines.map(l => {
      if (delimiter instanceof RegExp) {
        return l.split(delimiter);
      }
      return l.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ""));
    });

    let headerIdx = -1;
    let custNoCol = -1;
    let addrCol = -1;
    let poleCol = -1;
    let codeCol = -1;
    let meterNoCol = -1;
    let termCol = -1;

    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const row = rows[i];
      const joined = row.join(" ");
      if (/(?:電號|地址|圖號|座標|表號|土木|桿|設備)/.test(joined)) {
        headerIdx = i;
        row.forEach((col, cIdx) => {
          const c = col.replace(/\s+/g, "");
          if (c.includes("電號")) custNoCol = cIdx;
          else if (c.includes("地址")) addrCol = cIdx;
          else if (c.includes("桿") || c.includes("土木") || c.includes("設備") || c.includes("變壓器") || c.includes("亭置") || c.includes("開關") || c.includes("箱體") || c.includes("支號")) poleCol = cIdx;
          else if (c.includes("圖號") || c.includes("座標")) codeCol = cIdx;
          else if (c.includes("表號")) meterNoCol = cIdx;
          else if (c.includes("檢定") || c.includes("期限")) termCol = cIdx;
        });
        break;
      }
    }

    const dataRows = headerIdx !== -1 ? rows.slice(headerIdx + 1) : rows;
    const records = [];

    for (const r of dataRows) {
      if (!r || !r.length) continue;

      let custNo = "";
      let addr = "";
      let pole = "";
      let code = "";
      let meterNo = "";
      let inspectTerm = "";

      if (custNoCol !== -1 && r[custNoCol]) custNo = r[custNoCol];
      if (addrCol !== -1 && r[addrCol]) addr = r[addrCol];
      if (poleCol !== -1 && r[poleCol]) pole = r[poleCol];
      if (codeCol !== -1 && r[codeCol]) code = r[codeCol];
      if (meterNoCol !== -1 && r[meterNoCol]) meterNo = r[meterNoCol];
      if (termCol !== -1 && r[termCol]) inspectTerm = r[termCol];

      // 智慧備援推斷
      if (addrCol === -1 || !addr) {
        for (const col of r) {
          if (/(?:市|縣|區|鄉|鎮|路|街|巷|段)/.test(col) && col.length >= 4) {
            addr = col;
            break;
          }
        }
      }

      if (codeCol === -1 || !code) {
        for (const col of r) {
          const m = col.match(/[A-HJ-Z]\d{4}[A-HJ-Z]{2}\d{2,4}/i);
          if (m) {
            code = m[0].toUpperCase();
            break;
          }
        }
      }

      if (custNoCol === -1 || !custNo) {
        for (const col of r) {
          if (/^\d{11}$/.test(col)) {
            custNo = col;
            break;
          }
        }
      }

      // 智慧備援推斷桿名 (土木設備)
      if (poleCol === -1 || !pole) {
        for (let colIdx = 0; colIdx < r.length; colIdx++) {
          if (colIdx === custNoCol || colIdx === addrCol || colIdx === codeCol || colIdx === meterNoCol || colIdx === termCol) continue;
          const col = r[colIdx];
          if (!col || typeof col !== "string") continue;
          const s = col.trim();
          if (s.length < 2 || s.length > 25) continue;
          if (/^\d+$/.test(s) || /^[A-Za-z0-9]+$/.test(s)) continue;
          if (/^\d{2,3}[/-]\d{2}$/.test(s)) continue;
          if (/亭置|變場|變壓器|配電|開關箱|開關|高幹|高分|配電室/.test(s)) {
            pole = s;
            break;
          }
          if (/[\u4e00-\u9fa5]/.test(s) && (/\d/.test(s) || /[左右分幹支號]/.test(s))) {
            if (!/(?:市|縣|區|鄉|鎮).*?[路街巷弄號]/.test(s)) {
              pole = s;
              break;
            }
          }
        }
      }

      // 標準化圖號座標
      code = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

      // 擷取所有原始欄位存入 extra 物件，作為動態多條件篩選之依據
      const extra = {};
      if (headerIdx !== -1 && rows[headerIdx]) {
        rows[headerIdx].forEach((hName, cIdx) => {
          const key = (hName || "").trim();
          if (key && r[cIdx] !== undefined) {
            extra[key] = String(r[cIdx]).trim();
          }
        });
      }
      if (pole && !extra["土木設備"]) extra["土木設備"] = pole;
      if (inspectTerm && !extra["檢定期限"]) extra["檢定期限"] = inspectTerm;

      if (custNo || addr || code) {
        const seq = records.length + 1;
        records.push({
          seqNo: seq,
          uid: "bm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + seq,
          inspected: false,
          custNo,
          addr,
          pole,
          code,
          meterNo,
          inspectTerm,
          extra,
          lat: null,
          lng: null,
          locType: null, // "doorplate" | "grid" | "fallback"
          locLabel: ""
        });
      }
    }

    return records;
  }

  // 範例資料（示範去識別化假資料，包含11位、9位、8位電號，地址為實際可精準定位之新化區門牌）
  const SAMPLE_TEXT = `電號\t契約\t型式\t相別\t電表表號\t檢定期限\t用電地址\t土木設備\t圖號座標
10000000001\t15\t28\tD\t00000001\t115/04\t台南市新化區中正路８４７號\t新化54\tQ0999GB1201
10000000002\t15\t27\tD\t00000002\t115/12\t台南市新化區正新北路１６號\t新北4\tQ0998GC7900
100000003\t15\t20\tD\t00000003\t116/05\t台南市新化區正新北路２號\t協興4\tQ0998GD57
10000004\t15\t25\tD\t00000004\t116/05\t台南市新化區太平街１７號\t朝天5左2\tQ1098CA40
10000000005\t15\t25\tD\t00000005\t115/12\t台南市新化區太平街９９之７號\t太平13\tQ0997FE64
10000000006\t16\t28\tD\t00000006\t116/01\t台南市新化區中山路３３０號\t亭置式變場\tQ1097BB13
10000000007\t15\t20\tD\t00000007\t116/10\t台南市新化區忠孝路１３７號\t正新7左4\tQ0997GD55
10000000008\t15\t20\tD\t00000008\t116/09\t台南市新化區正新路１４２號\t窄港3\tQ0996FD37
10000000009\t15\t25\tD\t00000009\t115/05\t台南市新化區信義路４４３巷４５號\t信義8左2\tQ0996EE51
10000000010\t16\t20\tD\t00000010\t116/09\t台南市新化區中山路５１８號\t亭置式變場\tQ0997EB5501`;

  // 模組狀態
  const state = {
    records: [],
    layerGroup: null,
    isProcessing: false,
    showLabels: true,       // 是否顯示批次地址標籤與定位標記
    bgLabelsHidden: true,   // 是否已隱藏底圖設備標籤
    activeFilters: {},      // 當前多條件篩選狀態: { [colKey]: Set([selectedValues]) }
    hideInspected: true,    // 是否隱藏已跑/已巡檢點位 (符合現場巡檢跑過隱藏之直覺體驗)
    isReadOnlyShare: false, // 是否處於唯讀現場巡查分享模式 (他人僅能檢視、導航與標記隱藏，無法刪除)
    shareHash: "",          // 當前載入之分享雜湊標識
  };

  const controls = {
    panel: null,
    toggle: null,
    close: null,
    tabs: null,
    input: null,
    startBtn: null,
    sampleBtn: null,
    fileBtn: null,
    fileInput: null,
    progress: null,
    progressText: null,
    progressFill: null,
    totalCount: null,
    doorplateCount: null,
    gridCount: null,
    tabCountBadge: null,
    list: null,
    fitBoundsBtn: null,
    exportBtn: null,
    clearAllBtn: null,
    shareBtn: null,
    shareQuickBtn: null,
    toggleBgLabelsBtn: null,
    toggleLabelsBtn: null,
    filterBtn: null,
    filterBadge: null,
    filterActiveBar: null,
    filterVisibleCount: null,
    filterTotalCount: null,
    filterResetQuickBtn: null,
    filterDrawer: null,
    filterBackdrop: null,
    filterCloseBtn: null,
    filterResetAllBtn: null,
    filterBody: null,
    filterApplyBtn: null,
    filterMatchCount: null,
    driveUploadBtn: null,
    driveRestoreBtn: null,
    driveDeleteBtn: null,
    clearInputBtn: null,
    clearInputBtnTop: null,
    downloadJsonBtn: null,
    restoreJsonBtn: null,
    jsonFileInput: null,
  };

  function initControls() {
    controls.panel = document.getElementById("v2BatchMeterPanel");
    controls.toggle = document.getElementById("v2BatchMeterToggle");
    controls.close = document.getElementById("v2BatchMeterClose");
    controls.tabs = document.querySelectorAll('.v2-tab-btn[data-panel="batch"]');
    controls.input = document.getElementById("batchMeterInput");
    controls.startBtn = document.getElementById("batchMeterStartBtn");
    controls.sampleBtn = document.getElementById("batchMeterSampleBtn");
    controls.fileBtn = document.getElementById("batchMeterFileBtn");
    controls.fileInput = document.getElementById("batchMeterFileInput");
    controls.clearInputBtn = document.getElementById("batchMeterClearInputBtn");
    controls.clearInputBtnTop = document.getElementById("batchMeterClearInputBtnTop");
    controls.progress = document.getElementById("batchMeterProgress");
    controls.progressText = document.getElementById("batchMeterProgressText");
    controls.progressFill = document.getElementById("batchMeterProgressFill");
    controls.totalCount = document.getElementById("batchTotalCount");
    controls.doorplateCount = document.getElementById("batchDoorplateCount");
    controls.gridCount = document.getElementById("batchGridCount");
    controls.tabCountBadge = document.getElementById("v2BatchCount");
    controls.list = document.getElementById("batchMeterList");
    controls.fitBoundsBtn = document.getElementById("batchFitBoundsBtn");
    controls.exportBtn = document.getElementById("batchMeterExportBtn");
    controls.clearAllBtn = document.getElementById("batchClearAllBtn");
    controls.shareBtn = document.getElementById("batchShareBtn");
    controls.shareQuickBtn = document.getElementById("batchShareQuickBtn");

    controls.toggleBgLabelsBtn = document.getElementById("batchToggleBgLabelsBtn");
    controls.toggleLabelsBtn = document.getElementById("batchToggleLabelsBtn");
    controls.filterBtn = document.getElementById("batchFilterBtn");
    controls.filterBadge = document.getElementById("batchFilterBadge");
    controls.filterActiveBar = document.getElementById("batchFilterActiveBar");
    controls.filterVisibleCount = document.getElementById("batchFilterVisibleCount");
    controls.filterTotalCount = document.getElementById("batchFilterTotalCount");
    controls.filterResetQuickBtn = document.getElementById("batchFilterResetQuickBtn");

    controls.filterDrawer = document.getElementById("batchFilterDrawer");
    controls.filterBackdrop = document.getElementById("batchFilterBackdrop");
    controls.filterCloseBtn = document.getElementById("batchFilterCloseBtn");
    controls.filterResetAllBtn = document.getElementById("batchFilterResetAllBtn");
    controls.filterBody = document.getElementById("batchFilterBody");
    controls.filterApplyBtn = document.getElementById("batchFilterApplyBtn");
    controls.filterMatchCount = document.getElementById("batchFilterMatchCount");

    controls.patrolBar = document.getElementById("batchPatrolBar");
    controls.pendingCount = document.getElementById("batchPendingCount");
    controls.doneCount = document.getElementById("batchDoneCount");
    controls.toggleHideDoneBtn = document.getElementById("batchToggleHideDoneBtn");
    controls.toggleDoneText = document.getElementById("batchToggleDoneText");
    controls.toggleDoneIcon = document.getElementById("batchToggleDoneIcon");

    controls.driveUploadBtn = document.getElementById("batchDriveUploadBtn");
    controls.driveRestoreBtn = document.getElementById("batchDriveRestoreBtn");
    controls.driveDeleteBtn = document.getElementById("batchDriveDeleteBtn");
    controls.downloadJsonBtn = document.getElementById("batchDownloadJsonBtn");
    controls.restoreJsonBtn = document.getElementById("batchRestoreJsonBtn");
    controls.jsonFileInput = document.getElementById("batchJsonFileInput");
  }

  // 關閉其他面板 (使用全域互斥管理器)
  function closeOtherPanels() {
    if (window.__closeAllPanelsExcept) {
      window.__closeAllPanelsExcept("batch");
    } else {
      const s = document.getElementById("mapSearchPanel"), st = document.getElementById("mapSearchToggle");
      const lp = document.getElementById("layerMenuPanel"), lt = document.getElementById("layerMenuToggle");
      const cp = document.getElementById("v2CadastrePanel"), ct = document.getElementById("v2CadastreToggle");
      const ap = document.getElementById("v2AddressPanel"), at = document.getElementById("v2AddressToggle");
      const sp = document.getElementById("v2SyncPanel"), spt = document.getElementById("v2SyncToggle");
      s?.classList.remove("is-open"); st?.classList.remove("is-active"); st?.setAttribute("aria-expanded", "false");
      if (lp) lp.hidden = true; lt?.classList.remove("is-active"); lt?.setAttribute("aria-expanded", "false");
      cp?.classList.remove("is-open"); cp?.setAttribute("aria-hidden", "true"); ct?.classList.remove("is-active"); ct?.setAttribute("aria-expanded", "false");
      ap?.classList.remove("is-open"); ap?.setAttribute("aria-hidden", "true"); at?.classList.remove("is-active"); at?.setAttribute("aria-expanded", "false");
      sp?.classList.remove("is-open"); sp?.setAttribute("aria-hidden", "true"); spt?.classList.remove("is-active"); spt?.setAttribute("aria-expanded", "false");
    }
  }

  function setPanelOpen(open) {
    if (!controls.panel || !controls.toggle) return;
    if (open && !controls.panel.classList.contains("is-open")) {
      const e = new CustomEvent("v2-batch-open", { cancelable: true });
      if (!document.dispatchEvent(e)) return;
    }
    controls.panel.classList.toggle("is-open", open);
    controls.panel.setAttribute("aria-hidden", String(!open));
    controls.toggle.classList.toggle("is-active", open);
    controls.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      closeOtherPanels();
      syncBgLabelsBtnWithMap();
    }
  }

  function switchTab(tabName) {
    controls.tabs.forEach(btn => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll('.v2-tab-pane[data-panel="batch"]').forEach(pane => {
      const active = pane.dataset.pane === tabName;
      pane.classList.toggle("is-active", active);
      pane.hidden = !active;
    });
  }


  // 本機電桿資料庫高速索引 (台南 points.json，23.8 萬筆現場設備)
  let localCodeIndex = null;
  let localNameIndex = null;
  function getLocalEquipmentIndexes() {
    if (localCodeIndex && localNameIndex) return { codeIndex: localCodeIndex, nameIndex: localNameIndex };
    const points = window.state?.points;
    if (Array.isArray(points) && points.length > 0) {
      localCodeIndex = new Map();
      localNameIndex = new Map();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.code) {
          const c = String(p.code).toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!localCodeIndex.has(c)) localCodeIndex.set(c, p);
        }
        if (p.name) {
          const n = String(p.name).trim();
          if (!localNameIndex.has(n)) localNameIndex.set(n, p);
        }
      }
      return { codeIndex: localCodeIndex, nameIndex: localNameIndex };
    }
    return null;
  }

  function findLocalEquipmentPoint(code, name) {
    const indexes = getLocalEquipmentIndexes();
    if (!indexes) return null;
    if (code) {
      const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const found = indexes.codeIndex.get(c);
      if (found) return found;
    }
    if (name) {
      const n = String(name).trim();
      const found = indexes.nameIndex.get(n);
      if (found) return found;
    }
    return null;
  }

  // --- 底圖設備標籤隱藏與顯示控制 ---
  function hideBackgroundPoleLabels() {
    const btn = document.getElementById("toggleLabelsBtn");
    if (btn && !btn.classList.contains("is-hidden")) {
      btn.click();
    }
    updateBgLabelsBtnUI(true);
  }

  function showBackgroundPoleLabels() {
    const btn = document.getElementById("toggleLabelsBtn");
    if (btn && btn.classList.contains("is-hidden")) {
      btn.click();
    }
    updateBgLabelsBtnUI(false);
  }

  function toggleBackgroundPoleLabels() {
    const btn = document.getElementById("toggleLabelsBtn");
    if (btn) {
      btn.click();
      const isHidden = btn.classList.contains("is-hidden");
      updateBgLabelsBtnUI(isHidden);
      showToast(isHidden ? "🚫 已為您隱藏設備標籤與點位" : "👁️ 已還原設備標籤與點位");
    }
  }

  function syncBgLabelsBtnWithMap() {
    const btn = document.getElementById("toggleLabelsBtn");
    const isHidden = btn ? btn.classList.contains("is-hidden") : false;
    updateBgLabelsBtnUI(isHidden);
  }

  function updateBgLabelsBtnUI(hidden) {
    state.bgLabelsHidden = hidden;
    if (!controls.toggleBgLabelsBtn) return;
    if (hidden) {
      controls.toggleBgLabelsBtn.textContent = "🚫 設備標籤";
      controls.toggleBgLabelsBtn.title = "底圖台電設備標籤：已隱藏（點擊顯示）";
      controls.toggleBgLabelsBtn.classList.add("is-hidden-state");
      controls.toggleBgLabelsBtn.classList.remove("is-active");
    } else {
      controls.toggleBgLabelsBtn.textContent = "👁️ 設備標籤";
      controls.toggleBgLabelsBtn.title = "底圖台電設備標籤：顯示中（點擊隱藏）";
      controls.toggleBgLabelsBtn.classList.remove("is-hidden-state");
      controls.toggleBgLabelsBtn.classList.add("is-active");
    }
  }

  // ============================================================
  // 地圖標籤視野裁切 (Viewport Culling)
  // 僅將目前螢幕可視範圍（加 25% 平移緩衝區）內的 Marker 與 Tooltip 掛載至 DOM
  // 視窗外的數百上千個節點自動脫離 DOM，大幅消除縮放拖曳卡頓並維持 60 FPS
  // ============================================================
  let _lastCullingStats = "";
  function updateBatchViewportCulling() {
    const map = getMap();
    if (!map || !state.layerGroup) return;

    if (!state.records || !state.records.length) {
      state.layerGroup.clearLayers();
      return;
    }

    // 若使用者全局關閉地址標籤
    if (!state.showLabels) {
      if (map.hasLayer(state.layerGroup)) {
        map.removeLayer(state.layerGroup);
      }
      return;
    }

    if (!map.hasLayer(state.layerGroup)) {
      map.addLayer(state.layerGroup);
    }

    // 視野邊界加 25% 緩衝區（平移拖曳時邊緣無感加載，不產生突然跳出的突兀感）
    const bounds = map.getBounds().pad(0.25);
    const isHidingInspected = state.hideInspected !== false;

    // 收集所有唯一 Marker
    const uniqueMarkers = new Set();
    state.records.forEach(r => {
      if (r.marker) uniqueMarkers.add(r.marker);
    });

    let inViewCount = 0;
    let culledCount = 0;

    uniqueMarkers.forEach(marker => {
      const group = marker._batchClusterGroup;

      // 1. 條件篩選檢查：群組內所有項目若全被過濾，直接不顯示
      const hasVisibleFilter = group ? group.some(item => !item.r.filteredOut) : true;
      if (!hasVisibleFilter) {
        if (state.layerGroup.hasLayer(marker)) {
          state.layerGroup.removeLayer(marker);
        }
        return;
      }

      // 2. 巡檢已跑隱藏檢查：群組內所有項目若全已跑且開啟隱藏，直接不顯示
      const isClusterAllDone = group ? group.every(item => item.r.inspected) : false;
      if (isHidingInspected && isClusterAllDone) {
        if (state.layerGroup.hasLayer(marker)) {
          state.layerGroup.removeLayer(marker);
        }
        return;
      }

      // 3. 視野裁切判定 (Viewport Culling)
      const latLng = marker.getLatLng();
      const inView = bounds.contains(latLng);

      if (inView) {
        inViewCount++;
        if (!state.layerGroup.hasLayer(marker)) {
          state.layerGroup.addLayer(marker);
          if (state.showLabels && marker.getTooltip()) {
            marker.openTooltip();
          }
        } else {
          if (state.showLabels && marker.getTooltip() && !marker.isTooltipOpen()) {
            marker.openTooltip();
          }
        }
        // 更新巡檢已跑外觀樣式 (Pin 與 Tooltip 同步呈現半透明已跑樣式)
        const pin = marker.getElement()?.querySelector(".batch-marker-pin");
        if (pin) pin.classList.toggle("is-all-done", isClusterAllDone);
        const tooltipEl = marker.getTooltip()?.getElement();
        if (tooltipEl) tooltipEl.classList.toggle("is-all-done", isClusterAllDone);
      } else {
        culledCount++;
        if (state.layerGroup.hasLayer(marker)) {
          state.layerGroup.removeLayer(marker);
        }
      }
    });

    // 提示與統計 (可於 Console 與按鈕 Hover Title 即時查看效果)
    const statsKey = `${inViewCount}_${culledCount}`;
    if (statsKey !== _lastCullingStats) {
      _lastCullingStats = statsKey;
      if (controls.toggleLabelsBtn) {
        controls.toggleLabelsBtn.title = `批次地址標籤：視野裁切運作中（視窗內 ${inViewCount} 點 / 視窗外裁切 ${culledCount} 點）`;
      }
      console.log(`⚡ [地圖標籤視野裁切 Viewport Culling] 視窗內渲染: ${inViewCount} 點 / 視窗外裁切: ${culledCount} 點 (省去 DOM 節點: ${culledCount * 2} 個)`);
    }
  }

  // 監聽地圖平移、縮放事件以觸發視野裁切
  function setupMapViewportEvents(map) {
    if (!map || map._batchViewportCullingAttached) return;
    map._batchViewportCullingAttached = true;

    let throttleTimer = null;
    const onMoveThrottled = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        updateBatchViewportCulling();
      }, 120);
    };

    const onMoveEnd = () => {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      updateBatchViewportCulling();
    };

    map.on("move", onMoveThrottled);
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
  }

  // 取得所有有效批次紀錄的完整經緯度邊界（獨立於地圖圖層狀態，確保全體視野始終精確）
  function getBatchRecordsBounds() {
    if (!state.records || !state.records.length || !window.L) return null;
    const validCoords = state.records
      .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map(r => [r.lat, r.lng]);
    if (!validCoords.length) return null;
    return L.latLngBounds(validCoords);
  }

  // --- 批次地址標籤與數字標記切換（連動隱藏/顯示）---
  function toggleBatchLabels(force) {
    state.showLabels = typeof force === "boolean" ? force : !state.showLabels;
    if (controls.toggleLabelsBtn) {
      controls.toggleLabelsBtn.textContent = state.showLabels ? "🏷️ 地址標籤" : "🙈 地址標籤";
      controls.toggleLabelsBtn.title = state.showLabels ? "批次地址標籤與標記：顯示中（點擊隱藏）" : "批次地址標籤與標記：已隱藏（點擊顯示）";
      controls.toggleLabelsBtn.classList.toggle("is-active", state.showLabels);
      controls.toggleLabelsBtn.classList.toggle("is-hidden-state", !state.showLabels);
    }
    const map = getMap();
    if (!map || !state.layerGroup) return;

    if (!state.showLabels) {
      if (map.hasLayer(state.layerGroup)) {
        map.removeLayer(state.layerGroup);
      }
    } else {
      updateBatchViewportCulling();
    }
  }

  // ============================================================
  // 多條件勾選篩選模組 (支援手機抽屜式操作、多條件勾選、地圖標記與清單聯動)
  // ============================================================

  // 自動探測資料中的可篩選欄位與各值分佈
  function getFilterableDimensions() {
    if (!state.records || !state.records.length) return [];
    const candidates = new Map(); // colKey -> Map(val -> count)
    const priorityKeys = ["型式", "契約", "相別", "定位型態", "檢定期限", "土木設備", "桿名", "營業區"];

    state.records.forEach(r => {
      if (!r.extra) r.extra = {};
      if (r.locType && !r.extra["定位型態"]) {
        r.extra["定位型態"] = r.locType === "doorplate" ? "🏠 門牌定位" : (r.locType === "fallback" ? "⚡ 圖號保底" : "⚡ 圖號定位");
      }
      if (r.pole && !r.extra["土木設備"]) r.extra["土木設備"] = r.pole;
      if (r.inspectTerm && !r.extra["檢定期限"]) r.extra["檢定期限"] = r.inspectTerm;
      const extra = r.extra;
      for (const [k, rawVal] of Object.entries(extra)) {
        if (!k) continue;
        const v = String(rawVal === undefined || rawVal === null ? "" : rawVal).trim();
        if (!v) continue;
        if (k === "電號" || k === "用電地址" || k === "圖號座標" || k === "電表表號" || k === "編號") continue;
        if (!candidates.has(k)) candidates.set(k, new Map());
        const valMap = candidates.get(k);
        valMap.set(v, (valMap.get(v) || 0) + 1);
      }
    });

    const list = [];
    for (const [key, valMap] of candidates.entries()) {
      // 只要相異值數量 >= 2 且 <= 40（適合勾選，且不超過清單總數）
      if (valMap.size >= 2 && valMap.size <= 40 && valMap.size <= state.records.length) {
        const sortedValues = Array.from(valMap.entries()).map(([val, count]) => ({ val, count }));
        // 數字或字串自然排序
        sortedValues.sort((a, b) => {
          const numA = Number(a.val), numB = Number(b.val);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return String(a.val).localeCompare(String(b.val), "zh-Hant");
        });
        list.push({ key, values: sortedValues });
      }
    }

    // 依照台電常見業務優先順序排序
    list.sort((a, b) => {
      const idxA = priorityKeys.indexOf(a.key);
      const idxB = priorityKeys.indexOf(b.key);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.key.localeCompare(b.key, "zh-Hant");
    });

    return list;
  }

  // 判定某筆記錄是否符合給定之篩選條件（純粹判定條件篩選，絕不混雜巡檢已跑隱藏狀態）
  function isRecordVisible(r, filterState) {
    const filters = filterState || state.activeFilters;
    if (!filters) return true;
    for (const [key, selectedSet] of Object.entries(filters)) {
      if (!selectedSet || !(selectedSet instanceof Set)) continue;
      const val = String(r.extra?.[key] || "").trim();
      if (!selectedSet.has(val)) {
        return false;
      }
    }
    return true;
  }

  // 套用當前篩選狀態至地圖標記與結果清單
  function applyFilters() {
    let filterMatchesCount = 0;
    const isHiding = state.hideInspected !== false;

    state.records.forEach((r, idx) => {
      const matches = isRecordVisible(r);
      r.filteredOut = !matches;
      if (matches) filterMatchesCount++;

      // 1. 清單卡片聯動 (正交判定：條件篩選排除 OR 巡檢已跑隱藏)
      const card = controls.list?.querySelector(`.v2-batch-item[data-meter-idx="${idx}"]`);
      if (card) {
        const isHidden = Boolean(r.filteredOut) || (isHiding && r.inspected);
        card.style.display = isHidden ? "none" : "";
      }
    });

    // 2. 地圖 Marker 視野聯動
    if (state.layerGroup) {
      updateBatchViewportCulling();
    }

    updateFilterStatusUI(filterMatchesCount);
  }

  // 更新篩選按鈕、狀態提示條與統計徽章 UI
  function updateFilterStatusUI(visibleCount) {
    if (visibleCount === undefined) {
      visibleCount = state.records.filter(r => !r.filteredOut).length;
    }
    const total = state.records.length;
    const dims = getFilterableDimensions();

    // 計算是否有部分欄位被過濾
    let activeDimCount = 0;
    dims.forEach(dim => {
      const set = state.activeFilters[dim.key];
      if (set && set.size < dim.values.length) {
        activeDimCount++;
      }
    });

    const isFiltering = activeDimCount > 0;

    // 篩選按鈕徽章與樣式
    if (controls.filterBadge) {
      if (isFiltering) {
        controls.filterBadge.textContent = String(visibleCount);
        controls.filterBadge.style.display = "inline-block";
      } else {
        controls.filterBadge.style.display = "none";
      }
    }
    if (controls.filterBtn) {
      controls.filterBtn.classList.toggle("is-active", isFiltering);
      controls.filterBtn.classList.toggle("has-filter", isFiltering);
      controls.filterBtn.style.background = "";
      controls.filterBtn.style.color = "";
      controls.filterBtn.style.borderColor = "";
    }

    // 篩選狀態提示列
    if (controls.filterActiveBar) {
      controls.filterActiveBar.style.display = isFiltering ? "flex" : "none";
    }
    if (controls.filterVisibleCount) controls.filterVisibleCount.textContent = visibleCount;
    if (controls.filterTotalCount) controls.filterTotalCount.textContent = total;

    // 總計徽章
    if (controls.totalCount) {
      controls.totalCount.textContent = isFiltering ? `${visibleCount} (全 ${total})` : total;
    }
  }

  // 開啟手機抽屜式多條件篩選器
  let drawerFilters = {};

  function openFilterDrawer() {
    if (!controls.filterDrawer || !controls.filterBody) return;
    const dims = getFilterableDimensions();
    if (!dims.length) {
      showToast("💡 請貼上包含「型式」、「契約」等完整表頭資料以啟用分類篩選", "dup");
      return;
    }

    // 複製或初始化篩選暫存
    drawerFilters = {};
    dims.forEach(dim => {
      if (state.activeFilters[dim.key] && state.activeFilters[dim.key] instanceof Set) {
        drawerFilters[dim.key] = new Set(state.activeFilters[dim.key]);
      } else {
        drawerFilters[dim.key] = new Set(dim.values.map(v => v.val));
      }
    });

    renderFilterDrawerBody(dims);
    updateDrawerMatchCount();

    controls.filterDrawer.classList.remove("is-hidden");
    controls.filterDrawer.style.display = "flex";
    controls.filterDrawer.setAttribute("aria-hidden", "false");
  }

  function closeFilterDrawer() {
    if (!controls.filterDrawer) return;
    controls.filterDrawer.classList.add("is-hidden");
    controls.filterDrawer.style.display = "none";
    controls.filterDrawer.setAttribute("aria-hidden", "true");
  }

  // 動態渲染抽屜內容
  function renderFilterDrawerBody(dims) {
    if (!controls.filterBody) return;

    const html = dims.map(dim => {
      const selectedSet = drawerFilters[dim.key] || new Set();

      const chipsHtml = dim.values.map(v => {
        const isChecked = selectedSet.has(v.val);
        return `
          <div class="v2-filter-chip ${isChecked ? 'is-active' : ''}" data-dim-key="${escapeHtml(dim.key)}" data-val="${escapeHtml(v.val)}">
            <span>${escapeHtml(v.val)}</span>
            <span class="v2-filter-chip-count">${v.count}</span>
          </div>
        `;
      }).join("");

      return `
        <div class="v2-filter-group" data-dim-group="${escapeHtml(dim.key)}">
          <div class="v2-filter-group-header">
            <span class="v2-filter-group-title">
              <span>🏷️</span> ${escapeHtml(dim.key)}
            </span>
            <div class="v2-filter-group-actions">
              <button type="button" class="v2-filter-action-link" data-dim-action="all" data-dim-key="${escapeHtml(dim.key)}">全選</button>
              <button type="button" class="v2-filter-action-link" data-dim-action="none" data-dim-key="${escapeHtml(dim.key)}">全消</button>
            </div>
          </div>
          <div class="v2-filter-chips">
            ${chipsHtml}
          </div>
        </div>
      `;
    }).join("");

    controls.filterBody.innerHTML = html;

    // 綁定 Chip 點擊切換
    controls.filterBody.querySelectorAll(".v2-filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.dimKey;
        const val = chip.dataset.val;
        const set = drawerFilters[key];
        if (!set) return;

        if (set.has(val)) {
          set.delete(val);
          chip.classList.remove("is-active");
        } else {
          set.add(val);
          chip.classList.add("is-active");
        }
        updateDrawerMatchCount();
      });
    });

    // 綁定全選/全消按鈕
    controls.filterBody.querySelectorAll(".v2-filter-action-link").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.dimAction;
        const key = btn.dataset.dimKey;
        const dim = dims.find(d => d.key === key);
        if (!dim) return;

        const groupEl = controls.filterBody.querySelector(`.v2-filter-group[data-dim-group="${key}"]`);
        const set = drawerFilters[key];

        if (action === "all") {
          dim.values.forEach(v => set.add(v.val));
          groupEl?.querySelectorAll(".v2-filter-chip").forEach(c => c.classList.add("is-active"));
        } else {
          set.clear();
          groupEl?.querySelectorAll(".v2-filter-chip").forEach(c => c.classList.remove("is-active"));
        }
        updateDrawerMatchCount();
      });
    });
  }

  function updateDrawerMatchCount() {
    const matches = state.records.filter(r => isRecordVisible(r, drawerFilters)).length;
    if (controls.filterMatchCount) {
      controls.filterMatchCount.textContent = matches;
    }
  }

  function applyDrawerFilters() {
    state.activeFilters = {};
    const dims = getFilterableDimensions();

    dims.forEach(dim => {
      const set = drawerFilters[dim.key];
      if (set) {
        state.activeFilters[dim.key] = new Set(set);
      }
    });

    closeFilterDrawer();
    applyFilters();
    showToast(`🌪️ 已套用條件篩選！符合 ${state.records.filter(r => !r.filteredOut).length} 筆`);
  }

  function resetAllFilters() {
    state.activeFilters = {};
    if (controls.filterDrawer && !controls.filterDrawer.classList.contains("is-hidden")) {
      const dims = getFilterableDimensions();
      dims.forEach(dim => {
        drawerFilters[dim.key] = new Set(dim.values.map(v => v.val));
      });
      renderFilterDrawerBody(dims);
      updateDrawerMatchCount();
    }
    applyFilters();
    showToast("已重設全部篩選，顯示所有電表");
  }

  // 核心執行流程：解析並批次定位
  async function runBatchGeocoding() {
    if (state.isReadOnlyShare) {
      showToast("目前處於唯讀巡查模式，請先點擊上方「退出巡查」後再進行新資料標記！", "dup");
      return;
    }
    const rawText = controls.input.value.trim();
    if (!rawText) {
      showToast("請先在文字框貼上 Excel 清單資料！", "dup");
      controls.input.focus();
      return;
    }

    const records = parseBatchInputText(rawText);
    if (!records.length) {
      showToast("無法辨識資料，請確認是否包含用電地址或圖號座標！", "error");
      return;
    }

    state.isProcessing = true;
    controls.startBtn.disabled = true;
    controls.progress.style.display = "flex";
    controls.progressFill.style.width = "0%";
    controls.progressText.textContent = `準備定位 ${records.length} 筆電表...`;

    const total = records.length;
    let completed = 0;
    let doorplateSuccess = 0;
    let gridCount = 0;
    let fallbackCount = 0;

    const tpcFunc = window.tpcCodeToLatLng;
    const strategy = document.querySelector('input[name="batchLocStrategy"]:checked')?.value || "smart";

    // 多線程並行隊列（兼顧速度與官方防爬蟲限制，提速 3~4 倍）
    const CONCURRENCY = 3;
    let nextIndex = 0;

    async function processNextRecord() {
      while (nextIndex < total) {
        const i = nextIndex++;
        const r = records[i];
        const isParcel = isLandParcelAddress(r.addr);

        // 優先從本機資料庫 (台南 points.json) 查對實測點位
        const localPt = findLocalEquipmentPoint(r.code, r.pole);
        if (localPt) {
          if (!r.pole && localPt.name) r.pole = localPt.name;
          if (!r.code && localPt.code) r.code = localPt.code;
        }

                const resolvePoleCoord = (c) => {
          if (localPt && Number.isFinite(localPt.lat) && Number.isFinite(localPt.lng)) {
            return { lat: localPt.lat, lng: localPt.lng };
          }
          if (c && typeof tpcFunc === "function") {
            try {
              const pt = tpcFunc(c);
              if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) return pt;
            } catch (err) {
              console.warn("tpcFunc error:", err);
            }
          }
          return null;
        };

        if (strategy === "pole") {
          // 【策略 A：電桿圖號優先（外勤換表/巡檢推薦，電桿掛表最準確）】
          if (r.code && typeof tpcFunc === "function") {
            const pt = resolvePoleCoord(r.code);
            if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
              r.lat = pt.lat;
              r.lng = pt.lng;
              r.locType = "grid";
              r.locLabel = "⚡ 圖號座標定位（現場掛表電桿）";
              gridCount++;
            }
          } else if (r.addr) {
            // 無圖號座標保底依門牌定位
            const geo = await geocodeDoorplate(r.addr, null);
            if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
              r.lat = geo.lat;
              r.lng = geo.lng;
              r.locType = "doorplate";
              r.locLabel = "🏠 電子門牌精準定位（用戶住家）";
              doorplateSuccess++;
            }
          }
        } else {
          // 【策略 B：智慧雙軌（門牌精確才用，相距逾300m或地號自動轉電桿現場）】
          if (isParcel) {
            // 是地號 ➔ 直接使用圖號座標精準反推現場電桿
            if (r.code && typeof tpcFunc === "function") {
              const pt = resolvePoleCoord(r.code);
              if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
                r.lat = pt.lat;
                r.lng = pt.lng;
                r.locType = "grid";
                r.locLabel = "⚡ 圖號座標定位（地號農電桿）";
                gridCount++;
              }
            }
          } else if (r.addr) {
            // 是一般門牌地址 ➔ 調用電子門牌定位（以電桿座標輔助檢核，偏差 > 300m 自動以電桿為準）
            let expectedPt = null;
            if (r.code && typeof tpcFunc === "function") {
              const pt = resolvePoleCoord(r.code);
              if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
                expectedPt = pt;
              }
            }

            const geo = await geocodeDoorplate(r.addr, expectedPt);
            if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
              r.lat = geo.lat;
              r.lng = geo.lng;
              r.locType = "doorplate";
              r.locLabel = "🏠 電子門牌精準定位（用戶住家）";
              doorplateSuccess++;
            } else if (expectedPt) {
              // 門牌查無、號碼不符或偏離現場逾300m ➔ 100% 保底轉用現場電桿圖號定位
              r.lat = expectedPt.lat;
              r.lng = expectedPt.lng;
              r.locType = "fallback";
              r.locLabel = "⚡ 門牌查無或偏離，轉用現場電桿圖號定位";
              fallbackCount++;
            }
          } else if (r.code && typeof tpcFunc === "function") {
            const pt = resolvePoleCoord(r.code);
            if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
              r.lat = pt.lat;
              r.lng = pt.lng;
              r.locType = "grid";
              r.locLabel = "⚡ 圖號座標定位";
              gridCount++;
            }
          }
        }

        // 智慧備援：若無桿名但有圖號座標，優先從本機 points.json 或快取反查桿名
        if (!r.pole && r.code) {
          if (localPt && localPt.name) {
            r.pole = localPt.name;
          } else if (poleSearchCache.has(r.code)) {
            r.pole = poleSearchCache.get(r.code);
          } else {
            try {
              const resp = await fetch(`/api/search?q=${encodeURIComponent(r.code)}&limit=1`);
              if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0 && data[0].name) {
                  r.pole = data[0].name;
                  poleSearchCache.set(r.code, r.pole);
                }
              }
            } catch {}
          }
        }

        completed++;
        const pct = Math.round((completed / total) * 100);
        controls.progressFill.style.width = `${pct}%`;
        controls.progressText.textContent = `正在定位 (${completed}/${total})：${r.addr || r.code || formatCustNo(r.custNo)}...`;
      }
    }

    const poolSize = Math.min(CONCURRENCY, total);
    const workers = [];
    for (let w = 0; w < poolSize; w++) {
      workers.push(processNextRecord());
    }
    await Promise.all(workers);

    state.records = records.filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    state.records.forEach(r => {
      if (!r.extra) r.extra = {};
      r.extra["定位型態"] = r.locType === "doorplate" ? "🏠 門牌定位" : (r.locType === "fallback" ? "⚡ 圖號保底" : "⚡ 圖號定位");
      if (r.pole && !r.extra["土木設備"]) r.extra["土木設備"] = r.pole;
      if (r.inspectTerm && !r.extra["檢定期限"]) r.extra["檢定期限"] = r.inspectTerm;
    });
    state.activeFilters = {};

    state.isProcessing = false;
    controls.startBtn.disabled = false;
    controls.progress.style.display = "none";

    // 儲存至本地快取
    try {
      localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(state.records));
    } catch {}

    // 自動隱藏底圖設備標籤，保持地圖清爽
    hideBackgroundPoleLabels();

    // 繪製地圖標記、文字標籤與清單卡片
    renderBatchMarkers();
    renderBatchList();
    updateSummaryBadges(doorplateSuccess, gridCount, fallbackCount);
    updateFilterStatusUI(state.records.length);

    // 切換至結果頁
    switchTab("list");

    const map = getMap();
    if (map && state.records.length > 0) {
      const bounds = getBatchRecordsBounds();
      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        // 避開 fitBounds 觸發 zoomstart 自動收合面板，確保標記完成後保持結果頁開啟
        setTimeout(() => setPanelOpen(true), 350);
      }
    } else {
      setPanelOpen(true);
    }

    showToast(`🎉 批次標記完成！成功定位 ${state.records.length} / ${total} 筆地址（已自動隱藏底圖設備標籤）`);
  }

  function updatePatrolToggleUI() {
    const isHiding = state.hideInspected !== false;
    if (controls.toggleHideDoneBtn) {
      controls.toggleHideDoneBtn.classList.toggle("is-active", isHiding);
    }
    if (controls.toggleDoneText) {
      controls.toggleDoneText.textContent = isHiding ? "隱藏已跑中" : "顯示全部中";
    }
    if (controls.toggleDoneIcon) {
      controls.toggleDoneIcon.textContent = isHiding ? "👁️" : "👁️‍🗨️";
    }
  }

  function updateSummaryBadges(dp, grid, fallback) {
    const total = state.records.length;
    const done = state.records.filter(r => r.inspected).length;
    const pending = total - done;

    if (dp === undefined) {
      dp = state.records.filter(r => r.locType === "doorplate").length;
      grid = state.records.filter(r => r.locType === "grid").length;
      fallback = state.records.filter(r => r.locType === "fallback").length;
    }
    if (controls.totalCount) controls.totalCount.textContent = total;
    if (controls.doorplateCount) controls.doorplateCount.textContent = dp;
    if (controls.gridCount) controls.gridCount.textContent = grid + fallback;
    if (controls.tabCountBadge) controls.tabCountBadge.textContent = state.hideInspected ? pending : total;

    if (controls.pendingCount) controls.pendingCount.textContent = pending;
    if (controls.doneCount) controls.doneCount.textContent = done;

    updatePatrolToggleUI();
  }

  // 建立單一電表的詳細資訊卡 HTML（供單戶 Popup 或多戶共用點位 Popup 嵌入）
  function buildSingleMeterDetailHtml(r, idx) {
    const formattedCustNo = formatCustNo(r.custNo);
    const typeBadge = r.locType === "doorplate"
      ? `<span style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:700;">🏠 門牌</span>`
      : `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:700;">⚡ 圖號</span>`;

    const customFields = getAllCustomFields(r);
    const chips = [];
    if (r.extra?.["型式"]) chips.push(`<span class="v2-batch-chip is-type">型式: ${escapeHtml(r.extra["型式"])}</span>`);
    if (r.extra?.["契約"]) chips.push(`<span class="v2-batch-chip is-contract">契約: ${escapeHtml(r.extra["契約"])}</span>`);
    if (r.extra?.["相別"]) chips.push(`<span class="v2-batch-chip is-phase">相別: ${escapeHtml(r.extra["相別"])}</span>`);
    if (r.meterNo) chips.push(`<span class="v2-batch-chip">表號: ${escapeHtml(r.meterNo)}</span>`);
    if (r.inspectTerm) chips.push(`<span class="v2-batch-chip">檢定: ${escapeHtml(r.inspectTerm)}</span>`);
    if (chips.length === 0 && customFields.length > 0) {
      customFields.slice(0, 2).forEach(f => {
        chips.push(`<span class="v2-batch-chip">${escapeHtml(f.key)}: ${escapeHtml(f.val)}</span>`);
      });
    }

    const popupCollapseHtml = customFields.length > 0 ? `
      <details class="batch-popup-collapse" style="margin-top:4px;">
        <summary>
          <span>📋 完整資料 (${customFields.length} 欄位)</span>
          <span style="font-size:9px;color:#94a3b8;">▼</span>
        </summary>
        <div class="batch-popup-details-body">
          ${customFields.map(f => `
            <div class="batch-popup-row">
              <span class="batch-popup-key">${escapeHtml(f.key)}:</span>
              <span class="batch-popup-val">${escapeHtml(f.val)}</span>
            </div>
          `).join("")}
        </div>
      </details>
    ` : "";

    return `
      <div class="batch-popup-meter-item ${r.inspected ? 'is-inspected' : ''}" data-popup-meter-idx="${idx}" data-popup-meter-uid="${r.uid}">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:3px;margin-bottom:4px;">
          <strong style="color:#0f766e;font-size:12px;display:flex;align-items:center;gap:4px;">
            #${r.seqNo} 電號 ${escapeHtml(formattedCustNo || "--")}
            ${r.inspected ? '<span class="v2-batch-badge-inspected">✓ 已跑</span>' : ''}
          </strong>
          ${typeBadge}
        </div>
        <div style="color:#334155;font-size:11px;line-height:1.4;">📍 <strong>地址：</strong>${escapeHtml(r.addr || "--")}</div>
        ${chips.length > 0 ? `<div class="v2-batch-chips-row" style="margin-top:3px;">${chips.join("")}</div>` : ""}
        ${popupCollapseHtml}
        <!-- 每戶卡片底部專屬操作：已跑隱藏、導航與移除按鈕 (手機排版適應) -->
        <div class="batch-popup-item-actions">
          <button type="button" class="batch-popup-act-btn is-inspect ${r.inspected ? 'is-done' : ''}" data-act-uid="${r.uid}" onclick="event.stopPropagation(); window.__toggleBatchInspected?.('${r.uid}');" title="${r.inspected ? '點擊取消已跑並恢復顯示' : '標記此點已巡檢並隱藏'}">
            ${r.inspected ? '✓ 已跑(復原)' : '👁️ 標記已跑'}
          </button>
          <a class="batch-popup-act-btn is-nav popup-navigation-link" href="${googleNavUrl(r.lat, r.lng)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" title="以 Google Maps 導航至此電表精確座標">
            🗺️ 導航
          </a>
          ${!state.isReadOnlyShare ? `
            <button type="button" class="batch-popup-act-btn is-del batch-remove-single-btn" data-remove-uid="${r.uid}" data-remove-idx="${idx}" onclick="event.stopPropagation(); window.__removeBatchMeter?.('${r.uid}');" title="從清單與地圖中移除此電表">
              🗑️ 移除
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // 繪製地圖標記點與醒目文字標籤
  function renderBatchMarkers() {
    const map = getMap();
    if (!map || !window.L) return;

    if (!state.layerGroup) {
      state.layerGroup = L.featureGroup();
      if (state.showLabels) {
        state.layerGroup.addTo(map);
      }
    } else {
      state.layerGroup.clearLayers();
    }

    // 依座標聚類分組（同變壓器/同掛表桿位判斷）
    const coordMap = new Map();
    state.records.forEach((r, idx) => {
      if (!r.seqNo) r.seqNo = idx + 1;
      if (!r.uid) r.uid = "bm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + r.seqNo;
      r._displayIndex = r.seqNo;

      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return;

      // 取小數點後 6 位 (約 0.1 公尺精度內視為同一現場掛表點/同變壓器)
      const key = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`;
      if (!coordMap.has(key)) coordMap.set(key, []);
      coordMap.get(key).push({ r, idx });
    });

    coordMap.forEach((group, coordKey) => {
      const isCluster = group.length > 1;
      const primaryRec = group[0].r;
      const primaryIdx = group[0].idx;
      const lat = primaryRec.lat;
      const lng = primaryRec.lng;

      // 徽章樣式 (若群組內有任一門牌定位優先顯綠)
      const hasDoorplate = group.some(item => item.r.locType === "doorplate");
      const badgeClass = hasDoorplate ? "is-doorplate" : (primaryRec.locType === "fallback" ? "is-fallback" : "is-grid");

      const isAllDone = group.every(item => item.r.inspected);
      const doneClass = isAllDone ? "is-all-done" : "";

      // 1. Marker DivIcon 圖標 (永久固定原始序號)
      const pinMainText = `${primaryRec.seqNo}`;
      const pinBadge = isCluster ? `<span class="batch-marker-pin-badge">+${group.length - 1}</span>` : "";
      const clusterTypeName = hasDoorplate ? "同門牌/住址" : "共用變壓器/桿位";
      const clusterTitle = isCluster
        ? `⚡ ${clusterTypeName}: 共 ${group.length} 只電表 (#${group.map(g => g.r.seqNo).join(",")})`
        : `#${primaryRec.seqNo} ${escapeHtml(primaryRec.addr || primaryRec.code)}`;

      const icon = L.divIcon({
        className: "batch-marker-divicon",
        html: `<div class="batch-marker-pin ${badgeClass} ${isCluster ? 'is-cluster' : ''} ${doneClass}" title="${clusterTitle}">
                 <span class="batch-marker-pin-main">${pinMainText}</span>
                 ${pinBadge}
               </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lng], { icon });
      marker._batchClusterGroup = group; // 保存群組引用

      // 2. 地圖醒目標籤 Tooltip (同座標整合顯示，徹底避免疊在一起)
      let labelHtml = "";
      if (!isCluster) {
        const formattedCustNo = formatCustNo(primaryRec.custNo);
        labelHtml = `
          <div class="batch-map-label ${badgeClass}">
            <span class="batch-label-index">#${primaryRec.seqNo}</span>
            <span class="batch-label-text">${escapeHtml(primaryRec.addr || primaryRec.code || formattedCustNo)}</span>
            ${primaryRec.pole ? `<span class="batch-label-pole">(${escapeHtml(primaryRec.pole)})</span>` : ""}
          </div>
        `;
      } else {
        const indicesStr = group.map(g => `#${g.r.seqNo}`).join(",");
        const firstAddr = group[0].r.addr || group[0].r.code;
        const allSameAddr = group.every(g => (g.r.addr || g.r.code) === firstAddr);
        const displayAddrText = allSameAddr ? `${firstAddr}` : `${firstAddr} 等 ${group.length} 戶`;
        const poleName = group.find(g => g.r.pole)?.r.pole || primaryRec.code || "";
        const tagText = hasDoorplate ? `🏠 同門牌 (${group.length}表)` : `⚡ 共用變壓器 (${group.length}表)`;

        labelHtml = `
          <div class="batch-map-label ${badgeClass} is-cluster-label">
            <div class="batch-map-label-header">
              <span class="batch-label-index">${indicesStr}</span>
              <span class="batch-label-multi-badge">${tagText}</span>
            </div>
            <div class="batch-label-text">${escapeHtml(displayAddrText)}</div>
            ${poleName ? `<span class="batch-label-pole">(${escapeHtml(poleName)})</span>` : ""}
          </div>
        `;
      }

      marker.bindTooltip(labelHtml, {
        permanent: state.showLabels !== false,
        direction: "top",
        offset: [0, -14],
        className: "batch-meter-map-tooltip"
      });

      // 3. Popup 彈窗詳細卡片
      let popupHtml = "";

      if (!isCluster) {
        popupHtml = `
          <div class="batch-popup-card" style="min-width:240px;line-height:1.5;font-size:12px;">
            <div style="color:#334155;margin-bottom:5px;font-size:11px;">
              ⚡ <strong>設備：</strong>${escapeHtml(primaryRec.pole || "--")} · 🗺️ <strong>圖號：</strong><code style="font-family:monospace;font-weight:700;color:#0f766e;">${escapeHtml(primaryRec.code || "--")}</code>
            </div>
            ${buildSingleMeterDetailHtml(primaryRec, primaryIdx)}
          </div>
        `;
      } else {
        // 多戶共用同座標點位（同門牌透天大樓分表或同變壓器供電）
        const headTitle = hasDoorplate ? "🏠 同門牌/住址點位" : "⚡ 變壓器/桿位共用點位";
        const headCountBadge = hasDoorplate ? `共 ${group.length} 戶電表` : `共 ${group.length} 只電表`;
        const headSubInfo = hasDoorplate
          ? `📍 <strong>門牌：</strong>${escapeHtml(group[0].r.addr || "--")}${primaryRec.pole ? ` · ⚡ <strong>設備：</strong>${escapeHtml(primaryRec.pole)}` : ""}`
          : `⚡ <strong>設備：</strong>${escapeHtml(primaryRec.pole || "--")} · 🗺️ <strong>圖號：</strong><code style="font-family:monospace;font-weight:700;color:#0f766e;">${escapeHtml(primaryRec.code || "--")}</code>`;

        const globalNavUrl = googleNavUrl(lat, lng);
        const globalNavText = "🗺️ 導航";

        popupHtml = `
          <div class="batch-popup-card" style="min-width:260px;max-width:320px;line-height:1.5;font-size:12px;">
            <div class="batch-popup-cluster-head">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:#0f766e;font-size:13px;">${headTitle}</strong>
                <span class="batch-popup-cluster-count">${headCountBadge}</span>
              </div>
              <div style="color:#475569;font-size:11px;margin-top:3px;">
                ${headSubInfo}
              </div>
            </div>
            <div style="max-height:240px;overflow-y:auto;padding-right:2px;display:flex;flex-direction:column;gap:6px;">
              ${group.map(item => buildSingleMeterDetailHtml(item.r, item.idx)).join("")}
            </div>
            <div class="v2-cadastre-popup-actions" style="margin-top:8px;display:flex;gap:6px;">
              <a class="popup-navigation-link" href="${globalNavUrl}" target="_blank" rel="noopener" style="flex:1;text-align:center;justify-content:center;">
                ${globalNavText}
              </a>
            </div>
          </div>
        `;
      }

      marker.bindPopup(popupHtml, { maxWidth: 320, maxHeight: 420, className: "batch-meter-popup" });
      // 注意：此處交由 Viewport Culling 依螢幕視野動態掛載至 state.layerGroup

      // 為群組內每筆紀錄關聯此 Marker 與叢集資訊
      group.forEach(item => {
        item.r.marker = marker;
        item.r._clusterSize = group.length;
        item.r._clusterKey = coordKey;
      });
    });

    // 綁定地圖平移、縮放視野裁切監聽
    setupMapViewportEvents(map);

    // 依當前視窗範圍執行初次視野裁切 (僅將螢幕內之 Marker 與 Tooltip 掛載至 DOM)
    updateBatchViewportCulling();

    applyFilters();
  }

  // 渲染分頁 2 的結果卡片
  function renderBatchList() {
    if (!controls.list) return;
    if (!state.records.length) {
      controls.list.innerHTML = `<div style="text-align:center;padding:24px 8px;color:#94a3b8;font-size:12px;">尚未標記任何電表，請在第一頁貼上並點擊開始標記。</div>`;
      return;
    }

    const html = state.records.map((r, idx) => {
      const typeBadge = r.locType === "doorplate"
        ? `<span style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:700;">🏠 門牌</span>`
        : `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:700;">⚡ 圖號</span>`;

      const formattedCustNo = formatCustNo(r.custNo);
      const customFields = getAllCustomFields(r);

      const chips = [];
      if (r.extra?.["型式"]) chips.push(`<span class="v2-batch-chip is-type">型式: ${escapeHtml(r.extra["型式"])}</span>`);
      if (r.extra?.["契約"]) chips.push(`<span class="v2-batch-chip is-contract">契約: ${escapeHtml(r.extra["契約"])}</span>`);
      if (r.extra?.["相別"]) chips.push(`<span class="v2-batch-chip is-phase">相別: ${escapeHtml(r.extra["相別"])}</span>`);
      if (r.meterNo) chips.push(`<span class="v2-batch-chip">表號: ${escapeHtml(r.meterNo)}</span>`);
      if (r.inspectTerm) chips.push(`<span class="v2-batch-chip">檢定: ${escapeHtml(r.inspectTerm)}</span>`);
      // 若無上述台電常見規格但有其他自訂欄位，動態取前 2 項作為標籤
      if (chips.length === 0 && customFields.length > 0) {
        customFields.slice(0, 2).forEach(f => {
          chips.push(`<span class="v2-batch-chip">${escapeHtml(f.key)}: ${escapeHtml(f.val)}</span>`);
        });
      }

      const cardCollapseHtml = customFields.length > 0 ? `
        <details class="v2-batch-card-details" onclick="event.stopPropagation()">
          <summary class="v2-batch-card-summary">
            <span>📋 完整資料 (${customFields.length} 欄位)</span>
            <span class="v2-batch-card-arrow">▼</span>
          </summary>
          <div class="v2-batch-card-body">
            ${customFields.map(f => `
              <div class="v2-batch-card-row">
                <span class="v2-batch-card-key">${escapeHtml(f.key)}:</span>
                <span class="v2-batch-card-val">${escapeHtml(f.val)}</span>
              </div>
            `).join("")}
          </div>
        </details>
      ` : "";

      const sharedBadge = (r._clusterSize && r._clusterSize > 1)
        ? `<span class="v2-batch-badge-shared" title="與其他 ${r._clusterSize - 1} 戶共用同一變壓器/桿位座標">⚡ 同變壓器 (${r._clusterSize}戶)</span>`
        : "";

      if (!r.seqNo) r.seqNo = idx + 1;
      if (!r.uid) r.uid = "bm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + r.seqNo;

      const isHidden = (state.hideInspected !== false && r.inspected) || Boolean(r.filteredOut);
      const navUrl = (Number.isFinite(r.lat) && Number.isFinite(r.lng)) ? googleNavUrl(r.lat, r.lng) : "";

      return `
        <div class="v2-batch-item ${r.inspected ? 'is-inspected' : ''}" data-meter-idx="${idx}" data-meter-uid="${r.uid}" ${isHidden ? 'style="display:none;"' : ""}>
          <div class="v2-batch-item-title">
            <span style="font-weight:700;display:flex;align-items:center;gap:4px;">
              #${r.seqNo} ${escapeHtml(r.addr || r.code || formattedCustNo)}
              ${r.inspected ? '<span class="v2-batch-badge-inspected">✓ 已跑</span>' : ''}
            </span>
            <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
              ${sharedBadge}
              ${typeBadge}
            </div>
          </div>
          <div class="v2-batch-item-meta">
            <span>電號: <strong>${escapeHtml(formattedCustNo || "--")}</strong></span> · 
            <span>桿名: ${escapeHtml(r.pole || "--")}</span> · 
            <span>圖號: <code style="font-family:monospace;font-weight:700;color:#0f766e;">${escapeHtml(r.code || "--")}</code></span>
          </div>
          ${chips.length > 0 ? `<div class="v2-batch-chips-row">${chips.join("")}</div>` : ""}
          ${cardCollapseHtml}
          <div class="v2-batch-item-footer">
            <button type="button" class="batch-item-act-btn is-inspect ${r.inspected ? 'is-done' : ''}" data-act-uid="${r.uid}" onclick="event.stopPropagation(); window.__toggleBatchInspected?.('${r.uid}');" title="${r.inspected ? '點擊取消已跑並恢復顯示' : '標記此點已巡檢並隱藏'}">
              ${r.inspected ? '✓ 已跑 (點擊復原)' : '👁️ 標記已跑'}
            </button>
            <div style="display:flex;gap:4px;align-items:center;">
              ${navUrl ? `
                <a class="popup-navigation-link batch-item-act-btn is-nav" href="${navUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" title="以 Google Maps 導航至此電表精確座標">
                  🗺️ 導航
                </a>
              ` : ""}
              ${!state.isReadOnlyShare ? `
                <button type="button" class="batch-item-act-btn is-del batch-remove-single-btn" data-remove-uid="${r.uid}" data-remove-idx="${idx}" onclick="event.stopPropagation(); window.__removeBatchMeter?.('${r.uid}');" title="從清單與地圖中移除此電表">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join("");

    controls.list.innerHTML = html;

    // 綁定卡片點擊聚焦
    controls.list.querySelectorAll(".v2-batch-item").forEach(el => {
      el.addEventListener("click", () => {
        const uid = el.dataset.meterUid;
        const r = state.records.find(item => item.uid === uid) || state.records[parseInt(el.dataset.meterIdx, 10)];
        const map = getMap();
        if (map && r && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
          if (!state.showLabels) {
            toggleBatchLabels(true); // 使用者點選特定項目查看時，自動還原顯示標籤與標記
          }
          if (r.marker && !state.layerGroup.hasLayer(r.marker)) {
            state.layerGroup.addLayer(r.marker);
            if (state.showLabels && r.marker.getTooltip()) {
              r.marker.openTooltip();
            }
          }
          map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
          if (r.marker) {
            setTimeout(() => {
              r.marker.openPopup();
              // 若為同變壓器多電表，自動將彈窗內對應電表捲入視野並短暫高亮
              setTimeout(() => {
                const targetEl = document.querySelector(`.batch-popup-meter-item[data-popup-meter-uid="${r.uid}"]`)
                  || document.querySelector(`.batch-popup-meter-item[data-popup-meter-idx="${el.dataset.meterIdx}"]`);
                if (targetEl) {
                  targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  targetEl.style.boxShadow = "0 0 0 2px #0f766e";
                  setTimeout(() => { targetEl.style.boxShadow = ""; }, 1800);
                }
              }, 120);
            }, 400);
          }
        }
      });
    });
  }

  // 匯出帶座標與導航連結的 Excel
  async function exportToExcel() {
    if (!state.records.length) {
      showToast("沒有標記結果可匯出！", "dup");
      return;
    }

    try {
      await ensureXLSX();

      // 收集所有在 extra 中的自訂欄位（如型式、契約、相別、以及使用者匯入之其他欄位）
      const allExtraKeys = new Set();
      state.records.forEach(r => {
        if (r.extra && typeof r.extra === "object") {
          Object.keys(r.extra).forEach(k => {
            const cleanK = String(k || "").trim();
            if (cleanK && !["電號", "用電地址", "地址", "土木設備", "桿名", "設備", "圖號座標", "圖號", "定位型態", "電表表號", "檢定期限"].includes(cleanK)) {
              allExtraKeys.add(cleanK);
            }
          });
        }
      });
      const extraKeyList = Array.from(allExtraKeys);

      const headerRow = [
        "編號", "電號", "用電地址", "土木設備(桿名)", "圖號座標", "電表表號", "檢定期限", "定位型態", "巡檢狀態",
        ...extraKeyList,
        "緯度(Lat)", "經度(Lng)", "Google導航網址"
      ];
      const exportRows = [headerRow];

      state.records.forEach((r) => {
        const row = [
          r.seqNo,
          r.custNo || "",
          r.addr || "",
          r.pole || "",
          r.code || "",
          r.meterNo || "",
          r.inspectTerm || "",
          r.locLabel || "",
          r.inspected ? "已巡檢(已跑)" : "待巡檢"
        ];
        extraKeyList.forEach(k => {
          row.push(r.extra?.[k] || "");
        });
        row.push(
          Number(r.lat.toFixed(6)),
          Number(r.lng.toFixed(6)),
          googleNavUrl(r.lat, r.lng)
        );
        exportRows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "批次電表標記");
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `台電電表標記清單_${dateStr}.xlsx`);
      showToast("📥 Excel 檔案已順利下載！");
    } catch (e) {
      showToast("匯出失敗：" + e.message, "error");
    }
  }

  function normalizeImportedRecords(records) {
    if (!Array.isArray(records)) return [];
    records.forEach((r, idx) => {
      if (!r.seqNo || typeof r.seqNo !== "number") {
        r.seqNo = idx + 1;
      }
      if (!r.uid) {
        r.uid = "bm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + r.seqNo;
      }
      r.inspected = Boolean(r.inspected);
      if (!r.addr && (r.address || r.fullAddress || r.rawAddress || r.name || r.title)) {
        r.addr = r.address || r.fullAddress || r.rawAddress || r.name || r.title;
      }
      // 支援 lat/lng, la/ln, coordinates.lat/lng, latDeg/lngDeg, y/x 與字串型態經緯度
      const rawLat = (r.lat !== undefined && r.lat !== null && r.lat !== "")
        ? r.lat
        : (r.la !== undefined && r.la !== null && r.la !== ""
            ? r.la
            : (r.coordinates?.lat ?? r.latDeg ?? r.y));
      const rawLng = (r.lng !== undefined && r.lng !== null && r.lng !== "")
        ? r.lng
        : (r.ln !== undefined && r.ln !== null && r.ln !== ""
            ? r.ln
            : (r.coordinates?.lng ?? r.lngDeg ?? r.x));
      const numLat = typeof rawLat === "number" ? rawLat : parseFloat(rawLat);
      const numLng = typeof rawLng === "number" ? rawLng : parseFloat(rawLng);
      if (Number.isFinite(numLat) && Number.isFinite(numLng)) {
        r.lat = numLat;
        r.lng = numLng;
      }

      if (!r.extra || typeof r.extra !== "object") r.extra = {};
      if (r.locType && !r.extra["定位型態"]) {
        r.extra["定位型態"] = r.locType === "doorplate" ? "🏠 門牌定位" : (r.locType === "fallback" ? "⚡ 圖號保底" : "⚡ 圖號定位");
      }
      if (r.pole && !r.extra["土木設備"]) r.extra["土木設備"] = r.pole;
      if (r.inspectTerm && !r.extra["檢定期限"]) r.extra["檢定期限"] = r.inspectTerm;
      if (r.meterType && !r.extra["型式"]) r.extra["型式"] = r.meterType;
      if (r.contract && !r.extra["契約"]) r.extra["契約"] = r.contract;
      if (r.phase && !r.extra["相別"]) r.extra["相別"] = r.phase;
    });
    return records;
  }

  function getCleanRecords() {
    return state.records.map(r => ({
      seqNo: r.seqNo,
      uid: r.uid,
      inspected: Boolean(r.inspected),
      custNo: r.custNo || "",
      addr: r.addr || "",
      pole: r.pole || "",
      code: r.code || "",
      meterNo: r.meterNo || "",
      inspectTerm: r.inspectTerm || "",
      locType: r.locType || "grid",
      locLabel: r.locLabel || "",
      lat: r.lat,
      lng: r.lng,
      extra: r.extra || null
    }));
  }

  // --- 本機檔案備份與讀取 (免登入、公司內網最佳、外勤手機零門檻互傳) ---
  function downloadBatchJson() {
    if (!state.records.length) {
      showToast("目前沒有批次電表標記可下載！", "dup");
      return;
    }
    const cleanRecords = getCleanRecords();
    const jsonStr = JSON.stringify(cleanRecords, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `批次電表標記_${timeStr}.json`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast(`💾 已下載 ${cleanRecords.length} 筆電表備份檔 (${filename})！`);
  }

  function restoreBatchJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          showToast("備份檔格式不符（須為 JSON 陣列）！", "error");
          return;
        }
        if (!parsed.length) {
          showToast("備份檔為空資料！", "dup");
          return;
        }
        state.records = normalizeImportedRecords(parsed);
        state.activeFilters = {};
        localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(state.records));
        hideBackgroundPoleLabels();
        renderBatchMarkers();
        renderBatchList();
        updateSummaryBadges();
        updateFilterStatusUI(state.records.length);
        switchTab("list");
        const map = getMap();
        if (map && state.records.length > 0) {
          const bounds = getBatchRecordsBounds();
          if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
        showToast(`📂 成功還原 ${state.records.length} 筆電表標記！`);
      } catch (err) {
        showToast("解析備份檔失敗：" + err.message, "error");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  // --- Google Drive 備份、還原與刪除 (獨立批次電表清單) ---
  window.__getBatchRecords = () => getCleanRecords();

  function uploadBatchToDrive() {
    if (!state.records.length) {
      showToast("目前沒有批次電表標記可上傳！", "dup");
      return;
    }
    const clean = getCleanRecords();
    localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(clean));
    const doneCount = clean.filter(r => r.inspected).length;
    showToast(`☁️ 正在上傳 ${clean.length} 筆電表 (含 ${doneCount} 筆已跑進度) 至雲端...`);
    if (window.__bookmarkDrive) {
      window.__bookmarkDrive.upload("batch");
    } else {
      showToast("Google Drive 模組尚未就緒，請稍候重試", "error");
    }
  }

  function restoreBatchFromDrive() {
    if (window.__bookmarkDrive) {
      window.__bookmarkDrive.restore("batch");
    } else {
      showToast("Google Drive 模組尚未就緒，請稍候重試", "error");
    }
  }

  function deleteBatchFromDrive() {
    if (window.__bookmarkDrive) {
      window.__bookmarkDrive.deleteCloud("batch");
    } else {
      showToast("Google Drive 模組尚未就緒，請稍候重試", "error");
    }
  }

  // 清空所有標記 (二次確認防誤觸機制)
  let _clearAllPending = false;
  let _clearAllTimer = null;

  function resetClearAllBtn() {
    _clearAllPending = false;
    if (_clearAllTimer) {
      clearTimeout(_clearAllTimer);
      _clearAllTimer = null;
    }
    if (controls.clearAllBtn) {
      controls.clearAllBtn.textContent = "🗑️ 清空清單";
      controls.clearAllBtn.title = "清空此批次所有定位標記與資料";
      controls.clearAllBtn.classList.remove("is-confirming");
    }
  }

  function handleClearAllClick(e) {
    if (e) e.stopPropagation();
    if (state.isReadOnlyShare) {
      showToast("此地圖為唯讀巡查模式，無法清空清單！", "dup");
      resetClearAllBtn();
      return;
    }

    if (!state.records || !state.records.length) {
      showToast("目前沒有批次電表標記可清空！", "dup");
      return;
    }

    if (!_clearAllPending) {
      // 第一次點擊：進入二次確認狀態
      _clearAllPending = true;
      if (controls.clearAllBtn) {
        controls.clearAllBtn.textContent = "⚠️ 確定清空？";
        controls.clearAllBtn.title = "再次點擊將立即清空全部標記與資料 (4秒後自動取消)";
        controls.clearAllBtn.classList.add("is-confirming");
      }
      showToast("⚠️ 請再次點擊「確定清空」以確認刪除全體清單", "dup");

      if (_clearAllTimer) clearTimeout(_clearAllTimer);
      _clearAllTimer = setTimeout(() => {
        resetClearAllBtn();
      }, 4000);
      return;
    }

    // 第二次點擊：真正執行清空
    resetClearAllBtn();
    clearAllMarkers();
  }

  // 清空所有標記
  function clearAllMarkers() {
    if (state.isReadOnlyShare) {
      showToast("此地圖為唯讀巡查模式，無法清空清單！", "dup");
      return;
    }
    if (!state.records.length) return;
    if (state.layerGroup) state.layerGroup.clearLayers();
    state.records = [];
    state.activeFilters = {};
    updateFilterStatusUI(0);
    localStorage.removeItem("tp_batch_meter_bookmarks_v1");
    renderBatchList();
    updateSummaryBadges(0, 0, 0);
    showToast("🗑️ 已清空批次電表標記與清單");
  }

  // 綁定所有使用者介面事件
  function bindEvents() {
    document.addEventListener("v2-cadastre-open", () => setPanelOpen(false));
    document.addEventListener("v2-address-open", () => setPanelOpen(false));
    document.addEventListener("v2-inspection-open", () => setPanelOpen(false));
    document.addEventListener("v2-search-open", () => setPanelOpen(false));
    document.addEventListener("v2-layer-open", () => setPanelOpen(false));

    controls.toggle?.addEventListener("click", () => setPanelOpen(!controls.panel?.classList.contains("is-open")));
    controls.close?.addEventListener("click", () => setPanelOpen(false));

    controls.tabs?.forEach(btn => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    controls.sampleBtn?.addEventListener("click", () => {
      if (controls.input) {
        controls.input.value = SAMPLE_TEXT;
        showToast("已載入新化區測試範例資料！請點擊開始標記");
      }
    });

    function handleClearInput() {
      if (controls.input) {
        controls.input.value = "";
        controls.input.focus();
        showToast("已清空輸入框內容");
      }
    }
    controls.clearInputBtn?.addEventListener("click", handleClearInput);
    controls.clearInputBtnTop?.addEventListener("click", handleClearInput);

    controls.startBtn?.addEventListener("click", runBatchGeocoding);

    controls.fileBtn?.addEventListener("click", () => controls.fileInput?.click());
    controls.fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await ensureXLSX();
        const reader = new FileReader();
        reader.onload = evt => {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const tsv = XLSX.utils.sheet_to_csv(firstSheet, { FS: "\t" });
            if (controls.input) {
              controls.input.value = tsv;
              showToast(`成功讀取「${file.name}」，已填入輸入框！請點擊開始標記`);
            }
          } catch (err) {
            showToast("檔案讀取失敗：" + err.message, "error");
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        showToast("解析失敗：" + err.message, "error");
      }
    });

    controls.fitBoundsBtn?.addEventListener("click", () => {
      const map = getMap();
      if (map && state.records.length > 0) {
        if (!state.showLabels) {
          toggleBatchLabels(true); // 點擊全體視野時自動還原顯示
        }
        const bounds = getBatchRecordsBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
      }
    });

    controls.exportBtn?.addEventListener("click", exportToExcel);
    controls.clearAllBtn?.addEventListener("click", handleClearAllClick);
    document.addEventListener("click", (e) => {
      if (_clearAllPending && !e.target.closest("#batchClearAllBtn")) {
        resetClearAllBtn();
      }
    });

    // 條件篩選按鈕與手機抽屜控制
    controls.filterBtn?.addEventListener("click", openFilterDrawer);
    controls.filterCloseBtn?.addEventListener("click", closeFilterDrawer);
    controls.filterBackdrop?.addEventListener("click", closeFilterDrawer);
    controls.filterApplyBtn?.addEventListener("click", applyDrawerFilters);
    controls.filterResetAllBtn?.addEventListener("click", resetAllFilters);
    controls.filterResetQuickBtn?.addEventListener("click", resetAllFilters);

    // 標籤控制
    controls.toggleBgLabelsBtn?.addEventListener("click", toggleBackgroundPoleLabels);
    controls.toggleLabelsBtn?.addEventListener("click", () => toggleBatchLabels());

    // 本機檔案備份與還原 (公司內網 / 手機互傳)
    controls.downloadJsonBtn?.addEventListener("click", downloadBatchJson);
    controls.restoreJsonBtn?.addEventListener("click", () => controls.jsonFileInput?.click());
    controls.jsonFileInput?.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) restoreBatchJson(file);
      e.target.value = "";
    });

    // 專屬分享連結 (訪客唯讀巡查模式)
    controls.shareBtn?.addEventListener("click", generateShareLink);
    controls.shareQuickBtn?.addEventListener("click", generateShareLink);

    // 雲端備份
    controls.driveUploadBtn?.addEventListener("click", uploadBatchToDrive);
    controls.driveRestoreBtn?.addEventListener("click", restoreBatchFromDrive);
    controls.driveDeleteBtn?.addEventListener("click", deleteBatchFromDrive);
        syncBgLabelsBtnWithMap();

    // 監聽標籤/點位圖層切換事件，實現與圖層控制選單雙向即時連動
    window.addEventListener("poleLabelsToggled", (e) => {
      const isHidden = e && e.detail && typeof e.detail.hidden === "boolean"
        ? e.detail.hidden
        : (document.getElementById("toggleLabelsBtn")?.classList.contains("is-hidden") || false);
      updateBgLabelsBtnUI(isHidden);
    });

    // 監聽 Drive 還原事件
    window.addEventListener("batchMetersRestored", (e) => {
      try {
        // 優先讀取事件 detail 內傳遞的已解析資料，徹底避開 localStorage 延遲或舊版快取
        let saved = (e && e.detail && Array.isArray(e.detail.records) && e.detail.records.length > 0)
          ? e.detail.records
          : null;
        if (!saved || !saved.length) {
          try {
            const raw = JSON.parse(localStorage.getItem("tp_batch_meter_bookmarks_v1") || "[]");
            if (Array.isArray(raw) && raw.length > 0) saved = raw;
          } catch {}
        }
        // 若前面曾被舊版寫入 "undefined"，自動搶救還原
        if (!saved || !saved.length) {
          try {
            const undefRaw = JSON.parse(localStorage.getItem("undefined") || "[]");
            if (Array.isArray(undefRaw) && undefRaw.length > 0) {
              saved = undefRaw;
              localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(saved));
              localStorage.removeItem("undefined");
            }
          } catch {}
        }

        // 若備份檔物件結構包含 records 或 meters，自動解包
        if (!Array.isArray(saved) && saved && typeof saved === "object") {
          if (Array.isArray(saved.records)) saved = saved.records;
          else if (Array.isArray(saved.meters)) saved = saved.meters;
          else if (Array.isArray(saved.data)) saved = saved.data;
          else if (Array.isArray(saved.items)) saved = saved.items;
          else if (Array.isArray(saved.bookmarks)) saved = saved.bookmarks;
        }

        if (Array.isArray(saved) && saved.length > 0) {
          state.records = normalizeImportedRecords(saved);
          state.activeFilters = {};
          localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(state.records));
          hideBackgroundPoleLabels();
          renderBatchMarkers();
          renderBatchList();
          updateSummaryBadges();
          updateFilterStatusUI(state.records.length);
          setPanelOpen(true);
          switchTab("list");
          const map = getMap();
          if (map && state.records.length > 0) {
            const bounds = getBatchRecordsBounds();
            if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
          }
          const doneCount = state.records.filter(r => r.inspected).length;
          showToast(`☁️ 已從 Google Drive 還原 ${state.records.length} 筆電表 (已跑 ${doneCount} 筆已自動同步隱藏)！`);
        } else {
          showToast("還原失敗：備份檔內無有效電表資料", "error");
        }
      } catch (err) {
        console.error("還原批次電表失敗：", err);
        showToast("還原解析錯誤：" + err.message, "error");
      }
    });

  // 標記已跑切換 (依永久 uid 鎖定)
  window.__toggleBatchInspected = function(uid) { toggleRecordInspected(uid); };
  window.__removeBatchMeter = function(uid) { removeRecordByUid(uid); };

      // --- 局部精準更新 (O(1)) 效能核心：直接更新對應 DOM 與 Marker，避免全量重繪 ---
  function updateCardInspectedUI(record) {
    const card = document.querySelector(`.v2-batch-item[data-meter-uid="${record.uid}"]`);
    if (!card) return;

    card.classList.toggle("is-inspected", record.inspected);

    const btn = card.querySelector(".batch-item-act-btn.is-inspect");
    if (btn) {
      btn.classList.toggle("is-done", record.inspected);
      btn.textContent = record.inspected ? "✓ 已跑 (點擊復原)" : "👁️ 標記已跑";
      btn.title = record.inspected ? "點擊取消已跑並恢復顯示" : "標記此點已巡檢並隱藏";
    }

    const titleSpan = card.querySelector(".v2-batch-item-title > span");
    if (titleSpan) {
      let badge = titleSpan.querySelector(".v2-batch-badge-inspected");
      if (record.inspected && !badge) {
        const span = document.createElement("span");
        span.className = "v2-batch-badge-inspected";
        span.textContent = "✓ 已跑";
        titleSpan.appendChild(span);
      } else if (!record.inspected && badge) {
        badge.remove();
      }
    }

    const isHidden = (state.hideInspected !== false && record.inspected) || Boolean(record.filteredOut);
    card.style.display = isHidden ? "none" : "";
  }

  function updatePopupInspectedUI(record) {
    const popupCard = document.querySelector(`.batch-popup-meter-item[data-popup-meter-uid="${record.uid}"]`);
    if (!popupCard) return;

    popupCard.classList.toggle("is-inspected", record.inspected);

    const btn = popupCard.querySelector(".batch-popup-act-btn.is-inspect");
    if (btn) {
      btn.classList.toggle("is-done", record.inspected);
      btn.textContent = record.inspected ? "✓ 已跑(復原)" : "👁️ 標記已跑";
      btn.title = record.inspected ? "點擊取消已跑並恢復顯示" : "標記此點已巡檢並隱藏";
    }

    const titleStrong = popupCard.querySelector("strong");
    if (titleStrong) {
      let badge = titleStrong.querySelector(".v2-batch-badge-inspected");
      if (record.inspected && !badge) {
        const newBadge = document.createElement("span");
        newBadge.className = "v2-batch-badge-inspected";
        newBadge.textContent = "✓ 已跑";
        titleStrong.appendChild(newBadge);
      } else if (!record.inspected && badge) {
        badge.remove();
      }
    }
  }

  function updateMarkerInspectedUI(record) {
    if (!record.marker || !state.layerGroup) return;

    const group = record.marker._batchClusterGroup || [{ r: record }];
    const isClusterAllDone = group.every(g => g.r.inspected);
    const isHiding = state.hideInspected !== false;
    const map = getMap();
    const bounds = map ? map.getBounds().pad(0.25) : null;
    const inView = bounds ? bounds.contains(record.marker.getLatLng()) : true;

    // 條件篩選檢查：若群組內所有項目均已被條件篩選排除，則不應顯示於地圖
    const hasVisibleFilter = group.some(item => !item.r.filteredOut);
    if (!hasVisibleFilter) {
      if (state.layerGroup.hasLayer(record.marker)) {
        state.layerGroup.removeLayer(record.marker);
      }
      return;
    }

    if (isHiding) {
      if (record.inspected) {
        if (isClusterAllDone) {
          if (state.layerGroup.hasLayer(record.marker)) {
            state.layerGroup.removeLayer(record.marker);
          }
          getMap()?.closePopup();
        }
      } else {
        // 復原待巡檢：若在可視視野內，將圖標重新加回地圖圖層
        if (inView) {
          if (!state.layerGroup.hasLayer(record.marker)) {
            state.layerGroup.addLayer(record.marker);
            if (state.showLabels && record.marker.getTooltip()) {
              record.marker.openTooltip();
            }
          }
        }
      }
    } else {
      // 顯示全部中：若在可視視野內，保證圖標在地圖上，並切換 is-all-done 樣式
      if (inView) {
        if (!state.layerGroup.hasLayer(record.marker)) {
          state.layerGroup.addLayer(record.marker);
          if (state.showLabels && record.marker.getTooltip()) {
            record.marker.openTooltip();
          }
        }
      }
      const pin = record.marker.getElement()?.querySelector(".batch-marker-pin");
      if (pin) pin.classList.toggle("is-all-done", isClusterAllDone);
      const tooltipEl = record.marker.getTooltip()?.getElement();
      if (tooltipEl) tooltipEl.classList.toggle("is-all-done", isClusterAllDone);
    }
  }

  // 標記已跑切換 (O(1) 局部即時更新)
  function toggleRecordInspected(uid) {
    const record = state.records.find(r => r.uid === uid);
    if (!record) return;
    record.inspected = !record.inspected;

    if (state.isReadOnlyShare) {
      saveGuestInspectedState();
    } else {
      localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(getCleanRecords()));
    }

    // O(1) 局部精準操作：絕不重繪全體列表與地圖
    updateCardInspectedUI(record);
    updateMarkerInspectedUI(record);
    updatePopupInspectedUI(record);
    updateSummaryBadges();

    const hideSuffix = state.hideInspected ? " (已隱藏)" : "";
    showToast(record.inspected ? `✓ 已標記 #${record.seqNo} 為已跑${hideSuffix}` : `👁️ 已復原 #${record.seqNo} 為待巡檢`);
  }

  // 永久刪除單筆 (O(1) 局部即時移除)
  function removeRecordByUid(uid) {
    if (state.isReadOnlyShare) {
      showToast("此地圖為唯讀巡查模式，無法移除點位！", "dup");
      return;
    }
    const idx = state.records.findIndex(r => r.uid === uid);
    if (idx === -1) return;
    const removed = state.records.splice(idx, 1)[0];

    // 1. 局部移除地圖圖標
    if (removed.marker && state.layerGroup) {
      const group = removed.marker._batchClusterGroup;
      if (group && group.length > 1) {
        const gIdx = group.findIndex(g => g.r.uid === uid);
        if (gIdx !== -1) group.splice(gIdx, 1);
        if (group.length === 0) {
          state.layerGroup.removeLayer(removed.marker);
        } else {
          const primaryRec = group[0].r;
          const pin = removed.marker.getElement()?.querySelector(".batch-marker-pin-main");
          if (pin) pin.textContent = primaryRec.seqNo;
          const badge = removed.marker.getElement()?.querySelector(".batch-marker-pin-badge");
          if (badge) {
            if (group.length > 1) badge.textContent = `+${group.length - 1}`;
            else badge.remove();
          }
        }
      } else {
        state.layerGroup.removeLayer(removed.marker);
      }
    }

    // 2. 局部移除抽屜卡片
    const card = document.querySelector(`.v2-batch-item[data-meter-uid="${uid}"]`);
    card?.remove();

    // 3. 局部移除地圖彈窗項目
    const popupItem = document.querySelector(`.batch-popup-meter-item[data-popup-meter-uid="${uid}"]`);
    popupItem?.remove();
    const remainingInPopup = document.querySelectorAll(".batch-popup-meter-item");
    if (!remainingInPopup || remainingInPopup.length === 0) {
      getMap()?.closePopup();
    }

    localStorage.setItem("tp_batch_meter_bookmarks_v1", JSON.stringify(getCleanRecords()));
    updateSummaryBadges();
    showToast(`已移除 #${removed.seqNo} 標記`);
  }

  // 切換是否隱藏已跑點位 (就地切換 DOM 與圖層，避免重算與重建)
  function toggleHideInspected() {
    state.hideInspected = !state.hideInspected;
    updatePatrolToggleUI();

    const isHiding = state.hideInspected !== false;
    state.records.forEach(r => {
      // 1. 卡片顯示狀態切換
      const card = document.querySelector(`.v2-batch-item[data-meter-uid="${r.uid}"]`);
      if (card) {
        const isHidden = (isHiding && r.inspected) || Boolean(r.filteredOut);
        card.style.display = isHidden ? "none" : "";
      }
    });

    // 2. 地圖圖層與視野動態裁切
    updateBatchViewportCulling();

    if (isHiding) {
      // 若當前開啟的彈窗所屬點位已被隱藏，關閉彈窗
      const activePopupUid = document.querySelector(".batch-popup-meter-item")?.dataset?.popupMeterUid;
      if (activePopupUid) {
        const activeRec = state.records.find(r => r.uid === activePopupUid);
        if (activeRec && activeRec.inspected) {
          getMap()?.closePopup();
        }
      }
    }

    updateSummaryBadges();
    showToast(state.hideInspected ? "已開啟：隱藏已跑點位" : "已開啟：顯示全部點位 (包含已跑)");
  }

    // 監聽巡檢進度列按鈕
    if (controls.toggleHideDoneBtn) {
      controls.toggleHideDoneBtn.addEventListener("click", () => {
        toggleHideInspected();
      });
    }

    // 監聽標記已跑與單筆移除
    document.addEventListener("click", (e) => {
      // 1. 移除單筆
      const delBtn = e.target.closest(".batch-remove-single-btn");
      if (delBtn && !delBtn.hasAttribute("onclick")) {
        const uid = delBtn.dataset.removeUid;
        if (uid) {
          removeRecordByUid(uid);
          return;
        }
        const idx = parseInt(delBtn.dataset.removeIdx, 10);
        if (!isNaN(idx) && state.records[idx]) {
          removeRecordByUid(state.records[idx].uid);
        }
        return;
      }

      // 2. 標記已跑 / 復原切換
      const inspectBtn = e.target.closest(".is-inspect[data-act-uid]");
      if (inspectBtn && !inspectBtn.hasAttribute("onclick")) {
        const uid = inspectBtn.dataset.actUid;
        if (uid) {
          toggleRecordInspected(uid);
        }
        return;
      }
    });
  }

  // 嘗試還原本地暫存
  function restoreLocalCachedBatch() {
    try {
      const cached = JSON.parse(localStorage.getItem("tp_batch_meter_bookmarks_v1") || "[]");
      if (Array.isArray(cached) && cached.length > 0) {
        state.records = normalizeImportedRecords(cached);
        renderBatchMarkers();
        renderBatchList();
        updateSummaryBadges();
        updateFilterStatusUI(state.records.length);
      }
    } catch (err) {
      console.error("restoreLocalCachedBatch error:", err);
    }
  }

  // --- 專屬分享連結與訪客巡查模式 (他人可點擊看資料、導航、縮放、標記已跑隱藏，但不能刪除移除) ---

  function ensureQRCode() {
    if (window.QRCode) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  function uint8ArrayToBase64Url(bytes) {
    let binary = "";
    const len = bytes.byteLength;
    const chunk = 0x8000;
    for (let i = 0; i < len; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, len)));
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function base64UrlToUint8Array(base64url) {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function compressShareData(data) {
    const jsonStr = JSON.stringify(data);
    if (typeof CompressionStream !== "undefined") {
      const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buffer = await new Response(stream).arrayBuffer();
      return uint8ArrayToBase64Url(new Uint8Array(buffer));
    }
    return btoa(unescape(encodeURIComponent(jsonStr))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function decompressShareData(b64) {
    if (typeof DecompressionStream !== "undefined") {
      try {
        const bytes = base64UrlToUint8Array(b64);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const text = await new Response(stream).text();
        return JSON.parse(text);
      } catch (err) {
        console.warn("DecompressionStream 解壓失敗，嘗試降級解析：", err);
      }
    }
    const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(jsonStr);
  }

  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function tupleToRecord(t, idx) {
    const extra = {};
    if (t[11]) {
      String(t[11]).split(";").forEach(pair => {
        const p = pair.split(":");
        if (p[0]) extra[p[0]] = p.slice(1).join(":");
      });
    }
    const isDoorplate = Number(t[9]) === 1;
    const isInspected = Number(t[10]) === 1;
    return {
      seqNo: Number(t[0]) || (idx + 1),
      uid: `bm_share_${Date.now()}_${t[0] || idx}_${Math.random().toString(36).slice(2, 6)}`,
      lat: Number(t[1]),
      lng: Number(t[2]),
      custNo: String(t[3] || ""),
      addr: String(t[4] || ""),
      pole: String(t[5] || ""),
      code: String(t[6] || ""),
      meterNo: String(t[7] || ""),
      inspectTerm: String(t[8] || ""),
      locType: isDoorplate ? "doorplate" : "grid",
      locLabel: isDoorplate ? "🏠 電子門牌精準定位（用戶住家）" : "⚡ 圖號座標定位（現場掛表電桿）",
      inspected: isInspected,
      extra: Object.keys(extra).length > 0 ? extra : null
    };
  }

  function saveGuestInspectedState() {
    if (!state.isReadOnlyShare || !state.shareHash) return;
    try {
      const inspectedSeqNos = state.records.filter(r => r.inspected).map(r => r.seqNo);
      sessionStorage.setItem("tp_guest_inspected_" + state.shareHash, JSON.stringify(inspectedSeqNos));
    } catch (e) {}
  }

  async function generateShareLink() {
    if (!state.records || !state.records.length) {
      showToast("目前沒有批次電表標記可分享！請先進行標記。", "dup");
      return;
    }

    try {
      showToast("正在產生專屬分享連結…");
      const compact = state.records.map(r => [
        r.seqNo,
        Number(Number(r.lat).toFixed(6)),
        Number(Number(r.lng).toFixed(6)),
        r.custNo || "",
        r.addr || "",
        r.pole || "",
        r.code || "",
        r.meterNo || "",
        r.inspectTerm || "",
        r.locType === "doorplate" ? 1 : 0,
        r.inspected ? 1 : 0,
        r.extra && typeof r.extra === "object" ? Object.entries(r.extra).map(([k, v]) => `${k}:${v}`).join(";") : ""
      ]);

      const b64 = await compressShareData(compact);
      const url = `${location.origin}${location.pathname}#share=${b64}`;

      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch (clipErr) {
        console.warn("自動寫入剪貼簿失敗，改由彈窗手動複製：", clipErr);
      }

      showShareModal(url, state.records.length, copied);
    } catch (err) {
      console.error("產生分享連結失敗：", err);
      showToast("產生分享連結失敗：" + err.message, "error");
    }
  }

  function showShareModal(url, count, autoCopied) {
    const isShortEnoughForQr = url.length <= 2200;
    const content = `
      <div style="font-size:13px;line-height:1.5;color:#334155;">
        <div style="margin-bottom:10px;">
          ${autoCopied 
            ? `<div style="background:#ecfdf5;border:1px solid #10b981;border-radius:6px;padding:6px 10px;color:#065f46;font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                 <span>✅</span><span>連結已自動複製到剪貼簿！可直接貼至 LINE 或 Teams。</span>
               </div>`
            : ''}
          已將 <strong>${count}</strong> 只電表之現場座標、桿號與地址資料封裝為專屬分享連結：
        </div>

        <div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;">
          <input type="text" id="bmShareUrlInput" readonly value="${escapeHtml(url)}" 
            style="flex:1;padding:7px 10px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#0f172a;min-width:0;" 
            onclick="this.select();" />
          <button type="button" id="bmShareCopyBtn" 
            style="background:#0f766e;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
            複製連結
          </button>
        </div>

        ${isShortEnoughForQr ? `
          <div style="text-align:center;margin:10px 0;padding:10px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">📱 或現場直接掃描 QR Code 開啟：</div>
            <div id="bmShareQrContainer" style="display:inline-block;padding:6px;background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.1);min-height:140px;min-width:140px;"></div>
          </div>
        ` : `
          <div style="font-size:11px;color:#64748b;background:#f8fafc;border-radius:6px;padding:6px 10px;margin-bottom:10px;">
            💡 提示：點位數量較多（共 ${count} 筆），建議直接使用上方「複製連結」傳送至手機瀏覽器開啟。
          </div>
        `}

        <div style="font-size:11px;color:#0f766e;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 10px;line-height:1.4;">
          🛡️ <strong>訪客權限保護保證：</strong><br>
          • 他人點擊連結後直接在地圖上檢視、導航與縮放。<br>
          • 他人可點擊「標記已跑」進行隱藏/巡檢，進度僅存在對方手機。<br>
          • <strong>他人無法清空、刪除或移除點位</strong>，您的母檔絕對安全。
        </div>
      </div>
    `;

    if (window.GlobalModal && window.GlobalModal.show) {
      window.GlobalModal.show({
        title: "🔗 批次電表現場巡查分享",
        content,
        type: "alert",
        confirmText: "關閉",
        onConfirm: () => {}
      });

      setTimeout(() => {
        const copyBtn = document.getElementById("bmShareCopyBtn");
        const urlInput = document.getElementById("bmShareUrlInput");
        if (copyBtn && urlInput) {
          copyBtn.onclick = async () => {
            try {
              urlInput.select();
              await navigator.clipboard.writeText(url);
              copyBtn.textContent = "✓ 已複製！";
              copyBtn.style.background = "#10b981";
              setTimeout(() => {
                copyBtn.textContent = "複製連結";
                copyBtn.style.background = "#0f766e";
              }, 2000);
            } catch (e) {
              urlInput.select();
              document.execCommand("copy");
              copyBtn.textContent = "✓ 已複製！";
            }
          };
        }

        const qrContainer = document.getElementById("bmShareQrContainer");
        if (qrContainer) {
          ensureQRCode().then(() => {
            if (window.QRCode) {
              try {
                new window.QRCode(qrContainer, {
                  text: url,
                  width: 140,
                  height: 140,
                  correctLevel: window.QRCode.CorrectLevel.M
                });
              } catch (qrErr) {
                console.warn("QR Code 渲染跳過：", qrErr);
              }
            }
          });
        }
      }, 50);
    } else {
      window.prompt("已產生分享連結，請複製：", url);
    }
  }

  function applyReadOnlyShareUI(totalCount) {
    if (!state.isReadOnlyShare) return;

    if (controls.clearAllBtn) controls.clearAllBtn.style.display = "none";
    if (controls.shareQuickBtn) controls.shareQuickBtn.style.display = "none";
    const driveUploadBtn = document.getElementById("batchDriveUploadBtn");
    const driveRestoreBtn = document.getElementById("batchDriveRestoreBtn");
    const driveDeleteBtn = document.getElementById("batchDriveDeleteBtn");
    const restoreJsonBtn = document.getElementById("batchRestoreJsonBtn");
    if (driveUploadBtn) driveUploadBtn.style.display = "none";
    if (driveRestoreBtn) driveRestoreBtn.style.display = "none";
    if (driveDeleteBtn) driveDeleteBtn.style.display = "none";
    if (restoreJsonBtn) restoreJsonBtn.style.display = "none";

    let banner = document.getElementById("batchShareBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "batchShareBanner";
      banner.style.cssText = "display:flex;align-items:center;justify-content:space-between;background:#ecfdf5;border:1px solid #10b981;border-radius:6px;padding:8px 10px;margin:2px 0 8px;font-size:12px;color:#065f46;";
      banner.innerHTML = `
        <div style="min-width:0;flex:1;padding-right:8px;">
          <strong style="display:flex;align-items:center;gap:4px;font-size:13px;color:#065f46;">
            <span>📋</span><span>現場巡查模式 (唯讀保護)</span>
          </strong>
          <div style="font-size:11px;color:#047857;margin-top:2px;">
            共 <strong id="batchShareBannerCount">${totalCount}</strong> 只電表 · 可導航、縮放、標記已跑
          </div>
        </div>
        <button id="batchExitShareBtn" type="button" 
          style="background:#fff;border:1px solid #cbd5e1;border-radius:5px;padding:5px 9px;font-size:11px;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.05);"
          title="退出此分享畫面並恢復您本機的電表清單">
          ✕ 退出巡查
        </button>
      `;

      const trioRow = document.querySelector(".v2-batch-trio-row");
      if (trioRow && trioRow.parentNode) {
        trioRow.parentNode.insertBefore(banner, trioRow);
      } else if (controls.panel) {
        controls.panel.querySelector(".v2-cadastre-body")?.prepend(banner);
      }

      const exitBtn = document.getElementById("batchExitShareBtn");
      if (exitBtn) {
        exitBtn.onclick = () => exitReadOnlyShareMode();
      }
    }
  }

  function exitReadOnlyShareMode() {
    const doExit = () => {
      let newHash = window.location.hash.replace(/[#&]share=[A-Za-z0-9_-]+/, "");
      if (newHash === "#" || !newHash) newHash = "";
      history.replaceState(null, "", window.location.pathname + window.location.search + newHash);

      state.isReadOnlyShare = false;
      state.shareHash = "";

      const banner = document.getElementById("batchShareBanner");
      if (banner) banner.remove();

      if (controls.clearAllBtn) controls.clearAllBtn.style.display = "";
      if (controls.shareQuickBtn) controls.shareQuickBtn.style.display = "";
      const driveUploadBtn = document.getElementById("batchDriveUploadBtn");
      const driveRestoreBtn = document.getElementById("batchDriveRestoreBtn");
      const driveDeleteBtn = document.getElementById("batchDriveDeleteBtn");
      const restoreJsonBtn = document.getElementById("batchRestoreJsonBtn");
      if (driveUploadBtn) driveUploadBtn.style.display = "";
      if (driveRestoreBtn) driveRestoreBtn.style.display = "";
      if (driveDeleteBtn) driveDeleteBtn.style.display = "";
      if (restoreJsonBtn) restoreJsonBtn.style.display = "";

      restoreLocalCachedBatch();
      showToast("已退出現場巡查模式，已恢復本機電表資料！");
    };

    if (window.GlobalModal && window.GlobalModal.confirm) {
      window.GlobalModal.confirm("確定退出現場巡查模式？將清除此分享畫面並恢復您本機的電表清單。", doExit);
    } else {
      if (window.confirm("確定退出現場巡查模式？將恢復您本機的電表清單。")) doExit();
    }
  }

  async function checkAndLoadSharedBatch() {
    let raw = "";
    const hash = window.location.hash || "";
    const hashMatch = hash.match(/[#&]share=([A-Za-z0-9_-]+)/);
    if (hashMatch && hashMatch[1]) {
      raw = hashMatch[1];
    }
    if (!raw) {
      const search = window.location.search || "";
      const searchParams = new URLSearchParams(search);
      raw = searchParams.get("share") || "";
    }

    if (!raw) return false;

    try {
      const tuples = await decompressShareData(raw);
      if (!Array.isArray(tuples) || !tuples.length) return false;

      const records = tuples.map((t, idx) => tupleToRecord(t, idx));
      if (!records.length) return false;

      state.isReadOnlyShare = true;
      state.shareHash = hashString(raw);
      state.records = records;

      try {
        const rawSaved = sessionStorage.getItem("tp_guest_inspected_" + state.shareHash);
        if (rawSaved) {
          const guestInspected = JSON.parse(rawSaved);
          if (Array.isArray(guestInspected)) {
            const set = new Set(guestInspected);
            state.records.forEach(r => {
              r.inspected = set.has(r.seqNo);
            });
          }
        }
      } catch (e) {}

      renderBatchMarkers();
      renderBatchList();
      updatePatrolToggleUI();
      updateSummaryBadges();
      updateFilterStatusUI(state.records.length);
      applyReadOnlyShareUI(records.length);

      const map = getMap();
      if (map && state.records.length > 0) {
        const bounds = getBatchRecordsBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
      }

      switchTab("list");
      setPanelOpen(true);

      showToast(`📋 已載入現場巡查分享（共 ${records.length} 只電表，唯讀保護）`);
      return true;
    } catch (err) {
      console.error("解析分享資料失敗：", err);
      showToast("載入分享資料失敗，可能連結不完整或損毀", "error");
      return false;
    }
  }

  async function boot(attempt = 0) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => boot(0), { once: true });
      return;
    }
    initControls();
    bindEvents();

    const loadedShare = await checkAndLoadSharedBatch();
    if (!loadedShare) {
      restoreLocalCachedBatch();
    }

    const map = getMap();
    if (!map && attempt < 40) {
      setTimeout(() => boot(attempt + 1), 100);
      return;
    }
    if (map) {
      setupMapViewportEvents(map);
      if (loadedShare && state.records.length > 0) {
        const bounds = getBatchRecordsBounds();
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
      }
    }
  }

  boot();
})();
