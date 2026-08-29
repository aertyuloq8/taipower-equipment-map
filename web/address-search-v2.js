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

  // ---- 本地精確庫（提供座標）----
  let __localIndex = null, __localNorm = null;
  function normalizeLocal(v){
    const s=String(v||"").normalize("NFKC");
    let out=""; for(const ch of s) out+=(__localNorm[ch]||ch);
    return out.replace(/[()\[\]（）\s]+/g,"").replace(/[-–—－]/g,"之").replace(/號/g,"");
  }
  async function loadLocalBase(){
    if(__localIndex) return;
    const [idx, variant] = await Promise.all([
      fetch("../data/addr-index.json").then(r=>r.json()),
      fetch("../data/addr-variants.json").then(r=>r.json()).catch(()=>({variants:{}}))
    ]);
    __localIndex = idx; __localNorm = variant.variants||{};
  }
  async function localPlatesFor(q){
    await loadLocalBase();
    const qn = normalizeLocal(q);
    const roads = __localIndex.roads||[];
    const prefix = roads.find(r=> r.k.includes(qn)) ? qn : (()=>{ for(let e=qn.length-1;e>=2;e--){ const sub=qn.slice(0,e); if(roads.some(r=>r.k.includes(sub))) return sub; } return ""; })();
    if(!prefix) return [];
    const hitRoads = roads.filter(r=>r.k.includes(prefix));
    const codes = [...new Set(hitRoads.map(r=>r.d))].slice(0,6);
    const lists = await Promise.all(codes.map(c=> fetch(`../data/addr/${c}.json`).then(r=>r.json()).catch(()=>[])));
    const all = lists.flat().map(p=>{
      const d = __localIndex.districts?.[p.d]||p.d;
      const kk = normalizeLocal(`臺南市${d}`)+normalizeLocal(p.r);
      const plate={r:p.r, d, la:p.la, ln:p.ln, k:kk, addr:`臺南市${d}${p.r}`};
      state.platesByKey.set(kk, plate);
      return plate;
    });
    return all;
  }
  async function findLocalCoords(addrStr){
    try{
      const norm = normalizeLocal(addrStr);
      // 抽路名（去 縣市/區/里/鄰 前綴）
      const roadMatch = norm.match(/([^0-9]+)([0-9之].*)?$/);
      const roadPart = roadMatch ? roadMatch[1] : norm;
      const plates = await localPlatesFor(roadPart);
      const hit = plates.find(p=> p.k.includes(norm)) || plates.find(p=> norm.includes(normalizeLocal(p.r)));
      if(hit && Number.isFinite(hit.la) && Number.isFinite(hit.ln)) return hit;
    }catch(e){ console.warn("本地座標失敗", e.message); }
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

  // ---- 主搜尋：NLSC(GAS) 精確清單優先，本地次之，ArcGIS 最後 ----
  async function performSearch(){
    const raw = controls.input.value.trim();
    if(!raw){ controls.results.innerHTML=""; setStatus(""); return; }
    setStatus("搜尋中…");
    try{
      let plates = await fetchNLSC(raw);
      let isOnline = plates.length > 0;
      if(!plates.length){
        plates = (await localPlatesFor(raw)).filter(p=> p.k.includes(normalizeLocal(raw))).slice(0,10);
      }
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
    if(!state.marker){
      state.marker = L.circleMarker([0,0], {radius:8, color:"#b91c1c", weight:2, fillColor:"#ef4444", fillOpacity:0.95}).addTo(map);
    }
    if(!map.hasLayer(state.marker)) state.marker.addTo(map);
    return state.marker;
  }
  function googleNavUrl(lat,lng){ return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat.toFixed(6)+","+lng.toFixed(6))}`; }
  function showPlate(map, plate){
    const marker = ensureMarker(map);
    marker.setLatLng([plate.la, plate.ln]);
    map.flyTo([plate.la, plate.ln], Math.max(map.getZoom(), 18), {duration:0.5});
    const content = `<div class="v2-cadastre-popup"><strong>${escapeHtml(plate.r)}</strong><br><span>門牌定位（國土測繪/本地精確）</span><div class="v2-cadastre-popup-actions"><a class="popup-navigation-link" href="${googleNavUrl(plate.la, plate.ln)}" target="_blank" rel="noopener">🗺️ 導航</a><button class="popup-clear-location-button" type="button" onclick="window.__v2AddressClearMarker()">✕ 清除</button></div></div>`;
    marker.bindPopup(content, {autoPanPadding:[10,10]});
    marker.on("click", ()=>marker.openPopup());
    setTimeout(()=>marker.openPopup(),520);
  }
  // 點擊時解析座標（NLSC 只給地址字串）
  async function handlePlateClick(plate){
    const map = getMap(); if(!map) return;
    if(!(Number.isFinite(plate.la) && Number.isFinite(plate.ln))){
      setStatus("定位中…");
      const hit = await findLocalCoords(plate.addr || plate.r);
      if(hit){ plate.la = hit.la; plate.ln = hit.ln; }
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
})();
