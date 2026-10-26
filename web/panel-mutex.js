/**
 * 全台土木設備分布地圖 - 全畫面面板互斥與收合管理器 (Panel Mutex Manager)
 * 確保「巡檢、設備、地籍、門牌、批次、圖層」六大功能嚴格互斥，絕不重疊！
 */
(() => {
  "use strict";

  window.__closeAllPanelsExcept = function (exceptName) {
    // 1. 巡檢紀錄面板 (Inspection Panel)
    if (exceptName !== "inspection") {
      const panel = document.getElementById("panel");
      const app = document.querySelector(".app");
      if (panel && !panel.classList.contains("is-collapsed")) {
        panel.classList.add("is-collapsed");
        app?.classList.add("is-panel-collapsed");
        document.body.classList.remove("is-panel-open");
        const toggle = document.getElementById("panelToggle");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
          toggle.classList.remove("is-active");
          toggle.title = "展開面板";
        }
      }
    }

    // 2. 設備搜尋面板 (Equipment Search)
    if (exceptName !== "search") {
      const sp = document.getElementById("mapSearchPanel");
      const st = document.getElementById("mapSearchToggle");
      sp?.classList.remove("is-open");
      st?.classList.remove("is-active");
      st?.setAttribute("aria-expanded", "false");
    }

    // 3. 地籍圖查詢面板 (Cadastre Panel)
    if (exceptName !== "cadastre") {
      const cp = document.getElementById("v2CadastrePanel");
      const ct = document.getElementById("v2CadastreToggle");
      cp?.classList.remove("is-open");
      cp?.setAttribute("aria-hidden", "true");
      ct?.classList.remove("is-active");
      ct?.setAttribute("aria-expanded", "false");
    }

    // 4. 門牌地址查詢面板 (Address Panel)
    if (exceptName !== "address") {
      const ap = document.getElementById("v2AddressPanel");
      const at = document.getElementById("v2AddressToggle");
      ap?.classList.remove("is-open");
      ap?.setAttribute("aria-hidden", "true");
      at?.classList.remove("is-active");
      at?.setAttribute("aria-expanded", "false");
    }

    // 5. 批次電表標記面板 (Batch Meter Panel)
    if (exceptName !== "batch") {
      const bp = document.getElementById("v2BatchMeterPanel");
      const bt = document.getElementById("v2BatchMeterToggle");
      bp?.classList.remove("is-open");
      bp?.setAttribute("aria-hidden", "true");
      bt?.classList.remove("is-active");
      bt?.setAttribute("aria-expanded", "false");
    }

    // 6. 圖層控制選單 (Layer Menu)
    if (exceptName !== "layer") {
      const lp = document.getElementById("layerMenuPanel");
      const lt = document.getElementById("layerMenuToggle");
      if (lp) lp.hidden = true;
      lt?.classList.remove("is-active");
      lt?.setAttribute("aria-expanded", "false");
    }

    // 7. 裝置同步面板 (Device Sync)
    if (exceptName !== "sync") {
      const sp = document.getElementById("v2SyncPanel");
      const st = document.getElementById("v2SyncToggle");
      sp?.classList.remove("is-open");
      sp?.setAttribute("aria-hidden", "true");
      st?.classList.remove("is-active");
      st?.setAttribute("aria-expanded", "false");
    }
  };

  // 關閉所有浮動面板 (地圖點擊/拖曳專用)
  window.__closeFloatingPanels = function () {
    // 設備
    const sp = document.getElementById("mapSearchPanel"), st = document.getElementById("mapSearchToggle");
    sp?.classList.remove("is-open"); st?.classList.remove("is-active"); st?.setAttribute("aria-expanded", "false");
    // 地籍
    const cp = document.getElementById("v2CadastrePanel"), ct = document.getElementById("v2CadastreToggle");
    cp?.classList.remove("is-open"); cp?.setAttribute("aria-hidden", "true"); ct?.classList.remove("is-active"); ct?.setAttribute("aria-expanded", "false");
    // 門牌
    const ap = document.getElementById("v2AddressPanel"), at = document.getElementById("v2AddressToggle");
    ap?.classList.remove("is-open"); ap?.setAttribute("aria-hidden", "true"); at?.classList.remove("is-active"); at?.setAttribute("aria-expanded", "false");
    // 批次
    const bp = document.getElementById("v2BatchMeterPanel"), bt = document.getElementById("v2BatchMeterToggle");
    bp?.classList.remove("is-open"); bp?.setAttribute("aria-hidden", "true"); bt?.classList.remove("is-active"); bt?.setAttribute("aria-expanded", "false");
    // 圖層
    const lp = document.getElementById("layerMenuPanel"), lt = document.getElementById("layerMenuToggle");
    if (lp) lp.hidden = true; lt?.classList.remove("is-active"); lt?.setAttribute("aria-expanded", "false");
    // 同步
    const syp = document.getElementById("v2SyncPanel"), syt = document.getElementById("v2SyncToggle");
    syp?.classList.remove("is-open"); syp?.setAttribute("aria-hidden", "true"); syt?.classList.remove("is-active"); syt?.setAttribute("aria-expanded", "false");

    // 手機版 (寬度 <= 768px) 點地圖同時收合巡檢面板
    if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
      const panel = document.getElementById("panel");
      const app = document.querySelector(".app");
      if (panel && !panel.classList.contains("is-collapsed")) {
        panel.classList.add("is-collapsed");
        app?.classList.add("is-panel-collapsed");
        document.body.classList.remove("is-panel-open");
        const toggle = document.getElementById("panelToggle");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
          toggle.classList.remove("is-active");
          toggle.title = "展開面板";
        }
      }
    }
  };

  // 全域監聽地圖點擊與拖曳，自動收合浮動面板
  function attachMapMutex() {
    const map = window.__v2LeafletMap || window.map;
    if (map && typeof map.on === "function") {
      map.on("click dragstart", () => {
        window.__closeFloatingPanels();
      });
    } else {
      setTimeout(attachMapMutex, 200);
    }
  }

  // 按下 Escape 鍵關閉所有浮動面板
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.__closeFloatingPanels();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachMapMutex, { once: true });
  } else {
    attachMapMutex();
  }
})();
