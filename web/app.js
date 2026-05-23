// ==========================================
      // 不良項目清單 (集中管理，供 Popup 與 datalist 共用)
      // ==========================================
      const DEFECT_ITEMS = ["架空地線綁紮", "樹木修剪", "椰樹修剪", "藤蔓清除", "竹枝清除"];
      // ==========================================
      // 全局自訂彈出視窗 (Modal)
      // ==========================================
      const GlobalModal = {
          overlay: document.getElementById('globalModal'),
          titleEl: document.getElementById('gmTitle'),
          contentEl: document.getElementById('gmContent'),
          inputEl: document.getElementById('gmInput'),
          selectEl: document.getElementById('gmSelect'),
          cancelBtn: document.getElementById('gmCancelBtn'),
          confirmBtn: document.getElementById('gmConfirmBtn'),
          
          show({ title, content, type = 'alert', defaultVal = '', selectHtml = '', onConfirm }) {
              this.titleEl.textContent = title;
              this.contentEl.innerHTML = content;
              this.inputEl.style.display = type === 'prompt' ? 'block' : 'none';
              this.inputEl.value = defaultVal;
              this.selectEl.style.display = type === 'select' ? 'block' : 'none';
              this.selectEl.innerHTML = selectHtml;
              this.cancelBtn.style.display = type === 'alert' ? 'none' : 'block';
              this.cancelBtn.onclick = () => { this.overlay.style.display = 'none'; };
              this.confirmBtn.onclick = () => {
                  this.overlay.style.display = 'none';
                  if (onConfirm) {
                      if (type === 'prompt') onConfirm(this.inputEl.value);
                      else if (type === 'select') onConfirm(this.selectEl.value);
                      else onConfirm(true);
                  }
              };
              this.overlay.style.display = 'flex';
              if (type === 'prompt') setTimeout(() => this.inputEl.focus(), 100);
          },
          alert(msg) { this.show({ title: '提示', content: msg, type: 'alert' }); },
          confirm(msg, onConfirm) { this.show({ title: '請確認', content: msg, type: 'confirm', onConfirm }); },
          prompt(msg, defaultVal, onConfirm) { this.show({ title: '輸入', content: msg, type: 'prompt', defaultVal, onConfirm }); },
          select(title, msg, selectHtml, onConfirm) { this.show({ title, content: msg, type: 'select', selectHtml, onConfirm }); }
      };

      // ==========================================
      // ?????摩
      // ==========================================
      const tabSearchBtn = document.getElementById("tabSearchBtn");
      const tabRecordsBtn = document.getElementById("tabRecordsBtn");
      const tabSearch = document.getElementById("tabSearch");
      const tabRecords = document.getElementById("tabRecords");

      function switchTab(tabId) {
        if (tabId === 'search') {
          tabSearchBtn.classList.add("is-active"); tabRecordsBtn.classList.remove("is-active");
          tabSearch.classList.add("is-active"); tabRecords.classList.remove("is-active");
        } else {
          tabRecordsBtn.classList.add("is-active"); tabSearchBtn.classList.remove("is-active");
          tabRecords.classList.add("is-active"); tabSearch.classList.remove("is-active");
        }
      }
      tabSearchBtn.addEventListener("click", () => switchTab('search'));
      tabRecordsBtn.addEventListener("click", () => switchTab('records'));

      // ==========================================
      // ???摨扳??詨??摩
      // ==========================================
      const PI = Math.PI;
      function wgs84ToTwd67Tm2(latDeg, lngDeg) {
          const lat = latDeg * PI / 180.0, lng = lngDeg * PI / 180.0;
          const a84 = 6378137.0, b84 = 6356752.314245, a67 = 6378160.0, b67 = 6356774.7192;
          const e2_84 = 1 - (b84**2)/(a84**2);
          const n84 = a84 / Math.sqrt(1 - e2_84 * Math.sin(lat)**2);
          const x84 = n84 * Math.cos(lat) * Math.cos(lng), y84 = n84 * Math.cos(lat) * Math.sin(lng), z84 = n84 * (1 - e2_84) * Math.sin(lat);
          const dx = -752.0, dy = -358.0, dz = -179.0, rx = -0.0000011698, ry = 0.0000018398, rz = 0.0000009822, s = 0.00002329;
          const x67 = x84 - dx - s*x84 + rz*y84 - ry*z84, y67 = y84 - dy - rz*x84 - s*y84 + rx*z84, z67 = z84 - dz + ry*x84 - rx*y84 - s*z84;
          const e2_67 = 1 - (b67**2)/(a67**2), ep2_67 = (a67**2 - b67**2)/(b67**2);
          const p = Math.sqrt(x67**2 + y67**2), theta = Math.atan2(z67 * a67, p * b67);
          const lat67 = Math.atan2(z67 + ep2_67 * b67 * Math.sin(theta)**3, p - e2_67 * a67 * Math.cos(theta)**3), lng67 = Math.atan2(y67, x67);
          const lng0 = 121.0 * PI / 180.0, k0 = 0.9999, e_prime2 = e2_67 / (1.0 - e2_67), nu = a67 / Math.sqrt(1.0 - e2_67 * Math.sin(lat67)**2), p_lon = lng67 - lng0;
          const A = a67 * (1.0 - e2_67/4.0 - 3.0*e2_67**2/64.0 - 5.0*e2_67**3/256.0), B = a67 * (3.0*e2_67/8.0 + 3.0*e2_67**2/32.0 + 45.0*e2_67**3/1024.0);
          const C = a67 * (15.0*e2_67**2/256.0 + 45.0*e2_67**3/1024.0), D = a67 * (35.0*e2_67**3/3072.0);
          const M = A*lat67 - B*Math.sin(2.0*lat67) + C*Math.sin(4.0*lat67) - D*Math.sin(6.0*lat67);
          const sinLat = Math.sin(lat67), cosLat = Math.cos(lat67), tanLat = Math.tan(lat67), t = tanLat**2, c = e_prime2 * cosLat**2;
          const tm2_x = k0 * nu * p_lon * cosLat * (1.0 + (p_lon**2/6.0) * cosLat**2 * (1.0 - t + c) + (p_lon**4/120.0) * cosLat**4 * (5.0 - 18.0*t + t**2 + 72.0*c - 58.0*e_prime2));
          const tm2_y = k0 * (M + nu * tanLat * (p_lon**2/2.0 * cosLat**2 + (p_lon**4/24.0) * cosLat**4 * (5.0 - t + 9.0*c + 4.0*c**2) + (p_lon**6/720.0) * cosLat**6 * (61.0 - 58.0*t + t**2 + 600.0*c - 330.0*e_prime2)));
          return { x: tm2_x + 250000.0, y: tm2_y };
      }

      const GRID_BASES = { "A": [170000, 2750000], "B": [250000, 2750000], "C": [330000, 2750000], "D": [170000, 2700000], "E": [250000, 2700000], "F": [330000, 2700000], "G": [170000, 2650000], "H": [250000, 2650000], "J": [90000, 2600000], "K": [170000, 2600000], "L": [250000, 2600000], "M": [90000, 2550000], "N": [170000, 2550000], "O": [250000, 2550000], "P": [90000, 2500000], "Q": [170000, 2500000], "R": [250000, 2500000], "T": [170000, 2450000], "U": [250000, 2450000], "V": [170000, 2400000], "W": [250000, 2400000], "X": [275000, 2614000], "Y": [275000, 2564000] };

      function tm2ToTpc(x, y) {
          let bestBase = "", bx = 0, by = 0;
          for (const [char, [cx, cy]] of Object.entries(GRID_BASES)) {
              const dx = x - cx, dy = y - cy;
              if (dx >= 0 && dx < 80000 && dy >= 0 && dy < 50000) { bestBase = char; bx = cx; by = cy; break; }
          }
          if (!bestBase) return "座標超出範圍";
          const dx = x - bx, dy = y - by;
          const t2x = String(Math.floor(dx / 800)).padStart(2, '0'), t2y = String(Math.floor(dy / 500)).padStart(2, '0');
          const remX = dx % 800, remY = dy % 500;
          const t3x = String.fromCharCode(65 + Math.floor(remX / 100)), t3y = String.fromCharCode(65 + Math.floor(remY / 100));
          const rremX = remX % 100, rremY = remY % 100;
          const t5x = String(Math.floor(rremX / 10)), t5y = String(Math.floor(rremY / 10));
          const rrremX = rremX % 10, rrremY = rremY % 10;
          const t99x = String(Math.floor(rrremX)), t99y = String(Math.floor(rrremY));
          return `${bestBase}${t2x}${t2y}${t3x}${t3y}${t5x}${t5y}${t99x}${t99y}`;
      }

      function latLngToTpcCode(lat, lng) {
          try {
              const {x, y} = wgs84ToTwd67Tm2(lat, lng);
              return tm2ToTpc(x, y);
          } catch(e) { return `GPS_${lat.toFixed(4)}_${lng.toFixed(4)}`; }
      }

      // ==========================================
      // ?詨?霈???憪?
      // ==========================================
      const map = L.map("map", { preferCanvas: true, zoomControl: false, attributionControl: true });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

      const SHOW_POINTS_ZOOM = 15;
      const MAX_POINT_LABELS = 1200;
      const MAX_DIRECT_POINTS = 3500;
      const STORAGE_KEY = "taipower_inspection_v7";

      const state = {
        points: [], meta: null, area: "", query: "", search: { prefixes: [], terms: [] },
        visiblePoints: [], drawnItems: [], equipmentColorMap: new Map(), displayMode: "prefix",
        folders: [], records: [],
        hiddenRecordFolders: new Set(),
        expandedFolders: new Set(),
        selectedFolders: new Set(),
        selectedRecords: new Set(),
        labelsHidden: false
      };

      const statusBox = document.querySelector("#status");
      const folderList = document.querySelector("#folderList");
      const selectedCountText = document.getElementById("selectedCount");
      const batchActionBar = document.getElementById("batchActionBar");
      const areaSelect = document.getElementById("areaSelect");
      const searchInput = document.getElementById("searchInput");
      const results = document.getElementById("results");
      const resultTemplate = document.getElementById("resultTemplate");
      const totalCount = document.getElementById("totalCount");
      const visibleCount = document.getElementById("visibleCount");
      const drawCount = document.getElementById("drawCount");
      
      let labelsLayer = L.layerGroup().addTo(map);
      let recordsLayer = L.featureGroup().addTo(map); 

      // ==========================================
      // [靽格迤 1] comparePointsByName - 鋆??箸???摨撘?      // ==========================================
      function comparePointsByName(a, b) {
        const nameA = (a.name || a.code || "").toLowerCase();
        const nameB = (b.name || b.code || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      }

      // [新增] 遞迴取得資料夾（含所有子層）的全部紀錄
      function getAllRecordsInFolder(folderId) {
        const direct = state.records.filter(r => r.folderId === folderId);
        const children = state.folders.filter(f => f.parentId === folderId);
        let all = [...direct];
        for (const child of children) {
          all = all.concat(getAllRecordsInFolder(child.id));
        }
        return all;
      }

      // [?啣?] ?艘??鞈?憭橘??急???撅歹???函???ID
      function getAllRecordIdsInFolder(folderId) {
        return getAllRecordsInFolder(folderId).map(r => r.id);
      }

      // [?啣?] 銝??身?詨
      const DEFECT_OPTIONS = ["?嗥征?啁?蝬揹", "璅寞靽桀", "璊唳邦靽桀", "?方?皜", "蝡寞?皜"];

      // [靽格迤] 靘楝敺?銝莎??急?蝺?撅歹??曉?遣蝡??冗嚗??摨惜鞈?憭?id
      // 支援格式：「5月21日」或「5月21日 / 子資料夾 / 孫資料夾」
      function findOrCreateFolderByPath(pathStr) {
        const parts = pathStr.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
        if (!parts.length) return null;
        let parentId = null;
        let currentFolder = null;
        for (const part of parts) {
          currentFolder = state.folders.find(f => f.name === part && f.parentId === parentId);
          if (!currentFolder) {
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            currentFolder = { id: newId, name: part, parentId: parentId };
            state.folders.push(currentFolder);
            state.expandedFolders.add(newId);
          }
          parentId = currentFolder.id;
        }
        return currentFolder ? currentFolder.id : null;
      }

      function setPanelCollapsed(collapsed) {
        document.querySelector("#panel").classList.toggle("is-collapsed", collapsed);
        document.querySelector(".app").classList.toggle("is-panel-collapsed", collapsed);
        window.setTimeout(() => map.invalidateSize(), 220);
      }

      document.getElementById("panelToggle").addEventListener("click", () => {
        const panel = document.querySelector("#panel");
        const collapsed = !panel.classList.contains("is-collapsed");
        setPanelCollapsed(collapsed);
        document.getElementById("panelToggle").setAttribute("aria-expanded", String(!collapsed));
      });

      // ==========================================
      // LocalStorage 鞈?摮??蝘?      // ==========================================
      function saveToLocalStorage() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders: state.folders, records: state.records }));
        } catch(e) { console.error("?脣?憭望?:", e); }
        renderFolders(); updateRecordMarkers();
      }

      function loadFromLocalStorage() {
        try {
          let dataStr = localStorage.getItem(STORAGE_KEY)
            || localStorage.getItem("taipower_inspection_v6")
            || localStorage.getItem("taipower_inspection_v5");
          if (dataStr) {
            const parsed = JSON.parse(dataStr);
            state.folders = parsed.folders || [];
            state.records = parsed.records || [];
            // ???瑞宏
            state.folders.forEach(f => { if (typeof f.parentId === 'undefined') f.parentId = null; });
            state.records.forEach(r => { if (!r.id) r.id = 'rec_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6); });
            if (!localStorage.getItem(STORAGE_KEY)) saveToLocalStorage();
          } else {
            const dateStr = new Date().toISOString().slice(0, 10);
            state.folders.push({ id: Date.now().toString(), name: dateStr, parentId: null });
          }
        } catch (e) { console.error("讀取 localStorage 失敗:", e); }
      }

      function getFullFolderPath(folderId) {
          let path = [];
          let curr = state.folders.find(f => f.id === folderId);
          while (curr) {
              path.unshift(curr.name);
              curr = state.folders.find(f => f.id === curr.parentId);
          }
          return path.join(" / ");
      }

      function getFolderOptionsHtml(selectedId = null, excludeFolderId = null, includeRoot = false) {
          let html = includeRoot ? '<option value="">(最上層)</option>' : '<option value="">(請選擇資料夾)</option>';
          function buildOpts(pId, depth) {
              state.folders.filter(f => f.parentId === pId).forEach(f => {
                  if (f.id === excludeFolderId) return;
                  const prefix = "　".repeat(depth) + (depth > 0 ? "└ " : "");
                  const sel = f.id === selectedId ? "selected" : "";
                  html += `<option value="${f.id}" ${sel}>${prefix}${escapeHtml(f.name)}</option>`;
                  buildOpts(f.id, depth + 1);
              });
          }
          buildOpts(null, 0);
          return html;
      }

      function isDescendant(targetParentId, folderId) {
          let curr = state.folders.find(f => f.id === targetParentId);
          while (curr) {
              if (curr.id === folderId) return true;
              curr = state.folders.find(f => f.id === curr.parentId);
          }
          return false;
      }

      // ==========================================
      // UI 皜脫?
      // ==========================================
      function renderFolders() {
        const selCount = state.selectedFolders.size + state.selectedRecords.size;
        selectedCountText.textContent = selCount;
        batchActionBar.style.display = selCount > 0 ? "flex" : "none";

        function buildFoldersHtml(parentId, depth) {
            let html = "";
            const children = state.folders.filter(f => f.parentId === parentId);
            children.forEach(folder => {
                // ?游惇蝝??憿舐內?剁?
                const directRecords = state.records.filter(r => r.folderId === folder.id);
                directRecords.sort((a, b) => comparePointsByName(a, b));
                // [靽格迤] 蝮賣?怠?撅歹?憿舐內?冽?
                const totalCount = getAllRecordsInFolder(folder.id).length;
                const directCount = directRecords.length;

                const isHidden = state.hiddenRecordFolders.has(folder.id);
                const isExpanded = state.expandedFolders.has(folder.id);
                const isChecked = state.selectedFolders.has(folder.id) ? "checked" : "";

                // ?斗甇方??冗???撅祉???血歇?券
                const allDirectSelected = directCount > 0 && directRecords.every(r => state.selectedRecords.has(r.id));

                let recordsHTML = "";
                if (directCount > 0) {
                    // [?啣?] ?游惇蝝??憿? + ?券??
                    recordsHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding-bottom:4px; border-bottom:1px dotted #e2e8f0;">
                        <span style="font-size:11px; color:var(--muted);">直屬紀錄 ${directCount} 筆</span>
                        <button class="btn-small" data-select-all-folder="${folder.id}" style="font-size:11px; padding:2px 6px; min-height:0;">
                          ${allDirectSelected ? '取消全選' : '全選'}
                        </button>
                    </div>`;
                    recordsHTML += directRecords.map(r => {
                        const rChecked = state.selectedRecords.has(r.id) ? "checked" : "";
                        return `
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                            <input type="checkbox" class="cb-record" data-id="${r.id}" ${rChecked} style="width:16px; height:16px; cursor:pointer; flex-shrink:0;">
                            <button class="record-item" data-fly-lat="${r.lat}" data-fly-lng="${r.lng}" title="飛轉至此設備">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span class="record-item-title">📍 ${escapeHtml(r.name || r.code)}</span>
                                    <span class="btn-small text-danger" data-delete-record="${r.id}" title="刪除此紀錄" style="border:none; padding:2px 4px; min-height:0; margin-left:4px;">✖</span>
                                </div>
                                <span class="record-item-meta">不良: ${escapeHtml(r.defect || '無')} | 緩急: ${escapeHtml(r.urgency || 'C')}</span>
                            </button>
                        </div>`;
                    }).join("");
                } else {
                    recordsHTML = `<div style="font-size:12px; color:#999; padding:4px;">(此層無直屬紀錄)</div>`;
                }

                let childrenHTML = "";
                if (isExpanded) childrenHTML = buildFoldersHtml(folder.id, depth + 1);

                const borderLeft = depth > 0 ? 'border-left: 2px solid #cbd5e1;' : '';
                const marginLeft = depth > 0 ? '10px' : '0px';
                const bg = depth % 2 === 0 ? '#f8fafc' : '#ffffff';

                // totalCount 憿舐內?怠?撅斤蜇?賂??交?摮惜???酉
                const hasChildren = state.folders.some(f => f.parentId === folder.id);
                const countLabel = hasChildren ? `${totalCount} (含子層)` : `${totalCount}`;

                html += `
                <div class="folder-item" style="margin-left: ${marginLeft}; ${borderLeft} border-radius: ${depth>0 ? '0 6px 6px 0':'6px'}; background: ${bg}; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); border-right: 1px solid var(--line);">
                  <div class="folder-item-top" style="flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; flex-grow:1; min-width:60%;">
                        <input type="checkbox" class="cb-folder" data-id="${folder.id}" ${isChecked} style="width:16px; height:16px; cursor:pointer; margin-right:6px; flex-shrink:0;">
                        <span class="folder-name-toggle" data-toggle="${folder.id}" title="展開/收合">
                          ${escapeHtml(folder.name)} (${countLabel})
                          <span style="font-size:10px; color:var(--muted); margin-left:4px;">${isExpanded ? '▲' : '▼'}</span>
                        </span>
                    </div>
                    <div class="folder-actions" style="display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; margin-top:6px; width:100%;">
                      <button class="btn-small" data-add-sub="${folder.id}" title="新增子層資料夾">➕子層</button>
                      <button class="btn-small" data-rename="${folder.id}" title="重新命名">✏️改名</button>
                      <button class="btn-small" data-move-up="${folder.id}" title="向上移">⬆️</button>
                      <button class="btn-small" data-move-down="${folder.id}" title="向下移">⬇️</button>
                      <button class="btn-small" data-export="${folder.id}" title="匯出此層+子層 Excel">📤匯出</button>
                      <button class="btn-small ${isHidden ? '' : 'active-eye'}" data-toggle-visibility="${folder.id}" title="顯示/隱藏">${isHidden ? '🙈' : '👁️'}</button>
                      <button class="btn-small text-danger" data-delete-folder="${folder.id}" title="刪除">✖</button>
                    </div>
                  </div>
                  <div class="record-list ${isExpanded ? 'is-expanded' : ''}" style="margin-left: 22px;">
                     ${recordsHTML}
                     ${childrenHTML}
                  </div>
                </div>`;
            });
            return html;
        }
        folderList.innerHTML = buildFoldersHtml(null, 0);
      }

      // ==========================================
      // 鈭辣憪晷
      // ==========================================
      document.getElementById("batchDeleteBtn").addEventListener("click", () => {
          // [修正] 遞迴計算所有選取資料夾（含子層）的紀錄總數
          let totalRecordsInFolders = 0;
          state.selectedFolders.forEach(fId => {
            totalRecordsInFolders += getAllRecordsInFolder(fId).length;
          });
          const totalRecords = totalRecordsInFolders + state.selectedRecords.size;
          const folderCount = state.selectedFolders.size;

          GlobalModal.confirm(
            `確定要刪除選取的 ${folderCount} 個資料夾（含子層）與 ${state.selectedRecords.size} 筆單獨勾選的紀錄嗎？\n共將移除 ${totalRecords} 筆紀錄。`,
            () => {
              // [修正] 遞迴刪除資料夾及其所有子孫資料夾與紀錄
              function deleteFolderRecursive(fId) {
                // 先遞迴刪子層
                state.folders.filter(f => f.parentId === fId).forEach(child => deleteFolderRecursive(child.id));
                // 刪此層紀錄
                state.records = state.records.filter(r => r.folderId !== fId);
                // 刪此層資料夾
                state.folders = state.folders.filter(f => f.id !== fId);
                state.hiddenRecordFolders.delete(fId);
                state.expandedFolders.delete(fId);
              }
              state.selectedFolders.forEach(fId => deleteFolderRecursive(fId));
              // 刪單獨勾選的紀錄
              state.selectedRecords.forEach(rId => { state.records = state.records.filter(r => r.id !== rId); });
              state.selectedFolders.clear(); state.selectedRecords.clear();
              saveToLocalStorage(); renderer.redraw();
            }
          );
      });

      document.getElementById("batchMoveBtn").addEventListener("click", () => {
          GlobalModal.select("🚚 批次移動至...", "請選擇要將勾選項搬移到哪個資料夾：", getFolderOptionsHtml(null, null, true), (targetId) => {
              const safeTarget = targetId === "" ? null : targetId;
              for (const fId of state.selectedFolders) {
                  if (fId === safeTarget || (safeTarget && isDescendant(safeTarget, fId))) continue;
                  const folder = state.folders.find(f => f.id === fId);
                  if (folder) folder.parentId = safeTarget;
              }
              for (const rId of state.selectedRecords) {
                  if (safeTarget === null) { GlobalModal.alert("❌ 設備紀錄必須放置在資料夾內！"); break; }
                  const record = state.records.find(r => r.id === rId);
                  if (record) record.folderId = safeTarget;
              }
              state.selectedFolders.clear(); state.selectedRecords.clear();
              saveToLocalStorage();
          });
      });

      // [靽格迤 2] showAllStarsBtn / hideAllStarsBtn 鈭辣蝬?
      document.getElementById("showAllStarsBtn").addEventListener("click", () => {
          state.hiddenRecordFolders.clear();
          renderFolders(); updateRecordMarkers();
      });
      document.getElementById("hideAllStarsBtn").addEventListener("click", () => {
          state.folders.forEach(f => state.hiddenRecordFolders.add(f.id));
          renderFolders(); updateRecordMarkers();
      });

      folderList.addEventListener("click", (e) => {
        const target = e.target;
        
        const folderToggle = target.closest('[data-toggle]');
        if (folderToggle) {
          const fId = folderToggle.dataset.toggle;
          if (state.expandedFolders.has(fId)) state.expandedFolders.delete(fId);
          else state.expandedFolders.add(fId);
          renderFolders(); return;
        }

        if (target.classList.contains('cb-folder')) {
            const fId = target.dataset.id;
            if (target.checked) state.selectedFolders.add(fId); else state.selectedFolders.delete(fId);
            renderFolders(); return;
        }

        // [新增] 全選/取消全選此資料夾的直屬紀錄
        if (target.dataset.selectAllFolder) {
            const fId = target.dataset.selectAllFolder;
            const directRecords = state.records.filter(r => r.folderId === fId);
            const allSelected = directRecords.length > 0 && directRecords.every(r => state.selectedRecords.has(r.id));
            if (allSelected) {
                directRecords.forEach(r => state.selectedRecords.delete(r.id));
            } else {
                directRecords.forEach(r => state.selectedRecords.add(r.id));
            }
            renderFolders(); return;
        }

        if (target.classList.contains('cb-record')) {
            const rId = target.dataset.id;
            if (target.checked) state.selectedRecords.add(rId); else state.selectedRecords.delete(rId);
            renderFolders(); return;
        }

        const recordBtn = target.closest('.record-item');
        if (recordBtn && !target.dataset.deleteRecord) {
          const lat = parseFloat(recordBtn.dataset.flyLat), lng = parseFloat(recordBtn.dataset.flyLng);
          const point = state.points.find(p => p.lat === lat && p.lng === lng) || state.records.find(r => r.lat === lat && r.lng === lng); 
          if (point) {
            map.flyTo([lat, lng], 18, { duration: 0.45 });
            L.popup().setLatLng([lat, lng]).setContent(popupHtml(point)).openOn(map);
            if (window.innerWidth <= 820) setPanelCollapsed(true);
          }
          return;
        }

        if (target.dataset.deleteRecord) {
            const rId = target.dataset.deleteRecord;
            GlobalModal.confirm("確定要刪除此筆紀錄嗎？", () => {
                state.records = state.records.filter(r => r.id !== rId);
                state.selectedRecords.delete(rId);
                saveToLocalStorage(); renderer.redraw();
            });
            return;
        }

        if (target.dataset.addSub) {
            const pId = target.dataset.addSub;
            GlobalModal.prompt("請輸入子資料夾名稱：", "", (newName) => {
                if (newName && newName.trim()) {
                    const newId = Date.now().toString();
                    state.folders.push({ id: newId, name: newName.trim(), parentId: pId });
                    state.expandedFolders.add(pId); state.expandedFolders.add(newId);
                    saveToLocalStorage();
                }
            });
        }
        else if (target.dataset.rename) {
            const fId = target.dataset.rename;
            const f = state.folders.find(x => x.id === fId);
            if (!f) return;
            GlobalModal.prompt("重新命名資料夾：", f.name, (newName) => {
                if (newName && newName.trim()) { f.name = newName.trim(); saveToLocalStorage(); }
            });
        }
        else if (target.dataset.moveUp || target.dataset.moveDown) {
            const fId = target.dataset.moveUp || target.dataset.moveDown;
            const direction = target.dataset.moveUp ? -1 : 1;
            const folder = state.folders.find(f => f.id === fId);
            if (!folder) return;
            const siblings = state.folders.filter(f => f.parentId === folder.parentId);
            const sIdx = siblings.findIndex(f => f.id === fId);
            if (direction === -1 && sIdx > 0) swapInArray(state.folders, fId, siblings[sIdx - 1].id);
            else if (direction === 1 && sIdx < siblings.length - 1) swapInArray(state.folders, fId, siblings[sIdx + 1].id);
        }
        else if (target.dataset.toggleVisibility) {
          const fId = target.dataset.toggleVisibility;
          const nowHidden = state.hiddenRecordFolders.has(fId);
          // ?艘??甇方??冗????摮怨??冗??id
          function getAllDescendantFolderIds(id) {
            const ids = [id];
            state.folders.filter(f => f.parentId === id).forEach(child => {
              getAllDescendantFolderIds(child.id).forEach(cid => ids.push(cid));
            });
            return ids;
          }
          const affectedIds = getAllDescendantFolderIds(fId);
          if (nowHidden) {
            affectedIds.forEach(id => state.hiddenRecordFolders.delete(id));
          } else {
            affectedIds.forEach(id => state.hiddenRecordFolders.add(id));
          }
          renderFolders(); updateRecordMarkers();
        }
        else if (target.dataset.export) { 
            const fId = target.dataset.export;
            const folder = state.folders.find(f => f.id === fId);
            if (!folder) return;
            // [修正] 遞迴取得含子層的所有紀錄
            const targetRecords = getAllRecordsInFolder(fId);
            const pathName = getFullFolderPath(fId);
            const exportData = targetRecords.map(r => ({
              "巡視日期(目錄)": getFullFolderPath(r.folderId), "土木設備": r.name || "", "圖號座標": r.code || "",
              "不良項目": r.defect || "", "緩急程度": r.urgency || "", "設計單號": "", "設計日期": "", "施工單位": "", "施工單號": "", "施工日期": ""
            }));
            if (exportData.length === 0) exportData.push({"巡視日期(目錄)": pathName, "土木設備": "", "圖號座標": "", "不良項目": "", "緩急程度": "", "設計單號": "", "設計日期": "", "施工單位": "", "施工單號": "", "施工日期": ""});
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "個人儲存");
            XLSX.writeFile(wb, `個人儲存_${folder.name}.xlsx`);
        }
        else if (target.dataset.deleteFolder) {
          const fId = target.dataset.deleteFolder;
          const folder = state.folders.find(f => f.id === fId);
          if (!folder) return;
          GlobalModal.confirm(`確定要刪除資料夾「${folder.name}」及其中所有紀錄嗎？`, () => {
            state.records = state.records.filter(r => r.folderId !== fId);
            state.folders = state.folders.filter(f => f.id !== fId);
            state.hiddenRecordFolders.delete(fId); state.selectedFolders.delete(fId);
            saveToLocalStorage(); renderer.redraw();
          });
        }
      });

      function swapInArray(arr, id1, id2) {
          const idx1 = arr.findIndex(i => i.id === id1), idx2 = arr.findIndex(i => i.id === id2);
          if (idx1 < 0 || idx2 < 0) return;
          const temp = arr[idx1]; arr[idx1] = arr[idx2]; arr[idx2] = temp;
          saveToLocalStorage();
      }

      document.querySelector("#addFolderBtn").addEventListener("click", () => {
        GlobalModal.prompt("請輸入新的最上層資料夾名稱：", "", (newName) => {
          if (newName && newName.trim()) {
            const newId = Date.now().toString();
            state.folders.push({ id: newId, name: newName.trim(), parentId: null });
            state.expandedFolders.add(newId);
            saveToLocalStorage();
          }
        });
      });

      // ?臬 Excel
      document.querySelector("#importCsvBtn").addEventListener("click", () => document.querySelector("#importFileInput").click());
      document.querySelector("#importFileInput").addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
          try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false });
            let importedCount = 0, skippedCount = 0;
            let skipHeader = true;
            for (const row of rows) {
              if (skipHeader) { skipHeader = false; continue; }
              if (!row || row.length < 3) continue; 
              // [修正] 第一欄支援完整路徑（含斜線），如「5月21日 / 子資料夾」
              const folderPath = String(row[0] || "").trim();
              const name = String(row[1] || "").trim();
              const code = String(row[2] || "").trim();
              const defect = String(row[3] || "").trim();
              const urgency = String(row[4] || "C").trim();
              if (!folderPath || !name) continue;
              const point = state.points.find(p => (p.name || "") === name && (p.code || "") === code);
              if (!point) { skippedCount++; continue; }
              // [修正] 依完整路徑找到或建立資料夾（支援多層）
              const folderId = findOrCreateFolderByPath(folderPath);
              if (!folderId) continue;
              const existingIndex = state.records.findIndex(r => r.folderId === folderId && r.lat === point.lat && r.lng === point.lng);
              const recordData = {
                id: 'rec_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                lat: point.lat, lng: point.lng, name: name, code: code,
                folderId: folderId, defect: defect, urgency: urgency
              };
              if (existingIndex >= 0) { recordData.id = state.records[existingIndex].id; state.records[existingIndex] = recordData; } 
              else { state.records.push(recordData); }
              importedCount++;
            }
            saveToLocalStorage();
            let msg = `匯入完成！成功匯入/更新 ${importedCount} 筆紀錄。`;
            if (skippedCount > 0) msg += `\n⚠️ 有 ${skippedCount} 筆因找不到對應設備而略過（名稱或圖號不符）。`;
            GlobalModal.alert(msg);
          } catch (err) { GlobalModal.alert("讀取檔案失敗！請確認格式是否正確。\n" + err.message); }
          e.target.value = ""; 
        };
        reader.readAsArrayBuffer(file);
      });

      // 系統備份與還原
      document.getElementById("exportSystemBtn").addEventListener("click", () => {
        const data = JSON.stringify({ folders: state.folders, records: state.records }, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `系統備份_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      });
      document.getElementById("importSystemBtn").addEventListener("click", () => document.getElementById("importSystemInput").click());
      document.getElementById("importSystemInput").addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
          try {
            const parsed = JSON.parse(event.target.result);
            if (!parsed.folders || !parsed.records) throw new Error("格式錯誤");
            GlobalModal.confirm("⚠️ 確定要還原備份嗎？現有資料將被覆蓋！", () => {
              state.folders = parsed.folders; state.records = parsed.records;
              state.hiddenRecordFolders.clear(); state.expandedFolders.clear();
              state.selectedFolders.clear(); state.selectedRecords.clear();
              saveToLocalStorage(); renderer.redraw();
              GlobalModal.alert("還原成功！");
            });
          } catch(err) { GlobalModal.alert("還原失敗：" + err.message); }
          e.target.value = "";
        };
        reader.readAsText(file);
      });

      // ==========================================
      // Popup ?批捆?摮?頛?      // ==========================================
      function googleNavUrl(point) { return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`; }
      function streetViewUrl(point) { return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`; }

      function popupHtml(point) {
        const existingRecord = state.records.find(r => r.lat === point.lat && r.lng === point.lng);
        const allRecordsForPoint = state.records.filter(r => r.lat === point.lat && r.lng === point.lng);

        let warningHtml = "";
        if (allRecordsForPoint.length > 0) {
            const folderLinks = allRecordsForPoint.map(r => {
                const fId = r.folderId;
                const path = getFullFolderPath(fId);
                return `<span class="goto-folder-link" data-folder-id="${fId}"
                  style="cursor:pointer; text-decoration:underline; color:#b91c1c; margin-right:4px;"
                  title="點擊跳轉至此資料夾">📂 ${escapeHtml(path)}</span>`;
            }).join("");
            warningHtml = `<div style="font-size:11px; margin-bottom:6px; font-weight:bold; background:#fff5f5; padding:4px 6px; border-radius:4px; line-height:1.8;">⚠️ 已記錄於：<br>${folderLinks}</div>`;
        }

        const defectVal = existingRecord ? (existingRecord.defect || "") : "";
        const uA = existingRecord && existingRecord.urgency === 'A' ? 'selected' : '';
        const uB = existingRecord && existingRecord.urgency === 'B' ? 'selected' : '';
        const uC = (!existingRecord || existingRecord.urgency === 'C' || (!uA && !uB && !(existingRecord && existingRecord.urgency === 'D'))) ? 'selected' : '';
        const uD = existingRecord && existingRecord.urgency === 'D' ? 'selected' : '';

        const isCustomDefect = defectVal !== "" && !DEFECT_OPTIONS.includes(defectVal);
        let defectOpts = `<option value="">(無)</option>`;
        DEFECT_OPTIONS.forEach(opt => {
          defectOpts += `<option value="${escapeHtml(opt)}" ${defectVal === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`;
        });
        defectOpts += `<option value="__custom__" ${isCustomDefect ? 'selected' : ''}>✏️ 自訂輸入...</option>`;
        const customDisplay = isCustomDefect ? '' : 'display:none;';
        const customVal = isCustomDefect ? escapeHtml(defectVal) : '';
        const defectFieldHtml = `
          <select id="popup-defect-select"
            onchange="(function(sel){
              var ci=document.getElementById('popup-defect-custom');
              if(sel.value==='__custom__'){ci.style.display='block';ci.focus();}
              else{ci.style.display='none';ci.value='';}
            })(this)"
            style="width:100%; min-height:28px; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:4px;">${defectOpts}</select>
          <input type="text" id="popup-defect-custom" placeholder="請輸入自訂不良項目" value="${customVal}"
            style="${customDisplay} width:100%; min-height:28px; padding:4px 6px; font-size:12px; border:1px solid #ccc; border-radius:4px; margin-top:4px;">`;

        const folderOptsHtml = getFolderOptionsHtml(existingRecord ? existingRecord.folderId : null);

        return `
          ${warningHtml}
          <div class="popup-title">${escapeHtml(point.name || "未命名設備")}</div>
          <div class="popup-meta" style="margin-bottom:2px;">圖號：${escapeHtml(point.code || "")}</div>
          <div class="popup-meta" style="margin-bottom:6px;">${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</div>

          <div class="popup-actions" style="margin-bottom:4px; flex-wrap:nowrap;">
              <a href="${googleNavUrl(point)}" target="_blank" rel="noopener" style="flex:1; text-align:center;">🗺️ 導航</a>
              <a href="${streetViewUrl(point)}" target="_blank" rel="noopener" style="flex:1; text-align:center;">🏙️ 街景</a>
          </div>

          <div class="popup-form" style="max-height:52vh; overflow-y:auto; padding-right:2px;">
            <div style="display:grid; gap:5px;">
              <label style="font-size:12px; font-weight:bold;">
                📁 存入資料夾
                <select id="popup-folder" style="width:100%; min-height:28px; padding:4px 6px; font-size:12px; margin-top:3px; border:1px solid #ccc; border-radius:4px;">
                  ${folderOptsHtml}
                </select>
              </label>
              <label style="font-size:12px; font-weight:bold;">
                🔧 不良項目
                <div style="margin-top:3px;">${defectFieldHtml}</div>
              </label>
              <label style="font-size:12px; font-weight:bold;">
                🚦 緩急程度
                <select id="popup-urgency" style="width:100%; min-height:28px; padding:4px 6px; font-size:12px; margin-top:3px; border:1px solid #ccc; border-radius:4px;">
                  <option value="A" ${uA}>A：極嚴重不良</option>
                  <option value="B" ${uB}>B：次嚴重不良</option>
                  <option value="C" ${uC}>C：較輕不良</option>
                  <option value="D" ${uD}>D：巡檢當場處理</option>
                </select>
              </label>
              <button class="btn-save-record" data-lat="${point.lat}" data-lng="${point.lng}" data-name="${escapeHtml(point.name || "")}" data-code="${escapeHtml(point.code || "")}">
                💾 儲存紀錄
              </button>
            </div>
          </div>
        `;
      }

      document.addEventListener("click", (e) => {
        const gotoLink = e.target.closest('.goto-folder-link');
        if (gotoLink) {
          const fId = gotoLink.dataset.folderId;
          if (!fId) return;
          let curr = state.folders.find(f => f.id === fId);
          while (curr) {
            state.expandedFolders.add(curr.id);
            curr = state.folders.find(f => f.id === curr.parentId);
          }
          map.closePopup();
          switchTab('records');
          renderFolders();
          setTimeout(() => {
            const el = folderList.querySelector(`[data-toggle="${fId}"]`);
            if (el) el.closest('.folder-item')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
          return;
        }

        if (e.target.classList.contains("btn-save-record")) {
          const btn = e.target;
          const lat = parseFloat(btn.dataset.lat), lng = parseFloat(btn.dataset.lng);
          const folderEl = document.getElementById("popup-folder");
          const defectSelectEl = document.getElementById("popup-defect-select");
          const defectCustomEl = document.getElementById("popup-defect-custom");
          const urgencyEl = document.getElementById("popup-urgency");
          if (!folderEl || !defectSelectEl || !urgencyEl) return;
          const folderId = folderEl.value;
          let defect = "";
          if (defectSelectEl.value === '__custom__') {
            defect = defectCustomEl ? defectCustomEl.value.trim() : "";
          } else {
            defect = defectSelectEl.value;
          }
          const urgency = urgencyEl.value;
          if (!folderId) { GlobalModal.alert("請先建立並選擇存放資料夾！"); return; }
          state.records = state.records.filter(r => r.folderId !== folderId || r.lat !== lat || r.lng !== lng);
          state.records.push({
            id: 'rec_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
            lat: lat, lng: lng, name: btn.dataset.name, code: btn.dataset.code,
            folderId: folderId, defect: defect, urgency: urgency
          });
          saveToLocalStorage(); map.closePopup(); switchTab('records');
        }
      });

      function updateRecordMarkers() {
        recordsLayer.clearLayers();
        const visibleRecords = state.records.filter(r => !state.hiddenRecordFolders.has(r.folderId));
        for (const record of visibleRecords) {
          let htmlContent = '<div class="saved-star-marker">⭐</div>';
          let iconAnchor = [10, 10];
          if (state.labelsHidden) {
            const labelColor = colorForEquipmentName(record.name);
            htmlContent = `<div style="display:flex; flex-direction:column; align-items:center; transform: translate(-50%, calc(-100% + 10px)); width: max-content;">
                <span class="point-label-chip" style="--label-color: ${labelColor}; margin-bottom: 2px;">${escapeHtml(record.name || record.code)}</span>
                <div class="saved-star-marker">⭐</div>
              </div>`;
            iconAnchor = [0, 0];
          }
          L.marker([record.lat, record.lng], { icon: L.divIcon({ className: "", html: htmlContent, iconSize: [0, 0], iconAnchor: iconAnchor }) }).bindPopup(() => popupHtml(record)).addTo(recordsLayer);
        }
      }

      // ==========================================
      // 地圖繪圖與核心邏輯
      // ==========================================
      function setStatus(text) { statusBox.textContent = text; }
      function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
      function formatNumber(value) { return new Intl.NumberFormat("zh-TW").format(value); }
      function debounce(fn, wait = 180) { let timer = 0; return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), wait); }; }
      function codePrefix(code) { const match = String(code || "").trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z]\d{4})/); return match ? match[1] : String(code || "").trim().slice(0, 5) || "未知"; }
      function searchResultRank(point, search) { if (hasSearchTerm(point, search.terms)) return 0; if (search.prefixes.includes(codePrefix(point.code))) return 1; return 2; }
      function parseSearchQuery(query) {
        const tokens = String(query || "").trim().split(/[.\s,，、;；|｜/／]+/).map(t => t.trim()).filter(Boolean);
        const prefixes = []; const terms = [];
        for (const t of tokens) { const n = t.toUpperCase(); if (/^[A-Z]\d{4}$/.test(n)) { if (!prefixes.includes(n)) prefixes.push(n); } else { terms.push(t.toLowerCase()); } }
        return { prefixes, terms };
      }
      function pointSearchText(point) { return `${point.name || ""} ${point.code || ""} ${codePrefix(point.code)}`.toLowerCase(); }
      function hasSearchTerm(point, terms) { if (!terms.length) return false; const text = pointSearchText(point); return terms.some((term) => text.includes(term)); }
      function matchesSearch(point, search) { if (!search.prefixes.length && !search.terms.length) return true; return search.prefixes.includes(codePrefix(point.code)) || hasSearchTerm(point, search.terms); }
      function pointInBounds(point, bounds) { return point.lat >= bounds.getSouth() && point.lat <= bounds.getNorth() && point.lng >= bounds.getWest() && point.lng <= bounds.getEast(); }
      function matchesFilters(point) { if (state.area && point.area !== state.area) return false; return matchesSearch(point, state.search); }
      function visibleFilteredPoints() { const bounds = map.getBounds(); const output = []; for (const point of state.points) { if (pointInBounds(point, bounds) && matchesFilters(point)) output.push(point); } return output; }

      const PREFIX_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#be123c", "#c2410c", "#15803d", "#0369a1", "#a16207", "#6d28d9", "#0e7490", "#b45309", "#047857"];
      const UNKNOWN_EQUIPMENT_PREFIX = "未分類", UNKNOWN_EQUIPMENT_COLOR = "#64748b";
      function hashText(value) { let hash = 0; for (const char of value) { hash = (hash * 31 + char.charCodeAt(0)) >>> 0; } return hash; }
      function colorForPrefix(prefix) { return PREFIX_COLORS[hashText(prefix) % PREFIX_COLORS.length]; }
      function equipmentNamePrefix(name) { const match = String(name || "").trim().match(/^[\u3400-\u9fff]+/); return match ? match[0].slice(0, 4) : UNKNOWN_EQUIPMENT_PREFIX; }

      const canvasLayer = L.Layer.extend({
        onAdd(currentMap) {
          this.canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated"); this.canvas.style.pointerEvents = "none"; this.context = this.canvas.getContext("2d");
          currentMap.getPanes().overlayPane.appendChild(this.canvas); currentMap.on("moveend zoomend resize", this.redraw, this); this.redraw();
        },
        onRemove(currentMap) { L.DomUtil.remove(this.canvas); currentMap.off("moveend zoomend resize", this.redraw, this); },
        redraw() {
          if (!this.canvas || !state.points.length) return;
          const size = map.getSize(); const topLeft = map.containerPointToLayerPoint([0, 0]);
          L.DomUtil.setPosition(this.canvas, topLeft);
          this.canvas.width = size.x; this.canvas.height = size.y; this.canvas.style.width = `${size.x}px`; this.canvas.style.height = `${size.y}px`;
          const ctx = this.context; ctx.clearRect(0, 0, size.x, size.y);

          if (state.labelsHidden) { state.drawnItems = []; updateLabels(); updateStats(); return; }

          state.visiblePoints = visibleFilteredPoints();
          if (map.getZoom() >= SHOW_POINTS_ZOOM && state.visiblePoints.length <= MAX_DIRECT_POINTS) {
            state.displayMode = "point";
            state.drawnItems = state.visiblePoints.map(p => { const pixel = map.latLngToContainerPoint([p.lat, p.lng]); return { type: "point", point: p, x: pixel.x, y: pixel.y, count: 1 }; });
            if (state.equipmentColorMap.size === 0) state.equipmentColorMap = buildEquipmentColorMap(state.drawnItems);
            drawPoints(ctx, state.drawnItems);
          } else {
            state.displayMode = "prefix"; const groups = new Map();
            for (const point of state.visiblePoints) {
              const prefix = codePrefix(point.code); let group = groups.get(prefix);
              if (!group) { group = { type: "prefix", prefix, count: 0, latSum: 0, lngSum: 0 }; groups.set(prefix, group); }
              group.count += 1; group.latSum += point.lat; group.lngSum += point.lng;
            }
            state.drawnItems = placePrefixLabels([...groups.values()].map(g => {
              const lat = g.latSum / g.count; const lng = g.lngSum / g.count; const pixel = map.latLngToContainerPoint([lat, lng]); return { ...g, lat, lng, x: pixel.x, y: pixel.y };
            }).sort((a, b) => b.count - a.count));
            drawPrefixLabels(ctx, state.drawnItems);
          }
          updateLabels(); updateStats();
        }
      });
      const renderer = new canvasLayer().addTo(map);

      function buildEquipmentColorMap(items) {
        const groups = new Map();
        for (const item of items) {
          const prefix = equipmentNamePrefix(item.point.name); if (prefix === UNKNOWN_EQUIPMENT_PREFIX) continue;
          let group = groups.get(prefix);
          if (!group) { group = { prefix, count: 0, xSum: 0, ySum: 0, minX: item.x, maxX: item.x, minY: item.y, maxY: item.y, color: "" }; groups.set(prefix, group); }
          group.count += 1; group.xSum += item.x; group.ySum += item.y; group.minX = Math.min(group.minX, item.x); group.maxX = Math.max(group.maxX, item.x); group.minY = Math.min(group.minY, item.y); group.maxY = Math.max(group.maxY, item.y);
        }
        const colorMap = new Map([[UNKNOWN_EQUIPMENT_PREFIX, UNKNOWN_EQUIPMENT_COLOR]]);
        const colorUse = new Map(PREFIX_COLORS.map(c => [c, 0]));
        const sortedGroups = [...groups.values()].map(g => ({ ...g, x: g.xSum / g.count, y: g.ySum / g.count })).sort((a, b) => b.count - a.count);
        for (const group of sortedGroups) {
          const start = hashText(group.prefix) % PREFIX_COLORS.length;
          const rankedColors = PREFIX_COLORS.map((_, i) => PREFIX_COLORS[(start + i) % PREFIX_COLORS.length]).sort((a, b) => (colorUse.get(a) || 0) - (colorUse.get(b) || 0));
          group.color = rankedColors[0]; colorMap.set(group.prefix, group.color); colorUse.set(group.color, (colorUse.get(group.color) || 0) + 1);
        }
        return colorMap;
      }
      function colorForEquipmentName(name) { return state.equipmentColorMap.get(equipmentNamePrefix(name)) || colorForPrefix(equipmentNamePrefix(name)); }
      function drawPoints(ctx, items) { for (const item of items) { ctx.beginPath(); ctx.arc(item.x, item.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = colorForEquipmentName(item.point.name); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"; ctx.stroke(); } }
      function drawPrefixLabels(ctx, items) {
        for (const item of items) {
          const label = `${item.prefix} 繚 ${formatNumber(item.count)}`, width = Math.max(74, Math.min(128, 28 + label.length * 7)), height = 30, x = item.x - width / 2, y = item.y - height / 2;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, width, height, 8); else ctx.rect(x,y,width,height);
          ctx.fillStyle = colorForPrefix(item.prefix); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "800 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, item.x, item.y + 0.5);
          item.hitBox = { x, y, width, height };
        }
      }
      function placePrefixLabels(items) {
        const occupied = new Set(), output = [], gridW = map.getZoom() <= 10 ? 52 : 36, gridH = map.getZoom() <= 10 ? 28 : 20;
        for (const item of items) { const key = `${Math.floor(item.x / gridW)}:${Math.floor(item.y / gridH)}`; if (occupied.has(key)) continue; occupied.add(key); output.push(item); if (output.length >= 900) break; }
        return output;
      }
      function updateLabels() {
        labelsLayer.clearLayers(); if (state.labelsHidden || state.displayMode !== "point" || state.visiblePoints.length > MAX_POINT_LABELS) return;
        for (const point of state.visiblePoints) {
          const labelColor = colorForEquipmentName(point.name);
          L.marker([point.lat, point.lng], { icon: L.divIcon({ className: "point-label", html: `<span class="point-label-chip" style="--label-color: ${labelColor}">${escapeHtml(point.name)}</span>`, iconSize: null, iconAnchor: [-8, 20] }) }).bindPopup(() => popupHtml(point)).addTo(labelsLayer);
        }
      }
      function updateStats() {
        totalCount.textContent = formatNumber(state.points.length);
        visibleCount.textContent = formatNumber(state.labelsHidden ? 0 : state.visiblePoints.length);
        drawCount.textContent = formatNumber(state.drawnItems.length);
      }
      function fillAreas() { for (const area of state.meta?.areas || []) { const option = document.createElement("option"); option.value = area.name; option.textContent = `${area.name} (${formatNumber(area.count)})`; areaSelect.append(option); } }

      document.getElementById("toggleLabelsBtn").addEventListener("click", (e) => {
        state.labelsHidden = !state.labelsHidden;
        e.target.textContent = state.labelsHidden ? "顯示所有主圖標籤" : "隱藏所有主圖標籤";
        e.target.classList.toggle("is-hidden", state.labelsHidden);
        renderer.redraw(); updateRecordMarkers();
      });
      areaSelect.addEventListener("change", applyFilter);
      searchInput.addEventListener("input", debounce(applyFilter, 180));
      function applyFilter() { state.area = areaSelect.value; state.query = searchInput.value.trim(); state.search = parseSearchQuery(state.query); renderResults(searchMatches(state.search)); renderer.redraw(); }
      function searchMatches(search) {
        if (!search.prefixes.length && !search.terms.some((t) => t.length >= 2)) return [];
        const output = []; for (const point of state.points) { if (state.area && point.area !== state.area) continue; if (matchesSearch(point, search)) output.push(point); }
        return output.sort((a, b) => { const rankCompare = searchResultRank(a, search) - searchResultRank(b, search); if (rankCompare !== 0) return rankCompare; return comparePointsByName(a, b); }).slice(0, 50);
      }
      function renderResults(items) {
        results.innerHTML = ""; if (!items.length) { results.innerHTML = '<p class="popup-meta">請輸入設備關鍵字。</p>'; return; }
        for (const point of items) {
          const fragment = resultTemplate.content.cloneNode(true);
          fragment.querySelector("strong").textContent = point.name || "未命名"; fragment.querySelector("span").textContent = `${point.area || ""} / ${point.code || ""}`;
          fragment.querySelector("button").addEventListener("click", () => { map.flyTo([point.lat, point.lng], 17, { duration: 0.45 }); L.popup().setLatLng([point.lat, point.lng]).setContent(popupHtml(point)).openOn(map); });
          results.append(fragment);
        }
      }

      map.on("click", (e) => {
        if (state.displayMode === "prefix") {
          const prefix = state.drawnItems.find(item => { const b = item.hitBox; return b && e.containerPoint.x >= b.x && e.containerPoint.x <= b.x + b.width && e.containerPoint.y >= b.y && e.containerPoint.y <= b.y + b.height; });
          if (prefix) map.flyTo([prefix.lat, prefix.lng], Math.max(map.getZoom() + 2, SHOW_POINTS_ZOOM), { duration: 0.45 });
        } else {
          if (state.labelsHidden) return; 
          let best = null, bestDist = 16;
          for (const point of state.visiblePoints.slice(0, 6000)) {
            const dist = map.latLngToContainerPoint([point.lat, point.lng]).distanceTo(e.containerPoint); if (dist < bestDist) { best = point; bestDist = dist; }
          }
          if (best) L.popup().setLatLng([best.lat, best.lng]).setContent(popupHtml(best)).openOn(map);
        }
      });
      map.on("contextmenu", (e) => { const { lat, lng } = e.latlng; const code = latLngToTpcCode(lat, lng); const point = { lat, lng, name: "手動新增設備", code: code, area: "自訂" }; L.popup().setLatLng([lat, lng]).setContent(popupHtml(point)).openOn(map); });

      let locationMarker = null, locationCircle = null, locationWatchId = null;
      document.getElementById("locateButton").addEventListener("click", (e) => {
        if (locationWatchId !== null) {
          navigator.geolocation.clearWatch(locationWatchId); locationWatchId = null;
          if (locationMarker) { map.removeLayer(locationMarker); locationMarker = null; }
          if (locationCircle) { map.removeLayer(locationCircle); locationCircle = null; }
          e.target.classList.remove("is-active"); e.target.textContent = "定位"; return;
        }
        if (!navigator.geolocation) { GlobalModal.alert("此瀏覽器不支援定位功能。"); return; }
        e.target.textContent = "定位中...";
        locationWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
            if (!locationMarker) {
              locationMarker = L.circleMarker(latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 0.95 }).addTo(map);
              locationCircle = L.circle(latlng, { radius: pos.coords.accuracy || 30, color: "#2563eb", weight: 1, fillColor: "#2563eb", fillOpacity: 0.12 }).addTo(map);
              map.flyTo(latlng, 17, { duration: 0.45 });
            } else { locationMarker.setLatLng(latlng); locationCircle.setLatLng(latlng).setRadius(pos.coords.accuracy || 30); }
            e.target.classList.add("is-active"); e.target.textContent = "關閉定位";
          },
          (err) => { e.target.textContent = "定位失敗"; console.error("定位錯誤:", err); },
          { enableHighAccuracy: true }
        );
      });

      // ==========================================
      // [修正 3] init - 強化 fetch 錯誤處理，加入多重備用策略
      // ==========================================
      const DATA_URLS = [
        { meta: "../data/meta.json", points: "../data/points.json" },
        { meta: "data/meta.json", points: "data/points.json" },
        { meta: "https://aertyuloq8.github.io/taipower-equipment-map/data/meta.json", points: "https://aertyuloq8.github.io/taipower-equipment-map/data/points.json" }
      ];

      async function tryFetchData() {
        for (const urls of DATA_URLS) {
          try {
            const [metaRes, pointsRes] = await Promise.all([
              fetch(urls.meta, { cache: "no-cache" }),
              fetch(urls.points, { cache: "no-cache" })
            ]);
            if (metaRes.ok && pointsRes.ok) {
              return { meta: await metaRes.json(), points: await pointsRes.json() };
            }
          } catch (e) {
            // 繼續嘗試下一個來源
            console.warn("資料來源嘗試失敗，切換備用：", urls.meta, e.message);
          }
        }
        throw new Error("所有資料來源皆無法連線，請檢查網路或資料目錄是否存在。");
      }

      async function init() {
        setStatus("載入設備資料...");
        loadFromLocalStorage();
        renderFolders();
        updateRecordMarkers();

        try {
          const { meta, points } = await tryFetchData();
          state.meta = meta;
          state.points = points;
          fillAreas();
          renderResults([]);
          map.setView([23.7, 120.95], 8);
          if (state.meta?.bounds) map.fitBounds(state.meta.bounds, { padding: [28, 28] });
          renderer.redraw();
          setStatus("");
        } catch(e) {
          console.error(e);
          setStatus("⚠️ 設備資料載入失敗：" + e.message);
        }
      }

      init();
