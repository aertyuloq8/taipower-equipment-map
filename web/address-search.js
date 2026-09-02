(() => {
  "use strict";
  const controls = {
    panel: document.getElementById("v2AddressPanel"),
    toggle: document.getElementById("v2AddressToggle"),
    close: document.getElementById("v2AddressClose"),
    input: document.getElementById("addrSearchInput"),
    status: document.getElementById("addrSearchStatus"),
    results: document.getElementById("addrSearchResults"),
  };
  const ADDRESS_BOOKMARKS_KEY = "tp_address_bookmarks_v1";
  function loadAddressBookmarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(ADDRESS_BOOKMARKS_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(b => b && b.id && b.addr) : [];
    } catch { return []; }
  }
  function saveAddressBookmarks() {
    try { localStorage.setItem(ADDRESS_BOOKMARKS_KEY, JSON.stringify(addressBookmarks)); } catch {}
    // Also write to IndexedDB (async, non-blocking)
    if (window.__bookmarkDB) window.__bookmarkDB.saveBookmarks("address", addressBookmarks).catch(() => {});
  }
  let addressBookmarks = loadAddressBookmarks();
  let addressBookmarkLayers = new Map();
  let addressSelectedIds = new Set();
  window.addEventListener("bookmarksRestored", () => {
    addressBookmarks = JSON.parse(localStorage.getItem("tp_address_bookmarks_v1") || "[]");
    addressSelectedIds.clear();
    renderAddressBookmarks();
  });
  // Async migration: load from IndexedDB if available, update in-memory array
  if (window.__bookmarkDB) {
    window.__bookmarkDB.loadBookmarks("address").then(data => {
      if (Array.isArray(data)) { addressBookmarks = data; renderAddressBookmarks(); }
    }).catch(() => {});
  }
  const state = {
    marker: null,
    timer: null,
    platesByKey: new Map(),
  };
  if (!controls.panel || !controls.toggle || !controls.input) return;
  function getMap() { return window.__v2LeafletMap || null; }
  function escapeHtml(v){ return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function setStatus(m){ controls.status.textContent = m; }

  // ---- GAS JSONP（與 cadastre-v2.js 相同方式呼叫 GAS）----
  function gasJsonp(params){
    return new Promise((resolve, reject)=>{
      const cb = `__gas_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const script = document.createElement("script");
      const timer = setTimeout(()=>{ cleanup(); reject(new Error("GAS 連線逾時")); }, 9000);
      const cleanup = ()=>{ try{ delete window[cb]; }catch(e){} script.remove(); clearTimeout(timer); };
      window[cb] = (data)=>{ cleanup(); resolve(data); };
      const base = String(window.CADASTRE_GAS_URL || "").trim();
      if(!base){ cleanup(); reject(new Error("未設定 GAS 網址")); return; }
      const usp = new URLSearchParams(params);
      usp.set("callback", cb);
      script.src = base + "?" + usp.toString();
      script.onerror = ()=>{ cleanup(); reject(new Error("GAS 連線失敗")); };
      document.head.appendChild(script);
    });
  }

  // ---- 國土測繪精確門牌清單（經 GAS 代理，與 maps.nlsc.gov.tw 一致）----
  async function fetchNLSC(q){
    let addr = q.trim();
    if(!addr.startsWith("臺南") && !addr.startsWith("台南")) addr = "臺南市" + addr;
    try{
      const data = await gasJsonp({ action: "addr", word: addr });
      const list = (data && Array.isArray(data.results)) ? data.results : [];
      if(list.length){
        return list.map((addrStr, i)=>{
          const key = `nlsc_${i}_${addrStr}`;
          const plate = { r: addrStr, d: "", la: null, ln: null, k: key, addr: addrStr };
          state.platesByKey.set(key, plate);
          return plate;
        });
      }
    }catch(e){ console.warn("NLSC(GAS) 失敗", e.message); }
    return [];
  }

  // ---- 國土測繪精確座標（點選地址後，QuerySearch 回傳 LOCATION）----
  async function nlscGeo(addr){
    try{
      const data = await gasJsonp({ action: "addrGeo", word: addr });
      const list = (data && Array.isArray(data.results)) ? data.results : [];
      if(list.length){
        // 優先精確匹配；否則取第一筆
        const plain = (s)=>String(s||"").normalize("NFKC").replace(/[()\[\]（）\s]+/g,"").replace(/號/g,"");
        const norm = plain(addr);
        const exact = list.find(it=> plain(it.address) === norm) || list[0];
        if(Number.isFinite(exact.x) && Number.isFinite(exact.y)) return { la: exact.y, ln: exact.x };
      }
    }catch(e){ console.warn("NLSC 定位失敗", e.message); }
    return null;
  }

  // ---- ArcGIS 備援 ----
  async function fetchArcGIS(q){
    let addr = q.trim();
    if(!addr.startsWith("臺南") && !addr.startsWith("台南")) addr = "臺南市" + addr;
    try{
      const r = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&SingleLine=${encodeURIComponent(addr)}&outFields=*&maxLocations=10`, {cache:"no-store"});
      const j = await r.json();
      return (j.candidates||[]).map((c,i)=>{
        const key = `arcgis_${i}_${c.location.x}_${c.location.y}`;
        const plate = { r: c.address || addr, d: "", la: c.location.y, ln: c.location.x, k: key, addr: c.address || addr };
        state.platesByKey.set(key, plate);
        return plate;
      });
    }catch(e){ console.warn("ArcGIS 失敗", e.message); return []; }
  }

  // ---- 主搜尋：NLSC(GAS) 精確清單優先，ArcGIS 備援 ----
  async function performSearch(){
    const raw = controls.input.value.trim();
    if(!raw){ controls.results.innerHTML=""; setStatus(""); return; }
    setStatus("搜尋中…");
    try{
      let plates = await fetchNLSC(raw);
      let isOnline = plates.length > 0;
      if(!plates.length){
        setStatus("線上備援…");
        plates = await fetchArcGIS(raw);
        isOnline = true;
      }
      if(!plates.length){
        controls.results.innerHTML = `<p class="v2-address-empty">查無「${escapeHtml(raw)}」，請試完整門牌如「竹子脚247之228」或「洋子20號」。</p>`;
        setStatus("查無結果");
        return;
      }
      renderResults(raw, plates, plates.length, isOnline);
    }catch(e){
      console.error(e);
      controls.results.innerHTML = `<p class="v2-address-empty">搜尋失敗：${escapeHtml(e.message)}</p>`;
      setStatus("搜尋失敗");
    }
  }
  function renderResults(q, plates, plateCount, isOnline){
    let html = `<p class="v2-address-section">${isOnline?"線上門牌（國土測繪）":"門牌"}（${plateCount}）</p>`;
    for(const plate of plates){
      html += `<button type="button" class="v2-address-item" data-plate="${escapeHtml(plate.k)}"><span class="v2-address-item-name">${escapeHtml(plate.r)}</span></button>`;
    }
    controls.results.innerHTML = html;
    setStatus(`找到 ${plateCount} 筆`);
  }
  function ensureMarker(map){
    // Always create marker if not exists
    if(!state.marker){
      const icon = L.divIcon({ className: "address-marker-icon", html: '<div style="width:16px;height:16px;background:#ef4444;border:3px solid #b91c1c;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>', iconSize: [40,40], iconAnchor: [20,20], popupAnchor: [0,-20] });
      state.marker = L.marker([0,0], { icon, interactive:true, bubblingMouseEvents:true, keyboard:true, zIndexOffset: 1000 });
    }
    // Re‑attach click handler every time (avoids stale marker reference after query rebuild)
    state.marker.off("click").on("click", ()=> {
      if(!map.hasLayer(state.marker)) return;
      const popup = state.marker.getPopup();
      if(popup && popup.isOpen()){
        popup.close();
      } else if(currentAddressPlate){
        state.marker.unbindPopup();
        state.marker.bindPopup(buildAddressPopupContent(currentAddressPlate), {autoPanPadding:[10,10]});
        state.marker.openPopup();
      }
    });
    // Ensure cursor and bringToFront
    if(state.marker.bringToFront) state.marker.bringToFront();
    if(!map.hasLayer(state.marker)) state.marker.addTo(map);
    // Keep popup autoClose behaviour (true = close when clicking map, false = stay open)
    if(state.marker.getPopup()) state.marker.getPopup().options.autoClose = true;
    return state.marker;
  }
  let currentAddressPlate = null;
  function googleNavUrl(lat,lng){ return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat.toFixed(6)+","+lng.toFixed(6))}`; }
  function buildAddressPopupContent(plate){
    return `<div class="v2-cadastre-popup"><strong>${escapeHtml(plate.r)}</strong><div class="v2-cadastre-popup-actions"><a class="popup-navigation-link" href="${googleNavUrl(plate.la, plate.ln)}" target="_blank" rel="noopener">🗺️ 導航</a><button class="popup-clear-location-button" type="button" onclick="window.__v2AddressClearMarker()">✕ 清除</button><button type="button" data-address-retain style="background:#ecfeff;color:#0f766e;border:1px solid #0f766e;border-radius:5px;min-height:28px;padding:4px 8px;font-weight:800;cursor:pointer;">⭐ 收藏</button></div></div>`;
  }
  function showPlate(map, plate){
    currentAddressPlate = plate;
    const marker = ensureMarker(map);
    marker.setLatLng([plate.la, plate.ln]);
    if (!map.hasLayer(marker)) marker.addTo(map);
    map.flyTo([plate.la, plate.ln], Math.max(map.getZoom(), 19), {duration:0.5});
    marker.unbindPopup();
    marker.bindPopup(buildAddressPopupContent(plate), {autoPanPadding:[10,10]});
    marker.openPopup();
    const onPopupClose = () => {
      marker.off("popupclose", onPopupClose);
    };
    marker.on("popupclose", onPopupClose);
  }
  // 點擊時解析座標（NLSC AutoComplete 只給地址字串，用 QuerySearch 精確定位）
  async function handlePlateClick(plate){
    const map = getMap(); if(!map) return;
    if(!(Number.isFinite(plate.la) && Number.isFinite(plate.ln))){
      setStatus("定位中…");
      const geo = await nlscGeo(plate.addr || plate.r);
      if(geo){ plate.la = geo.la; plate.ln = geo.ln; }
      else {
        const list = await fetchArcGIS(plate.addr || plate.r);
        if(list.length){ plate.la = list[0].la; plate.ln = list[0].ln; }
      }
    }
    if(!(Number.isFinite(plate.la) && Number.isFinite(plate.ln))){
      setStatus("無法取得此門牌座標");
      return;
    }
    showPlate(map, plate);
    setPanelOpen(false);
  }
  window.__v2AddressClearMarker = ()=>{
    const map=getMap(); if(!map) return;
    map.closePopup();
    if(state.marker){ map.removeLayer(state.marker); state.marker=null; }
  };
  function renderAddressBookmarks() {
    const list = document.getElementById("v2AddressBookmarks");
    const countEl = document.getElementById("v2AddressCount");
    const countEl2 = document.getElementById("v2AddressBookmarksCount");
    const toggleBtn = document.getElementById("v2AddressBookmarksToggle");
    const deleteBtn = document.getElementById("v2AddressBookmarksDelete");
    const selectAllCb = document.getElementById("v2AddressSelectAll");
    if (!list) return;
    if (countEl) countEl.textContent = String(addressBookmarks.length);
    if (countEl2) countEl2.textContent = String(addressBookmarks.length);
    if (toggleBtn) {
      const allVisible = addressBookmarks.length && addressBookmarks.every(b => b.visible !== false);
      toggleBtn.textContent = allVisible ? "👁️ 全部隱藏" : "🙈 全部顯示";
    }
    if (deleteBtn) deleteBtn.disabled = addressSelectedIds.size === 0;
    if (selectAllCb) selectAllCb.checked = addressSelectedIds.size > 0 && addressSelectedIds.size === addressBookmarks.length;
    if (!addressBookmarks.length) {
      list.innerHTML = '<p style="color:#999;font-size:12px;padding:12px;text-align:center;">尚無收藏，搜尋後點選門牌並按「收藏」即可加入</p>';
      updateAddressBookmarkLayers();
      return;
    }
    list.innerHTML = addressBookmarks.map(b => `
      <div class="v2-bookmark-item" data-id="${escapeHtml(b.id)}" style="cursor:pointer;transition:transform 0.12s ease, box-shadow 0.12s ease;">
        <div class="v2-bookmark-item-head">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" data-address-check="${escapeHtml(b.id)}" ${addressSelectedIds.has(b.id)?"checked":""} style="accent-color:#0f766e;width:16px;height:16px;"> <span class="v2-bookmark-item-title">${escapeHtml(b.addr)}</span></label>
        </div>
        <div class="v2-bookmark-item-actions">
          <button type="button" data-address-action="toggle" data-id="${escapeHtml(b.id)}" style="background:${b.visible===false?'#f8fafc':'#ecfeff'};color:${b.visible===false?'#64748b':'#0f766e'};border:1px solid ${b.visible===false?'#cbd5e1':'#0f766e'};">${b.visible===false?'🙈 顯示':'👁️ 隱藏'}</button>
          <button type="button" data-address-action="remove" data-id="${escapeHtml(b.id)}" style="background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5;">🗑️ 刪除</button>
        </div>
      </div>
    `).join("");
    updateAddressBookmarkLayers();
  }
  function updateAddressBookmarkLayers() {
    const map = getMap();
    if (!map || !window.L) return;
    for (const layer of addressBookmarkLayers.values()) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
    addressBookmarkLayers.clear();
    addressBookmarks.forEach(b => {
      if (b.visible === false) return;
      if (!Number.isFinite(b.la) || !Number.isFinite(b.ln)) return;
      try {
        const icon = L.divIcon({ className: "address-bookmark-icon", html: '<div style="width:14px;height:14px;background:#ef4444;border:2px solid #991b1b;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>', iconSize: [32,32], iconAnchor: [16,16], popupAnchor: [0,-16] });
        const layer = L.marker([b.la, b.ln], { icon, interactive:true, bubblingMouseEvents:true, zIndexOffset: 500 }).addTo(map);
        layer.bindPopup(`<div class="v2-cadastre-popup"><strong>${escapeHtml(b.addr)}</strong><div class="v2-cadastre-popup-actions" style="margin-top:6px;"><a class="popup-navigation-link" href="${googleNavUrl(b.la,b.ln)}" target="_blank" rel="noopener" style="margin-right:6px;">🗺️ 導航</a><button type="button" data-address-bookmark-hide="${escapeHtml(b.id)}" style="background:#f8fafc;color:#64748b;border:1px solid #cbd5e1;border-radius:5px;min-height:28px;padding:4px 8px;font-weight:800;cursor:pointer;">🙈 隱藏</button></div></div>`);
        addressBookmarkLayers.set(b.id, layer);
      } catch {}
    });
  }
  function addAddressBookmark(plate) {
    if (!plate || !Number.isFinite(plate.la) || !Number.isFinite(plate.ln)) { setStatus("無可收藏的座標", { error: true }); return; }
    const addrKey = plate.r || plate.addr;
    const exists = addressBookmarks.some(b => b.addr === addrKey && Math.abs(b.la - plate.la) < 1e-6 && Math.abs(b.ln - plate.ln) < 1e-6);
    if (exists) { setStatus(`已收藏過 ${addrKey}`, { error: true }); return; }
    const id = `${plate.k || plate.addr}_${Date.now()}`;
    addressBookmarks.push({ id, addr: addrKey, la: plate.la, ln: plate.ln, visible: true, createdAt: new Date().toISOString() });
    saveAddressBookmarks();
    renderAddressBookmarks();
    setStatus(`已收藏 ${addrKey}`);
  }
  function bindAddressBookmarkTabs() {
    document.querySelectorAll(".v2-tab-btn[data-panel='address']").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".v2-tab-btn[data-panel='address']").forEach(b => {
          b.classList.toggle("is-active", b.dataset.tab === tab);
          b.setAttribute("aria-selected", String(b.dataset.tab === tab));
        });
        document.querySelectorAll(".v2-tab-pane[data-panel='address']").forEach(pane => {
          const isActive = pane.dataset.pane === tab;
          pane.classList.toggle("is-active", isActive);
          pane.hidden = !isActive;
        });
      });
    });
    const addressListEl = document.getElementById("v2AddressBookmarks");
    addressListEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-address-action]");
      if (btn) {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.addressAction;
        const bm = addressBookmarks.find(b => b.id === id);
        if (!bm) return;
        if (action === "toggle") {
          bm.visible = bm.visible === false ? true : false;
          saveAddressBookmarks();
          renderAddressBookmarks();
        } else if (action === "remove") {
          const removed = addressBookmarks.find(b => b.id === id);
          addressBookmarks = addressBookmarks.filter(b => b.id !== id);
          addressSelectedIds.delete(id);
          saveAddressBookmarks();
          renderAddressBookmarks();
          if (removed && currentAddressPlate && (currentAddressPlate.r === removed.addr || currentAddressPlate.addr === removed.addr)) {
            window.__v2AddressClearMarker();
            currentAddressPlate = null;
          }
        }
        return;
      }
      const item = e.target.closest(".v2-bookmark-item");
      if (!item) return;
      const id = item.dataset.id;
      const bm = addressBookmarks.find(b => b.id === id);
      const map = getMap();
      if (!bm || !map) return;
      if (bm.visible === false) {
        bm.visible = true;
        saveAddressBookmarks();
        renderAddressBookmarks();
      }
      const layer = addressBookmarkLayers.get(id);
      if (layer) {
        map.flyTo([bm.la, bm.ln], Math.max(map.getZoom(), 19), { duration: 0.5 });
        setTimeout(() => layer.openPopup(), 500);
      } else if (Number.isFinite(bm.la) && Number.isFinite(bm.ln)) {
        // Bookmark was hidden, now visible but layer not yet created, re-render will create it
        setTimeout(() => {
          const newLayer = addressBookmarkLayers.get(id);
          if (newLayer) {
            map.flyTo([bm.la, bm.ln], Math.max(map.getZoom(), 19), { duration: 0.5 });
            setTimeout(() => newLayer.openPopup(), 500);
          } else {
            map.flyTo([bm.la, bm.ln], Math.max(map.getZoom(), 19), { duration: 0.5 });
          }
        }, 100);
      }
    });
    addressListEl?.addEventListener("mouseenter", (e) => {
      const item = e.target.closest(".v2-bookmark-item");
      if (!item) return;
      const layer = addressBookmarkLayers.get(item.dataset.id);
      if (!layer) return;
      const el = layer.getElement();
      const inner = el?.querySelector('div');
      if (inner) { inner.style.transform = 'scale(1.3)'; inner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)'; }
      if (layer.bringToFront) layer.bringToFront();
    }, true);
    addressListEl?.addEventListener("mouseleave", (e) => {
      const item = e.target.closest(".v2-bookmark-item");
      if (!item) return;
      const layer = addressBookmarkLayers.get(item.dataset.id);
      if (!layer) return;
      const el = layer.getElement();
      const inner = el?.querySelector('div');
      if (inner) { inner.style.transform = 'scale(1)'; inner.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)'; }
    }, true);
    document.getElementById("v2AddressBookmarksToggle")?.addEventListener("click", () => {
      const allVisible = addressBookmarks.every(b => b.visible !== false);
      addressBookmarks.forEach(b => b.visible = !allVisible);
      saveAddressBookmarks();
      renderAddressBookmarks();
    });
    document.addEventListener("click", (e) => {
      const hideBtn = e.target.closest("[data-address-bookmark-hide]");
      if (!hideBtn) return;
      const id = hideBtn.getAttribute("data-address-bookmark-hide");
      const bm = addressBookmarks.find(b => b.id === id);
      if (!bm) return;
      bm.visible = false;
      saveAddressBookmarks();
      renderAddressBookmarks();
      getMap()?.closePopup();
    });
    document.addEventListener("click", (e) => {
      const retainBtn = e.target.closest("[data-address-retain]");
      if (!retainBtn) return;
      if (currentAddressPlate) addAddressBookmark(currentAddressPlate);
    });
    document.getElementById("v2AddressSelectAll")?.addEventListener("change", (e) => {
      if (e.target.checked) addressBookmarks.forEach(b => addressSelectedIds.add(b.id));
      else addressSelectedIds.clear();
      renderAddressBookmarks();
    });
    addressListEl?.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-address-check]");
      if (!cb) return;
      if (cb.checked) addressSelectedIds.add(cb.dataset.addressCheck);
      else addressSelectedIds.delete(cb.dataset.addressCheck);
      renderAddressBookmarks();
    });
    document.getElementById("v2AddressBookmarksDelete")?.addEventListener("click", () => {
      if (!addressSelectedIds.size) return;
      addressBookmarks = addressBookmarks.filter(b => !addressSelectedIds.has(b.id));
      addressSelectedIds.clear();
      saveAddressBookmarks();
      renderAddressBookmarks();
    });
  }

  function closeOtherFloatingPanels(){
    const s=document.getElementById("mapSearchPanel"), st=document.getElementById("mapSearchToggle"), lp=document.getElementById("layerMenuPanel"), lt=document.getElementById("layerMenuToggle"), cp=document.getElementById("v2CadastrePanel"), ct=document.getElementById("v2CadastreToggle");
    s?.classList.remove("is-open"); st?.classList.remove("is-active"); st?.setAttribute("aria-expanded","false");
    if(lp) lp.hidden=true; lt?.classList.remove("is-active"); lt?.setAttribute("aria-expanded","false");
    cp?.classList.remove("is-open"); cp?.setAttribute("aria-hidden","true"); ct?.classList.remove("is-active"); ct?.setAttribute("aria-expanded","false");
  }
  function setPanelOpen(open){
    if(!controls.panel || !controls.toggle) return;
    if(open && !controls.panel.classList.contains("is-open")){
      const e=new CustomEvent("v2-address-open",{cancelable:true});
      if(!document.dispatchEvent(e)) return;
    }
    controls.panel.classList.toggle("is-open", open);
    controls.panel.setAttribute("aria-hidden", String(!open));
    controls.toggle.classList.toggle("is-active", open);
    controls.toggle.setAttribute("aria-expanded", String(open));
    if(open){ closeOtherFloatingPanels(); controls.input.focus(); }
  }
  document.addEventListener("v2-inspection-open", ()=>setPanelOpen(false));
  controls.toggle.addEventListener("click", ()=> setPanelOpen(!controls.panel.classList.contains("is-open")));
  controls.close?.addEventListener("click", ()=> setPanelOpen(false));
  controls.input.addEventListener("input", ()=>{
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(()=> performSearch(), 350);
  });
  controls.input.addEventListener("keydown", e=>{
    if(e.key==="Escape") setPanelOpen(false);
    if(e.key==="Enter"){ const b=controls.results.querySelector("button.v2-address-item"); b?.click(); }
  });
  controls.results.addEventListener("click", e=>{
    const btn=e.target.closest("button.v2-address-item");
    if(!btn || !btn.dataset.plate) return;
    const plate=state.platesByKey.get(btn.dataset.plate);
    if(!plate) return;
    handlePlateClick(plate);
  });
  bindAddressBookmarkTabs();
  renderAddressBookmarks();
  (function bootAddressBookmarks(attempt=0){
    if (!getMap() && attempt<40) { setTimeout(()=>bootAddressBookmarks(attempt+1),100); return; }
    if (getMap()) {
      updateAddressBookmarkLayers();
      const map = getMap();
      map.on("click", ()=> { if(controls.panel?.classList.contains("is-open")) setPanelOpen(false); });
      map.on("dragstart zoomstart", ()=> { if(controls.panel?.classList.contains("is-open")) setPanelOpen(false); });
    }
  })();
})();
