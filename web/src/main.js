import "./modules/modal.js";
import "./modules/coords.js";
import "./modules/constants.js";
const { STORAGE_KEY, LEGACY_STORAGE_KEYS, PHOTO_DB_NAME, PHOTO_STORE_NAME, DRAFT_STORE_NAME, APP_DATA_STORE_NAME,
        DRAFT_ACTIVE_ID, EQUIPMENT_CACHE_ID, BACKUP_SUMMARY_KEY, BACKUP_FORMAT_VERSION, MAX_DIRECT_POINTS, MAX_ROUTE_POINTS } = window;


      // ==========================================
      // 分頁切換 (新增了 'edit' 分頁支援)
      // ==========================================
      function switchTab(tabId, options = {}) {
        const currentTab = document.getElementById("panel")?.dataset.activeTab;
        if (tabId !== "edit") closeDefectEditPanel();
        if (!options.skipEditGuard && tabId !== "edit" && currentTab === "edit" && hasUnsavedEditChanges()) {
          confirmBeforeLeavingEdit(() => switchTab(tabId, { skipEditGuard: true }));
          return false;
        }
        disableRouteLayerForTools();
        document.getElementById("panel").dataset.activeTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('is-active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('is-active'));

        if (tabId === 'records') {
          document.getElementById('tabRecordsBtn').classList.add('is-active');
          document.getElementById('tabRecords').classList.add('is-active');
          refreshStorageStatus();
        } else if (tabId === 'stats') {
          document.getElementById('tabStatsBtn').classList.add('is-active');
          document.getElementById('tabStats').classList.add('is-active');
          renderDefectStats();
        } else if (tabId === 'photos') {
          document.getElementById('tabPhotosBtn').classList.add('is-active');
          document.getElementById('tabPhotos').classList.add('is-active');
          renderPhotoBrowser();
        } else if (tabId === 'edit') {
          document.getElementById('tabEditBtn').classList.add('is-active');
          document.getElementById('tabEdit').classList.add('is-active');

          const folderSelect = document.getElementById("sidebar-folder");
          if (folderSelect) {
            const currentVal = folderSelect.value;
            const folderExists = state.folders.some(f => f.id === currentVal);
            const valueToSelect = folderExists ? currentVal : state.lastFolderId;
            folderSelect.innerHTML = getFolderOptionsHtml(valueToSelect);
          }
          setTimeout(() => maybeShowDailyFolderReminder(), 300);
        }

        window.setTimeout(() => map.invalidateSize(), 120);
      }
      document.getElementById('tabRecordsBtn').addEventListener('click', () => switchTab('records'));
      document.getElementById('tabStatsBtn').addEventListener('click',   () => switchTab('stats'));
      document.getElementById('tabPhotosBtn').addEventListener('click', () => switchTab('photos'));
      document.getElementById('tabEditBtn').addEventListener('click',    () => switchTab('edit'));

      const mapSearchPanel = document.getElementById("mapSearchPanel");
      const mapSearchToggle = document.getElementById("mapSearchToggle");
      const layerMenu = document.querySelector(".layer-menu");
      const layerMenuToggle = document.getElementById("layerMenuToggle");
      const layerMenuPanel = document.getElementById("layerMenuPanel");
      const panelToggle = document.getElementById("panelToggle");
      const inspectionPanel = document.getElementById("panel");
      const panelCloseButton = document.getElementById("panelCloseButton");

      function syncPanelToggleState() {
        if (!panelToggle || !inspectionPanel) return;
        const isOpen = !inspectionPanel.classList.contains("is-collapsed");
        panelToggle.setAttribute("aria-expanded", String(isOpen));
        panelToggle.classList.toggle("is-active", isOpen);
        panelToggle.title = isOpen ? "收合面板" : "展開面板";
      }

      function syncMapSearchState() {
        if (!mapSearchToggle || !mapSearchPanel) return;
        const isOpen = mapSearchPanel.classList.contains("is-open");
        mapSearchToggle.setAttribute("aria-expanded", String(isOpen));
        mapSearchToggle.classList.toggle("is-active", isOpen);
        mapSearchToggle.title = isOpen ? "關閉設備搜尋" : "搜尋設備";
      }

      function closeMapSearchPanel() {
        if (!mapSearchPanel) return;
        mapSearchPanel.classList.remove("is-open");
        syncMapSearchState();
      }

      function closeAddressPanel() {
        const addrPanel = document.getElementById("v2AddressPanel");
        const addrToggle = document.getElementById("v2AddressToggle");
        if (!addrPanel) return;
        addrPanel.classList.remove("is-open");
        addrPanel.setAttribute("aria-hidden", "true");
        addrToggle?.classList.remove("is-active");
        addrToggle?.setAttribute("aria-expanded", "false");
      }

      function closeLayerMenu() {
        if (!layerMenuToggle || !layerMenuPanel) return;
        layerMenuPanel.hidden = true;
        layerMenuToggle.setAttribute("aria-expanded", "false");
        layerMenuToggle.classList.remove("is-active");
      }
      function syncLayerMenuState() {
        const labelsBtn = document.getElementById("toggleLabelsBtn");
        const labelsState = document.getElementById("labelsLayerState");
        const gridBtn = document.getElementById("tpcGridToggle");
        const gridState = document.getElementById("tpcGridLayerState");
        const routeBtn = document.getElementById("routeLayerToggle");
        const routeState = document.getElementById("routeLayerState");
        if (labelsBtn && typeof state !== "undefined") {
          const visible = !state.labelsHidden;
          labelsBtn.classList.toggle("is-active", visible);
          labelsBtn.classList.toggle("is-hidden", !visible);
          labelsBtn.setAttribute("aria-pressed", String(visible));
          if (labelsState) labelsState.textContent = visible ? "顯示" : "隱藏";
        }
        if (gridBtn && typeof tpcGrid !== "undefined") {
          gridBtn.classList.toggle("is-active", tpcGrid.visible);
          gridBtn.classList.toggle("is-hidden", !tpcGrid.visible);
          gridBtn.setAttribute("aria-pressed", String(tpcGrid.visible));
          if (gridState) gridState.textContent = tpcGrid.visible ? "顯示" : "隱藏";
        }
        if (routeBtn && typeof state !== "undefined") {
          routeBtn.classList.toggle("is-active", state.routeLayerVisible);
          routeBtn.classList.toggle("is-hidden", !state.routeLayerVisible);
          routeBtn.setAttribute("aria-pressed", String(state.routeLayerVisible));
          if (routeState) routeState.textContent = state.routeLayerVisible ? "顯示" : "隱藏";
        }
      }
      layerMenuToggle?.addEventListener("click", () => {
        const willOpen = layerMenuPanel?.hidden !== false;
        if (!layerMenuPanel || !layerMenuToggle) return;
        if (willOpen) {
          closeMapSearchPanel();
          closeAddressPanel();
          window.__closeSyncPanel && window.__closeSyncPanel();
          if (!collapsePanelControl()) return;
        }
        layerMenuPanel.hidden = !willOpen;
        layerMenuToggle.setAttribute("aria-expanded", String(willOpen));
        layerMenuToggle.classList.toggle("is-active", willOpen);
        syncLayerMenuState();
      });
      document.addEventListener("click", event => {
        if (layerMenu && !layerMenu.contains(event.target)) closeLayerMenu();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeLayerMenu();
      });
      const isMobileLayout = () => window.matchMedia("(max-width: 768px), (max-height: 520px) and (orientation: landscape) and (pointer: coarse), (max-width: 980px) and (max-height: 520px) and (orientation: landscape)").matches;
      function syncMobileMapControls() {
        syncLayerMenuState();
      }
      function collapsePanelControl() {
        const didCollapse = setPanelCollapsed(true);
        syncPanelToggleState();
        return didCollapse;
      }
      function collapseFloatingControls() {
        closeMapSearchPanel();
        closeLayerMenu();
        closeAddressPanel();
        collapsePanelControl();
      }
      mapSearchToggle.addEventListener("click", () => {
        disableRouteLayerForTools();
        const willOpen = !mapSearchPanel.classList.contains("is-open");
        if (willOpen) {
          closeLayerMenu();
          window.__closeSyncPanel && window.__closeSyncPanel();
          closeAddressPanel();
          if (!collapsePanelControl()) return;
        }
        mapSearchPanel.classList.toggle("is-open", willOpen);
        syncMapSearchState();
      });
      document.getElementById("mapSearchClose").addEventListener("click", () => {
        closeMapSearchPanel();
      });

      // ==========================================
      // 初始化側邊欄的靜態表單選項
      // ==========================================
      function closeDefectEditPanel() {
        const panel = document.getElementById("defectEditPanel");
        const toggle = document.getElementById("defectEditToggle");
        const backdrop = document.getElementById("defectEditBackdrop");
        if (!panel || panel.hasAttribute("hidden")) return;
        panel.setAttribute("hidden", "");
        panel.style.display = "none";
        if (backdrop) backdrop.setAttribute("hidden", "");
        if (toggle) toggle.textContent = "✎ 編輯選項";
      }
      function renderDefectGroups() {
        const defectGroupsHtml = DEFECT_GROUPS.map(group => {
          const orderedItems = orderedDefectItemsForGroup(group);
          const chipsHtml = orderedItems.map(opt => {
             const len = opt.length;
             let line1 = escapeHtml(opt), line2 = "";
             if (len >= 3) { const cutIndex = Math.ceil(len / 2); line1 = escapeHtml(opt.substring(0, cutIndex)); line2 = escapeHtml(opt.substring(cutIndex)); }
             return `<div class="defect-chip-btn" data-val="${escapeHtml(opt)}"
               style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer; user-select:none; display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:44px; flex:1 1 auto; padding:6px 8px; box-sizing:border-box;">
               <span style="pointer-events:none; font-size:13px; color:#475569; line-height:1.25; letter-spacing:0.5px;">${line1}</span>
               ${line2 ? `<span style="pointer-events:none; font-size:13px; color:#475569; line-height:1.25; letter-spacing:0.5px; margin-top:2px;">${line2}</span>` : ""}
             </div>`;
          }).join("");
          return `
             <details name="defect-group" class="defect-group" ${group.open ? "open" : ""} style="border:1px solid #e2e8f0; border-radius:5px; background:#fff; padding:6px; margin-top:5px;">
               <summary style="cursor:pointer; color:#475569; font-size:13px; font-weight:bold; user-select:none;">${escapeHtml(group.label)} (${group.items.length})</summary>
               <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">${chipsHtml}</div>
             </details>`;
        }).join("");
        document.getElementById("sidebar-defect-groups").innerHTML = defectGroupsHtml;
      }
      function renderDefectGroupEditor() {
        const container = document.getElementById("defectGroupEditor");
        if (!container) return;
        const groups = cloneDefectGroups(DEFECT_GROUPS);
        const html = groups.map((group, groupIndex) => {
          const itemsHtml = group.items.map((item, itemIndex) => `
            <div style="display:flex; gap:6px; align-items:center; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px;">
              <input type="text" data-defect-group="${groupIndex}" data-defect-item="${itemIndex}" value="${escapeHtml(item)}" style="flex:1; min-width:0; border:1px solid #cbd5e1; border-radius:4px; padding:4px 6px; font-size:12px;" placeholder="選項文字" />
              <button type="button" data-defect-move="up" data-defect-group="${groupIndex}" data-defect-item="${itemIndex}" style="min-width:30px; min-height:30px; border:1px solid #cbd5e1; background:#e2e8f0; color:#1e293b; border-radius:4px; cursor:pointer; font-weight:bold;">↑</button>
              <button type="button" data-defect-move="down" data-defect-group="${groupIndex}" data-defect-item="${itemIndex}" style="min-width:30px; min-height:30px; border:1px solid #cbd5e1; background:#e2e8f0; color:#1e293b; border-radius:4px; cursor:pointer; font-weight:bold;">↓</button>
              <button type="button" data-defect-remove-item="${groupIndex}:${itemIndex}" style="min-width:30px; min-height:30px; border:1px solid #fecdd3; background:#fff1f2; color:#be123c; border-radius:4px; cursor:pointer; font-weight:bold;">✕</button>
            </div>`).join("") || `<div style="font-size:12px; color:#94a3b8; padding:4px 0;">尚無選項</div>`;
          return `
            <section style="border:1px solid #e2e8f0; border-radius:6px; background:#fff; padding:8px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="text" data-defect-group-label="${groupIndex}" value="${escapeHtml(group.label)}" style="flex:1; min-width:0; border:1px solid #cbd5e1; border-radius:4px; padding:6px 8px; font-size:12px; font-weight:bold;" placeholder="分類名稱" />
                <button type="button" data-defect-group-move="up" data-defect-group="${groupIndex}" style="min-width:30px; min-height:30px; border:1px solid #cbd5e1; background:#e2e8f0; color:#1e293b; border-radius:4px; cursor:pointer; font-weight:bold;">↑</button>
                <button type="button" data-defect-group-move="down" data-defect-group="${groupIndex}" style="min-width:30px; min-height:30px; border:1px solid #cbd5e1; background:#e2e8f0; color:#1e293b; border-radius:4px; cursor:pointer; font-weight:bold;">↓</button>
                <button type="button" data-defect-remove-group="${groupIndex}" data-defect-group="${groupIndex}" style="min-width:30px; min-height:30px; border:1px solid #fecdd3; background:#fff1f2; color:#be123c; border-radius:4px; cursor:pointer; font-weight:bold;">✕</button>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">${itemsHtml}</div>
              <div style="display:flex; gap:6px;">
                <button type="button" data-defect-add-item="${groupIndex}" data-defect-group="${groupIndex}" style="flex:1; min-height:32px; border:1px dashed #94a3b8; background:#f8fafc; color:#475569; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">＋ 新增選項</button>
              </div>
            </section>`;
        }).join("") || `<div style="font-size:12px; color:#94a3b8;">尚無分類，請新增分類</div>`;
        container.innerHTML = html;
      }
      function syncDefectGroupsFromEditor(options = {}) {
        const { renderEditor = true } = options;
        const container = document.getElementById("defectGroupEditor");
        if (!container) return;
        const next = [];
        container.querySelectorAll("section").forEach(section => {
          const label = String(section.querySelector("[data-defect-group-label]")?.value ?? "").trim();
          const items = [...section.querySelectorAll("[data-defect-item]")].map(input => String(input.value ?? "").trim()).filter(Boolean);
          if (!label || !items.length) return;
          next.push({ label, items, open: true });
        });
        DEFECT_GROUPS.length = 0;
        next.forEach(group => DEFECT_GROUPS.push(group));
        saveDefectGroups(DEFECT_GROUPS);
        renderDefectGroups();
        if (renderEditor) renderDefectGroupEditor();
      }
      function bindDefectEditorEvents() {
        const panel = document.getElementById("defectEditPanel");
        const toggle = document.getElementById("defectEditToggle");
        const editor = document.getElementById("defectGroupEditor");
        const addGroup = document.getElementById("defectAddGroupBtn");
        const reset = document.getElementById("defectResetBtn");
        const save = document.getElementById("defectSaveBtn");
        const closeBtn = document.getElementById("defectEditClose");
        const status = document.getElementById("defectEditStatus");
        if (!panel || !toggle || !editor || !addGroup || !reset || !save) return;
        const setStatus = (text) => { if (status) status.textContent = text; };
        const backdrop = document.getElementById("defectEditBackdrop");
        const openPanel = () => {
          panel.removeAttribute("hidden");
          panel.style.display = "flex";
          if (backdrop) backdrop.removeAttribute("hidden");
          toggle.textContent = "收合編輯";
          renderDefectGroupEditor();
          setStatus("");
        };
        toggle.addEventListener("click", () => {
          if (panel.hasAttribute("hidden")) openPanel();
          else closeDefectEditPanel();
        });
        closeBtn?.addEventListener("click", closeDefectEditPanel);
        backdrop?.addEventListener("click", closeDefectEditPanel);
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && !panel.hasAttribute("hidden")) closeDefectEditPanel();
        });
        addGroup.addEventListener("click", () => {
          DEFECT_GROUPS.push({ label: "新分類", items: ["新選項"], open: true });
          saveDefectGroups(DEFECT_GROUPS);
          renderDefectGroups();
          renderDefectGroupEditor();
          setStatus("已新增分類");
        });
        reset.addEventListener("click", () => {
          GlobalModal.confirm("確定要還原為預設的常用/裸露/導線/設計分類嗎？", () => {
            DEFECT_GROUPS.length = 0;
            cloneDefectGroups(DEFECT_GROUPS_DEFAULT).forEach(group => DEFECT_GROUPS.push(group));
            saveDefectGroups(DEFECT_GROUPS);
            renderDefectGroups();
            renderDefectGroupEditor();
            setStatus("已還原為預設分類");
            closeDefectEditPanel();
          });
        });
        save.addEventListener("click", () => {
          syncDefectGroupsFromEditor();
          setStatus("已儲存（已同步到本機）");
          closeDefectEditPanel();
        });
        editor.addEventListener("input", event => {
          if (event.target instanceof HTMLElement && (event.target.hasAttribute("data-defect-group-label") || event.target.hasAttribute("data-defect-item"))) {
            syncDefectGroupsFromEditor({ renderEditor: false });
          }
        });
        editor.addEventListener("click", event => {
          const target = event.target instanceof HTMLElement ? event.target.closest("button") : null;
          if (!target) return;
          const rawGroup = target.getAttribute("data-defect-group");
          const hasGroupAttr = rawGroup !== null && rawGroup !== "";
          const groupIndex = hasGroupAttr ? Number(rawGroup) : NaN;
          if (target.hasAttribute("data-defect-add-item") && hasGroupAttr && Number.isFinite(groupIndex) && DEFECT_GROUPS[groupIndex]) {
            DEFECT_GROUPS[groupIndex].items.push("新選項");
            saveDefectGroups(DEFECT_GROUPS);
            renderDefectGroups();
            renderDefectGroupEditor();
            setStatus("已新增選項");
            return;
          }
          if (target.hasAttribute("data-defect-remove-group") && hasGroupAttr && Number.isFinite(groupIndex) && DEFECT_GROUPS[groupIndex]) {
            DEFECT_GROUPS.splice(groupIndex, 1);
            saveDefectGroups(DEFECT_GROUPS);
            renderDefectGroups();
            renderDefectGroupEditor();
            setStatus("已移除分類");
            return;
          }
          const removeItem = target.getAttribute("data-defect-remove-item");
          if (removeItem && removeItem.includes(":")) {
            const parts = removeItem.split(":");
            if (parts.length === 2) {
              const g = Number(parts[0]);
              const i = Number(parts[1]);
              if (Number.isFinite(g) && Number.isFinite(i) && DEFECT_GROUPS[g] && DEFECT_GROUPS[g].items[i] !== undefined) {
                DEFECT_GROUPS[g].items.splice(i, 1);
                saveDefectGroups(DEFECT_GROUPS);
                renderDefectGroups();
                renderDefectGroupEditor();
                setStatus("已移除選項");
              }
            }
            return;
          }
          const move = target.getAttribute("data-defect-move");
          const itemIndexRaw = target.getAttribute("data-defect-item");
          const hasItemAttr = itemIndexRaw !== null && itemIndexRaw !== "";
          const itemIndex = hasItemAttr ? Number(itemIndexRaw) : NaN;
          if (move && hasGroupAttr && Number.isFinite(groupIndex) && Number.isFinite(itemIndex) && DEFECT_GROUPS[groupIndex]) {
            const items = DEFECT_GROUPS[groupIndex].items;
            const nextIndex = move === "up" ? itemIndex - 1 : itemIndex + 1;
            if (nextIndex < 0 || nextIndex >= items.length) return;
            const [moved] = items.splice(itemIndex, 1);
            items.splice(nextIndex, 0, moved);
            saveDefectGroups(DEFECT_GROUPS);
            renderDefectGroups();
            renderDefectGroupEditor();
            setStatus("已調整順序");
            return;
          }
          const groupMove = target.getAttribute("data-defect-group-move");
          if (groupMove && hasGroupAttr && Number.isFinite(groupIndex) && DEFECT_GROUPS[groupIndex]) {
            const nextIndex = groupMove === "up" ? groupIndex - 1 : groupIndex + 1;
            if (nextIndex < 0 || nextIndex >= DEFECT_GROUPS.length) return;
            const [moved] = DEFECT_GROUPS.splice(groupIndex, 1);
            DEFECT_GROUPS.splice(nextIndex, 0, moved);
            saveDefectGroups(DEFECT_GROUPS);
            renderDefectGroups();
            renderDefectGroupEditor();
            setStatus("已調整分類順序");
          }
        });
      }
      function initSidebarForm() {
        renderDefectGroups();
        bindDefectEditorEvents();
        const groupsHtml = ICON_GROUPS.map(group => {
          const chipsHtml = group.icons.map(ico => `<button type="button" class="icon-chip-btn" data-icon="${escapeHtml(ico)}" title="${escapeHtml(ico)}">${ico}</button>`).join("");
          return `<div style="display:flex; align-items:center; gap:3px; flex-wrap:wrap; margin-bottom:2px;"><span style="font-size:10px; color:var(--muted); width:28px; flex-shrink:0; text-align:right; padding-right:4px;">${escapeHtml(group.label)}</span>${chipsHtml}</div>`;
        }).join("");
        document.getElementById("sidebar-icon-groups").innerHTML = groupsHtml;

        document.getElementById('editScrollTopBtn').addEventListener('click', () => { document.getElementById('editFormScrollArea').scrollTo({ top: 0, behavior: 'smooth' }); });
        document.getElementById('editScrollBotBtn').addEventListener('click', () => { const el = document.getElementById('editFormScrollArea'); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });

        document.getElementById("photoCaptureBtn").addEventListener("click", () => {
          const input = document.getElementById("photoInput");
          // Ask the browser to open the rear-camera capture flow for one photo.
          input.setAttribute("capture", "environment");
          input.removeAttribute("multiple");
          input.click();
        });
        document.getElementById("photoPickBtn").addEventListener("click", () => {
          const input = document.getElementById("photoInput");
          input.removeAttribute("capture");
          input.setAttribute("multiple", "");
          input.click();
        });
        document.getElementById("photoClearPendingBtn").addEventListener("click", () => {
          editPhotoState.pending = [];
          renderEditPhotos();
          scheduleEditDraftSave(true);
        });
        document.getElementById("photoInput").addEventListener("change", async (event) => {
          const files = [...event.target.files];
          event.target.value = "";
          if (files.length) await addPendingPhotoFiles(files);
        });
        document.getElementById("photoStrip").addEventListener("click", (event) => {
          const button = event.target.closest("[data-remove-photo]");
          if (!button) return;
          const { removePhoto, photoSource } = button.dataset;
          if (photoSource === "existing") {
            editPhotoState.existing = editPhotoState.existing.filter(photo => photo.id !== removePhoto);
          } else if (photoSource === "pending") {
            editPhotoState.pending = editPhotoState.pending.filter(photo => photo.meta.id !== removePhoto);
          }
          renderEditPhotos();
          scheduleEditDraftSave(true);
        });
        document.getElementById("photoBrowserSearch").addEventListener("input", () => renderPhotoBrowser());
        document.getElementById("photoBrowserFolderFilter").addEventListener("change", () => renderPhotoBrowser());
        document.getElementById("photoBrowserGrid").addEventListener("click", (event) => {
          const folderToggle = event.target.closest("[data-photo-folder-toggle]");
          if (folderToggle) {
            event.stopPropagation();
            togglePhotoFolderCollapse(folderToggle.dataset.photoFolderToggle || "__uncategorized__");
            return;
          }
          const folderHead = event.target.closest(".photo-folder-head");
          if (folderHead && !event.target.closest(".photo-folder-delete") && !event.target.closest(".photo-folder-select") && !event.target.closest(".photo-folder-toggle")) {
            togglePhotoFolderCollapse(folderHead.closest(".photo-folder-group")?.dataset.photoFolder || "__uncategorized__");
            return;
          }
          const deleteSingle = event.target.closest("[data-photo-delete-single]");
          if (deleteSingle) {
            event.stopPropagation();
            const photoId = deleteSingle.dataset.photoDeleteSingle;
            GlobalModal.confirm("確定要刪除這張照片嗎？巡檢紀錄本身會保留。", async () => {
              try { await deletePhotoIdsFromRecords([photoId]); }
              catch (error) { GlobalModal.alert("刪除照片失敗：" + error.message); }
            });
            return;
          }
          const deleteFolder = event.target.closest("[data-photo-delete-folder]");
          if (deleteFolder) {
            event.stopPropagation();
            deleteBrowserFolderPhotos(deleteFolder.dataset.photoDeleteFolder || "");
            return;
          }
          const image = event.target.closest("[data-photo-open]");
          if (image) {
            openStoredPhoto(image.dataset.photoOpen);
            return;
          }
          if (event.target.closest("[data-photo-select]")) return;
          const card = event.target.closest("[data-photo-record]");
          if (!card) return;
          const record = state.records.find(item => item.id === card.dataset.photoRecord);
          if (record) openEditPanel(record);
        });
        document.getElementById("photoBrowserGrid").addEventListener("change", event => {
          const folderBox = event.target.closest("[data-photo-folder-select]");
          if (folderBox) {
            selectPhotoFolderPhotos(folderBox.dataset.photoFolderSelect || "__uncategorized__", folderBox.checked);
            return;
          }
          if (event.target.matches("[data-photo-select]")) updatePhotoBrowserSelectionUi();
        });
        document.getElementById("photoBrowserGrid").addEventListener("keydown", event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const head = event.target.closest(".photo-folder-head");
          if (!head || event.target.closest(".photo-folder-select") || event.target.closest(".photo-folder-toggle")) return;
          event.preventDefault();
          togglePhotoFolderCollapse(head.closest(".photo-folder-group")?.dataset.photoFolder || "__uncategorized__");
        });
        document.getElementById("storageRefreshBtn").addEventListener("click", refreshStorageStatus);
        document.getElementById("requestPersistentStorageBtn").addEventListener("click", requestPersistentStorage);
        (function initPanelFolds() {
          const folds = [["recordsToolsFold", "recordsToolsOpen"], ["storageHealthFold", "storageHealthOpen"]];
          folds.forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (!el) return;
            try {
              if (localStorage.getItem(key) === "1") el.open = true;
              el.addEventListener("toggle", () => {
                try { localStorage.setItem(key, el.open ? "1" : "0"); } catch { /* ignore */ }
              });
            } catch { /* ignore */ }
          });
          const toolsFold = document.getElementById("recordsToolsFold");
          if (toolsFold) {
            const collapseToolsFold = () => {
              if (toolsFold.open) {
                toolsFold.open = false;
                try { localStorage.setItem("recordsToolsOpen", "0"); } catch { /* ignore */ }
              }
            };
            toolsFold.querySelectorAll("button").forEach(btn => {
              if (btn.id === "driveBackupBtn" || btn.id === "driveRestoreBtn" || btn.id === "driveDeleteBtn") return;
              btn.addEventListener("click", () => {
                const progress = document.getElementById("backupProgress");
                setTimeout(() => {
                  if (progress && !progress.hidden) {
                    const obs = new MutationObserver((muts, ob) => {
                      if (progress.hidden) { ob.disconnect(); collapseToolsFold(); }
                    });
                    obs.observe(progress, { attributes: true, attributeFilter: ["hidden"] });
                  } else {
                    setTimeout(collapseToolsFold, 800);
                  }
                }, 400);
              });
            });
          }
        })();
        document.getElementById("photoBrowserSelectAllBtn").addEventListener("click", selectAllVisibleBrowserPhotos);
        document.getElementById("photoBrowserDeleteSelectedBtn").addEventListener("click", deleteSelectedBrowserPhotos);
        document.getElementById("photoBrowserDeleteAllBtn").addEventListener("click", deleteAllBrowserPhotos);
      }

      // ==========================================
      // V2 照片儲存：影像檔在 IndexedDB，紀錄只保留照片索引
      // ==========================================
      let photoDbPromise = null;
      function openPhotoDb() {
        if (photoDbPromise) return photoDbPromise;
        photoDbPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(PHOTO_DB_NAME, 2);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) db.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
            if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "id" });
            if (!db.objectStoreNames.contains(APP_DATA_STORE_NAME)) db.createObjectStore(APP_DATA_STORE_NAME, { keyPath: "id" });
          };
          request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error || new Error("無法開啟照片資料庫"));
        });
        return photoDbPromise;
      }

      async function photoDbRequest(mode, action, storeName = PHOTO_STORE_NAME) {
        const db = await openPhotoDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, mode);
          const request = action(transaction.objectStore(storeName));
          transaction.oncomplete = () => resolve(request ? request.result : undefined);
          transaction.onerror = () => reject(transaction.error || request?.error || new Error("照片資料庫操作失敗"));
          transaction.onabort = () => reject(transaction.error || new Error("照片資料庫操作已取消"));
        });
      }

      function getDraftRecord() {
        return photoDbRequest("readonly", store => store.get(DRAFT_ACTIVE_ID), DRAFT_STORE_NAME);
      }
      function putDraftRecord(draft) {
        return photoDbRequest("readwrite", store => store.put({ ...draft, id: DRAFT_ACTIVE_ID }), DRAFT_STORE_NAME);
      }
      function clearDraftRecord() {
        return photoDbRequest("readwrite", store => store.delete(DRAFT_ACTIVE_ID), DRAFT_STORE_NAME);
      }
      function getAppDataRecord(id) {
        return photoDbRequest("readonly", store => store.get(id), APP_DATA_STORE_NAME);
      }
      function putAppDataRecord(id, value) {
        return photoDbRequest("readwrite", store => store.put({ id, value, updatedAt: Date.now() }), APP_DATA_STORE_NAME);
      }

      function putPhotoBlob(photoId, blob) {
        return photoDbRequest("readwrite", store => store.put({ id: photoId, blob, updatedAt: Date.now() }));
      }
      function findPhotoMetadata(photoId) {
        for (const record of state.records || []) {
          const photo = (record.photos || []).find(item => item.id === photoId);
          if (photo) return photo;
        }
        return null;
      }
      function inferPhotoMimeType(photo, blob) {
        const metadataType = String(photo?.type || "").toLowerCase();
        if (/^image\/(jpeg|png|webp|gif|bmp|heic|heif)$/.test(metadataType)) return metadataType;
        const fileName = String(photo?.fileName || "").toLowerCase();
        if (/\.png$/.test(fileName)) return "image/png";
        if (/\.webp$/.test(fileName)) return "image/webp";
        if (/\.gif$/.test(fileName)) return "image/gif";
        if (/\.bmp$/.test(fileName)) return "image/bmp";
        if (/\.jpe?g$/.test(fileName)) return "image/jpeg";
        const blobType = String(blob?.type || "").toLowerCase();
        return blobType.startsWith("image/") ? blobType : "image/jpeg";
      }
      function normalizePhotoBlob(blob, photo) {
        if (!blob) return null;
        const mimeType = inferPhotoMimeType(photo, blob);
        return String(blob.type || "").toLowerCase() === mimeType
          ? blob
          : new Blob([blob], { type: mimeType });
      }
      async function getPhotoBlob(photoId, photoMeta = null) {
        const item = await photoDbRequest("readonly", store => store.get(photoId));
        if (!item?.blob) return null;
        const photo = photoMeta || findPhotoMetadata(photoId);
        const normalized = normalizePhotoBlob(item.blob, photo);
        if (normalized !== item.blob) {
          putPhotoBlob(photoId, normalized).catch(error => console.warn("修復照片格式失敗：", error));
        }
        return normalized;
      }
      function deletePhotoBlob(photoId) {
        return photoDbRequest("readwrite", store => store.delete(photoId));
      }
      function clearPhotoStore() {
        return photoDbRequest("readwrite", store => store.clear());
      }
      async function replacePhotoStore(entries) {
        const db = await openPhotoDb();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(PHOTO_STORE_NAME, "readwrite");
          const store = transaction.objectStore(PHOTO_STORE_NAME);
          store.clear();
          entries.forEach(entry => store.put({ id: entry.id, blob: entry.blob, updatedAt: Date.now() }));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error || new Error("照片資料庫還原失敗"));
          transaction.onabort = () => reject(transaction.error || new Error("照片資料庫還原已取消"));
        });
      }

      function formatStorageBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value < 0) return "--";
        if (value < 1024) return `${Math.round(value)} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let size = value / 1024;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
          size /= 1024;
          unit++;
        }
        return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
      }

      function formatDateTime(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return "未知時間";
        return date.toLocaleString("zh-TW", { hour12: false });
      }

      function readBackupSummary() {
        try { return JSON.parse(localStorage.getItem(BACKUP_SUMMARY_KEY) || "null"); }
        catch { return null; }
      }

      function renderBackupSummary(summary = readBackupSummary()) {
        const element = document.getElementById("backupSummary");
        if (!element) return;
        if (!summary?.exportedAt) {
          element.textContent = "最近一次備份：尚未建立";
          return;
        }
        const profile = summary.profile === "compressed" ? "壓縮版" : "原圖";
        const protection = summary.encrypted ? "、已加密" : "";
        element.textContent = `最近備份：${formatDateTime(summary.exportedAt)}｜${summary.records || 0} 筆、${summary.photos || 0} 張、${profile}${protection}｜格式 v${summary.formatVersion || BACKUP_FORMAT_VERSION}`;
      }

      function saveBackupSummary(summary) {
        try {
          localStorage.setItem(BACKUP_SUMMARY_KEY, JSON.stringify(summary));
          renderBackupSummary(summary);
        } catch (error) { console.warn("備份摘要儲存失敗：", error); }
      }

      async function getPhotoStorageUsage() {
        const db = await openPhotoDb();
        return new Promise((resolve, reject) => {
          const summary = { count: 0, bytes: 0 };
          const transaction = db.transaction(PHOTO_STORE_NAME, "readonly");
          const request = transaction.objectStore(PHOTO_STORE_NAME).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (cursor.value?.blob) {
              summary.count++;
              summary.bytes += Number(cursor.value.blob.size) || 0;
            }
            cursor.continue();
          };
          transaction.oncomplete = () => resolve(summary);
          transaction.onerror = () => reject(transaction.error || new Error("讀取照片使用量失敗"));
          transaction.onabort = () => reject(transaction.error || new Error("讀取照片使用量已取消"));
        });
      }

      async function getOfflineCacheStats() {
        try {
          if (typeof caches === "undefined") return null;
          const cacheName = (await caches.keys()).find(key => key.includes("tiles"));
          if (!cacheName) return { count: 0, bytes: 0 };
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          const sample = keys.slice(0, 500);
          let bytes = 0;
          for (const key of sample) {
            try {
              const response = await cache.match(key);
              const length = response?.headers?.get("content-length");
              bytes += length ? Number(length) : 0;
            } catch (error) {}
          }
          if (bytes === 0 && sample.length > 0) {
            let blobBytes = 0;
            const blobSample = sample.slice(0, 50);
            for (const key of blobSample) {
              try {
                const blob = await (await cache.match(key)).blob();
                blobBytes += blob.size;
              } catch (error) {}
            }
            if (blobBytes > 0) bytes = Math.round((blobBytes / blobSample.length) * sample.length);
          } else if (sample.length > 0 && keys.length > sample.length) {
            bytes = Math.round((bytes / sample.length) * keys.length);
          }
          return { count: keys.length, bytes };
        } catch (error) {
          return null;
        }
      }

      async function refreshStorageStatus() {
        const photoUsageEl = document.getElementById("photoStorageUsage");
        const quotaEl = document.getElementById("storageQuota");
        const availableEl = document.getElementById("storageAvailable");
        const offlineCacheEl = document.getElementById("offlineCacheUsage");
        const warningEl = document.getElementById("storageWarning");
        const persistenceEl = document.getElementById("storagePersistenceStatus");
        const persistButton = document.getElementById("requestPersistentStorageBtn");
        if (!photoUsageEl || !quotaEl || !availableEl || !offlineCacheEl || !warningEl || !persistenceEl || !persistButton) return;
        photoUsageEl.textContent = "更新中";
        quotaEl.textContent = "更新中";
        availableEl.textContent = "更新中";
        offlineCacheEl.textContent = "更新中";
        warningEl.hidden = true;
        warningEl.classList.remove("is-critical");
        persistenceEl.classList.remove("is-protected");
        persistenceEl.textContent = "資料保護：檢查中";
        renderBackupSummary();
        try {
          const storage = navigator.storage;
          const [photos, estimate, persisted, offline] = await Promise.all([
            getPhotoStorageUsage(),
            storage?.estimate ? storage.estimate() : Promise.resolve(null),
            storage?.persisted ? storage.persisted() : Promise.resolve(null),
            getOfflineCacheStats(),
          ]);
          photoUsageEl.textContent = `${photos.count} 張 / ${formatStorageBytes(photos.bytes)}`;
          offlineCacheEl.textContent = offline === null ? "無法讀取" : `${offline.count} 張圖磚 / ${formatStorageBytes(offline.bytes)}`;
          const quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
          quotaEl.textContent = quota === null ? "瀏覽器未提供" : formatStorageBytes(quota);
          const remaining = Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage)
            ? Math.max(0, estimate.quota - estimate.usage)
            : null;
          availableEl.textContent = remaining === null ? "瀏覽器未提供" : formatStorageBytes(remaining);
          if (quota && remaining !== null) {
            const remainingRatio = remaining / quota;
            if (remainingRatio < 0.05) {
              warningEl.textContent = "儲存空間即將不足（低於 5%），請先備份並清理照片。";
              warningEl.hidden = false;
              warningEl.classList.add("is-critical");
            } else if (remainingRatio < 0.2) {
              warningEl.textContent = "儲存空間偏低（低於 20%），建議先建立完整 ZIP 備份。";
              warningEl.hidden = false;
            }
          }
          if (persisted === true) {
            persistenceEl.textContent = "資料保護：已啟用";
            persistenceEl.classList.add("is-protected");
            persistButton.textContent = "已啟用資料保護";
            persistButton.disabled = true;
          } else if (!storage?.persist) {
            persistenceEl.textContent = "資料保護：此瀏覽器不支援";
            persistButton.textContent = "此瀏覽器不支援";
            persistButton.disabled = true;
          } else {
            persistenceEl.textContent = "資料保護：未啟用";
            persistButton.textContent = "保護此裝置資料";
            persistButton.disabled = false;
          }
        } catch (error) {
          console.warn("讀取儲存狀態失敗：", error);
          photoUsageEl.textContent = "無法讀取";
          quotaEl.textContent = "無法讀取";
          availableEl.textContent = "無法讀取";
          offlineCacheEl.textContent = "無法讀取";
          warningEl.textContent = "無法取得瀏覽器儲存估算，仍請定期建立 ZIP 備份。";
          warningEl.hidden = false;
          persistenceEl.textContent = "資料保護：無法讀取";
          persistButton.disabled = true;
        }
      }

      async function requestPersistentStorage() {
        if (!navigator.storage?.persist) {
          GlobalModal.alert("此瀏覽器不支援資料保護請求，請持續建立完整備份。");
          return;
        }
        const button = document.getElementById("requestPersistentStorageBtn");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "處理中";
        try {
          const granted = await navigator.storage.persist();
          await refreshStorageStatus();
          GlobalModal.alert(granted
            ? "此裝置已啟用資料保護。瀏覽器較不會在空間不足時自動清除照片，但仍請定期建立完整備份。"
            : "瀏覽器未授予資料保護。照片仍可使用，但請更頻繁建立完整備份。");
        } catch (error) {
          console.warn("資料保護請求失敗：", error);
          GlobalModal.alert("資料保護請求失敗，請持續建立完整備份。");
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      async function deleteRecordPhotos(records) {
        const photoIds = records.flatMap(record => Array.isArray(record?.photos) ? record.photos.map(photo => photo.id).filter(Boolean) : []);
        await Promise.all(photoIds.map(deletePhotoBlob));
        refreshStorageStatus();
      }

      function photoFileName(name, type = "image/jpeg") {
        const source = String(name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "photo";
        const extension = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(source)
          ? source.split(".").pop().toLowerCase()
          : ({
              "image/png": "png",
              "image/webp": "webp",
              "image/gif": "gif",
              "image/bmp": "bmp",
              "image/heic": "heic",
              "image/heif": "heif",
            }[String(type || "").toLowerCase()] || "jpg");
        return `${source.replace(/\.[^.]+$/, "").slice(0, 60)}.${extension}`;
      }

      async function preparePhotoForStorage(file) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name || "檔案"} 不是圖片`);
        return file.slice(0, file.size, file.type || "image/jpeg");
      }

      function clearPhotoPreviewUrls() {
        photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        photoPreviewUrls = [];
      }

      function updatePhotoStatus() {
        const existingCount = editPhotoState.existing.length;
        const pendingCount = editPhotoState.pending.length;
        const status = document.getElementById("photoStatusText");
        const clearButton = document.getElementById("photoClearPendingBtn");
        if (status) status.textContent = pendingCount
          ? `已新增 ${pendingCount} 張，按儲存紀錄後寫入照片庫`
          : existingCount ? `已儲存 ${existingCount} 張照片` : "可在儲存前拍照或選取相簿照片";
        if (clearButton) clearButton.disabled = pendingCount === 0;
      }

      async function renderEditPhotos() {
        const strip = document.getElementById("photoStrip");
        if (!strip) return;
        const epoch = ++photoRenderEpoch;
        clearPhotoPreviewUrls();
        const existing = editPhotoState.existing.map(photo => ({ meta: photo, source: "existing" }));
        const pending = editPhotoState.pending.map(photo => ({ meta: photo.meta, blob: photo.blob, source: "pending" }));
        const photos = [...existing, ...pending];
        updatePhotoStatus();
        if (!photos.length) {
          strip.innerHTML = '<span style="font-size:12px; color:var(--muted); padding:4px 2px;">尚未附加照片</span>';
          return;
        }
        strip.innerHTML = photos.map(({ meta, source }) => `
          <div class="photo-card">
            <img class="photo-thumb" data-photo-image="${escapeHtml(meta.id)}" alt="巡檢照片" />
            <button type="button" class="photo-remove" data-remove-photo="${escapeHtml(meta.id)}" data-photo-source="${source}" title="移除照片">✕</button>
            <span title="${escapeHtml(meta.fileName || "巡檢照片")}">${escapeHtml(meta.fileName || "巡檢照片")}</span>
          </div>`).join("");
        await Promise.all(photos.map(async ({ meta, blob }) => {
          const image = strip.querySelector(`[data-photo-image="${CSS.escape(meta.id)}"]`);
          const sourceBlob = blob || await getPhotoBlob(meta.id, meta);
          if (!image || !sourceBlob || epoch !== photoRenderEpoch) return;
          const previewBlob = await createPhotoPreviewBlob(sourceBlob);
          const url = URL.createObjectURL(previewBlob);
          photoPreviewUrls.push(url);
          image.src = url;
        }));
      }

      async function addPendingPhotoFiles(files) {
        const status = document.getElementById("photoStatusText");
        if (status) status.textContent = "處理照片中...";
        const accepted = [];
        for (const file of files) {
          try {
            const blob = await preparePhotoForStorage(file);
            accepted.push({
              meta: {
                id: `photo_${generateId()}`,
                fileName: photoFileName(file.name, blob.type),
                type: blob.type || "image/jpeg",
                size: blob.size,
                originalSize: blob.size,
                originalType: blob.type || "image/jpeg",
                capturedAt: new Date().toISOString(),
              },
              blob,
            });
          } catch (error) {
            console.warn("略過照片：", error);
          }
        }
        editPhotoState.pending.push(...accepted);
        renderEditPhotos();
        if (accepted.length) await scheduleEditDraftSave(true);
        if (files.length !== accepted.length) GlobalModal.alert("部分檔案不是可用的圖片，已略過。");
      }

      function beginEditPhotos(record) {
        clearPhotoPreviewUrls();
        const existing = Array.isArray(record?.photos) ? record.photos.map(photo => ({ ...photo })) : [];
        editPhotoState = { recordId: record?.id || null, existing, originalExisting: existing.map(photo => ({ ...photo })), pending: [] };
        editDraftState.dirty = false;
        editDraftState.point = null;
        editDraftState.restored = false;
        updateEditDraftUi();
        renderEditPhotos();
      }

      function getCurrentEditPointSnapshot() {
        const lat = Number(document.getElementById("editLat")?.value);
        const lng = Number(document.getElementById("editLng")?.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: document.getElementById("editRecordId")?.value || null,
          lat,
          lng,
          code: document.getElementById("editCode")?.value || "",
          name: document.getElementById("editPanelTitle")?.textContent || "",
        };
      }

      function updateEditDraftUi() {
        const badge = document.getElementById("editUnsavedBadge");
        const saveButton = document.getElementById("sidebarSaveBtn");
        if (badge) {
          badge.hidden = !editDraftState.dirty;
          badge.textContent = editDraftState.dirty ? "尚有未儲存變更" : "";
        }
        if (saveButton && !saveButton.disabled) saveButton.textContent = editDraftState.dirty ? "💾 儲存紀錄（未儲存）" : "💾 儲存紀錄";
      }

      function captureEditDraft() {
        const point = getCurrentEditPointSnapshot();
        if (!point) return null;
        return {
          id: DRAFT_ACTIVE_ID,
          version: 1,
          savedAt: new Date().toISOString(),
          point,
          recordId: editPhotoState.recordId || null,
          existing: editPhotoState.existing.map(photo => ({ ...photo })),
          originalExisting: editPhotoState.originalExisting.map(photo => ({ ...photo })),
          pending: editPhotoState.pending.map(item => ({ meta: { ...item.meta }, blob: item.blob })),
          values: {
            name: document.getElementById("sidebar-name-input")?.value || "",
            folderId: document.getElementById("sidebar-folder")?.value || "",
            urgency: document.getElementById("sidebar-urgency")?.value || "C",
            defect: document.getElementById("sidebar-defect-input")?.value || "",
            needCorrection: !!document.getElementById("sidebar-correction-flag")?.checked,
            correctCode: document.getElementById("sidebar-correct-code-input")?.value || "",
            icon: document.getElementById("sidebar-icon-input")?.value || "",
          },
          scrollTop: document.getElementById("editFormScrollArea")?.scrollTop || 0,
        };
      }

      function markEditDirty() {
        if (document.getElementById("editFormContainer")?.style.display === "none") return;
        editDraftState.dirty = true;
        editDraftState.point = getCurrentEditPointSnapshot();
        updateEditDraftUi();
      }

      function scheduleEditDraftSave(immediate = false) {
        markEditDirty();
        if (editDraftState.saveTimer) clearTimeout(editDraftState.saveTimer);
        if (immediate) return saveEditDraftNow();
        editDraftState.saveTimer = window.setTimeout(() => {
          editDraftState.saveTimer = null;
          saveEditDraftNow();
        }, 350);
        return editDraftState.saveSequence;
      }

      function saveEditDraftNow() {
        if (!editDraftState.dirty) return editDraftState.saveSequence;
        const draft = captureEditDraft();
        if (!draft) return editDraftState.saveSequence;
        editDraftState.saveSequence = editDraftState.saveSequence
          .catch(() => {})
          .then(() => putDraftRecord(draft))
          .then(() => {
            editDraftState.point = draft.point;
            updateEditDraftUi();
          })
          .catch(error => console.warn("草稿儲存失敗：", error));
        return editDraftState.saveSequence;
      }

      async function clearEditDraft() {
        if (editDraftState.saveTimer) clearTimeout(editDraftState.saveTimer);
        editDraftState.saveTimer = null;
        await editDraftState.saveSequence.catch(() => {});
        try { await clearDraftRecord(); }
        catch (error) { console.warn("清除草稿失敗：", error); }
        editDraftState.dirty = false;
        editDraftState.point = null;
        editDraftState.restored = false;
        updateEditDraftUi();
      }

      function getActiveEditRecord() {
        const recordId = editPhotoState.recordId || document.getElementById("editRecordId")?.value;
        if (recordId) return state.records.find(record => record.id === recordId) || null;
        const point = editDraftState.point;
        return point ? state.records.find(record => isSameMapPoint(record, point)) || null : null;
      }

      function resetEditPanelAfterDiscard() {
        document.getElementById("editFormContainer").style.display = "none";
        document.getElementById("sidebarSaveBtn").disabled = true;
        document.getElementById("editRecordId").value = "";
        document.getElementById("editLat").value = "";
        document.getElementById("editLng").value = "";
        document.getElementById("editCode").value = "";
        document.getElementById("editPanelTitle").textContent = "請選擇設備";
        document.getElementById("editPanelMeta").textContent = "在地圖點擊進行編輯";
        document.getElementById("editPanelWarning").innerHTML = "";
        document.getElementById("editPanelActions").style.display = "none";
        document.getElementById("sidebar-name-input").value = "";
        document.getElementById("sidebar-folder").innerHTML = getFolderOptionsHtml(state.lastFolderId);
        document.getElementById("sidebar-urgency").value = "C";
        document.getElementById("sidebar-defect-input").value = "";
        document.getElementById("sidebar-correction-flag").checked = false;
        document.getElementById("sidebar-correct-code-container").style.display = "none";
        document.getElementById("sidebar-correct-code-input").value = "";
        document.getElementById("sidebar-icon-input").value = "";
        document.querySelectorAll("#tabEdit .icon-chip-btn").forEach(btn => btn.classList.remove("is-selected"));
        beginEditPhotos(null);
        updateSidebarIconPreview();
      }

      async function discardEditChanges(onProceed) {
        const activeRecord = getActiveEditRecord();
        await clearEditDraft();
        if (activeRecord) openEditPanel(activeRecord, { skipDirtyGuard: true });
        else resetEditPanelAfterDiscard();
        if (onProceed) onProceed();
      }

      function hasUnsavedEditChanges() {
        return !!editDraftState.dirty && document.getElementById("editFormContainer")?.style.display !== "none";
      }

      function confirmBeforeLeavingEdit(onProceed) {
        if (!hasUnsavedEditChanges()) {
          onProceed();
          return true;
        }
        // A saved draft may leave the edit panel collapsed while its dirty state
        // is intentionally retained. Reopen the draft before showing another guard.
        const panel = document.getElementById("panel");
        if (panel?.classList.contains("is-collapsed")) {
          setPanelCollapsed(false, { skipEditGuard: true });
          switchTab("edit", { skipEditGuard: true });
          return false;
        }
        GlobalModal.show({
          title: "尚有未儲存變更",
          content: "目前有尚未儲存的欄位或照片變更。請選擇繼續編輯、關閉並保留草稿，或捨棄草稿。",
          type: "confirm",
          confirmText: "關閉並保留草稿",
          cancelText: "繼續編輯",
          discardText: "捨棄草稿",
          onConfirm: async () => {
            await saveEditDraftNow();
            onProceed();
          },
          onDiscard: () => discardEditChanges(onProceed),
        });
        return false;
      }

      async function restoreEditDraft(draft) {
        const point = draft?.point;
        if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) {
          await clearDraftRecord();
          GlobalModal.alert("上次草稿缺少有效座標，已略過恢復。\n請重新建立巡檢紀錄。");
          return;
        }
        openEditPanel({ ...point, lat: Number(point.lat), lng: Number(point.lng) }, { skipDirtyGuard: true });
        const values = draft.values || {};
        document.getElementById("sidebar-name-input").value = values.name || point.name || "手動新增設備";
        document.getElementById("sidebar-folder").innerHTML = getFolderOptionsHtml(values.folderId || null);
        document.getElementById("sidebar-urgency").value = values.urgency || "C";
        document.getElementById("sidebar-defect-input").value = values.defect || "";
        document.getElementById("sidebar-correction-flag").checked = !!values.needCorrection;
        document.getElementById("sidebar-correct-code-container").style.display = values.needCorrection ? "flex" : "none";
        document.getElementById("sidebar-correct-code-input").value = values.correctCode || "";
        document.getElementById("sidebar-icon-input").value = values.icon || "";
        document.querySelectorAll("#tabEdit .icon-chip-btn").forEach(btn => btn.classList.toggle("is-selected", btn.dataset.icon === values.icon));
        updateSidebarIconPreview();
        editPhotoState = {
          recordId: draft.recordId || null,
          existing: Array.isArray(draft.existing) ? draft.existing.map(photo => ({ ...photo })) : [],
          originalExisting: Array.isArray(draft.originalExisting) ? draft.originalExisting.map(photo => ({ ...photo })) : [],
          pending: Array.isArray(draft.pending) ? draft.pending.filter(item => item?.meta && item?.blob).map(item => ({ meta: { ...item.meta }, blob: item.blob })) : [],
        };
        editDraftState.dirty = true;
        editDraftState.point = { ...point };
        editDraftState.restored = true;
        renderEditPhotos();
        updateEditDraftUi();
        const scrollArea = document.getElementById("editFormScrollArea");
        if (scrollArea) scrollArea.scrollTop = Number(draft.scrollTop) || 0;
        setStatus("已恢復上次草稿，請確認後儲存");
        window.setTimeout(() => setStatus(""), 2600);
      }

      async function checkForSavedDraft() {
        try {
          const draft = await getDraftRecord();
          if (!draft?.point || (!draft.values && !draft.pending?.length)) return;
          const photoCount = (draft.pending?.length || 0) + (draft.existing?.length || 0);
          GlobalModal.show({
            title: "發現上次草稿",
            content: `上次編輯時間：${formatDateTime(draft.savedAt)}<br>設備：${escapeHtml(draft.values?.name || draft.point.name || "未命名設備")}<br>草稿照片：${photoCount} 張<br><br>可以恢復草稿，或捨棄這份未完成資料。`,
            type: "confirm",
            confirmText: "恢復上次草稿",
            cancelText: "捨棄草稿",
            onConfirm: () => restoreEditDraft(draft),
            onCancel: () => clearEditDraft(),
          });
        } catch (error) { console.warn("讀取草稿失敗：", error); }
      }

      let photoViewerUrl = null;
      let photoViewerRequest = 0;
      let photoViewerBlob = null;
      let photoViewerPhoto = null;
      let photoViewerRecord = null;
      let photoBrowserPreviewUrls = [];
      let photoBrowserRenderEpoch = 0;
      let photoThumbnailObserver = null;
      let photoThumbnailQueue = [];
      let photoThumbnailActive = 0;
      let photoViewerScale = 1;
      let photoViewerOffset = { x: 0, y: 0 };
      let photoViewerDrag = null;
      let photoViewerPointers = new Map();
      let photoViewerPinch = null;
      let photoViewerLastTap = null;
      let photoViewerLastPinchAt = 0;

      function applyPhotoViewerTransform() {
        const image = document.getElementById("photoViewerImage");
        const body = image?.closest(".photo-viewer-body");
        if (!image || !body) return;
        image.style.transform = `translate(${photoViewerOffset.x}px, ${photoViewerOffset.y}px) scale(${photoViewerScale})`;
        body.classList.toggle("is-zoomed", photoViewerScale > 1);
        body.classList.toggle("is-dragging", Boolean(photoViewerDrag));
      }

      function getPhotoViewerBodyPoint(clientX, clientY) {
        const body = document.querySelector(".photo-viewer-body");
        if (!body) return { x: 0, y: 0 };
        const rect = body.getBoundingClientRect();
        return {
          x: clientX - (rect.left + rect.width / 2),
          y: clientY - (rect.top + rect.height / 2),
        };
      }

      function setPhotoViewerScaleAt(nextScale, clientX, clientY, baseScale = photoViewerScale, baseOffset = photoViewerOffset) {
        const body = document.querySelector(".photo-viewer-body");
        const rect = body?.getBoundingClientRect();
        const focusX = Number.isFinite(clientX) ? clientX : rect ? rect.left + rect.width / 2 : 0;
        const focusY = Number.isFinite(clientY) ? clientY : rect ? rect.top + rect.height / 2 : 0;
        const scale = Math.min(4, Math.max(1, Number(nextScale.toFixed(2))));
        if (scale === 1) {
          photoViewerScale = 1;
          photoViewerOffset = { x: 0, y: 0 };
        } else {
          const point = getPhotoViewerBodyPoint(focusX, focusY);
          const ratio = scale / Math.max(0.01, baseScale);
          photoViewerScale = scale;
          photoViewerOffset = {
            x: point.x - (point.x - baseOffset.x) * ratio,
            y: point.y - (point.y - baseOffset.y) * ratio,
          };
        }
        applyPhotoViewerTransform();
      }

      function resetPhotoViewerZoom() {
        photoViewerScale = 1;
        photoViewerOffset = { x: 0, y: 0 };
        photoViewerDrag = null;
        photoViewerPointers.clear();
        photoViewerPinch = null;
        photoViewerLastTap = null;
        applyPhotoViewerTransform();
      }

      function changePhotoViewerZoom(delta) {
        const nextScale = Math.min(4, Math.max(1, Number((photoViewerScale + delta).toFixed(2))));
        setPhotoViewerScaleAt(nextScale);
      }

      function clearPhotoBrowserPreviewUrls() {
        photoBrowserPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        photoBrowserPreviewUrls = [];
      }

      function closePhotoViewer(cancelPending = true) {
        if (cancelPending) photoViewerRequest++;
        const viewer = document.getElementById("photoViewer");
        if (!viewer) return;
        viewer.classList.remove("is-open");
        viewer.setAttribute("aria-hidden", "true");
        document.getElementById("photoViewerImage").removeAttribute("src");
        document.getElementById("photoViewerDownload").removeAttribute("href");
        resetPhotoViewerZoom();
        if (photoViewerUrl) URL.revokeObjectURL(photoViewerUrl);
        photoViewerUrl = null;
        photoViewerBlob = null;
        photoViewerPhoto = null;
        photoViewerRecord = null;
      }

      async function openStoredPhoto(photoId) {
        const requestId = ++photoViewerRequest;
        try {
          const record = state.records.find(item => (item.photos || []).some(photo => photo.id === photoId));
          const photo = record?.photos?.find(item => item.id === photoId);
          const blob = await getPhotoBlob(photoId, photo);
          if (!blob) {
            GlobalModal.alert("找不到這張照片。它可能尚未從完整 ZIP 備份還原。");
            return;
          }
          if (requestId !== photoViewerRequest) return;
          closePhotoViewer(false);
          photoViewerUrl = URL.createObjectURL(blob);
          const viewer = document.getElementById("photoViewer");
          const image = document.getElementById("photoViewerImage");
          const download = document.getElementById("photoViewerDownload");
          photoViewerBlob = blob;
          photoViewerPhoto = photo;
          photoViewerRecord = record || null;
          syncPhotoViewerActions();
          document.getElementById("photoViewerTitle").textContent = photo?.fileName || "照片預覽";
          document.getElementById("photoViewerMeta").textContent = record
            ? `${record.name || record.code || "巡檢紀錄"} | ${record.defect || "未填寫改善事項"}`
            : "巡檢照片";
          image.src = photoViewerUrl;
          image.alt = photo?.fileName || "巡檢照片預覽";
          resetPhotoViewerZoom();
          download.href = photoViewerUrl;
          download.download = photo?.fileName || "巡檢照片.jpg";
          viewer.classList.add("is-open");
          viewer.setAttribute("aria-hidden", "false");
        } catch (error) {
          GlobalModal.alert("無法開啟照片：" + error.message);
        }
      }

      async function copyPhotoFromViewer() {
        if (!photoViewerPhoto?.id || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
          GlobalModal.alert("此瀏覽器不支援直接複製圖片，請使用下載照片。");
          return;
        }
        try {
          const blob = await getPhotoBlob(photoViewerPhoto.id, photoViewerPhoto);
          if (!blob) throw new Error("找不到目前開啟的照片");
          const clipboardBlob = await createClipboardImageBlob(blob);
          await navigator.clipboard.write([new ClipboardItem({ "image/png": clipboardBlob })]);
          GlobalModal.alert("圖片已複製，可貼到訊息或文件中。");
        } catch (error) {
          if (error?.name === "NotAllowedError") {
            GlobalModal.alert("瀏覽器未允許複製圖片，剪貼簿沒有更新。請不要使用先前貼上的舊圖片，可改用下載或分享功能。");
            return;
          }
          GlobalModal.alert("複製圖片失敗：" + error.message);
        }
      }

      function loadImageFromBlob(blob) {
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const image = new Image();
          image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
          };
          image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("圖片解碼失敗"));
          };
          image.src = url;
        });
      }

      function canvasToBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => {
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("圖片產生失敗")), type, quality);
        });
      }

      async function createClipboardImageBlob(blob) {
        const image = await loadImageFromBlob(blob);
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvasToBlob(canvas, "image/png");
      }

      function wrapCanvasText(context, text, maxWidth) {
        const lines = [];
        let line = "";
        for (const character of String(text || "")) {
          if (character === "\n") {
            lines.push(line || " ");
            line = "";
            continue;
          }
          const candidate = line + character;
          if (line && context.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = character;
          } else {
            line = candidate;
          }
        }
        lines.push(line || " ");
        return lines;
      }

      // Build a self-contained image so mobile sharing includes the needed inspection context instead of a page link.
      async function createInspectionShareCard() {
        if (!photoViewerPhoto?.id) throw new Error("尚未選擇照片");
        const blob = await getPhotoBlob(photoViewerPhoto.id, photoViewerPhoto);
        if (!blob) throw new Error("找不到目前開啟的照片");

        const image = await loadImageFromBlob(blob);
        const record = photoViewerRecord || {};
        const width = 1200;
        const padding = 56;
        const contentWidth = width - padding * 2;
        const imageScale = Math.min(contentWidth / image.naturalWidth, 1120 / image.naturalHeight, 1);
        const imageWidth = Math.max(1, Math.round(image.naturalWidth * imageScale));
        const imageHeight = Math.max(1, Math.round(image.naturalHeight * imageScale));
        const title = record.name || record.code || "巡檢紀錄";
        const details = [
          `圖號：${record.code || "未填寫"}`,
          `改善事項：${record.defect || "未填寫"}`,
        ];

        const measureCanvas = document.createElement("canvas");
        const measure = measureCanvas.getContext("2d");
        measure.font = "700 34px system-ui, sans-serif";
        const titleLines = wrapCanvasText(measure, title, contentWidth);
        measure.font = "400 28px system-ui, sans-serif";
        const detailLines = details.flatMap(detail => wrapCanvasText(measure, detail, contentWidth));
        const headerHeight = 26 + titleLines.length * 42 + 22;
        const detailHeight = 34 + detailLines.length * 42 + 26;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = headerHeight + imageHeight + detailHeight + padding * 2;
        const context = canvas.getContext("2d");

        context.fillStyle = "#eef2f5";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#087f8c";
        context.fillRect(0, 0, canvas.width, headerHeight);
        context.fillStyle = "#ffffff";
        context.font = "700 34px system-ui, sans-serif";
        let titleY = 50;
        titleLines.forEach(line => {
          context.fillText(line, padding, titleY);
          titleY += 42;
        });

        const imageX = Math.round((width - imageWidth) / 2);
        const imageY = headerHeight + padding;
        context.fillStyle = "#ffffff";
        context.fillRect(padding - 8, imageY - 8, contentWidth + 16, imageHeight + 16);
        context.drawImage(image, imageX, imageY, imageWidth, imageHeight);

        const detailY = imageY + imageHeight + padding;
        context.fillStyle = "#ffffff";
        context.fillRect(padding - 8, detailY - 16, contentWidth + 16, detailHeight + 16);
        context.fillStyle = "#17202a";
        context.font = "400 28px system-ui, sans-serif";
        let textY = detailY + 18;
        detailLines.forEach(line => {
          context.fillText(line, padding, textY);
          textY += 42;
        });
        return canvasToBlob(canvas, "image/png");
      }

      async function shareImageFile(blob, fileName) {
        if (typeof navigator.share !== "function") {
          GlobalModal.alert("此瀏覽器不支援圖片分享，請使用下載照片。");
          return;
        }
        try {
          const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
          const canShareFile = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
          if (!canShareFile) {
            GlobalModal.alert("此裝置不支援分享圖片檔案，請使用下載照片。");
            return;
          }
          await navigator.share({ files: [file] });
        } catch (error) {
          if (error?.name !== "AbortError") GlobalModal.alert("分享圖片失敗：" + error.message);
        }
      }

      function supportsNativeFileSharing() {
        const isMobile = navigator.userAgentData?.mobile === true
          || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
          || (navigator.maxTouchPoints > 1 && window.matchMedia?.("(pointer: coarse)").matches);
        if (!isMobile) return false;
        if (typeof navigator.share !== "function") return false;
        if (typeof navigator.canShare !== "function") return true;
        try {
          const sample = new File(
            [new Blob([""], { type: "image/png" })],
            "share.png",
            { type: "image/png" }
          );
          return navigator.canShare({ files: [sample] });
        } catch {
          return false;
        }
      }

      function syncPhotoViewerActions() {
        const canShareFiles = supportsNativeFileSharing();
        document.getElementById("photoViewerShare").hidden = !canShareFiles;
        document.getElementById("photoViewerShareOriginal").hidden = !canShareFiles;
        document.getElementById("photoViewerDownloadCard").hidden = canShareFiles;
      }

      async function downloadInspectionCardFromViewer() {
        try {
          const card = await createInspectionShareCard();
          const code = photoViewerRecord?.code || photoViewerPhoto?.id || "巡檢卡";
          downloadBlob(card, `巡檢卡_${code}.png`);
        } catch (error) {
          GlobalModal.alert("建立巡檢卡下載失敗：" + error.message);
        }
      }

      async function shareInspectionCardFromViewer() {
        try {
          const card = await createInspectionShareCard();
          await shareImageFile(card, "inspection-share-card.png");
        } catch (error) {
          GlobalModal.alert("建立巡檢分享卡失敗：" + error.message);
        }
      }

      async function sharePhotoFromViewer() {
        try {
          if (!photoViewerPhoto?.id) throw new Error("尚未選擇照片");
          const blob = await getPhotoBlob(photoViewerPhoto.id, photoViewerPhoto);
          if (!blob) throw new Error("找不到目前開啟的照片");
          await shareImageFile(blob, photoViewerPhoto.fileName || "巡檢照片.jpg");
        } catch (error) {
          GlobalModal.alert("分享原圖失敗：" + error.message);
        }
      }

      document.getElementById("photoViewerClose").addEventListener("click", closePhotoViewer);
      document.getElementById("photoViewerCopy").addEventListener("click", copyPhotoFromViewer);
      document.getElementById("photoViewerShare").addEventListener("click", shareInspectionCardFromViewer);
      document.getElementById("photoViewerShareOriginal").addEventListener("click", sharePhotoFromViewer);
      document.getElementById("photoViewerDownloadCard").addEventListener("click", downloadInspectionCardFromViewer);
      document.getElementById("photoViewerZoomOut").addEventListener("click", () => changePhotoViewerZoom(-0.5));
      document.getElementById("photoViewerZoomReset").addEventListener("click", resetPhotoViewerZoom);
      document.getElementById("photoViewerZoomIn").addEventListener("click", () => changePhotoViewerZoom(0.5));
      const photoViewerBody = document.querySelector(".photo-viewer-body");
      photoViewerBody.addEventListener("wheel", event => {
        if (!document.getElementById("photoViewer").classList.contains("is-open")) return;
        event.preventDefault();
        changePhotoViewerZoom(event.deltaY < 0 ? 0.25 : -0.25);
      }, { passive: false });
      photoViewerBody.addEventListener("pointerdown", event => {
        if (!document.getElementById("photoViewer").classList.contains("is-open") || event.target.id !== "photoViewerImage") return;
        event.preventDefault();
        photoViewerPointers.set(event.pointerId, {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          downAt: Date.now(),
          moved: false,
        });
        event.target.setPointerCapture?.(event.pointerId);
        if (photoViewerPointers.size >= 2) {
          const [first, second] = [...photoViewerPointers.values()].slice(0, 2);
          photoViewerPinch = {
            startDistance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
            startCenter: {
              x: (first.clientX + second.clientX) / 2,
              y: (first.clientY + second.clientY) / 2,
            },
            startScale: photoViewerScale,
            startOffset: { ...photoViewerOffset },
          };
          photoViewerDrag = null;
          photoViewerLastTap = null;
        } else if (photoViewerScale > 1) {
          photoViewerDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: photoViewerOffset.x,
            offsetY: photoViewerOffset.y,
          };
        }
        applyPhotoViewerTransform();
      });
      photoViewerBody.addEventListener("pointermove", event => {
        const pointer = photoViewerPointers.get(event.pointerId);
        if (!pointer) return;
        pointer.moved = pointer.moved || Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 8;
        pointer.clientX = event.clientX;
        pointer.clientY = event.clientY;
        if (photoViewerPinch && photoViewerPointers.size >= 2) {
          event.preventDefault();
          const [first, second] = [...photoViewerPointers.values()].slice(0, 2);
          const currentDistance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
          const currentCenter = {
            x: (first.clientX + second.clientX) / 2,
            y: (first.clientY + second.clientY) / 2,
          };
          const ratio = currentDistance / photoViewerPinch.startDistance;
          const nextScale = Math.min(4, Math.max(1, Number((photoViewerPinch.startScale * ratio).toFixed(2))));
          const startPoint = getPhotoViewerBodyPoint(photoViewerPinch.startCenter.x, photoViewerPinch.startCenter.y);
          const currentPoint = getPhotoViewerBodyPoint(currentCenter.x, currentCenter.y);
          const scaleRatio = nextScale / Math.max(0.01, photoViewerPinch.startScale);
          photoViewerScale = nextScale;
          photoViewerOffset = nextScale === 1
            ? { x: 0, y: 0 }
            : {
                x: currentPoint.x - (startPoint.x - photoViewerPinch.startOffset.x) * scaleRatio,
                y: currentPoint.y - (startPoint.y - photoViewerPinch.startOffset.y) * scaleRatio,
              };
          applyPhotoViewerTransform();
          return;
        }
        if (photoViewerDrag?.pointerId !== event.pointerId) return;
        event.preventDefault();
        photoViewerOffset = {
          x: photoViewerDrag.offsetX + event.clientX - photoViewerDrag.startX,
          y: photoViewerDrag.offsetY + event.clientY - photoViewerDrag.startY,
        };
        applyPhotoViewerTransform();
      });
      const endPhotoViewerPointer = event => {
        const pointer = photoViewerPointers.get(event.pointerId);
        if (!pointer) return;
        const now = Date.now();
        const wasPinching = Boolean(photoViewerPinch);
        const wasDragging = photoViewerDrag?.pointerId === event.pointerId;
        photoViewerPointers.delete(event.pointerId);
        if (wasPinching) {
          photoViewerLastPinchAt = now;
          photoViewerLastTap = null;
          photoViewerPinch = null;
          photoViewerDrag = null;
          const remaining = [...photoViewerPointers.values()][0];
          if (remaining && photoViewerScale > 1) {
            photoViewerDrag = {
              pointerId: remaining.pointerId,
              startX: remaining.clientX,
              startY: remaining.clientY,
              offsetX: photoViewerOffset.x,
              offsetY: photoViewerOffset.y,
            };
          }
        } else if (wasDragging) {
          photoViewerDrag = null;
        }
        const isTap = !wasPinching && !pointer.moved && now - pointer.downAt < 300;
        if (isTap && now - photoViewerLastPinchAt >= 350) {
          if (photoViewerLastTap && now - photoViewerLastTap.time < 320
            && Math.hypot(event.clientX - photoViewerLastTap.x, event.clientY - photoViewerLastTap.y) < 36) {
            setPhotoViewerScaleAt(photoViewerScale > 1 ? 1 : 2, event.clientX, event.clientY);
            photoViewerLastTap = null;
          } else {
            photoViewerLastTap = { time: now, x: event.clientX, y: event.clientY };
          }
        } else if (!photoViewerPointers.size) {
          photoViewerLastTap = null;
        }
        applyPhotoViewerTransform();
      };
      photoViewerBody.addEventListener("pointerup", endPhotoViewerPointer);
      photoViewerBody.addEventListener("pointercancel", endPhotoViewerPointer);
      document.getElementById("photoViewer").addEventListener("click", event => {
        if (event.target.id === "photoViewer") closePhotoViewer();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closePhotoViewer();
      });

      function updatePhotoFolderSelectStates() {
        document.querySelectorAll("#photoBrowserGrid .photo-folder-group").forEach(group => {
          const box = group.querySelector(".photo-folder-select");
          if (!box) return;
          const inputs = [...group.querySelectorAll("[data-photo-select]")];
          const checked = inputs.filter(input => input.checked).length;
          box.checked = inputs.length > 0 && checked === inputs.length;
          box.indeterminate = checked > 0 && checked < inputs.length;
          box.disabled = inputs.length === 0;
        });
      }

      function selectPhotoFolderPhotos(folderId, shouldSelect) {
        const group = document.querySelector(`#photoBrowserGrid [data-photo-folder-select="${CSS.escape(folderId || "__uncategorized__")}"]`)?.closest(".photo-folder-group");
        if (!group) return;
        group.querySelectorAll("[data-photo-select]").forEach(input => { input.checked = shouldSelect; });
        updatePhotoBrowserSelectionUi();
      }

      function updatePhotoBrowserSelectionUi() {
        const grid = document.getElementById("photoBrowserGrid");
        const selectedCount = document.getElementById("photoBrowserSelectedCount");
        const deleteSelected = document.getElementById("photoBrowserDeleteSelectedBtn");
        if (!grid || !selectedCount || !deleteSelected) return;
        const count = grid.querySelectorAll("[data-photo-select]:checked").length;
        selectedCount.textContent = count ? `已選取 ${count} 張照片` : "未選取照片";
        deleteSelected.disabled = count === 0;
        updatePhotoFolderSelectStates();
      }

      function stopPhotoThumbnailLoading() {
        if (photoThumbnailObserver) photoThumbnailObserver.disconnect();
        photoThumbnailObserver = null;
        photoThumbnailQueue = [];
        photoBrowserRenderEpoch++;
      }

      function runPhotoThumbnailQueue(epoch) {
        while (photoThumbnailActive < 3 && photoThumbnailQueue.length) {
          const task = photoThumbnailQueue.shift();
          photoThumbnailActive++;
          (async () => {
            try {
              if (epoch !== photoBrowserRenderEpoch || !task.image.isConnected) return;
              const blob = await getPhotoBlob(task.photo.id, task.photo);
              if (!blob || epoch !== photoBrowserRenderEpoch || !task.image.isConnected) return;
              const previewBlob = await createPhotoPreviewBlob(blob);
              if (epoch !== photoBrowserRenderEpoch || !task.image.isConnected) return;
              const url = URL.createObjectURL(previewBlob);
              photoBrowserPreviewUrls.push(url);
              task.image.src = url;
              task.image.dataset.loaded = "true";
            } catch (error) {
              console.warn("縮圖載入失敗：", error);
            } finally {
              photoThumbnailActive--;
              runPhotoThumbnailQueue(epoch);
            }
          })();
        }
      }

      function queuePhotoThumbnail(image, photo, epoch) {
        if (!image || image.dataset.queued === "true" || image.dataset.loaded === "true") return;
        image.dataset.queued = "true";
        photoThumbnailQueue.push({ image, photo });
        runPhotoThumbnailQueue(epoch);
      }

      function deletePhotoIdsFromRecords(photoIds) {
        const ids = new Set(photoIds.filter(Boolean));
        if (!ids.size) return Promise.resolve();
        const removed = [];
        state.records.forEach(record => {
          const photos = Array.isArray(record.photos) ? record.photos : [];
          const remaining = photos.filter(photo => {
            if (!ids.has(photo.id)) return true;
            removed.push(photo.id);
            return false;
          });
          record.photos = remaining;
        });
        if (photoViewerPhoto?.id && ids.has(photoViewerPhoto.id)) closePhotoViewer();
        saveToLocalStorage();
        return Promise.all(removed.map(deletePhotoBlob)).then(() => {
          renderPhotoBrowser();
          refreshStorageStatus();
        });
      }

      function selectedBrowserPhotoIds() {
        return [...document.querySelectorAll("#photoBrowserGrid [data-photo-select]:checked")].map(input => input.dataset.photoSelect);
      }

      function selectAllVisibleBrowserPhotos() {
        const inputs = [...document.querySelectorAll("#photoBrowserGrid [data-photo-select]")];
        const shouldSelect = inputs.some(input => !input.checked);
        inputs.forEach(input => { input.checked = shouldSelect; });
        const button = document.getElementById("photoBrowserSelectAllBtn");
        if (button) button.textContent = shouldSelect ? "取消選取" : "全部選取";
        updatePhotoBrowserSelectionUi();
      }

      function deleteSelectedBrowserPhotos() {
        const ids = selectedBrowserPhotoIds();
        if (!ids.length) return;
        GlobalModal.confirm(`確定要刪除選取的 ${ids.length} 張照片嗎？此動作無法從瀏覽器內復原，請先確認已有 ZIP 備份。`, async () => {
          try { await deletePhotoIdsFromRecords(ids); }
          catch (error) { GlobalModal.alert("刪除照片失敗：" + error.message); }
        });
      }

      function deleteAllBrowserPhotos() {
        const ids = state.records.flatMap(record => (record.photos || []).map(photo => photo.id));
        if (!ids.length) { GlobalModal.alert("目前沒有可刪除的照片。"); return; }
        GlobalModal.confirm(`確定要刪除全部 ${ids.length} 張照片嗎？巡檢紀錄本身會保留，但照片無法從瀏覽器內復原。`, async () => {
          try { await deletePhotoIdsFromRecords(ids); }
          catch (error) { GlobalModal.alert("刪除照片失敗：" + error.message); }
        });
      }

      function deleteBrowserFolderPhotos(folderId) {
        const ids = state.records
          .filter(record => (folderId ? record.folderId === folderId : !record.folderId))
          .flatMap(record => (record.photos || []).map(photo => photo.id));
        if (!ids.length) return;
        GlobalModal.confirm(`確定要刪除這個資料夾內的 ${ids.length} 張照片嗎？巡檢紀錄本身會保留。`, async () => {
          try { await deletePhotoIdsFromRecords(ids); }
          catch (error) { GlobalModal.alert("刪除照片失敗：" + error.message); }
        });
      }

      const collapsedPhotoFolders = new Set();
      let collapsedPhotoFoldersInitialized = false;
      function togglePhotoFolderCollapse(folderId) {
        const key = folderId || "__uncategorized__";
        if (collapsedPhotoFolders.has(key)) collapsedPhotoFolders.delete(key);
        else collapsedPhotoFolders.add(key);
        renderPhotoBrowser();
      }
      async function renderPhotoBrowser() {
        const grid = document.getElementById("photoBrowserGrid");
        const count = document.getElementById("photoBrowserCount");
        const folderFilter = document.getElementById("photoBrowserFolderFilter");
        if (!grid || !count || !folderFilter) return;
        if (!collapsedPhotoFoldersInitialized) {
          state.folders.forEach(folder => collapsedPhotoFolders.add(folder.id));
          collapsedPhotoFoldersInitialized = true;
        }
        const prevChecked = new Set([...grid.querySelectorAll("[data-photo-select]:checked")].map(input => input.dataset.photoSelect));
        stopPhotoThumbnailLoading();
        clearPhotoBrowserPreviewUrls();
        const epoch = photoBrowserRenderEpoch;
        const selectedFolder = folderFilter.value;
        folderFilter.innerHTML = '<option value="">全部資料夾</option>' + state.folders.map(folder =>
          `<option value="${escapeHtml(folder.id)}">${escapeHtml(getFullFolderPath(folder.id))}</option>`).join("");
        if ([...folderFilter.options].some(option => option.value === selectedFolder)) folderFilter.value = selectedFolder;
        const query = document.getElementById("photoBrowserSearch").value.trim().toLowerCase();
        const records = state.records.filter(record => {
          if (!Array.isArray(record.photos) || record.photos.length === 0) return false;
          if (folderFilter.value && record.folderId !== folderFilter.value) return false;
          const haystack = `${record.name || ""} ${record.code || ""} ${getFullFolderPath(record.folderId)} ${record.defect || ""}`.toLowerCase();
          return !query || haystack.includes(query);
        });
        const photoCount = records.reduce((total, record) => total + record.photos.length, 0);
        count.textContent = photoCount;
        if (!records.length) {
          grid.innerHTML = '<div style="font-size:13px; color:var(--muted); padding:18px 0;">尚無符合條件的照片紀錄</div>';
          const selectButton = document.getElementById("photoBrowserSelectAllBtn");
          if (selectButton) selectButton.textContent = "全部選取";
          updatePhotoBrowserSelectionUi();
          return;
        }

        const groups = new Map();
        records.forEach(record => {
          const key = record.folderId || "__uncategorized__";
          if (!groups.has(key)) groups.set(key, { folderId: record.folderId || "", label: getFullFolderPath(record.folderId) || "未歸類", records: [] });
          groups.get(key).records.push(record);
        });
        grid.innerHTML = [...groups.values()].map(group => {
          const groupPhotoCount = group.records.reduce((total, record) => total + record.photos.length, 0);
          const folderCollapsed = collapsedPhotoFolders.has(group.folderId || "__uncategorized__");
          return `<section class="photo-folder-group${folderCollapsed ? " is-collapsed" : ""}" data-photo-folder="${escapeHtml(group.folderId || "__uncategorized__")}">
            <div class="photo-folder-head${folderCollapsed ? " is-collapsed" : ""}" role="button" tabindex="0" aria-expanded="${folderCollapsed ? "false" : "true"}">
              <button type="button" class="photo-folder-toggle" data-photo-folder-toggle="${escapeHtml(group.folderId || "__uncategorized__")}" title="收合/展開資料夾" aria-label="收合/展開資料夾">▾</button>
              <input type="checkbox" class="photo-folder-select" data-photo-folder-select="${escapeHtml(group.folderId || "__uncategorized__")}" aria-label="選取此資料夾所有照片" title="選取此資料夾所有照片">
              <strong>📂 ${escapeHtml(group.label)}</strong>
              <span>${groupPhotoCount} 張</span>
              <button type="button" class="photo-folder-delete" data-photo-delete-folder="${escapeHtml(group.folderId)}">刪除此資料夾照片</button>
            </div>
            <div class="photo-folder-records">${group.records.map(record => `
              <article class="photo-record-card" data-photo-record="${escapeHtml(record.id)}" tabindex="0">
                <div class="photo-record-head">
                  <strong>${escapeHtml(record.name || record.code || "未命名設備")}</strong>
                  <span>${escapeHtml(record.code || "未填圖號")}</span>
                </div>
                <div class="photo-record-strip">${record.photos.map(photo => `
                  <figure class="photo-browser-item">
                    <input type="checkbox" data-photo-select="${escapeHtml(photo.id)}" aria-label="選取 ${escapeHtml(photo.fileName || "巡檢照片")}"${prevChecked.has(photo.id) ? " checked" : ""}>
                    <img data-photo-open="${escapeHtml(photo.id)}" data-browser-image="${escapeHtml(photo.id)}" alt="${escapeHtml(photo.fileName || "巡檢照片")}" title="點擊查看原圖" loading="lazy" />
                    <button type="button" data-photo-delete-single="${escapeHtml(photo.id)}" title="刪除這張照片" aria-label="刪除這張照片">×</button>
                  </figure>`).join("")}</div>
                <div class="photo-record-defect"><strong>改善事項</strong><span>${escapeHtml(record.defect || "未填寫")}</span></div>
                <div class="photo-record-actions"><span>${escapeHtml(record.photos.length + " 張照片")}</span></div>
              </article>`).join("")}</div>
          </section>`;
        }).join("");

        if ("IntersectionObserver" in window) {
          const scrollRoot = document.querySelector(".photo-browser");
          photoThumbnailObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
              if (!entry.isIntersecting) return;
              photoThumbnailObserver.unobserve(entry.target);
              const photo = findPhotoMetadata(entry.target.dataset.browserImage);
              if (photo) queuePhotoThumbnail(entry.target, photo, epoch);
            });
          }, { root: scrollRoot, rootMargin: "280px 0px" });
          grid.querySelectorAll("[data-browser-image]").forEach(image => photoThumbnailObserver.observe(image));
        } else {
          records.flatMap(record => record.photos).forEach(photo => {
            const image = grid.querySelector(`[data-browser-image="${CSS.escape(photo.id)}"]`);
            queuePhotoThumbnail(image, photo, epoch);
          });
        }
        const selectButton = document.getElementById("photoBrowserSelectAllBtn");
        if (selectButton) selectButton.textContent = prevChecked.size ? "取消選取" : "全部選取";
        updatePhotoBrowserSelectionUi();
        updatePhotoFolderSelectStates();
      }

      // ==========================================
      // 將資料帶入側邊欄，並切換分頁
      // ==========================================
      function openEditPanel(point, options = {}) {
        if (!options.skipDirtyGuard && hasUnsavedEditChanges()) {
          const currentPoint = editDraftState.point;
          const isSamePoint = currentPoint
            && Math.abs(Number(currentPoint.lat) - Number(point.lat)) < 0.0000001
            && Math.abs(Number(currentPoint.lng) - Number(point.lng)) < 0.0000001;
          if (!isSamePoint) {
            confirmBeforeLeavingEdit(() => openEditPanel(point, { skipDirtyGuard: true }));
            return;
          }
        }
        disableRouteLayerForTools();
        document.getElementById("editFormContainer").style.display = "flex";
        document.getElementById("sidebarSaveBtn").disabled = false;
        setTimeout(() => maybeShowDailyFolderReminder(), 400);

        const existingRecord = state.records.find(r => r.id === point.id)
          || state.records.find(r => isSameMapPoint(r, point));

        document.getElementById("editRecordId").value = existingRecord ? existingRecord.id : "";
        const allRecordsForPoint = state.records.filter(r => isSameMapPoint(r, point));

        document.getElementById("editPanelTitle").textContent = point.name || "未命名設備";
        document.getElementById("editPanelMeta").textContent = `圖號：${point.code || ""} | 座標：${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;

        let warningHtml = "";
        if (allRecordsForPoint.length > 0) {
          const folderLinks = allRecordsForPoint.map(r => `<span class="goto-folder-link" data-folder-id="${r.folderId}" data-record-id="${r.id}" style="cursor:pointer; text-decoration:underline; color:#b91c1c; margin-right:4px;">📂 ${escapeHtml(getFullFolderPath(r.folderId))}</span>`).join("");
          warningHtml = `<div style="font-size:11px; font-weight:bold; background:#fff5f5; padding:4px 6px; border-radius:4px; line-height:1.8;">⚠️ 已記錄於：<br>${folderLinks}</div>`;
        }
        document.getElementById("editPanelWarning").innerHTML = warningHtml;

        document.getElementById("editLat").value = point.lat;
        document.getElementById("editLng").value = point.lng;
        document.getElementById("editCode").value = point.code || "";

        document.getElementById("editPanelActions").style.display = "flex";
        document.getElementById("sidebarNavBtn").href = googleNavUrl(point);

        document.getElementById("sidebar-name-input").value = existingRecord ? (existingRecord.name || point.name || "手動新增設備") : (point.name || "手動新增設備");
        document.getElementById("sidebar-defect-input").value = existingRecord ? (existingRecord.defect || "") : "";
        document.getElementById("sidebar-urgency").value = existingRecord ? (existingRecord.urgency || "C") : "C";
        const isCorrectionNeeded = existingRecord ? !!existingRecord.needCorrection : false;
        document.getElementById("sidebar-correction-flag").checked = isCorrectionNeeded;
        document.getElementById("sidebar-correct-code-container").style.display = isCorrectionNeeded ? "flex" : "none";
        document.getElementById("sidebar-correct-code-input").value = existingRecord && existingRecord.correctCode ? existingRecord.correctCode : "";
        const defaultFolderId = existingRecord ? existingRecord.folderId : (state.lastFolderId || null);
        document.getElementById("sidebar-folder").innerHTML = getFolderOptionsHtml(defaultFolderId);

        const currentIcon = existingRecord ? (existingRecord.icon || "") : "";
        document.getElementById("sidebar-icon-input").value = currentIcon;
        document.querySelectorAll("#tabEdit .icon-chip-btn").forEach(btn => {
          btn.classList.toggle("is-selected", btn.dataset.icon === currentIcon);
        });

        updateSidebarIconPreview();
        beginEditPhotos(existingRecord);

        switchTab('edit');
        setPanelCollapsed(false);
      }

      // ==========================================
      // 地圖上的迷你導航小視窗 (精簡版)
      // ==========================================
      function miniPopupHtml(point) {
        return `
          <div class="popup-layout" style="min-width: 140px; text-align: center;">
            <div class="popup-title">${escapeHtml(point.name || "未命名設備")}</div>
            <div class="popup-meta" style="margin-bottom:2px;">圖號：${escapeHtml(point.code || "")}</div>
          </div>`;
      }




// ==========================================
      // Leaflet 地圖初始化
      // ==========================================
      const map = L.map("map", { preferCanvas: true, zoomControl: false, attributionControl: true });
      window.__v2LeafletMap = map;
      map.createPane("routePane");
      map.getPane("routePane").style.zIndex = 390;
      map.getPane("routePane").style.pointerEvents = "none";
      map.createPane("tpcGridPane");
      map.getPane("tpcGridPane").style.zIndex = 405;
      map.getPane("tpcGridPane").style.pointerEvents = "none";
      map.createPane("tpcGridLabelPane");
      map.getPane("tpcGridLabelPane").style.zIndex = 660;
      map.getPane("tpcGridLabelPane").style.pointerEvents = "none";
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const baseMapSelect = document.getElementById("baseMapSelect");
      const baseMapConfigs = {
        emap: {
          label: "臺灣通用電子地圖",
          url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: {
            maxZoom: 21,
            maxNativeZoom: 19,
            attribution: "© 內政部國土測繪中心",
            crossOrigin: true,
          },
        },
        photo_mix: {
          label: "正射影像混合",
          url: "https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: {
            maxZoom: 21,
            maxNativeZoom: 19,
            attribution: "© 國土測繪中心",
            crossOrigin: true,
          },
        },
        emap5: {
          label: "通用電子地圖(等高線+門牌)",
          url: "https://wmts.nlsc.gov.tw/wmts/EMAP5/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: {
            maxZoom: 21,
            maxNativeZoom: 19,
            attribution: "© 國土測繪中心",
            crossOrigin: true,
          },
        },
        osm: {
          label: "OpenStreetMap",
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          options: {
            maxZoom: 21,
            maxNativeZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" aria-label="OpenStreetMap contributors">OpenStreetMap</a>',
          },
        },
      };
      let baseTileLayer = null;

      function setBaseMap(baseMapKey) {
        const key = baseMapConfigs[baseMapKey] ? baseMapKey : "emap";
        const config = baseMapConfigs[key];
        if (baseTileLayer) map.removeLayer(baseTileLayer);

        const nextTileLayer = L.tileLayer(config.url, config.options).on("tileerror", () => {
          if (baseTileLayer !== nextTileLayer) return;
          setOfflineNotice(`「${config.label}」目前無法載入；可在「更多」→「底圖」切換備用底圖。設備資料、巡檢紀錄與照片仍可使用。`);
        }).addTo(map);

        baseTileLayer = nextTileLayer;
        if (baseMapSelect) baseMapSelect.value = key;
      }

      // 每次開啟 V2 都以臺灣通用電子地圖為預設；OSM 僅供本次操作手動切換。
      setBaseMap("emap");
      baseMapSelect?.addEventListener("change", event => setBaseMap(event.target.value));

      // 疊加圖層（透明 WMS/WMTS，可與底圖同時顯示）
      const overlayConfigs = {
        LANDSECT: {
          label: "段籍圖",
          url: "https://wmts.nlsc.gov.tw/wmts/LANDSECT/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: { maxZoom: 21, maxNativeZoom: 19, opacity: 0.65, attribution: "© 國土測繪中心", crossOrigin: true },
        },
        TOWN: {
          label: "鄉鎮界",
          url: "https://wmts.nlsc.gov.tw/wmts/TOWN/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: { maxZoom: 21, maxNativeZoom: 19, opacity: 0.7, attribution: "© 國土測繪中心", crossOrigin: true },
        },
        Village: {
          label: "村里界",
          url: "https://wmts.nlsc.gov.tw/wmts/Village/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: { maxZoom: 21, maxNativeZoom: 19, opacity: 0.7, attribution: "© 國土測繪中心", crossOrigin: true },
        },
        ROAD: {
          label: "道路路網",
          url: "https://wmts.nlsc.gov.tw/wmts/ROAD/default/GoogleMapsCompatible/{z}/{y}/{x}",
          options: { maxZoom: 21, maxNativeZoom: 19, opacity: 0.7, attribution: "© 國土測繪中心", crossOrigin: true },
        },
      };
      const overlayLayers = {};
      function setOverlayVisible(key, visible) {
        const config = overlayConfigs[key];
        if (!config) return;
        const btn = document.getElementById(`overlay${key}Toggle`);
        const stateEl = document.getElementById(`overlay${key}State`);
        if (visible) {
          if (!overlayLayers[key]) {
            overlayLayers[key] = L.tileLayer(config.url, config.options).on("tileerror", () => {
              if (overlayLayers[key]) setOfflineNotice(`「${config.label}」疊加圖層暫時無法載入。`);
            });
          }
          if (!map.hasLayer(overlayLayers[key])) overlayLayers[key].addTo(map);
        } else {
          if (overlayLayers[key] && map.hasLayer(overlayLayers[key])) map.removeLayer(overlayLayers[key]);
        }
        if (btn) btn.setAttribute("aria-pressed", String(visible));
        if (stateEl) stateEl.textContent = visible ? "顯示" : "隱藏";
        if (btn) {
          btn.classList.toggle("is-active", visible);
          btn.classList.toggle("is-hidden", !visible);
        }
      }
      ["LANDSECT", "TOWN", "Village", "ROAD"].forEach(key => {
        const btn = document.getElementById(`overlay${key}Toggle`);
        btn?.addEventListener("click", () => {
          const isActive = btn.getAttribute("aria-pressed") === "true";
          setOverlayVisible(key, !isActive);
          try { btn.blur(); } catch (e) {}
        });
      });

      // ==========================================
      // 圖號座標網格圖層（顯示圖號座標對應網格）
      // ==========================================
      const tpcGrid = { visible: false, layer: null, buildTimer: null };
      const pad2 = (n) => String(n).padStart(2, "0");

      function tpcGridVisibleRange(paddingMeters = 2000) {
        const b = map.getBounds();
        const corners = [
          wgs84ToTwd67Tm2(b.getNorth(), b.getWest()),
          wgs84ToTwd67Tm2(b.getNorth(), b.getEast()),
          wgs84ToTwd67Tm2(b.getSouth(), b.getWest()),
          wgs84ToTwd67Tm2(b.getSouth(), b.getEast()),
        ];
        return {
          minX: Math.min(...corners.map(c => c.x)) - paddingMeters,
          maxX: Math.max(...corners.map(c => c.x)) + paddingMeters,
          minY: Math.min(...corners.map(c => c.y)) - paddingMeters,
          maxY: Math.max(...corners.map(c => c.y)) + paddingMeters,
        };
      }

      const tpcGridReadout = document.getElementById("tpcGridReadout");
      const tpcGridReadoutCode = document.getElementById("tpcGridReadoutCode");
      const tpcGridReadoutMeta = document.getElementById("tpcGridReadoutMeta");
      function updateTpcGridReadout() {
        if (!tpcGridReadout || !tpcGridReadoutCode || !tpcGridReadoutMeta) return;
        if (!tpcGrid.visible) {
          tpcGridReadout.hidden = true;
          return;
        }
        const zoom = Math.round(map.getZoom());
        const center = map.getCenter();
        const rawCode = String(latLngToTpcCode(center.lat, center.lng) || "").trim().toUpperCase();
        const fullMatch = rawCode.match(/^([A-Z]\d{4}[A-Z]{2}\d{2})/);
        const fullCode = fullMatch ? fullMatch[1] : rawCode;
        let displayCode = fullCode || "--";
        if (fullMatch) {
          if (zoom >= 18) displayCode = fullCode.slice(-4);
          else if (zoom >= 16) displayCode = fullCode.slice(5, 7);
          else if (zoom >= 12) displayCode = fullCode.slice(0, 5);
          else displayCode = fullCode.slice(0, 1);
        }
        const level = zoom >= 20 ? "10m 分割格" : zoom >= 18 ? "10m 圖號" : zoom >= 16 ? "100m 細格" : zoom >= 12 ? "800m 區塊" : "圖組範圍";
        tpcGridReadoutCode.textContent = displayCode;
        tpcGridReadoutMeta.textContent = `Zoom ${zoom} · ${level}（地圖中心）`;
        tpcGridReadout.hidden = false;
      }

      function buildTpcGridLayer() {
        if (tpcGrid.layer) { map.removeLayer(tpcGrid.layer); tpcGrid.layer = null; }
        updateTpcGridReadout();
        if (!tpcGrid.visible) return;
        const range = tpcGridVisibleRange();
        const labelRange = tpcGridVisibleRange(0);
        const zoom = map.getZoom();
        const mapSize = map.getSize();
        const isCompactViewport = mapSize.x < 700 || mapSize.y < 560;
        const layer = L.layerGroup();
        const labels = L.layerGroup();
        layer.addLayer(labels);
        // 各倍率只畫一個尺度，避免邊界重複疊畫成雙線或錯位的視覺感。
        const showT2 = zoom >= 12 && zoom < 16; // 800m × 500m 網格
        const showT3 = zoom >= 16 && zoom < 18; // 100m × 100m 次網格
        const showFineGrid = zoom >= 18;        // 10m × 10m 細格
        const showPrefixLabels = zoom >= 12 && zoom < 16; // 區塊碼，例如 M8614
        const showT3Labels = zoom >= 16 && zoom < 18;     // 細格碼，例如 BD
        const showT5Labels = zoom >= 18;                  // 最後 4 碼，例如 BA47
        const showFineBlockLabels = zoom >= 20;            // 100m 區塊角標，例如 EC、FC
        // Zoom 20 以上需要每個 10m 細格都有圖號；其餘倍率仍限制標籤數量維持畫面乾淨。
        const MAX_GRID_LABELS = zoom >= 20
          ? (isCompactViewport ? 600 : 2400)
          : (isCompactViewport ? 180 : 360);
        let labelCount = 0;
        const toLatLng = (x, y) => { const p = twd67Tm2ToWgs84(x, y); return [p.lat, p.lng]; };
        const addLabel = (latlng, html, className, countTowardLimit = true) => {
          if (countTowardLimit && labelCount >= MAX_GRID_LABELS) return false;
          if (countTowardLimit) labelCount++;
          L.marker(latlng, {
            icon: L.divIcon({ className: "tpc-grid-label-wrap", html: `<span class="${className}">${html}</span>`, iconSize: [0, 0] }),
            interactive: false,
            pane: "tpcGridLabelPane",
            zIndexOffset: 1000,
          }).addTo(labels);
          return true;
        };

        for (const [baseChar, [bx, by]] of Object.entries(GRID_BASES)) {
          const baseX0 = bx, baseX1 = bx + 80000, baseY0 = by, baseY1 = by + 50000;
          if (baseX1 < range.minX || baseX0 > range.maxX || baseY1 < range.minY || baseY0 > range.maxY) continue;

          // 圖組邊界（80km × 50km）
          // 縮小時顯示圖組邊界；其餘倍率由各自格線畫邊界，避免同一條線重複堆疊。
          if (!showT2 && !showT3 && !showFineGrid) {
            L.polyline([
              toLatLng(baseX0, baseY0), toLatLng(baseX1, baseY0),
              toLatLng(baseX1, baseY1), toLatLng(baseX0, baseY1), toLatLng(baseX0, baseY0),
            ], { color: "#d88922", weight: 3, opacity: 0.95, interactive: false }).addTo(layer);
            addLabel(toLatLng(baseX0 + 2000, baseY1 - 2000), baseChar, "tpc-grid-base-label");
            continue;
          }

          if (showT2) {
          // 800m 垂直線
          const vStart = Math.max(baseX0, Math.floor((range.minX - bx) / 800) * 800 + bx);
          for (let x = vStart; x <= Math.min(baseX1, range.maxX); x += 800) {
            if (x < baseX0 || x > baseX1) continue;
            L.polyline([toLatLng(x, baseY0), toLatLng(x, baseY1)], {
              color: "#087f8c", weight: 1.3, opacity: 0.55, dashArray: "5 5", interactive: false,
            }).addTo(layer);
          }
          // 500m 水平線
          const hStart = Math.max(baseY0, Math.floor((range.minY - by) / 500) * 500 + by);
          for (let y = hStart; y <= Math.min(baseY1, range.maxY); y += 500) {
            if (y < baseY0 || y > baseY1) continue;
            L.polyline([toLatLng(baseX0, y), toLatLng(baseX1, y)], {
              color: "#087f8c", weight: 1.3, opacity: 0.55, dashArray: "5 5", interactive: false,
            }).addTo(layer);
          }
          const vLabelStart = Math.max(baseX0, Math.floor((labelRange.minX - bx) / 800) * 800 + bx);
          const hLabelStart = Math.max(baseY0, Math.floor((labelRange.minY - by) / 500) * 500 + by);
          // 800m × 500m 格子標籤（前 5 碼，如 L3128）
          if (showPrefixLabels) {
            for (let x = vLabelStart; x <= Math.min(baseX1, labelRange.maxX); x += 800) {
              if (x < baseX0) continue;
              const t2x = Math.round((x - bx) / 800);
              if (zoom < 17 && t2x % 2 !== 0) continue;
              for (let y = hLabelStart; y <= Math.min(baseY1, labelRange.maxY); y += 500) {
                if (y < baseY0) continue;
                const t2y = Math.round((y - by) / 500);
                addLabel(toLatLng(x + 400, y + 250), `${baseChar}${pad2(t2x)}${pad2(t2y)}`, "tpc-grid-label tpc-grid-label-prefix");
              }
            }
          }
          }
          if (!showT3 && !showFineGrid) continue;

          // 10m 分割線：放大後形成參考圖中的 10 × 10 細格。
          if (showFineGrid) {
            const fineStep = 10;
            const blockStep = 100;
            const fineMinX = Math.max(baseX0, range.minX), fineMaxX = Math.min(baseX1, range.maxX);
            const fineMinY = Math.max(baseY0, range.minY), fineMaxY = Math.min(baseY1, range.maxY);
            const fineXStart = Math.max(baseX0, Math.floor((range.minX - bx) / fineStep) * fineStep + bx);
            const fineYStart = Math.max(baseY0, Math.floor((range.minY - by) / fineStep) * fineStep + by);
            for (let x = fineXStart; x <= fineMaxX; x += fineStep) {
              if ((x - bx) % blockStep === 0) continue;
              L.polyline([toLatLng(x, fineMinY), toLatLng(x, fineMaxY)], {
                color: "#0f766e", weight: 0.8, opacity: 0.34, pane: "tpcGridPane", interactive: false,
              }).addTo(layer);
            }
            for (let y = fineYStart; y <= fineMaxY; y += fineStep) {
              if ((y - by) % blockStep === 0) continue;
              L.polyline([toLatLng(fineMinX, y), toLatLng(fineMaxX, y)], {
                color: "#0f766e", weight: 0.8, opacity: 0.34, pane: "tpcGridPane", interactive: false,
              }).addTo(layer);
            }

            // 100m 圖組邊界取代同位置的 10m 細線，讓前兩碼改變的位置一眼可辨且不會疊線。
            const blockXStart = Math.max(baseX0, Math.floor((range.minX - bx) / blockStep) * blockStep + bx);
            const blockYStart = Math.max(baseY0, Math.floor((range.minY - by) / blockStep) * blockStep + by);
            for (let x = blockXStart; x <= fineMaxX; x += blockStep) {
              L.polyline([toLatLng(x, fineMinY), toLatLng(x, fineMaxY)], {
                color: "#075985", weight: 1.5, opacity: 0.82, pane: "tpcGridPane", interactive: false,
              }).addTo(layer);
            }
            for (let y = blockYStart; y <= fineMaxY; y += blockStep) {
              L.polyline([toLatLng(fineMinX, y), toLatLng(fineMaxX, y)], {
                color: "#075985", weight: 1.5, opacity: 0.82, pane: "tpcGridPane", interactive: false,
              }).addTo(layer);
            }

            if (showFineBlockLabels) {
              const blockLabelXStart = Math.max(baseX0, Math.floor((labelRange.minX - bx) / blockStep) * blockStep + bx);
              const blockLabelYStart = Math.max(baseY0, Math.floor((labelRange.minY - by) / blockStep) * blockStep + by);
              for (let x = blockLabelXStart; x <= Math.min(baseX1, labelRange.maxX); x += blockStep) {
                if (x < baseX0) continue;
                const t3x = Math.floor(((x - bx) % 800) / blockStep);
                for (let y = blockLabelYStart; y <= Math.min(baseY1, labelRange.maxY); y += blockStep) {
                  if (y < baseY0) continue;
                  const t3y = Math.floor(((y - by) % 500) / blockStep);
                  const blockCode = `${String.fromCharCode(65 + t3x)}${String.fromCharCode(65 + t3y)}`;
                  const toneClass = (t3x + t3y) % 2 === 0 ? "" : " tpc-grid-label-block-alt";
                  addLabel(toLatLng(x + 4, y + 96), blockCode, `tpc-grid-label tpc-grid-label-block${toneClass}`, false);
                }
              }
            }
          }

          if (showT3) {

          // 100m 垂直次網格
          const v3Start = Math.max(baseX0, Math.floor((range.minX - bx) / 100) * 100 + bx);
          for (let x = v3Start; x <= Math.min(baseX1, range.maxX); x += 100) {
            if (x < baseX0 || x > baseX1) continue;
            L.polyline([toLatLng(x, baseY0), toLatLng(x, baseY1)], {
              color: "#087f8c", weight: 1.15, opacity: 0.55, pane: "tpcGridPane", interactive: false,
            }).addTo(layer);
          }
          // 100m 水平次網格
          const h3Start = Math.max(baseY0, Math.floor((range.minY - by) / 100) * 100 + by);
          for (let y = h3Start; y <= Math.min(baseY1, range.maxY); y += 100) {
            if (y < baseY0 || y > baseY1) continue;
            L.polyline([toLatLng(baseX0, y), toLatLng(baseX1, y)], {
              color: "#087f8c", weight: 1.15, opacity: 0.55, pane: "tpcGridPane", interactive: false,
            }).addTo(layer);
          }
          const v3LabelStart = Math.max(baseX0, Math.floor((labelRange.minX - bx) / 100) * 100 + bx);
          const h3LabelStart = Math.max(baseY0, Math.floor((labelRange.minY - by) / 100) * 100 + by);
          // 100m 格子標籤：放大後只顯示局部細格碼，避免長圖號遮住地圖。
          if (showT3Labels) {
            for (let x = v3LabelStart; x <= Math.min(baseX1, labelRange.maxX); x += 100) {
              if (x < baseX0) continue;
              const t3x = Math.floor(((x - bx) % 800) / 100);
              for (let y = h3LabelStart; y <= Math.min(baseY1, labelRange.maxY); y += 100) {
                if (y < baseY0) continue;
                const t3y = Math.floor(((y - by) % 500) / 100);
                addLabel(toLatLng(x + 50, y + 50), `${String.fromCharCode(65 + t3x)}${String.fromCharCode(65 + t3y)}`, "tpc-grid-label tpc-grid-label-sub");
              }
            }
          }
          }

          // 10m 格子標籤：最高倍率顯示每一格的最後 4 碼，例如 BA47。
          // Zoom 20／21 對應每個 10m 細格；Zoom 18／19 仍採稀疏取樣，避免過多 DOM 標籤。
          if (showT5Labels) {
            const labelStep = zoom >= 20 ? 10 : 40;
            const labelOffsetY = zoom >= 20 ? labelStep * 0.24 : labelStep / 2;
            const v5Start = Math.max(baseX0, Math.floor((labelRange.minX - bx) / labelStep) * labelStep + bx);
            const h5Start = Math.max(baseY0, Math.floor((labelRange.minY - by) / labelStep) * labelStep + by);
            for (let x = v5Start; x <= Math.min(baseX1, labelRange.maxX); x += labelStep) {
              if (x < baseX0) continue;
              const dx = x - bx;
              const t3x = Math.floor((dx % 800) / 100), t5x = Math.floor((dx % 100) / 10);
              for (let y = h5Start; y <= Math.min(baseY1, labelRange.maxY); y += labelStep) {
                if (y < baseY0) continue;
                const dy = y - by;
                const t3y = Math.floor((dy % 500) / 100), t5y = Math.floor((dy % 100) / 10);
                const localCode = `${String.fromCharCode(65 + t3x)}${String.fromCharCode(65 + t3y)}${t5x}${t5y}`;
                addLabel(toLatLng(x + labelStep / 2, y + labelOffsetY), localCode, "tpc-grid-label tpc-grid-label-detail");
                if (labelCount >= MAX_GRID_LABELS) break;
              }
              if (labelCount >= MAX_GRID_LABELS) break;
            }
          }
        }
        layer.addTo(map);
        tpcGrid.layer = layer;
      }

      const SHOW_POINTS_ZOOM   = 15;
      const MAX_POINT_LABELS   = 1200;
      

      const state = {
        points: [], meta: null, area: "", query: "",
        search: { prefixes: [], terms: [] },
        visiblePoints: [], drawnItems: [], equipmentColorMap: new Map(),
        displayMode: "prefix",
        folders: [], records: [],
        hiddenRecordFolders: new Set(), expandedFolders: new Set(),
        selectedFolders: new Set(), selectedRecords: new Set(),
        labelsHidden: false, lastFolderId: null,
        routeLayerVisible: false,
      };

      let editPhotoState = { recordId: null, existing: [], originalExisting: [], pending: [] };
      let editDraftState = { dirty: false, point: null, saveTimer: null, saveSequence: Promise.resolve(), restored: false };
      let photoPreviewUrls = [];
      let photoRenderEpoch = 0;

      const statusBox         = document.querySelector("#status");
      const folderList        = document.querySelector("#folderList");
      const selectedCountText = document.getElementById("selectedCount");
      const areaSelect        = document.getElementById("areaSelect");
      const searchInput       = document.getElementById("searchInput");
      const results           = document.getElementById("results");
      const resultTemplate    = document.getElementById("resultTemplate");
      const totalCount        = document.getElementById("totalCount");
      const visibleCount      = document.getElementById("visibleCount");
      const drawCount         = document.getElementById("drawCount");
      function refreshViewportLayout() {
        syncMobileMapControls();
        if (typeof map !== "undefined") {
          map.invalidateSize({ pan: false });
          window.setTimeout(() => map.invalidateSize({ pan: false }), 180);
          updateTpcGridReadout();
          if (tpcGrid.visible) {
            if (tpcGrid.buildTimer) clearTimeout(tpcGrid.buildTimer);
            tpcGrid.buildTimer = setTimeout(buildTpcGridLayer, 80);
          }
        }
      }
      const debouncedRefreshViewportLayout = debounce(refreshViewportLayout, 120);
      window.addEventListener("resize", debouncedRefreshViewportLayout);
      window.addEventListener("orientationchange", () => {
        window.setTimeout(refreshViewportLayout, 260);
      });

      let routeLayer   = L.layerGroup().addTo(map);
      let labelsLayer  = L.layerGroup().addTo(map);
      let recordsLayer = L.featureGroup().addTo(map);

      // ==========================================
      // ★ 混合圖示系統（Emoji + 1~3字短文字）
      // ==========================================
      const ICON_GROUPS = [
       { label: "外力",   icons: ["🌳樹", "🎋竹", "🌿藤","🌴椰", "🐦巢"] },
       { label: "狀態",   icons: ["⚠️","💤游休",  "📐設計", "✅已設計"] },
       { label: "設備",   icons: ["TR️", "DS", "GS", "AGS", "PAD"] },
       { label: "土木",   icons: [ "🚧", "⛏️", "🔩", "🔧", "🚨"] },
       { label: "其他",   icons: ["⭐", "🧤", "⚡", "💥", "💡"] }
      ];

      const DEFECT_ICON_RULES = [
        { pattern: /椰/,                   icon: "🌴椰" },
        { pattern: /竹/,  icon: "🎋竹" },
        { pattern: /藤/,  icon: "🌿藤" },
        { pattern: /樹木修剪|樹/,  icon: "🌳樹" },
        { pattern: /鳥/,                   icon: "🐦巢" },
        { pattern: /脫落/,      icon: "脫落" },
        { pattern: /游休/,                       icon: "💤游休" },
        { pattern: /設計|圖面|測量/,              icon: "📐設計" },
        { pattern: /裸露/,              icon: "🧤裸露" },
      ];

      function updateSidebarIconPreview() {
        const defectVal = document.getElementById("sidebar-defect-input").value;
        const manualIcon = document.getElementById("sidebar-icon-input").value;
        const autoIcon = autoDetectIcon(defectVal);
        const displayEl = document.getElementById("sidebar-icon-current-display");
        const autoBtn = document.getElementById("sidebar-icon-auto-btn");
        const statusText = document.getElementById("icon-status-text");

        const finalIcon = manualIcon || autoIcon;

        if (displayEl) {
          displayEl.textContent = finalIcon;
          displayEl.style.backgroundColor = getBadgeBgColor(finalIcon);
        }

        if (manualIcon) {
          if (statusText) statusText.textContent = "手動指定：";
          if (autoBtn) autoBtn.style.display = "block";
        } else {
          if (statusText) statusText.textContent = "自動判斷：";
          if (autoBtn) autoBtn.style.display = "none";
        }
      }

      function autoDetectIcon(defect) {
        const d = (defect || "").trim();
        if (!d || d === "無") return "⭐";
        for (const { pattern, icon } of DEFECT_ICON_RULES) {
          if (pattern.test(d)) return icon;
        }
        return "⭐";
      }

      function getBadgeBgColor(icon) {
        if (["🚨", "火", "停用"].includes(icon)) return "#dc2626";
        if (["⚠️", "🐦巢", "🧤裸露"].includes(icon)) return "#d97706";
        if (["TR️", "DS", "GS", "AGS", "PAD"].includes(icon)) return "#F700FF";
        if (["✅"].includes(icon)) return "#16a34a";
        if (["🌳樹", "🎋竹", "🌿藤", "🌴椰"].includes(icon)) return "#4d7c0f";
        if (["脫落", "⚡", "電桿", "箱體", "💤游休", "📐設計"].includes(icon)) return "#2563eb";
        if (["⭐"].includes(icon)) return "#0f766e";
        return "#64748b";
      }

      function getRecordIcon(record) {
        return record.icon || autoDetectIcon(record.defect);
      }

      // ==========================================
      // 排序工具
      // ==========================================
      // 名稱以 "?" 或非中英數開頭（如 ?、空白）排最後；其餘維持原排序
      function isBadNameStart(str) {
        return /^[?？\s]/.test(String(str || "").trim());
      }
      function compareNatural(strA, strB) {
        const aBad = isBadNameStart(strA), bBad = isBadNameStart(strB);
        if (aBad !== bBad) return aBad ? 1 : -1;
        return strA.localeCompare(strB, "zh-Hant", { numeric: true, sensitivity: "base" });
      }
      function comparePointsByName(a, b) {
        return compareNatural(a.name || a.code || "", b.name || b.code || "");
      }

      // ==========================================
      // 遞迴資料夾工具
      // ==========================================
      function getAllRecordsInFolder(folderId) {
        const direct   = state.records.filter(r => r.folderId === folderId);
        const children = state.folders.filter(f => f.parentId === folderId);
        let all = [...direct];
        for (const child of children) all = all.concat(getAllRecordsInFolder(child.id));
        return all;
      }
      function getAllRecordIdsInFolder(folderId) {
        return getAllRecordsInFolder(folderId).map(r => r.id);
      }

      const DEFECT_GROUPS_DEFAULT = [
        { label: "常用", open: true,  items: ["樹木修剪", "藤蔓清除", "竹枝清除", "椰樹修剪", "鳥巢", "桿上異物"] },
        { label: "裸露", open: false,  items: ["接線環裸露", "拉線夾板裸露", "FC裸露", "TR一次裸露", "電纜接頭裸露", "GS裸露"] },
        { label: "導線", open: false, items: ["防雷脫落", "低壓脫落"] },
        { label: "設計", open: false, items: ["不良設計", "游休TR設計", "橫擔腐蝕設計"] },
      ];

      const DEFECT_GROUPS_STORAGE_KEY = "tp_defect_groups_v1";

      function cloneDefectGroups(source) {
        return (source || DEFECT_GROUPS_DEFAULT).map(group => ({ ...group, items: [...(group.items || [])] }));
      }
      function loadDefectGroups() {
        try {
          const parsed = JSON.parse(localStorage.getItem(DEFECT_GROUPS_STORAGE_KEY) || "null");
          if (!Array.isArray(parsed) || !parsed.length) return null;
          const cleaned = parsed
            .map(group => {
              const label = String(group?.label ?? "").trim();
              const items = Array.isArray(group?.items) ? group.items.map(item => String(item ?? "").trim()).filter(Boolean) : [];
              if (!label || !items.length) return null;
              return { label, items, open: Boolean(group?.open) };
            })
            .filter(Boolean);
          return cleaned.length ? cleaned : null;
        } catch { return null; }
      }
      function saveDefectGroups(groups) {
        try { localStorage.setItem(DEFECT_GROUPS_STORAGE_KEY, JSON.stringify(groups)); } catch {}
      }
      // 不良項目排序：依照使用者自訂順序（編輯選項內可上下移動），不再依使用次數自動排前。
      function orderedDefectItemsForGroup(group) {
        return Array.isArray(group?.items) ? [...group.items] : [];
      }
      // 一次性清理舊版累加器（tp_defect_usage_v1 已停用，預留空殼避免其他存錯路徑時崩潰）。
      function purgeLegacyDefectUsageStorage() {
        try { localStorage.removeItem("tp_defect_usage_v1"); } catch {}
      }
      // 一次性分類遷移：把「雜項」內的「桿上異物」併入「常用」並刪除「雜項」分類。
      // 已用過的用戶 (localStorage 已有 tp_defect_groups_v1) 也會套用；新用戶直接吃 default 即可。
      function migrateDefectGroups(groups) {
        if (!Array.isArray(groups) || !groups.length) return groups;
        const MIGRATED_KEY = "tp_defect_groups_migrated_v1";
        if (localStorage.getItem(MIGRATED_KEY) === "1") return groups;
        let changed = false;
        const result = [];
        let changelog = null;
        for (const g of groups) {
          const label = String(g?.label ?? "").trim();
          if (label === "雜項") {
            changelog = g;
            changed = true;
            continue; // 不加入 result，等下處理它的 items
          }
          result.push(g);
        }
        if (changelog) {
          const itemsToMove = (Array.isArray(changelog.items) ? changelog.items : []).map(s => String(s ?? "").trim()).filter(Boolean);
          // 把 items 併入「常用」最尾端（避免打亂既有排序）
          for (const g of result) {
            if (String(g?.label ?? "").trim() === "常用") {
              g.items = Array.isArray(g.items) ? [...g.items] : [];
              for (const item of itemsToMove) {
                if (!g.items.includes(item)) g.items.push(item);
              }
              break;
            }
          }
          // 雜項本身已被 continue 跳過，不會出現在 result
        }
        if (changed) {
          try { localStorage.setItem(MIGRATED_KEY, "1"); } catch {}
        }
        return changed ? result : groups;
      }

      const DEFECT_GROUPS = (() => {
        const loaded = loadDefectGroups();
        const base = loaded ? loaded : cloneDefectGroups(DEFECT_GROUPS_DEFAULT);
        const migrated = migrateDefectGroups(base);
        if (loaded && migrated !== base) saveDefectGroups(migrated);
        return migrated;
      })();
      const LAST_SAVE_DATE_KEY = "tp_last_save_date";
      function getTodayLocalStr() {
        const d = new Date();
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      }
      function maybeShowDailyFolderReminder() {
        try {
          const today = getTodayLocalStr();
          const lastDate = localStorage.getItem(LAST_SAVE_DATE_KEY) || "";
          if (lastDate === today) return;
          if (!state.records || state.records.length === 0) return;
          const lastFolder = state.folders.find(f => f.id === state.lastFolderId);
          const lastFolderName = lastFolder ? lastFolder.name : "（未選）";
          const lastDateDisplay = lastDate ? lastDate.slice(5).replace("-", "/") : "先前";
          GlobalModal.show({
            title: "每日提醒",
            content: `今天是 ${today.slice(5).replace("-", "/")}，上次使用資料夾「${escapeHtml(lastFolderName)}」（${escapeHtml(lastDateDisplay)}），是否更換？`,
            type: "confirm",
            confirmText: "+新增資料夾",
            cancelText: `沿用：${lastFolderName}`,
            discardText: "選其他",
            onConfirm: () => {
              GlobalModal.prompt("請輸入新資料夾名稱：", "", (newName) => {
                if (newName && newName.trim()) {
                  const newId = generateId();
                  state.folders.push({ id: newId, name: newName.trim(), parentId: null });
                  state.expandedFolders.add(newId);
                  state.lastFolderId = newId;
                  saveToLocalStorage();
                  renderFolders();
                  const sel = document.getElementById("sidebar-folder");
                  if (sel) sel.innerHTML = getFolderOptionsHtml(newId);
                  try { localStorage.setItem(LAST_SAVE_DATE_KEY, today); } catch {}
                }
              });
            },
            onCancel: () => {
              try { localStorage.setItem(LAST_SAVE_DATE_KEY, today); } catch {}
            },
            onDiscard: () => {
              const optionsHtml = getFolderOptionsHtml(state.lastFolderId);
              GlobalModal.select("選擇資料夾", "請選擇要使用的資料夾：", optionsHtml, (selectedValue) => {
                if (selectedValue) {
                  state.lastFolderId = selectedValue;
                  saveToLocalStorage();
                  const sel = document.getElementById("sidebar-folder");
                  if (sel) sel.innerHTML = getFolderOptionsHtml(selectedValue);
                }
                try { localStorage.setItem(LAST_SAVE_DATE_KEY, today); } catch {}
              });
            }
          });
        } catch {}
      }

      function findOrCreateFolderByPath(pathStr) {
        const parts = pathStr.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
        if (!parts.length) return null;
        let parentId = null, currentFolder = null;
        for (const part of parts) {
          currentFolder = state.folders.find(f => f.name === part && f.parentId === parentId);
          if (!currentFolder) {
            const newId = generateId();
            currentFolder = { id: newId, name: part, parentId };
            state.folders.push(currentFolder);
            state.expandedFolders.add(newId);
          }
          parentId = currentFolder.id;
        }
        return currentFolder ? currentFolder.id : null;
      }

      function setPanelCollapsed(collapsed, options = {}) {
        if (collapsed && !options.skipEditGuard && document.getElementById("panel")?.dataset.activeTab === "edit" && hasUnsavedEditChanges()) {
          confirmBeforeLeavingEdit(() => setPanelCollapsed(true, { skipEditGuard: true }));
          return false;
        }
        if (!collapsed) disableRouteLayerForTools();
        inspectionPanel.classList.toggle("is-collapsed", collapsed);
        document.querySelector(".app").classList.toggle("is-panel-collapsed", collapsed);
        document.body.classList.toggle("is-panel-open", !collapsed);
        if (!collapsed) {
          closeMapSearchPanel();
          closeLayerMenu();
          document.dispatchEvent(new CustomEvent("v2-inspection-open"));
        }
        syncPanelToggleState();
        window.setTimeout(() => map.invalidateSize(), 220);
        return true;
      }

      // The inspection sidebar and the V2 cadastre window occupy the same
      // mobile workspace.  Opening one must close the other.
      document.addEventListener("v2-cadastre-open", event => {
        if (!inspectionPanel || inspectionPanel.classList.contains("is-collapsed")) return;
        if (!setPanelCollapsed(true)) event.preventDefault();
      });
      document.addEventListener("v2-address-open", event => {
        if (!inspectionPanel || inspectionPanel.classList.contains("is-collapsed")) return;
        if (!setPanelCollapsed(true)) event.preventDefault();
      });

      panelToggle.addEventListener("click", () => {
        const collapsed = !inspectionPanel.classList.contains("is-collapsed");
        setPanelCollapsed(collapsed);
      });
      panelCloseButton?.addEventListener("click", () => setPanelCollapsed(true));

      // 手機版：面板頂部往下拖曳收合（跟手；桌面滑鼠不觸發；僅 touch 裝置）
      (function initPanelDragHandle() {
        const handle = document.getElementById("panelDragHandle");
        if (!handle) return;
        const panel = document.getElementById("panel");
        let startY = 0;
        let panelHeight = 1;
        let lastDelta = 0;
        let dragging = false;
        handle.addEventListener("touchstart", (event) => {
          if (event.touches.length !== 1) return;
          startY = event.touches[0].clientY;
          lastDelta = 0;
          panelHeight = panel.getBoundingClientRect().height || 1;
          dragging = true;
          panel.style.transition = "none";
        }, { passive: true });
        handle.addEventListener("touchmove", (event) => {
          if (!dragging) return;
          lastDelta = event.touches[0].clientY - startY;
          if (lastDelta > 0) {
            panel.style.transform = "translateY(" + Math.min(lastDelta, Math.round(panelHeight * 0.7)) + "px)";
          }
        }, { passive: true });
        handle.addEventListener("touchend", () => {
          if (!dragging) return;
          dragging = false;
          const delta = lastDelta;
          if (delta > 100) {
            setPanelCollapsed(true);
            requestAnimationFrame(() => {
              panel.style.transition = "";
              panel.style.transform = "";
            });
          } else {
            panel.style.transition = "";
            panel.style.transform = "";
          }
        });
        handle.addEventListener("touchcancel", () => {
          dragging = false;
          panel.style.transition = "";
          panel.style.transform = "";
        });
      })();

      // ==========================================
      // ★ jumpToRecord：支援孤兒記錄與正常記錄的完美跳轉
      // ==========================================
      function jumpToRecord(folderId, recordId) {
        const record = state.records.find(r => r.id === recordId);
        if (!record) return;

        // 尋找父資料夾並展開（如果是孤兒記錄，curr 為 undefined，會自動跳過此迴圈）
        let curr = state.folders.find(f => f.id === folderId);
        while (curr) {
          state.expandedFolders.add(curr.id);
          curr = state.folders.find(f => f.id === curr.parentId);
        }

        map.closePopup();
        setPanelCollapsed(false);
        switchTab('records');
        renderFolders(); // 確保 DOM 已經重新渲染

        // 延遲捲動，讓孤兒紀錄也能順利被找到並高亮
        setTimeout(() => {
          const row = document.getElementById(`record-row-${recordId}`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.backgroundColor = '#fef08a';
            setTimeout(() => { row.style.backgroundColor = 'transparent'; }, 5000);
          }
        }, 80);
      }

      // ==========================================
      // LocalStorage
      // ==========================================
      function saveToLocalStorage() {
        try {
          normalizeInspectionState();
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            folders: state.folders, records: state.records, lastFolderId: state.lastFolderId,
          }));
        } catch (e) {
          console.error("儲存失敗:", e);
          GlobalModal.alert("⚠️ 儲存失敗！<br><br>可能是瀏覽器儲存空間已達上限 (約 5MB)。請立即點擊「資料備份」下載您的紀錄，並清理不需要的資料夾。");
        }

        renderFolders();
        updateRecordMarkers();

        const folderSelect = document.getElementById("sidebar-folder");
        if (folderSelect) {
          const currentVal = folderSelect.value;
          const folderExists = state.folders.some(f => f.id === currentVal);
          const valueToSelect = folderExists ? currentVal : state.lastFolderId;
          folderSelect.innerHTML = getFolderOptionsHtml(valueToSelect);
        }
      }

      function loadFromLocalStorage() {
        try {
          let dataStr = localStorage.getItem(STORAGE_KEY);
          let importedFromLegacy = false;
          if (!dataStr) {
            dataStr = LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean) || null;
            importedFromLegacy = !!dataStr;
          }
          if (dataStr) {
            const parsed = JSON.parse(dataStr);
            state.folders = parsed.folders || [];
            state.records = parsed.records || [];
            state.lastFolderId = parsed.lastFolderId || null;
            state.folders.forEach(f => { if (typeof f.parentId === "undefined") f.parentId = null; });
            state.records.forEach(r => {
              if (!r.id) r.id = "rec_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
            });
            const beforeNormalize = JSON.stringify({ folders: state.folders, records: state.records, lastFolderId: state.lastFolderId });
            normalizeInspectionState();
            const afterNormalize = JSON.stringify({ folders: state.folders, records: state.records, lastFolderId: state.lastFolderId });
            if (!state.lastFolderId && state.records.length > 0) state.lastFolderId = state.records[state.records.length - 1].folderId;
            if (beforeNormalize !== afterNormalize || importedFromLegacy) saveToLocalStorage();
            if (!localStorage.getItem(STORAGE_KEY)) saveToLocalStorage();
          }
        } catch (e) { console.error("讀取 localStorage 失敗:", e); }
      }

      function normalizeInspectionState() {
        const usedFolderIds = new Set();
        for (const folder of state.folders) {
          if (!folder.id || usedFolderIds.has(folder.id)) folder.id = generateId();
          usedFolderIds.add(folder.id);
          folder.name = String(folder.name || "未命名資料夾").trim() || "未命名資料夾";
          if (typeof folder.parentId === "undefined") folder.parentId = null;
        }

        const validFolderIds = new Set(state.folders.map(f => f.id));
        for (const folder of state.folders) {
          if (folder.parentId === folder.id || !validFolderIds.has(folder.parentId)) folder.parentId = null;
        }

        for (const folder of state.folders) {
          const seen = new Set([folder.id]);
          let curr = state.folders.find(f => f.id === folder.parentId);
          while (curr) {
            if (seen.has(curr.id)) {
              folder.parentId = null;
              break;
            }
            seen.add(curr.id);
            curr = state.folders.find(f => f.id === curr.parentId);
          }
        }

        const usedRecordIds = new Set();
        for (const record of state.records) {
          if (!record.id || usedRecordIds.has(record.id)) record.id = "rec_" + generateId();
          usedRecordIds.add(record.id);
          if (!record.folderId || !validFolderIds.has(record.folderId)) record.folderId = null;
          record.photos = Array.isArray(record.photos)
            ? record.photos.filter(photo => photo && photo.id).map(photo => ({
              id: String(photo.id),
              fileName: String(photo.fileName || "巡檢照片.jpg"),
              type: String(photo.type || "image/jpeg"),
              size: Number(photo.size) || 0,
              originalSize: Number(photo.originalSize) || Number(photo.size) || 0,
              originalType: String(photo.originalType || photo.type || "image/jpeg"),
              capturedAt: photo.capturedAt || null,
            }))
            : [];
        }

        if (!state.lastFolderId || !validFolderIds.has(state.lastFolderId)) {
          const lastRecordFolderId = [...state.records].reverse().find(r => r.folderId && validFolderIds.has(r.folderId))?.folderId;
          state.lastFolderId = lastRecordFolderId || state.folders[state.folders.length - 1]?.id || null;
        }

        for (const id of [...state.hiddenRecordFolders]) if (!validFolderIds.has(id)) state.hiddenRecordFolders.delete(id);
        for (const id of [...state.expandedFolders]) if (!validFolderIds.has(id)) state.expandedFolders.delete(id);
        for (const id of [...state.selectedFolders]) if (!validFolderIds.has(id)) state.selectedFolders.delete(id);
        const validRecordIds = new Set(state.records.map(r => r.id));
        for (const id of [...state.selectedRecords]) if (!validRecordIds.has(id)) state.selectedRecords.delete(id);
      }

      function getFullFolderPath(folderId) {
        let path = [], curr = state.folders.find(f => f.id === folderId);
        while (curr) { path.unshift(curr.name); curr = state.folders.find(f => f.id === curr.parentId); }
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
        html += '<option value="__CREATE_NEW__">＋ 新增資料夾</option>';
        return html;
      }
      document.addEventListener("change", (e) => {
        if (e.target && e.target.id === "sidebar-folder" && e.target.value === "__CREATE_NEW__") {
          GlobalModal.prompt("請輸入新資料夾名稱：", "", (newName) => {
            if (newName && newName.trim()) {
              const newId = generateId();
              state.folders.push({ id: newId, name: newName.trim(), parentId: null });
              state.expandedFolders.add(newId);
              saveToLocalStorage();
              renderFolders();
              e.target.innerHTML = getFolderOptionsHtml(newId);
              e.target.value = newId;
            } else {
              e.target.innerHTML = getFolderOptionsHtml(state.lastFolderId);
              e.target.value = state.lastFolderId || "";
            }
          });
        }
      });

      function isDescendant(targetParentId, folderId) {
        let curr = state.folders.find(f => f.id === targetParentId);
        while (curr) { if (curr.id === folderId) return true; curr = state.folders.find(f => f.id === curr.parentId); }
        return false;
      }

      // ==========================================
      // renderFolders() 加入孤兒記錄區塊
      // ==========================================
      function renderFolders() {
        for (const id of state.selectedFolders) { if (!state.folders.some(f => f.id === id)) state.selectedFolders.delete(id); }
        for (const id of state.selectedRecords) { if (!state.records.some(r => r.id === id)) state.selectedRecords.delete(id); }

        const folderCount = state.selectedFolders.size, recordCount = state.selectedRecords.size;
        const selCount = folderCount + recordCount, totalItemsCount = state.folders.length + state.records.length;

        let countText = "";
        if (folderCount > 0 && recordCount > 0) countText = `${folderCount} 個資料夾，${recordCount} 筆紀錄`;
        else if (folderCount > 0) countText = `${folderCount} 個資料夾`;
        else if (recordCount > 0) countText = `${recordCount} 筆紀錄`;
        else countText = "0 項";
        selectedCountText.textContent = countText;

        const batchActionGroup = document.getElementById("batchActionGroup");
        if (batchActionGroup) batchActionGroup.style.display = selCount > 0 ? "flex" : "none";

        const selectAllBtn = document.getElementById("selectAllBtn");
        if (selectAllBtn) {
          if (selCount === totalItemsCount && totalItemsCount > 0) {
            selectAllBtn.textContent = "取消 ❌"; selectAllBtn.style.background = "#64748b";
          } else {
            selectAllBtn.textContent = "全選 ☑️"; selectAllBtn.style.background = "#0f766e";
          }
        }

        function buildFoldersHtml(parentId, depth) {
          let html = "";
          const children = state.folders.filter(f => f.parentId === parentId);
          children.forEach(folder => {
            const directRecords = state.records.filter(r => r.folderId === folder.id);
            directRecords.sort((a, b) => {
              const cmp = compareNatural(a.name || "", b.name || "");
              return cmp !== 0 ? cmp : compareNatural(a.code || "", b.code || "");
            });
            const totalCountVal = getAllRecordsInFolder(folder.id).length;
            const directCount   = directRecords.length;
            const isHidden    = state.hiddenRecordFolders.has(folder.id);
            const isExpanded  = state.expandedFolders.has(folder.id);
            const isChecked   = state.selectedFolders.has(folder.id) ? "checked" : "";
            const allDirectSelected = directCount > 0 && directRecords.every(r => state.selectedRecords.has(r.id));

            let recordsHTML = "";
            if (directCount > 0) {
              recordsHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; padding-bottom:4px; border-bottom:1px dotted #e2e8f0;">
                  <span style="font-size:11px; color:var(--muted);">直屬紀錄 ${directCount} 筆</span>
                  <button class="btn-small" data-select-all-folder="${folder.id}" style="font-size:11px; padding:2px 6px; min-height:0;">
                    ${allDirectSelected ? "取消全選" : "全選"}
                  </button>
                </div>`;
              recordsHTML += directRecords.map(r => {
                const rChecked = state.selectedRecords.has(r.id) ? "checked" : "";
                const recordIcon = getRecordIcon(r);
                const correctionTag = r.needCorrection ? `<span style="background-color:#b91c1c; color:#fff; font-size:10px; font-weight:bold; padding:2px 4px; border-radius:4px; margin-left:4px;">🔧圖號不符</span>` : "";
                return `
                  <div id="record-row-${r.id}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px; padding:4px; border-radius:4px; transition:background-color 1.5s ease;">
                    <input type="checkbox" class="cb-record" data-id="${r.id}" ${rChecked} style="width:16px; height:16px; cursor:pointer; flex-shrink:0;">
                    <button class="record-item" data-fly-lat="${r.lat}" data-fly-lng="${r.lng}" title="飛轉至此設備">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="record-item-title"><span style="display:inline-block; padding:1px 5px; border-radius:8px; font-size:10px; color:#fff; background-color:${getBadgeBgColor(recordIcon)}; vertical-align:middle; margin-right:2px;">${recordIcon}</span> ${escapeHtml(r.name || r.code)}${correctionTag}</span>
                        <span class="btn-small text-danger" data-delete-record="${r.id}" title="刪除此紀錄" style="border:none; padding:2px 4px; min-height:0; margin-left:4px;">✖</span>
                      </div>
                      <span class="record-item-meta">不良: ${escapeHtml(r.defect || "無")} | 緩急: ${escapeHtml(r.urgency || "C")}</span>
                    </button>
                  </div>`;
              }).join("");
            } else {
              recordsHTML = `<div style="font-size:12px; color:#999; padding:4px;">(此層無直屬紀錄)</div>`;
            }

            let childrenHTML = "";
            if (isExpanded) childrenHTML = buildFoldersHtml(folder.id, depth + 1);

            const borderLeft  = depth > 0 ? "border-left:2px solid #cbd5e1;" : "";
            const marginLeft  = depth > 0 ? "10px" : "0px";
            const bg          = depth % 2 === 0 ? "#f8fafc" : "#ffffff";
            const hasChildren = state.folders.some(f => f.parentId === folder.id);
            const countLabel  = hasChildren ? `${totalCountVal} (含子層)` : `${totalCountVal}`;

            html += `
              <div class="folder-item" style="margin-left:${marginLeft}; ${borderLeft} border-radius:${depth > 0 ? "0 6px 6px 0" : "6px"}; background:${bg}; border-top:1px solid var(--line); border-bottom:1px solid var(--line); border-right:1px solid var(--line);">
                <div class="folder-item-top" style="flex-wrap:wrap;">
                  <div style="display:flex; align-items:center; flex-grow:1; min-width:60%;">
                    <input type="checkbox" class="cb-folder" data-id="${folder.id}" ${isChecked} style="width:16px; height:16px; cursor:pointer; margin-right:6px; flex-shrink:0;">
                    <span class="folder-name-toggle" data-toggle="${folder.id}" title="展開/收合">
                      ${escapeHtml(folder.name)} (${countLabel})
                      <span style="font-size:10px; color:var(--muted); margin-left:4px;">${isExpanded ? "▲" : "▼"}</span>
                    </span>
                  </div>
                  <div class="folder-actions" style="display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; margin-top:6px; width:100%;">
                    <button class="btn-small" data-add-sub="${folder.id}" title="新增子層資料夾">➕子層</button>
                    <button class="btn-small" data-rename="${folder.id}" title="重新命名">✏️改名</button>
                    <button class="btn-small" data-move-up="${folder.id}" title="向上移">⬆️</button>
                    <button class="btn-small" data-move-down="${folder.id}" title="向下移">⬇️</button>
                    <button class="btn-small" data-export="${folder.id}" title="匯出此層與子層，可選擇 Excel 或 ZIP">📤匯出</button>
                    <button class="btn-small ${isHidden ? "" : "active-eye"}" data-toggle-visibility="${folder.id}" title="顯示/隱藏">${isHidden ? "🙈" : "👁️"}</button>
                    <button class="btn-small text-danger" data-delete-folder="${folder.id}" title="刪除">✖</button>
                  </div>
                </div>
                <div class="record-list ${isExpanded ? "is-expanded" : ""}" style="margin-left:22px;">
                  ${recordsHTML}
                  ${childrenHTML}
                </div>
              </div>`;
          });
          return html;
        }

        // ★ 收集孤兒記錄
        const validFolderIds = new Set(state.folders.map(f => f.id));
        const orphanRecords = state.records.filter(r => !r.folderId || !validFolderIds.has(r.folderId));
        let orphanHtml = "";
        if (orphanRecords.length > 0) {
          orphanHtml += `
            <div style="margin-top:16px; border-top:2px dashed #f87171; padding-top:10px;">
              <div style="font-weight:bold; color:#b91c1c; margin-bottom:8px;">⚠️ 未歸類紀錄 (${orphanRecords.length})</div>
          `;
          orphanRecords.sort((a, b) => compareNatural(a.name || "", b.name || ""));
          for (const r of orphanRecords) {
            const icon = getRecordIcon(r);
            orphanHtml += `
              <div id="record-row-${r.id}" style="display:flex; align-items:center; gap:6px; margin-bottom:4px; padding:4px; border-radius:4px; background:#fef2f2;">
                <button class="record-item" data-fly-lat="${r.lat}" data-fly-lng="${r.lng}" title="飛轉至此設備" style="flex-grow:1;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="record-item-title">
                      <span style="display:inline-block; padding:1px 5px; border-radius:8px; font-size:10px; color:#fff; background-color:${getBadgeBgColor(icon)}; vertical-align:middle; margin-right:2px;">${icon}</span>
                      ${escapeHtml(r.name || r.code)}
                    </span>
                    <span class="btn-small text-danger" data-delete-record="${r.id}" title="刪除此紀錄" style="border:none; padding:2px 4px; min-height:0; margin-left:4px;">✖</span>
                  </div>
                  <span class="record-item-meta">不良: ${escapeHtml(r.defect || "無")} | 緩急: ${escapeHtml(r.urgency || "C")}</span>
                </button>
              </div>`;
          }
          orphanHtml += `</div>`;
        }

        folderList.innerHTML = buildFoldersHtml(null, 0) + orphanHtml;
      }

      // ==========================================
      // 批次操作 (batchMoveBtn 已修改為部分執行)
      // ==========================================
      const equipmentNameCollator = new Intl.Collator("zh-Hant", { sensitivity: "base" });

      function tokenizeEquipmentSuffix(value) {
        return (String(value || "").match(/\d+|右|左|[^0-9右左]+/g) || [])
          .map(token => {
            const compact = token.replace(/\s+/g, "");
            if (!compact) return null;
            if (/^\d+$/.test(compact)) return { kind: "number", value: Number(compact) };
            if (compact === "右") return { kind: "direction", value: 1 };
            if (compact === "左") return { kind: "direction", value: 2 };
            return { kind: "text", value: compact };
          })
          .filter(Boolean);
      }

      function equipmentSortKey(value) {
        const source = String(value || "").trim();
        const firstNumberIndex = source.search(/\d/);
        if (firstNumberIndex < 0) return { prefix: source.replace(/\s+/g, ""), primary: null, suffix: [] };
        const prefix = source.slice(0, firstNumberIndex).replace(/\s+/g, "");
        const numberMatch = source.slice(firstNumberIndex).match(/^\d+/);
        const primaryText = numberMatch?.[0] || "";
        return {
          prefix,
          primary: primaryText ? Number(primaryText) : null,
          suffix: tokenizeEquipmentSuffix(source.slice(firstNumberIndex + primaryText.length)),
        };
      }

      function compareEquipmentSuffix(left, right) {
        const tokenRank = { number: 0, direction: 1, text: 2 };
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index++) {
          const a = left[index];
          const b = right[index];
          if (!a || !b) return a ? 1 : -1;
          if (a.kind !== b.kind) return tokenRank[a.kind] - tokenRank[b.kind];
          if (a.value !== b.value) {
            if (a.kind === "text") return equipmentNameCollator.compare(a.value, b.value);
            return a.value - b.value;
          }
        }
        return 0;
      }

      function compareEquipmentNames(leftName, rightName) {
        const left = equipmentSortKey(leftName);
        const right = equipmentSortKey(rightName);
        const prefixResult = equipmentNameCollator.compare(left.prefix, right.prefix);
        if (prefixResult) return prefixResult;
        if (left.primary === null || right.primary === null) {
          if (left.primary === null && right.primary !== null) return -1;
          if (left.primary !== null && right.primary === null) return 1;
          return compareEquipmentSuffix(left.suffix, right.suffix);
        }
        if (left.primary !== right.primary) return left.primary - right.primary;
        return compareEquipmentSuffix(left.suffix, right.suffix);
      }

      function sortInspectionRecords(records) {
        return [...records]
          .map((record, index) => ({ record, index }))
          .sort((left, right) => {
            const nameResult = compareEquipmentNames(
              left.record?.name || left.record?.code || "",
              right.record?.name || right.record?.code || ""
            );
            return nameResult || left.index - right.index;
          })
          .map(item => item.record);
      }

      function recordToExcelRow(record, includePhotoLinks = false, photoLinkLabels = null) {
        const photos = Array.isArray(record.photos) ? record.photos : [];
        const labels = {
          card: photoLinkLabels?.card || "巡檢卡連結",
          original: photoLinkLabels?.original || "原始照片連結",
        };
        const row = {
          "巡視日期(目錄)": getFullFolderPath(record.folderId),
          "土木設備": record.name || "",
          "圖號座標": record.code || "",
          "不良項目": record.defect || "",
          "緩急程度": record.urgency || "",
          "設計單號": "",
          "設計日期": "",
          "施工單位": "",
          "施工單號": "",
          "施工日期": "",
          "圖資修正": record.needCorrection ? "是" : "",
          "正確圖號": record.correctCode || "",
          "照片數量": photos.length,
          "照片檔案": photos.map(photo => photo.fileName || photo.id).join(" | "),
          "照片識別碼": photos.map(photo => photo.id).join(" | "),
        };
        if (includePhotoLinks) {
          row[labels.card] = "";
          row[labels.original] = "";
        }
        return row;
      }

      function setExcelHyperlink(worksheet, columnIndex, rowIndex, target, tooltip) {
        const ref = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
        const cell = worksheet[ref] || (worksheet[ref] = { t: "s", v: "" });
        cell.l = { Target: target, Tooltip: tooltip };
      }

      async function createRecordsWorkbook(records, fallbackFolderPath = "", photoLinkFor = null, photoLinkLabels = null) {
        await ensureXLSX();
        const includePhotoLinks = typeof photoLinkFor === "function";
        const labels = {
          card: photoLinkLabels?.card || "巡檢卡連結",
          original: photoLinkLabels?.original || "原始照片連結",
        };
        const orderedRecords = sortInspectionRecords(records);
        const emptyRow = {
          "巡視日期(目錄)": fallbackFolderPath,
          "土木設備": "", "圖號座標": "", "不良項目": "", "緩急程度": "",
          "設計單號": "", "設計日期": "", "施工單位": "", "施工單號": "", "施工日期": "",
          "圖資修正": "", "正確圖號": "", "照片數量": 0, "照片檔案": "", "照片識別碼": "",
        };
        if (includePhotoLinks) {
          emptyRow[labels.card] = "";
          emptyRow[labels.original] = "";
        }
        const rows = orderedRecords.length
          ? orderedRecords.map(record => recordToExcelRow(record, includePhotoLinks, labels))
          : [emptyRow];
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "巡視紀錄");

        if (includePhotoLinks && orderedRecords.length) {
          const cardLinkColumn = Object.keys(rows[0]).indexOf(labels.card);
          const originalLinkColumn = Object.keys(rows[0]).indexOf(labels.original);
          const photoLinkRows = [];
          orderedRecords.forEach((record, recordIndex) => {
            const linkedPhotos = (record.photos || []).map(photo => {
              const links = photoLinkFor(record, photo);
              return {
                photo,
                cardTarget: typeof links === "string" ? links : (links?.card || ""),
                originalTarget: typeof links === "string" ? links : (links?.original || ""),
              };
            }).filter(item => item.cardTarget || item.originalTarget);
            const firstLink = linkedPhotos[0];
            if (firstLink) {
              if (firstLink.cardTarget) {
                const cardLinkRef = XLSX.utils.encode_cell({ c: cardLinkColumn, r: recordIndex + 1 });
                if (!ws[cardLinkRef]) ws[cardLinkRef] = { t: "s", v: "" };
                ws[cardLinkRef].v = `開啟第一張巡檢卡 (${linkedPhotos.length})`;
                setExcelHyperlink(ws, cardLinkColumn, recordIndex + 1, firstLink.cardTarget, firstLink.photo.fileName || "開啟巡檢卡");
              }
              if (firstLink.originalTarget) {
                const originalLinkRef = XLSX.utils.encode_cell({ c: originalLinkColumn, r: recordIndex + 1 });
                if (!ws[originalLinkRef]) ws[originalLinkRef] = { t: "s", v: "" };
                ws[originalLinkRef].v = `開啟第一張原圖 (${linkedPhotos.length})`;
                setExcelHyperlink(ws, originalLinkColumn, recordIndex + 1, firstLink.originalTarget, firstLink.photo.fileName || "開啟原始照片");
              }
            }
            linkedPhotos.forEach(({ photo, cardTarget, originalTarget }) => {
              photoLinkRows.push({
                "巡視日期(目錄)": getFullFolderPath(record.folderId),
                "土木設備": record.name || "",
                "圖號座標": record.code || "",
                "改善事項": record.defect || "",
                "照片檔案": photo.fileName || photo.id,
                [labels.card]: cardTarget ? "開啟巡檢卡" : "",
                [labels.original]: originalTarget ? "開啟原圖" : "",
                cardTarget,
                originalTarget,
              });
            });
          });
          if (photoLinkRows.length) {
            const photoRows = photoLinkRows.map(({ cardTarget, originalTarget, ...row }) => row);
            const photoWs = XLSX.utils.json_to_sheet(photoRows);
            const photoCardColumn = Object.keys(photoRows[0]).indexOf(labels.card);
            const photoOriginalColumn = Object.keys(photoRows[0]).indexOf(labels.original);
            photoLinkRows.forEach((row, index) => {
              if (row.cardTarget) {
                setExcelHyperlink(photoWs, photoCardColumn, index + 1, row.cardTarget, row["照片檔案"] || "開啟巡檢卡");
              }
              if (row.originalTarget) {
                setExcelHyperlink(photoWs, photoOriginalColumn, index + 1, row.originalTarget, row["照片檔案"] || "開啟原始照片");
              }
            });
            XLSX.utils.book_append_sheet(wb, photoWs, "照片連結");
          }
        }
        return wb;
      }

      function getFolderSubsetForExport(records, selectedFolderIds = []) {
        const foldersById = new Map(state.folders.map(folder => [folder.id, folder]));
        const includedIds = new Set();
        const addFolderTree = folderId => {
          if (!folderId || includedIds.has(folderId)) return;
          includedIds.add(folderId);
          state.folders
            .filter(folder => folder.parentId === folderId)
            .forEach(folder => addFolderTree(folder.id));
        };

        const addParentChain = folderId => {
          const visited = new Set();
          while (folderId && !visited.has(folderId)) {
            includedIds.add(folderId);
            visited.add(folderId);
            folderId = foldersById.get(folderId)?.parentId || null;
          }
        };

        selectedFolderIds.forEach(folderId => {
          addFolderTree(folderId);
          addParentChain(folderId);
        });
        records.forEach(record => addParentChain(record.folderId));
        return state.folders.filter(folder => includedIds.has(folder.id));
      }

      function cloudExportBaseName(base) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return base + "_" + pad(now.getHours()) + pad(now.getMinutes());
      }

      function chooseRecordExportFormat(records, folders, fileBaseName, fallbackFolderPath = "") {
        const safeFileBaseName = zipPathPart(fileBaseName);
        GlobalModal.select(
          "選擇匯出格式",
          `將匯出 ${records.length} 筆巡檢紀錄。`,
          [
            '<option value="zip">ZIP：含照片、巡檢卡與 Excel</option>',
            '<option value="xlsx">Excel：僅匯出表格資料</option>',
          ].join(""),
          format => {
            GlobalModal.select(
              "選擇儲存位置",
              "可下載到本機，或直接上傳到您的個人雲端硬碟。",
              [
                '<option value="local">本地下載</option>',
                '<option value="drive">雲端 Drive</option>',
                '<option value="both">本機與雲端都要</option>',
              ].join(""),
              destination => {
                (async () => {
                  const cloudBase = destination === "drive" || destination === "both" ? cloudExportBaseName(safeFileBaseName) : "";
                  if (format === "xlsx") {
                    await ensureXLSX();
                    const workbook = await createRecordsWorkbook(records, fallbackFolderPath);
                    const fileName = `${safeFileBaseName}.xlsx`;
                    if (destination === "local" || destination === "both") XLSX.writeFile(workbook, fileName);
                    if (destination === "drive" || destination === "both") {
                      window.__v2DriveResume = { type: "export", mode: "xlsx", records, fallbackFolderPath, fileName: cloudBase + ".xlsx" };
                      uploadRecordsWorkbookToDrive(workbook, cloudBase + ".xlsx");
                    }
                    return;
                  }
                GlobalModal.select(
                    "選擇 ZIP 照片版本",
                    "完整備份建議使用原圖；壓縮版適合分享，還原後只會保留壓縮圖片。",
                    [
                      '<option value="original">原圖：可完整備份與還原</option>',
                      '<option value="compressed">壓縮版：檔案較小，適合分享</option>',
                    ].join(""),
                    photoProfile => exportRecordsAsZip(records, folders, safeFileBaseName, photoProfile, destination, cloudBase)
                  );
                })();
              }
            );
          }
        );
      }

      document.getElementById("batchExportBtn").addEventListener("click", () => {
        if (state.selectedFolders.size === 0 && state.selectedRecords.size === 0) { GlobalModal.alert("請先勾選要匯出的資料夾或紀錄。"); return; }
        const uniqueRecordIds = new Set();
        state.selectedFolders.forEach(fId => getAllRecordIdsInFolder(fId).forEach(id => uniqueRecordIds.add(id)));
        state.selectedRecords.forEach(id => uniqueRecordIds.add(id));
        const exportRecords = [];
        uniqueRecordIds.forEach(rId => {
          const r = state.records.find(x => x.id === rId);
          if (r) exportRecords.push(r);
        });
        if (exportRecords.length === 0) { GlobalModal.alert("勾選範圍內沒有紀錄可匯出。"); return; }
        const exportFolders = getFolderSubsetForExport(exportRecords, [...state.selectedFolders]);
        chooseRecordExportFormat(exportRecords, exportFolders, `批次匯出_${new Date().toISOString().slice(0, 10)}`);
      });

      document.getElementById("batchDeleteBtn").addEventListener("click", () => {
        const uniqueRecordIds = new Set();
        state.selectedFolders.forEach(fId => getAllRecordIdsInFolder(fId).forEach(id => uniqueRecordIds.add(id)));
        state.selectedRecords.forEach(id => uniqueRecordIds.add(id));
        GlobalModal.confirm(
          `確定要刪除選取的 ${state.selectedFolders.size} 個資料夾（含子層）與單獨勾選的紀錄嗎？\n共將移除 ${uniqueRecordIds.size} 筆不重複紀錄。`,
          () => {
            const recordsToDelete = state.records.filter(record => uniqueRecordIds.has(record.id));
            function deleteFolderRecursive(fId) {
              state.folders.filter(f => f.parentId === fId).forEach(child => deleteFolderRecursive(child.id));
              state.records = state.records.filter(r => r.folderId !== fId);
              state.folders = state.folders.filter(f => f.id !== fId);
              state.hiddenRecordFolders.delete(fId); state.expandedFolders.delete(fId);
              if (state.lastFolderId === fId) {
                state.lastFolderId = state.folders.length > 0 ? state.folders[state.folders.length - 1].id : null;
              }
            }
            state.selectedFolders.forEach(fId => deleteFolderRecursive(fId));
            state.selectedRecords.forEach(rId => { state.records = state.records.filter(r => r.id !== rId); });
            state.selectedFolders.clear(); state.selectedRecords.clear();
            saveToLocalStorage(); renderer.redraw();
            deleteRecordPhotos(recordsToDelete).catch(error => console.warn("刪除照片失敗：", error));
          }
        );
      });

      document.getElementById("batchMoveBtn").addEventListener("click", () => {
        GlobalModal.select("🚚 批次移動至...", "請選擇要將勾選項搬移到哪個資料夾：",
          getFolderOptionsHtml(null, null, true),
          (targetId) => {
            const safeTarget = targetId === "" ? null : targetId;

            const recordsInMovingFolders = new Set();
            state.selectedFolders.forEach(fId => getAllRecordIdsInFolder(fId).forEach(id => recordsInMovingFolders.add(id)));

            const standaloneRecords = [...state.selectedRecords].filter(rId => !recordsInMovingFolders.has(rId));

            const blockedRecords = [];
            if (safeTarget === null && standaloneRecords.length > 0) {
              standaloneRecords.forEach(rId => {
                const rec = state.records.find(r => r.id === rId);
                if (rec) blockedRecords.push(rec.name || rec.code);
              });
            }

            // 移動資料夾
            for (const fId of state.selectedFolders) {
              if (fId === safeTarget || (safeTarget && isDescendant(safeTarget, fId))) continue;
              const folder = state.folders.find(f => f.id === fId);
              if (folder) folder.parentId = safeTarget;
            }

            // 移動獨立紀錄（僅在目標非最上層時）
            for (const rId of standaloneRecords) {
              if (safeTarget !== null) {
                const record = state.records.find(r => r.id === rId);
                if (record) record.folderId = safeTarget;
              }
            }

            state.selectedFolders.clear();
            state.selectedRecords.clear();
            saveToLocalStorage();
            renderFolders();

            if (blockedRecords.length > 0) {
              GlobalModal.alert(`⚠️ 以下設備紀錄無法移至最上層（必須放在資料夾內），已略過：\n${blockedRecords.join("、")}`);
            }
          }
        );
      });

      document.getElementById("selectAllBtn").addEventListener("click", () => {
        const totalItemsCount = state.folders.length + state.records.length;
        const currentSelectedCount = state.selectedFolders.size + state.selectedRecords.size;
        if (currentSelectedCount === totalItemsCount && totalItemsCount > 0) {
          state.selectedFolders.clear(); state.selectedRecords.clear();
        } else {
          state.folders.forEach(f => state.selectedFolders.add(f.id));
          state.records.forEach(r => state.selectedRecords.add(r.id));
        }
        renderFolders();
      });

      document.getElementById("showAllStarsBtn").addEventListener("click", () => {
        state.hiddenRecordFolders.clear(); renderFolders(); updateRecordMarkers();
      });
      document.getElementById("hideAllStarsBtn").addEventListener("click", () => {
        state.folders.forEach(f => state.hiddenRecordFolders.add(f.id)); renderFolders(); updateRecordMarkers();
      });

      // ==========================================
      // 資料夾清單事件委派
      // ==========================================
      folderList.addEventListener("click", (e) => {
        const target = e.target;
        const folderToggle = target.closest("[data-toggle]");
        if (folderToggle) {
          const fId = folderToggle.dataset.toggle;
          const folder = state.folders.find(f => f.id === fId);
          const isExpanding = !state.expandedFolders.has(fId);
          if (isExpanding) {
            const siblings = state.folders.filter(f => f.parentId === (folder ? folder.parentId : null));
            siblings.forEach(sib => { if (sib.id !== fId) state.expandedFolders.delete(sib.id); });
            state.expandedFolders.add(fId);
          } else {
            state.expandedFolders.delete(fId);
          }
          renderFolders(); return;
        }
        if (target.classList.contains("cb-folder")) {
          const fId = target.dataset.id, isChecked = target.checked;
          function getAllDescendantFolderIds(id) {
            let ids = [];
            state.folders.filter(f => f.parentId === id).forEach(child => { ids.push(child.id); ids = ids.concat(getAllDescendantFolderIds(child.id)); });
            return ids;
          }
          const descendantFolderIds = getAllDescendantFolderIds(fId), allRecordIds = getAllRecordIdsInFolder(fId);
          if (isChecked) {
            state.selectedFolders.add(fId); descendantFolderIds.forEach(id => state.selectedFolders.add(id)); allRecordIds.forEach(id => state.selectedRecords.add(id));
          } else {
            state.selectedFolders.delete(fId); descendantFolderIds.forEach(id => state.selectedFolders.delete(id)); allRecordIds.forEach(id => state.selectedRecords.delete(id));
            let curr = state.folders.find(f => f.id === fId);
            while (curr && curr.parentId) { state.selectedFolders.delete(curr.parentId); curr = state.folders.find(f => f.id === curr.parentId); }
          }
          renderFolders(); return;
        }
        if (target.dataset.selectAllFolder) {
          const fId = target.dataset.selectAllFolder;
          const directRecords = state.records.filter(r => r.folderId === fId);
          const allSelected = directRecords.length > 0 && directRecords.every(r => state.selectedRecords.has(r.id));
          if (allSelected) directRecords.forEach(r => state.selectedRecords.delete(r.id));
          else directRecords.forEach(r => state.selectedRecords.add(r.id));
          renderFolders(); return;
        }
        if (target.classList.contains("cb-record")) {
          const rId = target.dataset.id;
          if (target.checked) {
            state.selectedRecords.add(rId);
          } else {
            state.selectedRecords.delete(rId);
            const record = state.records.find(r => r.id === rId);
            if (record) {
              let currId = record.folderId;
              while (currId) { state.selectedFolders.delete(currId); const parentFolder = state.folders.find(f => f.id === currId); currId = parentFolder ? parentFolder.parentId : null; }
            }
          }
          renderFolders(); return;
        }
        // ── 點擊側邊欄的紀錄飛轉 ──
        const recordBtn = target.closest(".record-item");
        if (recordBtn && !target.dataset.deleteRecord) {
          const row = recordBtn.closest("[id^='record-row-']");
          const rId = row ? row.id.replace("record-row-", "") : null;
          let point = state.records.find(r => r.id === rId);

          if (!point) {
            const lat = parseFloat(recordBtn.dataset.flyLat), lng = parseFloat(recordBtn.dataset.flyLng);
            point = state.points.find(p => p.lat === lat && p.lng === lng) || state.records.find(r => r.lat === lat && r.lng === lng);
          }

          if (point) {
            map.flyTo([point.lat, point.lng], map.getMaxZoom(), { duration: 0.45 });
            L.popup({ autoPanPadding: [10, 10] }).setLatLng([point.lat, point.lng]).setContent(miniPopupHtml(point)).openOn(map);
            openEditPanel(point);
            if (window.innerWidth <= 820) setPanelCollapsed(true);
          }
          return;
        }
        if (target.dataset.deleteRecord) {
          const rId = target.dataset.deleteRecord;
          GlobalModal.confirm("確定要刪除此筆紀錄嗎？", () => {
            const deletedRecords = state.records.filter(r => r.id === rId);
            state.records = state.records.filter(r => r.id !== rId);
            state.selectedRecords.delete(rId);
            saveToLocalStorage(); renderer.redraw();
            deleteRecordPhotos(deletedRecords).catch(error => console.warn("刪除照片失敗：", error));
          }); return;
        }
        if (target.dataset.addSub) {
          GlobalModal.prompt("請輸入子資料夾名稱：", "", (newName) => {
            if (newName && newName.trim()) {
              const pId = target.dataset.addSub, newId = generateId();
              state.folders.push({ id: newId, name: newName.trim(), parentId: pId });
              state.expandedFolders.add(pId); state.expandedFolders.add(newId); saveToLocalStorage();
            }
          });
        } else if (target.dataset.rename) {
          const fId = target.dataset.rename, f = state.folders.find(x => x.id === fId);
          if (!f) return;
          GlobalModal.prompt("重新命名資料夾：", f.name, (newName) => {
            if (newName && newName.trim()) { f.name = newName.trim(); saveToLocalStorage(); }
          });
        }
        const moveUpBtn = target.closest("[data-move-up]"), moveDownBtn = target.closest("[data-move-down]");
        if (moveUpBtn || moveDownBtn) {
          const btn = moveUpBtn || moveDownBtn, fId = btn.dataset.moveUp || btn.dataset.moveDown, direction = moveUpBtn ? -1 : 1;
          const folder = state.folders.find(f => f.id === fId); if (!folder) return;
          const siblings = state.folders.filter(f => f.parentId === folder.parentId), sIdx = siblings.findIndex(f => f.id === fId);
          if (direction === -1 && sIdx > 0) swapInArray(state.folders, fId, siblings[sIdx - 1].id);
          else if (direction === 1 && sIdx < siblings.length - 1) swapInArray(state.folders, fId, siblings[sIdx + 1].id);
          return;
        } else if (target.dataset.toggleVisibility) {
          const fId = target.dataset.toggleVisibility, nowHidden = state.hiddenRecordFolders.has(fId);
          function getAllDescIds(id) {
            const ids = [id]; state.folders.filter(f => f.parentId === id).forEach(child => getAllDescIds(child.id).forEach(cid => ids.push(cid))); return ids;
          }
          const affectedIds = getAllDescIds(fId);
          if (nowHidden) affectedIds.forEach(id => state.hiddenRecordFolders.delete(id));
          else affectedIds.forEach(id => state.hiddenRecordFolders.add(id));
          renderFolders(); updateRecordMarkers();
        } else if (target.dataset.export) {
          const fId = target.dataset.export, folder = state.folders.find(f => f.id === fId);
          if (!folder) return;
          const targetRecords = getAllRecordsInFolder(fId), pathName = getFullFolderPath(fId);
          const exportFolders = getFolderSubsetForExport(targetRecords, [fId]);
          chooseRecordExportFormat(targetRecords, exportFolders, `巡視紀錄_${pathName || folder.name}`, pathName);
        } else if (target.dataset.deleteFolder) {
          const fId = target.dataset.deleteFolder, folder = state.folders.find(f => f.id === fId);
          if (!folder) return;

          // [修正] 加上 escapeHtml 防護
          GlobalModal.confirm(`確定要刪除資料夾「${escapeHtml(folder.name)}」及其中所有子層與紀錄嗎？`, () => {
            const folderIdsToDelete = new Set();
            (function collectFolderIds(folderId) {
              folderIdsToDelete.add(folderId);
              state.folders.filter(item => item.parentId === folderId).forEach(child => collectFolderIds(child.id));
            })(fId);
            const recordsToDelete = state.records.filter(record => folderIdsToDelete.has(record.folderId));

            function deleteFolderRecursive(currentFolderId) {
              state.folders.filter(f => f.parentId === currentFolderId).forEach(child => deleteFolderRecursive(child.id));
              state.records = state.records.filter(r => r.folderId !== currentFolderId);
              state.folders = state.folders.filter(f => f.id !== currentFolderId);

              state.hiddenRecordFolders.delete(currentFolderId);
              state.selectedFolders.delete(currentFolderId);
              state.expandedFolders.delete(currentFolderId);

              if (state.lastFolderId === currentFolderId) {
                state.lastFolderId = state.folders.length > 0 ? state.folders[state.folders.length - 1].id : null;
              }
            }

            deleteFolderRecursive(fId);
            saveToLocalStorage();
            renderer.redraw();
            renderFolders();
            deleteRecordPhotos(recordsToDelete).catch(error => console.warn("刪除照片失敗：", error));
          });
        }
      });

      function swapInArray(arr, id1, id2) {
        const idx1 = arr.findIndex(i => i.id === id1), idx2 = arr.findIndex(i => i.id === id2);
        if (idx1 < 0 || idx2 < 0) return;
        [arr[idx1], arr[idx2]] = [arr[idx2], arr[idx1]];
        saveToLocalStorage();
      }

      document.querySelector("#addFolderBtn").addEventListener("click", () => {
        GlobalModal.prompt("請輸入資料夾名稱：", "", (newName) => {
          if (newName && newName.trim()) {
            const newId = generateId();
            state.folders.push({ id: newId, name: newName.trim(), parentId: null });
            state.expandedFolders.add(newId); saveToLocalStorage();
          }
        });
      });

     // ==========================================
      // 匯入 Excel
      // ==========================================
      document.querySelector("#importCsvBtn").addEventListener("click", () => document.querySelector("#importFileInput").click());
      document.querySelector("#importFileInput").addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async function (event) {
          try {
            await ensureXLSX();
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false });

            // [修改] 新增 reverseResolvedCount 計數器
            let importedCount = 0, skippedCount = 0, reverseResolvedCount = 0, manualCount = 0, skipHeader = true;

            for (const row of rows) {
              if (skipHeader) { skipHeader = false; continue; }
              if (!row || row.length < 3) continue;
              const folderPath = String(row[0] || "").trim(), name = String(row[1] || "").trim(), code = String(row[2] || "").trim(), defect = String(row[3] || "").trim(), urgency = String(row[4] || "C").trim();

              const needCorrection = String(row[10] || "").trim() === "是";
              const correctCode = String(row[11] || "").trim();

              if (!folderPath || !name) continue;
              let resolvedLat = null, resolvedLng = null, resolvedName = name, resolvedCode = code;
              let point = code ? state.points.find(p => (p.code || "") === code) : null;
              if (!point && name) point = state.points.find(p => (p.name || "") === name);

              if (point) {
                resolvedLat = point.lat; resolvedLng = point.lng; resolvedName = point.name || name; resolvedCode = point.code || code;
              } else {
                const gpsMatch = code.match(/^GPS_([\d.]+)_([\d.]+)$/i);
                if (gpsMatch) {
                  resolvedLat = parseFloat(gpsMatch[1]); resolvedLng = parseFloat(gpsMatch[2]); resolvedCode = code; resolvedName = name; manualCount++;
                } else {
                  const reversed = tpcCodeToLatLng(code);
                  // [修改] 成功反推算入 reverseResolvedCount，失敗才算入 skippedCount
                  if (reversed) {
                    resolvedLat = reversed.lat; resolvedLng = reversed.lng; resolvedCode = code; resolvedName = name;
                    reverseResolvedCount++;
                  } else {
                    skippedCount++;
                    continue;
                  }
                }
              }
              const folderId = findOrCreateFolderByPath(folderPath); if (!folderId) continue;
              const existingIndex = state.records.findIndex(r =>
                r.folderId === folderId && isSameMapPoint(r, { lat: resolvedLat, lng: resolvedLng, code: resolvedCode })
              );
              const recordData = {
                // 修改這裡的寫法
                id: existingIndex >= 0 ? state.records[existingIndex].id : "rec_" + generateId(),
                lat: resolvedLat, lng: resolvedLng, name: resolvedName, code: resolvedCode, folderId, defect, urgency,
                icon: existingIndex >= 0 ? state.records[existingIndex].icon : undefined,
                photos: existingIndex >= 0 ? (state.records[existingIndex].photos || []) : [],
                needCorrection,
                correctCode
              };
              if (existingIndex >= 0) state.records[existingIndex] = recordData;
              else state.records.push(recordData);
              importedCount++;
            }
            saveToLocalStorage();

            // [修改] 訊息顯示邏輯同步更新
            let msg = `✅ 匯入完成！成功匯入/更新 ${importedCount} 筆紀錄`;
            if (manualCount > 0) msg += `（含 ${manualCount} 筆 GPS 手動點位）`;
            msg += `。`;
            if (reverseResolvedCount > 0) msg += `\n📐 有 ${reverseResolvedCount} 筆不在資料庫，已用圖號反推座標自動補全。`;
            if (skippedCount > 0) msg += `\n⚠️ 有 ${skippedCount} 筆圖號無法解析，已略過。`;

            GlobalModal.alert(msg);
          } catch (err) { GlobalModal.alert("讀取檔案失敗！請確認格式是否正確。\n" + err.message); }
          e.target.value = "";
        };
        reader.readAsArrayBuffer(file);
      });

      // ==========================================
      // 完整備份與還原：ZIP = 紀錄 JSON + Excel + 實際照片
      // ==========================================
      function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function zipPathPart(value) {
        return String(value || "record").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 70) || "record";
      }

      function photoArchiveFileName(photo, profile = "original") {
        const originalName = photoFileName(photo.fileName || "photo.jpg", photo.type || "image/jpeg");
        if (profile !== "compressed") return originalName;
        return `${originalName.replace(/\.[^.]+$/, "")}.jpg`;
      }

      function photoArchivePath(record, photo, profile = "original") {
        const fileName = `${zipPathPart(photo.id)}_${zipPathPart(photoArchiveFileName(photo, profile))}`;
        return `photos/${zipPathPart(record.id)}/${fileName}`;
      }

      function folderPathFromList(folderId, folders) {
        const folderById = new Map((folders || []).map(folder => [folder.id, folder]));
        const path = [];
        const visited = new Set();
        let currentId = folderId;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const folder = folderById.get(currentId);
          if (!folder) break;
          path.unshift(folder.name || "未命名資料夾");
          currentId = folder.parentId || null;
        }
        return path.join(" / ");
      }

      async function compressPhotoForExport(blob) {
        try {
          const image = await loadImageFromBlob(blob);
          const maxSize = 1920;
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          return await canvasToBlob(canvas, "image/jpeg", 0.82);
        } catch (error) {
          console.warn("匯出壓縮失敗，改用原圖：", error);
          return blob;
        }
      }

      async function createPhotoPreviewBlob(blob, maxSize = 720) {
        try {
          const image = await loadImageFromBlob(blob);
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
          if (scale === 1) return blob;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          return await canvasToBlob(canvas, "image/jpeg", 0.78);
        } catch (error) {
          return blob;
        }
      }

      function excelPhotoLinkTarget(path) {
        return String(path).split("/").map(part => encodeURIComponent(part)).join("/");
      }

      const INSPECTION_CARD_FILE = "inspection-card.html";

      function inspectionCardDetailPath(photoId) {
        return `cards/${zipPathPart(photoId)}.html`;
      }

      function inspectionCardLinkTarget(photoId) {
        return excelPhotoLinkTarget(inspectionCardDetailPath(photoId));
      }

      function createInspectionCardDetailHtml(card) {
        const cardData = JSON.stringify({
          name: card.name || "",
          code: card.code || "",
          defect: card.defect || "",
          photoPath: `../${card.photoPath || ""}`,
          listPath: `../${INSPECTION_CARD_FILE}?return=${encodeURIComponent(card.id || "")}`,
        })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029");
        return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>巡檢卡</title>
  <style>
    :root { color-scheme: light; --accent: #087f8c; --bg: #eef2f5; --text: #17202a; --line: #d9e1e8; }
    * { box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif; margin: 0; }
    main { margin: 0 auto; max-width: 980px; padding: 24px 16px 40px; }
    .card { background: #fff; border: 1px solid var(--line); box-shadow: 0 8px 28px rgba(22, 36, 52, 0.13); overflow: hidden; }
    .card-head { background: var(--accent); color: #fff; padding: 18px 22px; }
    .card-head h1 { font-size: 24px; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
    .photo-frame { background: #fff; padding: 20px; text-align: center; }
    .photo-frame img { display: block; height: auto; margin: 0 auto; max-height: 72vh; max-width: 100%; object-fit: contain; }
    .details { border-top: 1px solid var(--line); display: grid; gap: 10px; padding: 18px 22px 22px; }
    .detail { font-size: 18px; line-height: 1.55; overflow-wrap: anywhere; }
    .screen-actions { display: flex; gap: 8px; margin-bottom: 14px; }
    .back, .print-card { background: #fff; border: 1px solid var(--line); color: #075d67; display: inline-block; font-weight: 800; padding: 8px 12px; text-decoration: none; }
    .print-card { background: var(--accent); border-color: var(--accent); color: #fff; cursor: pointer; }
    @media print { :root { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { background: #fff; } main { max-width: none; padding: 0; } .screen-actions { display: none !important; } .card { border: 0; box-shadow: none; } .card-head { background: #087f8c !important; color: #fff !important; } .photo-frame img { max-height: 62vh; } }
    @media (max-width: 600px) { main { padding: 12px 10px 28px; } .card-head { padding: 15px 16px; } .card-head h1 { font-size: 20px; } .photo-frame { padding: 10px; } .details { padding: 16px; } .detail { font-size: 16px; } .screen-actions { flex-wrap: wrap; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    (() => {
      const card = ${cardData};
      const app = document.getElementById("app");
      const text = (tag, value, className = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = value;
        return element;
      };
      const actions = document.createElement("div");
      actions.className = "screen-actions";
      const back = document.createElement("a");
      back.className = "back";
      back.href = card.listPath;
      back.textContent = "返回巡檢卡列表";
      const print = document.createElement("button");
      print.className = "print-card";
      print.type = "button";
      print.textContent = "列印巡檢卡";
      print.addEventListener("click", () => window.print());
      actions.append(back, print);
      const section = document.createElement("article");
      section.className = "card";
      const head = document.createElement("header");
      head.className = "card-head";
      head.append(text("h1", card.name || card.code || "巡檢紀錄"));
      const photoFrame = document.createElement("div");
      photoFrame.className = "photo-frame";
      const image = document.createElement("img");
      image.src = card.photoPath;
      image.alt = card.name || card.code || "巡檢照片";
      photoFrame.append(image);
      const details = document.createElement("section");
      details.className = "details";
      details.append(text("div", "圖號：" + (card.code || "未填寫"), "detail"));
      details.append(text("div", "改善事項：" + (card.defect || "未填寫"), "detail"));
      section.append(head, photoFrame, details);
      app.append(actions, section);
      document.title = (card.name || card.code || "巡檢卡") + " | 巡檢卡";
    })();
  <\/script>
</body>
</html>`;
      }

      function createInspectionCardHtml(cards, folders = []) {
        const cardData = JSON.stringify({ cards, folders })
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029");
        return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>巡檢卡</title>
  <style>
    :root { color-scheme: light; --accent: #087f8c; --bg: #eef2f5; --text: #17202a; --line: #d9e1e8; }
    * { box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif; margin: 0; }
    main { margin: 0 auto; max-width: 980px; padding: 24px 16px 40px; }
    .card { background: #fff; border: 1px solid var(--line); box-shadow: 0 8px 28px rgba(22, 36, 52, 0.13); overflow: hidden; }
    .card-head { background: var(--accent); color: #fff; padding: 18px 22px; }
    .card-head h1 { font-size: 24px; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
    .photo-frame { background: #fff; padding: 20px; text-align: center; }
    .photo-frame img { display: block; height: auto; margin: 0 auto; max-height: 72vh; max-width: 100%; object-fit: contain; }
    .details { border-top: 1px solid var(--line); display: grid; gap: 10px; padding: 18px 22px 22px; }
    .detail { font-size: 18px; line-height: 1.55; overflow-wrap: anywhere; }
    .screen-toolbar { align-items: center; background: #fff; border: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-bottom: 12px; padding: 12px; }
    .screen-toolbar h1 { font-size: 22px; margin: 0; }
    .screen-toolbar-actions, .screen-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .screen-toolbar button, .screen-actions button, .screen-actions a { background: #fff; border: 1px solid var(--line); color: #075d67; cursor: pointer; display: inline-block; font-weight: 800; min-height: 36px; padding: 8px 12px; text-decoration: none; }
    .screen-toolbar button.primary, .screen-actions button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .selection-summary { color: #687584; font-size: 13px; margin-right: auto; }
    .folder-group { background: #fff; border: 1px solid var(--line); margin-bottom: 10px; }
    .folder-group.depth-1 { margin-left: 18px; }
    .folder-group.depth-2 { margin-left: 36px; }
    .folder-group-head { align-items: center; background: #f8fafc; border-bottom: 1px solid var(--line); display: flex; gap: 8px; min-height: 46px; padding: 8px 12px; }
    .folder-group-head strong { flex: 1; overflow-wrap: anywhere; }
    .folder-group-count { color: #687584; font-size: 12px; }
    .folder-toggle { background: #fff; border: 1px solid var(--line); color: #075d67; cursor: pointer; flex: 0 0 auto; font-size: 13px; font-weight: 800; min-height: 32px; padding: 5px 9px; }
    .folder-records { display: grid; gap: 8px; padding: 10px; }
    .folder-records[hidden] { display: none; }
    .folder-record { align-items: flex-start; border: 1px solid var(--line); display: flex; gap: 8px; padding: 10px; }
    .folder-record a { color: #075d67; display: grid; gap: 4px; min-width: 0; text-decoration: none; }
    .folder-record a:hover { background: #eef8f9; }
    .record-title { font-weight: 800; overflow-wrap: anywhere; }
    .record-defect { color: #5f4a16; font-size: 14px; overflow-wrap: anywhere; }
    .folder-record input, .folder-group-head input { flex: 0 0 auto; height: 20px; margin: 2px 0 0; width: 20px; }
    .empty { background: #fff; border: 1px solid var(--line); color: #687584; padding: 22px; }
    .print-view-title { margin: 0 0 12px; }
    .inspection-card { background: #fff; border: 1px solid var(--line); box-shadow: 0 8px 28px rgba(22, 36, 52, 0.13); margin-bottom: 18px; overflow: hidden; }
    .card-head { background: var(--accent); color: #fff; padding: 18px 22px; }
    .card-head h2 { font-size: 24px; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
    .photo-frame { background: #fff; padding: 20px; text-align: center; }
    .photo-frame img { display: block; height: auto; margin: 0 auto; max-height: 72vh; max-width: 100%; object-fit: contain; }
    .details { border-top: 1px solid var(--line); display: grid; gap: 10px; padding: 18px 22px 22px; }
    .detail { font-size: 18px; line-height: 1.55; overflow-wrap: anywhere; }
    .back { background: #fff; border: 1px solid var(--line); color: #075d67; display: inline-block; font-weight: 800; padding: 8px 12px; text-decoration: none; }
    @media print { :root { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body { background: #fff; } main { max-width: none; padding: 0; } .screen-toolbar, .screen-actions, .folder-group, .print-view-title { display: none !important; } .inspection-card { border: 0; box-shadow: none; break-after: page; margin: 0; } .inspection-card:last-child { break-after: auto; } .card-head { background: #087f8c !important; color: #fff !important; } .photo-frame img { max-height: 62vh; } }
    @media (max-width: 600px) { main { padding: 12px 10px 28px; } .screen-toolbar { align-items: stretch; } .screen-toolbar h1 { font-size: 20px; } .screen-toolbar-actions { width: 100%; } .screen-toolbar button { flex: 1 1 140px; } .folder-group.depth-1 { margin-left: 10px; } .folder-group.depth-2 { margin-left: 20px; } .folder-record { padding: 9px; } .card-head { padding: 15px 16px; } .card-head h2 { font-size: 20px; } .photo-frame { padding: 10px; } .details { padding: 16px; } .detail { font-size: 16px; } }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    (() => {
      const payload = ${cardData};
      const cards = Array.isArray(payload.cards) ? payload.cards : [];
      const folders = Array.isArray(payload.folders) ? payload.folders : [];
      const app = document.getElementById("app");
      const selectedIds = new Set();
      const text = (tag, value, className = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = value;
        return element;
      };
      const createButton = (label, className = "") => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        if (className) button.className = className;
        return button;
      };
      const childrenByParent = new Map();
      folders.forEach(folder => {
        const parentId = folder.parentId || null;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(folder);
      });
      const cardsByFolder = new Map();
      cards.forEach(card => {
        const folderId = card.folderId || null;
        if (!cardsByFolder.has(folderId)) cardsByFolder.set(folderId, []);
        cardsByFolder.get(folderId).push(card);
      });
      const folderChildren = folderId => childrenByParent.get(folderId || null) || [];
      const cardIdsInFolderTree = folderId => {
        const result = [];
        (cardsByFolder.get(folderId) || []).forEach(card => result.push(card.id));
        folderChildren(folderId).forEach(child => result.push(...cardIdsInFolderTree(child.id)));
        return result;
      };
      const hasCardsInFolderTree = folderId => cardIdsInFolderTree(folderId).length > 0;
      const createCardArticle = card => {
        const article = document.createElement("article");
        article.className = "inspection-card";
        const head = document.createElement("header");
        head.className = "card-head";
        head.append(text("h2", card.name || card.code || "巡檢紀錄"));
        const photoFrame = document.createElement("div");
        photoFrame.className = "photo-frame";
        const image = document.createElement("img");
        image.src = card.photoPath || "";
        image.alt = card.name || card.code || "巡檢照片";
        photoFrame.append(image);
        const details = document.createElement("section");
        details.className = "details";
        details.append(text("div", "圖號：" + (card.code || "未填寫"), "detail"));
        details.append(text("div", "改善事項：" + (card.defect || "未填寫"), "detail"));
        article.append(head, photoFrame, details);
        return article;
      };
      const updateSelectionUi = () => {
        app.querySelectorAll("[data-card-select]").forEach(input => {
          input.checked = selectedIds.has(input.dataset.cardSelect);
        });
        app.querySelectorAll("[data-folder-select]").forEach(input => {
          const ids = cardIdsInFolderTree(input.dataset.folderSelect);
          const selectedCount = ids.filter(id => selectedIds.has(id)).length;
          input.checked = ids.length > 0 && selectedCount === ids.length;
          input.indeterminate = selectedCount > 0 && selectedCount < ids.length;
        });
        const summary = app.querySelector("[data-selection-summary]");
        if (summary) summary.textContent = "已選 " + selectedIds.size + " 張巡檢卡";
      };
      const waitForImages = () => Promise.all([...app.querySelectorAll("img")].map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }));
      const printCurrentCards = () => waitForImages().then(() => window.print());
      const showSelectedCards = (autoPrint = false) => {
        const selectedCards = cards.filter(card => selectedIds.has(card.id));
        if (!selectedCards.length) {
          window.alert("請先勾選資料夾或巡檢卡。");
          return;
        }
        app.replaceChildren();
        const actions = document.createElement("div");
        actions.className = "screen-actions";
        const back = createButton("返回巡檢卡列表");
        back.addEventListener("click", showList);
        const print = createButton("列印所選巡檢卡", "primary");
        print.addEventListener("click", printCurrentCards);
        actions.append(back, print);
        app.append(actions, text("h1", "已選巡檢卡（" + selectedCards.length + " 張）", "print-view-title"));
        selectedCards.forEach(card => app.append(createCardArticle(card)));
        document.title = "已選巡檢卡 | 巡檢卡";
        if (autoPrint) window.setTimeout(printCurrentCards, 80);
      };
      const bindListActions = () => {
        app.querySelectorAll("[data-card-select]").forEach(input => {
          input.addEventListener("change", event => {
            const id = event.target.dataset.cardSelect;
            if (event.target.checked) selectedIds.add(id); else selectedIds.delete(id);
            updateSelectionUi();
          });
        });
        app.querySelectorAll("[data-folder-select]").forEach(input => {
          input.addEventListener("change", event => {
            const ids = cardIdsInFolderTree(event.target.dataset.folderSelect);
            ids.forEach(id => event.target.checked ? selectedIds.add(id) : selectedIds.delete(id));
            updateSelectionUi();
          });
        });
      };
      const saveListScroll = cardId => {
        try {
          sessionStorage.setItem("inspection-card-scroll", JSON.stringify({
            id: cardId || "",
            top: window.scrollY || document.documentElement.scrollTop || 0,
          }));
        } catch (error) { /* Storage may be unavailable in a restricted browser context. */ }
      };
      const createCardLink = card => {
        const link = document.createElement("a");
        link.href = card.cardPath || ("?photo=" + encodeURIComponent(card.id));
        link.addEventListener("click", () => saveListScroll(card.id));
        return link;
      };
      const setFolderExpanded = (records, expanded) => {
        records.hidden = !expanded;
        const toggle = records.previousElementSibling?.querySelector(".folder-toggle");
        if (toggle) {
          toggle.setAttribute("aria-expanded", String(expanded));
          toggle.textContent = expanded ? "收合" : "展開";
        }
      };
      const buildFolderGroup = (folder, depth = 0) => {
        if (!hasCardsInFolderTree(folder.id)) return null;
        const section = document.createElement("section");
        section.className = "folder-group depth-" + Math.min(depth, 2);
        const head = document.createElement("div");
        head.className = "folder-group-head";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.folderSelect = folder.id;
        const directCount = (cardsByFolder.get(folder.id) || []).length;
        const totalCount = cardIdsInFolderTree(folder.id).length;
        const toggle = createButton("展開", "folder-toggle");
        toggle.setAttribute("aria-expanded", "false");
        const records = document.createElement("div");
        records.className = "folder-records";
        setFolderExpanded(records, false);
        toggle.addEventListener("click", () => setFolderExpanded(records, records.hidden));
        head.append(checkbox, text("strong", folder.name || "未命名資料夾"), text("span", totalCount + " 張卡" + (directCount ? "" : "（子層）"), "folder-group-count"), toggle);
        section.append(head);
        (cardsByFolder.get(folder.id) || []).forEach(card => {
          const row = document.createElement("div");
          row.className = "folder-record";
          const cardCheckbox = document.createElement("input");
          cardCheckbox.type = "checkbox";
          cardCheckbox.dataset.cardSelect = card.id;
          const link = createCardLink(card);
          link.append(text("span", (card.name || card.code || "巡檢紀錄") + " | " + (card.code || "未填圖號"), "record-title"), text("span", "改善事項：" + (card.defect || "未填寫"), "record-defect"));
          row.append(cardCheckbox, link);
          records.append(row);
        });
        folderChildren(folder.id).forEach(child => {
          const childSection = buildFolderGroup(child, depth + 1);
          if (childSection) records.append(childSection);
        });
        section.append(records);
        return section;
      };
      const selectedId = () => {
        const queryId = new URLSearchParams(location.search).get("photo");
        if (queryId) return queryId;
        try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; }
      };
      const readReturnState = () => {
        const queryId = new URLSearchParams(location.search).get("return") || "";
        let stored = null;
        try {
          const raw = sessionStorage.getItem("inspection-card-scroll");
          if (raw) stored = JSON.parse(raw);
          sessionStorage.removeItem("inspection-card-scroll");
        } catch (error) { /* Storage may be unavailable in a restricted browser context. */ }
        const id = queryId || (stored && stored.id) || "";
        const top = stored && Number.isFinite(Number(stored.top)) ? Math.max(0, Number(stored.top)) : null;
        return id || top !== null ? { id, top } : null;
      };
      const restoreListPosition = returnState => {
        if (!returnState) return;
        window.requestAnimationFrame(() => {
          const target = [...app.querySelectorAll("[data-card-select]")].find(input => input.dataset.cardSelect === returnState.id);
          if (target) {
            let records = target.closest(".folder-records");
            while (records) {
              setFolderExpanded(records, true);
              const group = records.closest(".folder-group");
              records = group?.parentElement?.closest(".folder-records") || null;
            }
          }
          if (returnState.top !== null) window.scrollTo(0, returnState.top);
          else if (target) target.closest(".folder-record")?.scrollIntoView({ block: "center" });
        });
      };
      const showList = () => {
        const returnState = readReturnState();
        app.replaceChildren();
        if (!cards.length) {
          app.append(text("div", "這份備份沒有照片巡檢卡。", "empty"));
          return;
        }
        const toolbar = document.createElement("section");
        toolbar.className = "screen-toolbar";
        toolbar.append(text("h1", "巡檢卡"));
        const summary = text("span", "已選 0 張巡檢卡", "selection-summary");
        summary.dataset.selectionSummary = "true";
        const toolbarActions = document.createElement("div");
        toolbarActions.className = "screen-toolbar-actions";
        const selectAll = createButton("全選");
        selectAll.addEventListener("click", () => { cards.forEach(card => selectedIds.add(card.id)); updateSelectionUi(); });
        const clearAll = createButton("清除");
        clearAll.addEventListener("click", () => { selectedIds.clear(); updateSelectionUi(); });
        const generate = createButton("產生所選巡檢卡", "primary");
        generate.addEventListener("click", () => showSelectedCards(false));
        const print = createButton("列印所選巡檢卡", "primary");
        print.addEventListener("click", () => showSelectedCards(true));
        toolbarActions.append(selectAll, clearAll, generate, print);
        toolbar.append(summary, toolbarActions);
        app.append(toolbar);
        folderChildren(null).forEach(folder => {
          const group = buildFolderGroup(folder);
          if (group) app.append(group);
        });
        const uncategorized = cardsByFolder.get(null) || [];
        if (uncategorized.length) {
          const group = document.createElement("section");
          group.className = "folder-group";
          const head = document.createElement("div");
          head.className = "folder-group-head";
          const toggle = createButton("展開", "folder-toggle");
          toggle.setAttribute("aria-expanded", "false");
          const records = document.createElement("div");
          records.className = "folder-records";
          setFolderExpanded(records, false);
          toggle.addEventListener("click", () => setFolderExpanded(records, records.hidden));
          head.append(text("strong", "未歸類"), text("span", uncategorized.length + " 張卡", "folder-group-count"), toggle);
          group.append(head);
          uncategorized.forEach(card => {
            const row = document.createElement("div");
            row.className = "folder-record";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.cardSelect = card.id;
            const link = createCardLink(card);
            link.append(text("span", (card.name || card.code || "巡檢紀錄") + " | " + (card.code || "未填圖號"), "record-title"), text("span", "改善事項：" + (card.defect || "未填寫"), "record-defect"));
            row.append(checkbox, link);
            records.append(row);
          });
          group.append(records);
          app.append(group);
        }
        bindListActions();
        updateSelectionUi();
        document.title = "巡檢卡 | 巡檢卡";
        restoreListPosition(returnState);
      };
      const showCard = card => {
        app.replaceChildren();
        const actions = document.createElement("div");
        actions.className = "screen-actions";
        const back = document.createElement("a");
        back.className = "back";
        back.href = "${INSPECTION_CARD_FILE}?return=" + encodeURIComponent(card.id || "");
        back.textContent = "返回巡檢卡列表";
        const print = createButton("列印巡檢卡", "primary");
        print.addEventListener("click", printCurrentCards);
        actions.append(back, print);
        app.append(actions, createCardArticle(card));
        document.title = (card.name || card.code || "巡檢卡") + " | 巡檢卡";
      };
      const render = () => {
        const card = cards.find(item => item.id === selectedId());
        if (card) showCard(card); else showList();
      };
      window.addEventListener("hashchange", render);
      render();
    })();
  <\/script>
      </body>
</html>`;
      }

      async function archiveDataToBlob(data, type = "application/octet-stream") {
        if (data instanceof Blob) return data;
        if (data instanceof ArrayBuffer) return new Blob([data], { type });
        if (ArrayBuffer.isView(data)) return new Blob([data], { type });
        return new Blob([String(data)], { type });
      }

      async function sha256Hex(data) {
        const blob = await archiveDataToBlob(data);
        if (!globalThis.crypto?.subtle) return "";
        const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
      }

      async function addArchiveFile(manifestFiles, archiveFiles, path, data, type = "application/octet-stream") {
        const blob = await archiveDataToBlob(data, type);
        archiveFiles.push({ path, data: blob, type });
        manifestFiles.push({
          path,
          bytes: blob.size,
          sha256: await sha256Hex(blob),
        });
        return blob;
      }
      let __archiveWorker = null;
      function getArchiveWorker() {
        if (__archiveWorker) return __archiveWorker;
        try {
          __archiveWorker = new Worker("./archive-worker.js");
        } catch (e) {
          __archiveWorker = null;
        }
        return __archiveWorker;
      }
      async function generateZipViaWorker(archiveFiles, onProgress) {
        const worker = getArchiveWorker();
        if (!worker) {
          const zip = new JSZip();
          for (const f of archiveFiles) zip.file(f.path, f.data);
          return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (meta) => {
            if (onProgress) onProgress(meta.percent);
          });
        }
        return new Promise((resolve, reject) => {
          const id = String(Date.now()) + Math.random().toString(36).slice(2);
          let settled = false;
          const cleanup = () => {
            worker.removeEventListener("message", handle);
            worker.removeEventListener("error", errorHandle);
          };
          const handle = (event) => {
            const msg = event.data;
            if (!msg || msg.id !== id) return;
            if (msg.type === "progress" && onProgress) onProgress(msg.percent);
            else if (msg.type === "done") {
              if (settled) return; settled = true;
              cleanup(); clearTimeout(timer);
              resolve(msg.blob);
            } else if (msg.type === "error") {
              if (settled) return; settled = true;
              cleanup(); clearTimeout(timer);
              reject(new Error(msg.error));
            }
          };
          const errorHandle = (err) => {
            if (settled) return; settled = true;
            cleanup(); clearTimeout(timer);
            reject(new Error(err.message || "Worker 錯誤"));
          };
          worker.addEventListener("message", handle);
          worker.addEventListener("error", errorHandle);
          const filesForWorker = archiveFiles.map(f => ({ path: f.path, data: f.data, type: f.type }));
          try { worker.postMessage({ id, files: filesForWorker }); } catch (e) {
            cleanup();
            reject(new Error("Worker 傳送失敗：" + e.message));
            return;
          }
          const timer = setTimeout(() => {
            if (settled) return; settled = true;
            cleanup();
            reject(new Error("Worker 逾時"));
          }, 15000);
        });
      }

      const BACKUP_ENCRYPTION_MAGIC = new Uint8Array([84, 80, 87, 50]);

      async function deriveBackupKey(password, salt, iterations) {
        if (!globalThis.crypto?.subtle) throw new Error("此瀏覽器不支援備份加密");
        const material = await globalThis.crypto.subtle.importKey(
          "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        return globalThis.crypto.subtle.deriveKey(
          { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      }

      async function encryptBackupBlob(blob, password) {
        const trimmedPassword = String(password || "");
        if (!trimmedPassword) return { blob, encrypted: false };
        if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) throw new Error("此瀏覽器不支援備份加密");
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const iterations = 210000;
        const key = await deriveBackupKey(trimmedPassword, salt, iterations);
        const cipherText = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer()));
        const header = new Uint8Array(4 + 1 + 4 + salt.length + iv.length);
        header.set(BACKUP_ENCRYPTION_MAGIC, 0);
        header[4] = 1;
        new DataView(header.buffer).setUint32(5, iterations);
        header.set(salt, 9);
        header.set(iv, 25);
        return { blob: new Blob([header, cipherText], { type: "application/octet-stream" }), encrypted: true };
      }

      async function isEncryptedBackupFile(file) {
        const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        return BACKUP_ENCRYPTION_MAGIC.every((value, index) => header[index] === value);
      }

      async function decryptBackupFile(file, password) {
        if (!globalThis.crypto?.subtle) throw new Error("此瀏覽器不支援備份解密");
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length < 37 || !BACKUP_ENCRYPTION_MAGIC.every((value, index) => bytes[index] === value)) {
          throw new Error("加密備份格式錯誤");
        }
        const iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5);
        const salt = bytes.slice(9, 25);
        const iv = bytes.slice(25, 37);
        try {
          const key = await deriveBackupKey(password, salt, iterations);
          const plain = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(37));
          return new Blob([plain], { type: "application/zip" });
        } catch {
          throw new Error("密碼錯誤或備份檔案已損毀");
        }
      }

      async function createPhotoArchive(records, folders, archiveTitle, photoProfile = "original", onProgress = null) {
        await ensureJSZip();
        await ensureXLSX();
        const archiveFiles = [];
        const totalPhotos = records.reduce((n, record) => n + (record.photos || []).length, 0);
        const manifestFiles = [];
        const exportedAt = new Date().toISOString();
        const orderedRecords = sortInspectionRecords(records);
        const archiveRecords = orderedRecords.map(record => ({
          ...record,
          photos: (record.photos || []).map(photo => ({ ...photo })),
        }));

        let photoCount = 0;
        let originalPhotoBytes = 0;
        let exportedPhotoBytes = 0;
        const exportedPhotoLinks = new Map();
        const inspectionCards = [];
        const cardFiles = [];
        for (const record of archiveRecords) {
          for (const photo of record.photos || []) {
            const sourcePhoto = { ...photo };
            const sourceBlob = await getPhotoBlob(photo.id, sourcePhoto);
            if (!sourceBlob) continue;
            const blob = photoProfile === "compressed"
              ? await compressPhotoForExport(sourceBlob)
              : sourceBlob;
            originalPhotoBytes += Number(sourceBlob.size) || 0;
            exportedPhotoBytes += Number(blob.size) || 0;
            if (photoProfile === "compressed") {
              photo.originalSize = Number(photo.originalSize) || sourceBlob.size;
              photo.originalType = photo.originalType || sourceBlob.type || "image/jpeg";
              photo.size = blob.size;
              photo.type = blob.type || "image/jpeg";
              photo.fileName = photoArchiveFileName(photo, "compressed");
            }
            const path = photoArchivePath(record, photo, photoProfile);
            const cardPath = inspectionCardDetailPath(photo.id);
            await addArchiveFile(manifestFiles, archiveFiles, path, blob, blob.type || "image/jpeg");
            const originalTarget = excelPhotoLinkTarget(path);
            exportedPhotoLinks.set(photo.id, {
              card: inspectionCardLinkTarget(photo.id),
              original: originalTarget,
            });
            inspectionCards.push({
              id: photo.id,
              name: record.name || "",
              code: record.code || "",
              defect: record.defect || "",
              photoPath: originalTarget,
              cardPath,
              folderId: record.folderId || null,
              folderPath: folderPathFromList(record.folderId, folders),
            });
            photoCount++;
            if (onProgress) onProgress(photoCount, Math.max(1, totalPhotos));
            if (photoCount % 10 === 0) await new Promise(r => setTimeout(r, 0));
          }
        }

        const recordsJson = JSON.stringify({
          format: "taipower-inspection-v2-photo-backup",
          version: 2,
          backupFormatVersion: BACKUP_FORMAT_VERSION,
          exportedAt,
          photoProfile,
          folders,
          records: archiveRecords,
        }, null, 2);
        await addArchiveFile(manifestFiles, archiveFiles, "records.json", recordsJson, "application/json");
        await addArchiveFile(manifestFiles, archiveFiles, INSPECTION_CARD_FILE, createInspectionCardHtml(inspectionCards, folders), "text/html");
        inspectionCards.forEach(card => {
          cardFiles.push({ path: card.cardPath, data: createInspectionCardDetailHtml(card) });
        });
        for (const cardFile of cardFiles) await addArchiveFile(manifestFiles, archiveFiles, cardFile.path, cardFile.data, "text/html");
        const workbook = await createRecordsWorkbook(
          archiveRecords,
          "",
          (record, photo) => exportedPhotoLinks.get(photo.id) || null,
          photoProfile === "compressed" ? { original: "照片連結" } : null
        );
        const workbookData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        await addArchiveFile(manifestFiles, archiveFiles, "records.xlsx", workbookData, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        const readme = [
          archiveTitle,
          `匯出時間：${exportedAt}`,
          `備份格式版本：${BACKUP_FORMAT_VERSION}`,
          `巡檢紀錄：${archiveRecords.length} 筆`,
          `照片檔案：${photoCount} 張`,
          `照片版本：${photoProfile === "compressed" ? "匯出壓縮版（適合分享，無法恢復未匯出的原始細節）" : "原圖（可完整還原）"}`,
          "請先解壓縮 ZIP，再開啟 records.xlsx。",
          `Excel 的「巡視紀錄」與「照片連結」工作表提供「巡檢卡連結」與「${photoProfile === "compressed" ? "照片連結" : "原始照片連結"}」。`,
          `${INSPECTION_CARD_FILE} 是依資料夾分類的巡檢卡列表；cards 資料夾存放各照片的巡檢卡，使用同包 photos 資料夾內的圖片，不會額外複製照片檔案。`,
          "manifest.json 會列出每個檔案的大小與 SHA-256，可在資料還原前重新檢查。",
          "records.json 可用於資料還原。還原前請先確認不會覆蓋現有資料。",
        ].join("\r\n");
        await addArchiveFile(manifestFiles, archiveFiles, "README.txt", readme, "text/plain");

        const manifest = {
          format: "taipower-inspection-backup-manifest",
          backupFormatVersion: BACKUP_FORMAT_VERSION,
          exportedAt,
          photoProfile,
          folders: folders.length,
          records: archiveRecords.length,
          photos: photoCount,
          originalPhotoBytes,
          exportedPhotoBytes,
          checksum: globalThis.crypto?.subtle ? "SHA-256" : "unavailable",
          files: manifestFiles,
        };
        const manifestText = JSON.stringify(manifest, null, 2);
        await addArchiveFile([], archiveFiles, "manifest.json", manifestText, "application/json");

        let blob;
        try {
          blob = await generateZipViaWorker(archiveFiles);
        } catch (e) {
          console.warn("Worker 產生 ZIP 失敗，改用主線程：", e);
          const zip = new JSZip();
          for (const f of archiveFiles) zip.file(f.path, f.data);
          blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        }
        return {
          blob,
          photoCount,
          originalPhotoBytes,
          exportedPhotoBytes,
          manifest,
          manifestHash: await sha256Hex(manifestText),
        };
      }

      window.__syncBridge = {
        buildBackup: async () => {
          normalizeInspectionState();
          const archive = await createPhotoArchive(state.records, state.folders, "土木設備分布地圖照片版完整備份");
          return {
            blob: archive.blob,
            photoCount: archive.photoCount,
            recordCount: state.records.length,
            manifestHash: archive.manifestHash,
          };
        },
        restoreBackup: async (file) => {
          await processBackupImport(file, "");
        },
        mergeBackup: async (file) => {
          return await mergeZipBackup(file);
        },
        confirmEmptySend: (info) => new Promise(resolve => {
          GlobalModal.show({
            title: "本機沒有資料",
            content: `本機目前有 ${info.records} 筆紀錄、${info.photos} 張照片。<br><br>
              將傳送<strong>空資料</strong>給對方 — 對方若選擇「覆蓋本機資料」，其資料會被清空。<strong style="color:#b91c1c">確定要傳送嗎？</strong>`,
            type: "confirm",
            confirmText: "仍要傳送",
            cancelText: "取消傳送",
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
          });
        }),
        snapshotBeforeOverwrite: async () => {
          try {
            const archive = await createPhotoArchive(state.records, state.folders, "覆蓋前自動快照");
            await putAppDataRecord("tpSyncPreOverwriteSnapshot", {
              blob: archive.blob,
              recordCount: state.records.length,
              photoCount: archive.photoCount,
              createdAt: new Date().toISOString(),
            });
            return true;
          } catch (error) {
            console.error("建立覆蓋前快照失敗：", error);
            return false;
          }
        },
        getSnapshotInfo: async () => {
          try {
            const record = await getAppDataRecord("tpSyncPreOverwriteSnapshot");
            if (!record?.value?.blob) return null;
            return {
              recordCount: record.value.recordCount,
              photoCount: record.value.photoCount,
              createdAt: record.value.createdAt,
            };
          } catch { return null; }
        },
        restoreSnapshot: async () => {
          const record = await getAppDataRecord("tpSyncPreOverwriteSnapshot");
          if (!record?.value?.blob) throw new Error("沒有可還原的快照");
          const file = new File([record.value.blob], "覆蓋前快照.zip", { type: "application/zip" });
          await processBackupImport(file, "");
          return true;
        },
        confirm: (text) => new Promise(resolve => {
          GlobalModal.confirm(text, () => resolve(true), () => resolve(false));
        }),
        confirmMerge: (info) => new Promise(resolve => {
          const showMergeModal = () => {
            GlobalModal.show({
              title: "同步還原方式",
              content: `收到 ${info.records} 筆紀錄、${info.photos} 張照片（${info.sizeMB}）。<br><br>
                <strong>合併到本機</strong>：把對端的新資料加入本機，不會覆蓋既有資料與照片（共用電腦建議使用）。<br>
                <strong>覆蓋本機</strong>：以對端資料取代本機全部資料與照片（個人專用裝置建議使用）。`,
              type: "confirm",
              confirmText: "合併到本機資料",
              discardText: "覆蓋本機資料",
              cancelText: "取消",
              onConfirm: () => resolve("merge"),
              onDiscard: () => {
                const remoteCount = Number(info.records);
                if (!Number.isFinite(remoteCount) || remoteCount === 0) {
                  GlobalModal.show({
                    title: "無法覆蓋",
                    content: "對方沒有資料（0 筆紀錄），無法覆蓋本機。請改選<strong>「合併到本機資料」</strong>或<strong>「取消」</strong>。",
                    type: "alert",
                    confirmText: "了解",
                    onConfirm: () => showMergeModal(),
                  });
                  return;
                }
                const localPhotoCount = state.records.reduce((total, record) => total + (record.photos || []).length, 0);
                GlobalModal.show({
                  title: "確定覆蓋本機資料？",
                  content: `對方資料：<strong>${info.records}</strong> 筆紀錄、<strong>${info.photos}</strong> 張照片<br>
                    本機目前：<strong>${state.records.length}</strong> 筆紀錄、<strong>${localPhotoCount}</strong> 張照片<br><br>
                    覆蓋後本機資料將全部被取代，<strong style="color:#b91c1c">無法復原</strong>（覆蓋前會自動留存一份快照，可於同步面板「↩ 還原」）。確定要覆蓋嗎？`,
                  type: "confirm",
                  confirmText: "確定覆蓋",
                  cancelText: "回到選擇",
                  onConfirm: async () => {
                    await window.__syncBridge.snapshotBeforeOverwrite();
                    resolve("replace");
                  },
                  onCancel: () => showMergeModal(),
                });
              },
              onCancel: () => resolve("cancel"),
            });
          };
          showMergeModal();
        }),
      };

      async function exportRecordsAsZip(records, folders, fileBaseName, photoProfile = "original", destination = "local", cloudBaseName = "") {
        try {
          const { blob, photoCount, manifestHash } = await createPhotoArchive(records, folders, "土木設備分布地圖照片版巡檢匯出", photoProfile);
          const fileName = fileBaseName + ".zip";
          if (destination === "local" || destination === "both") downloadBlob(blob, fileName);
          const toCloud = destination === "drive" || destination === "both";
          let cloudName = "";
          if (toCloud) {
            window.__v2DriveResume = { type: "export", mode: "zip", records, folders, fileBaseName, photoProfile, destination, cloudBase: cloudBaseName };
            cloudName = (cloudBaseName || fileBaseName) + ".zip";
            backupProgressUpdate(10, "上傳 ZIP 至雲端…");
            await uploadZipToDrive(blob, cloudName, (pct) => backupProgressUpdate(10 + Math.round(pct * 0.85), "上傳 ZIP " + pct + "%…"));
            backupProgressUpdate(100, "完成");
          }
          saveBackupSummary({
            exportedAt: new Date().toISOString(),
            folders: folders.length,
            records: records.length,
            photos: photoCount,
            profile: photoProfile,
            encrypted: false,
            formatVersion: BACKUP_FORMAT_VERSION,
            manifestHash,
          });
          GlobalModal.alert(`ZIP 匯出完成：${records.length} 筆紀錄、${photoCount} 張照片（${photoProfile === "compressed" ? "壓縮版" : "原圖"}）。解壓縮後可開啟 records.xlsx、巡檢卡或使用資料還原。${toCloud ? "並已上傳到雲端硬碟（" + cloudName + "）。" : ""}`);
        } catch (error) {
          console.error("ZIP 匯出失敗：", error);
          GlobalModal.alert("ZIP 匯出失敗：" + error.message);
        }
      }

      async function uploadRecordsWorkbookToDrive(workbook, fileName) {
        try {
          await ensureXLSX();
          backupProgressUpdate(10, "上傳 Excel 至雲端…");
          const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
          const blob = new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          await uploadZipToDrive(blob, fileName, (pct) => backupProgressUpdate(10 + Math.round(pct * 0.85), "上傳 Excel " + pct + "%…"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          backupProgressUpdate(100, "完成");
          GlobalModal.alert(`Excel 已上傳到雲端硬碟：${fileName}`);
        } catch (error) {
          console.error("Excel 雲端上傳失敗：", error);
          GlobalModal.alert("Excel 雲端上傳失敗：" + error.message);
        }
      }

      // ===== Google Drive 備份（個人帳號 OAuth；token 不持久化，每次操作重新授權，關閉即無殘留）=====
      const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
      const DRIVE_CLIENT_ID_DEFAULT = "1005424982828-ncebcgsd539occ7ds0rjpae3coodae9u.apps.googleusercontent.com";
      let _driveClientId = null;
      function getDriveClientId() {
        const fromUrl = new URLSearchParams(location.search).get("driveClientId");
        if (fromUrl) return fromUrl;
        if (_driveClientId === null) _driveClientId = DRIVE_CLIENT_ID_DEFAULT;
        return _driveClientId;
      }
      async function ensureDriveClientId() {
        const clientId = getDriveClientId();
        if (clientId) return clientId;
        return "";
      }
      async function loadGIS() {
        if (window.google?.accounts?.oauth2) return;
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.onload = resolve;
          script.onerror = () => reject(new Error("無法載入 Google 登入元件，請確認網路可連 Google 後重試"));
          document.head.appendChild(script);
        });
      }
      let _driveAccessToken = null;
      let _driveTokenExpiresAt = 0;
      function clearDriveAccessToken() {
        _driveAccessToken = null;
        _driveTokenExpiresAt = 0;
      }
      // ===== iOS：Safari（含「網頁應用程式」）無法開啟 OAuth 彈窗，改以跳轉登入後自動跳回 =====
      function isIOSDevice() {
        return (
          /iPhone|iPod/.test(navigator.userAgent) ||
          /iPad/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        );
      }
      function getDriveTokenViaRedirect(clientId) {
        const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const resume = window.__v2DriveResume || null;
        if (resume) {
          try { sessionStorage.setItem("v2-drive-resume", JSON.stringify(resume)); }
          catch { /* 參數過大無法序列化時，登入完成後提示使用者重試 */ }
        }
        sessionStorage.setItem("v2-drive-oauth-state", state);
        const redirectUri = encodeURIComponent(location.href.split("#")[0]);
        location.href =
          "https://accounts.google.com/o/oauth2/v2/auth" +
          "?client_id=" + encodeURIComponent(clientId) +
          "&redirect_uri=" + redirectUri +
          "&response_type=token" +
          "&scope=" + encodeURIComponent(DRIVE_SCOPE) +
          "&state=" + state +
          "&include_granted_scopes=true";
        return new Promise(() => { /* 頁面跳轉後此 Promise 不再被消費 */ });
      }
      async function resumeDriveExport(resume) {
        if (resume.mode === "xlsx") {
          try {
            await ensureXLSX();
            const workbook = await createRecordsWorkbook(resume.records, resume.fallbackFolderPath || "");
            await uploadRecordsWorkbookToDrive(workbook, resume.fileName);
          } catch (error) {
            GlobalModal.alert("Google 登入完成，但匯出資料無法續傳，請重新選擇匯出：" + error.message);
          }
          return;
        }
        exportRecordsAsZip(resume.records, resume.folders, resume.fileBaseName, resume.photoProfile || "original", resume.destination, resume.cloudBase || "");
      }
      (function handleDriveOAuthRedirect() {
        const hash = location.hash;
        if (!hash || hash.indexOf("access_token=") === -1) return;
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const token = params.get("access_token");
        if (!token) return;
        const state = params.get("state");
        if (state && sessionStorage.getItem("v2-drive-oauth-state") !== state) {
          console.warn("Drive OAuth state 不符，忽略回跳");
          history.replaceState(null, "", location.pathname + location.search);
          return;
        }
        sessionStorage.removeItem("v2-drive-oauth-state");
        _driveAccessToken = token;
        const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
        _driveTokenExpiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
        history.replaceState(null, "", location.pathname + location.search);
        const resumeRaw = sessionStorage.getItem("v2-drive-resume");
        sessionStorage.removeItem("v2-drive-resume");
        if (!resumeRaw) return;
        let resume = null;
        try { resume = JSON.parse(resumeRaw); } catch { /* ignore */ }
        if (!resume) return;
        window.__v2DriveResume = null;
        const run = () => {
          if (resume.type === "backup") driveBackupAction();
          else if (resume.type === "restore") driveRestoreAction();
          else if (resume.type === "delete") driveDeleteAction();
          else if (resume.type === "export") resumeDriveExport(resume);
          else GlobalModal.alert("Google 登入完成，請再按一次原本的功能。");
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
        else setTimeout(run, 300);
      })();
      async function getDriveAccessToken() {
        const clientId = await ensureDriveClientId();
        if (!clientId) throw new Error("尚未設定 Google Client ID，已取消");
        if (_driveAccessToken && _driveTokenExpiresAt > Date.now() + 60000) return _driveAccessToken;
        if (isIOSDevice()) return getDriveTokenViaRedirect(clientId);
        await loadGIS();
        return new Promise((resolve, reject) => {
          let settled = false;
          let popupHandle = null;
          let pollTimer = null;
          const realOpen = window.open;
          const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            if (pollTimer) clearInterval(pollTimer);
            window.open = realOpen;
            if (popupHandle && !popupHandle.closed) { try { popupHandle.close(); } catch { /* ignore */ } }
            fn(arg);
          };
          window.open = (...args) => {
            const opened = realOpen.apply(window, args);
            if (opened) popupHandle = opened;
            return opened;
          };
          pollTimer = setInterval(() => {
            if (popupHandle && popupHandle.closed) {
              finish(reject, new Error("Google 登入視窗已關閉，已取消"));
            }
          }, 300);
          const timeoutId = setTimeout(() => finish(reject, new Error("Google 登入逾時，請重試")), 120000);
          const client = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_SCOPE,
            callback: (resp) => {
              clearTimeout(timeoutId);
              if (resp.error) return finish(reject, new Error("Google 登入失敗：" + (resp.error_description || resp.error)));
              _driveAccessToken = resp.access_token;
              _driveTokenExpiresAt = Date.now() + 3300000;
              finish(resolve, resp.access_token);
            },
          });
          client.requestAccessToken();
        });
      }
      let backupProgressTimer = null;
      function backupProgressShow() {
        document.getElementById("backupProgress").hidden = false;
        clearTimeout(backupProgressTimer);
        backupProgressTimer = setTimeout(backupProgressHide, 30000);
      }
      function backupProgressUpdate(percent, text) {
        backupProgressShow();
        document.getElementById("backupProgressFill").style.width =
          Math.max(0, Math.min(100, percent)) + "%";
        document.getElementById("backupProgressText").textContent = text || "";
      }
      function backupProgressHide() {
        clearTimeout(backupProgressTimer);
        document.getElementById("backupProgress").hidden = true;
        document.getElementById("backupProgressFill").style.width = "0%";
        document.getElementById("backupProgressText").textContent = "";
      }
      async function driveFetch(url, options = {}) {
        const token = await getDriveAccessToken();
        const resp = await fetch(url, {
          ...options,
          headers: { Authorization: "Bearer " + token, ...(options.headers || {}) },
        });
        if (!resp.ok) {
          let detail = "";
          try { detail = (await resp.json()).error?.message || ""; } catch { /* ignore */ }
          throw new Error("Google Drive 請求失敗（" + resp.status + "）" + (detail ? "：" + detail : ""));
        }
        return resp;
      }
      async function uploadZipToDrive(blob, name, onProgress = null, mimeType = "application/zip") {
        const token = await getDriveAccessToken();
        return new Promise((resolve, reject) => {
          const init = new XMLHttpRequest();
          init.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable");
          init.setRequestHeader("Authorization", "Bearer " + token);
          init.setRequestHeader("Content-Type", "application/json");
          init.setRequestHeader("X-Upload-Content-Type", mimeType);
          init.setRequestHeader("X-Upload-Content-Length", String(blob.size));
          init.onload = () => {
            const location = init.getResponseHeader("Location");
            if (init.status < 200 || init.status >= 300 || !location) {
              reject(new Error("Google Drive 未提供上傳位址（" + init.status + "）"));
              return;
            }
            const put = new XMLHttpRequest();
            put.open("PUT", location);
            put.setRequestHeader("Content-Type", mimeType);
            put.upload.onprogress = (event) => {
              if (event.lengthComputable && onProgress) {
                onProgress(Math.round((event.loaded / event.total) * 100));
              }
            };
            put.onload = () => {
              if (put.status >= 200 && put.status < 300) {
                try { resolve(JSON.parse(put.responseText)); }
                catch { resolve({}); }
              } else {
                reject(new Error("上傳失敗（" + put.status + "），請確認網路後重試"));
              }
            };
            put.onerror = () => reject(new Error("上傳失敗，請確認網路後重試"));
            put.send(blob);
          };
          init.onerror = () => reject(new Error("Google Drive 連線失敗，請確認網路後重試"));
          init.send(JSON.stringify({ name, mimeType: "application/zip" }));
        });
      }
      async function listDriveBackups() {
        const query = encodeURIComponent("(name contains '設備地圖備份' or name contains '批次匯出' or name contains '巡視紀錄') and trashed = false");
        const resp = await driveFetch(
          "https://www.googleapis.com/drive/v3/files?q=" + query +
          "&orderBy=createdTime desc&pageSize=20&fields=files(id,name,size,createdTime)"
        );
        return (await resp.json()).files || [];
      }
      async function downloadDriveFile(fileId, onProgress = null) {
        const token = await getDriveAccessToken();
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
          xhr.responseType = "blob";
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
              onProgress(Math.round((event.loaded / event.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
            else reject(new Error("下載失敗（" + xhr.status + "）"));
          };
          xhr.onerror = () => reject(new Error("下載失敗，請確認網路後重試"));
          xhr.send();
        });
      }
      function driveBackupFileName() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return "設備地圖備份_" + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) +
          "_" + pad(now.getHours()) + pad(now.getMinutes()) + ".zip";
      }
      async function driveBackupAction() {
        window.__v2DriveResume = { type: "backup" };
        const button = document.getElementById("driveBackupBtn");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "☁️ 登入 Google 中";
        try {
          await ensureJSZip();
          backupProgressUpdate(2, "準備打包…");
          await getDriveAccessToken();
          normalizeInspectionState();
          const archive = await createPhotoArchive(state.records, state.folders, "土木設備分布地圖照片版完整備份", "original",
            (done, total) => backupProgressUpdate(3 + Math.round((done / Math.max(1, total)) * 57), "打包照片 " + done + " / " + total + "…"));
          button.textContent = "☁️ 上傳中（" + formatStorageBytes(archive.blob.size) + "）";
          backupProgressUpdate(62, "上傳中（" + formatStorageBytes(archive.blob.size) + "）…");
          const fileName = driveBackupFileName();
          await uploadZipToDrive(archive.blob, fileName, (pct) => backupProgressUpdate(62 + Math.round(pct * 0.36), "上傳 " + pct + "%…"));
          backupProgressUpdate(100, "完成");
          saveBackupSummary({
            exportedAt: new Date().toISOString(),
            folders: state.folders.length,
            records: state.records.length,
            photos: archive.photoCount,
            profile: "original",
            encrypted: false,
            formatVersion: BACKUP_FORMAT_VERSION,
            manifestHash: archive.manifestHash,
          });
          GlobalModal.alert("已備份到個人 Google 雲端硬碟：<strong>" + escapeHtml(fileName) + "</strong><br>" +
            state.records.length + " 筆紀錄、" + archive.photoCount + " 張照片（" + formatStorageBytes(archive.blob.size) + "）。<br>" +
            "其他裝置可在「☁️ 從 Drive 還原」選取此檔。<small>備份檔未加密，請勿放入機密照片。</small>");
        } catch (error) {
          console.error("Drive 備份失敗：", error);
          if (!/已取消/.test(error.message)) GlobalModal.alert("Drive 備份失敗：" + error.message);
        } finally {
          clearDriveAccessToken();
          backupProgressHide();
          button.disabled = false;
          button.textContent = originalText;
        }
      }
      function driveBackupRows(files, multi) {
        return files.map((f, i) =>
          '<label style="display:block; padding:6px 4px; border-bottom:1px solid #e2e8f0; cursor:pointer;">' +
          '<input type="' + (multi ? "checkbox" : "radio") + '" name="driveBackupPick" value="' + f.id + '"' + (!multi && i === 0 ? " checked" : "") + "> " +
          "<strong>" + escapeHtml(f.name) + "</strong><br>" +
          '<span style="font-size:12px; color:#64748b; margin-left:20px;">' +
          (f.createdTime ? new Date(f.createdTime).toLocaleString("zh-TW") : "") +
          (f.size ? " · " + formatStorageBytes(Number(f.size)) : "") + "</span></label>"
        ).join("");
      }
      async function driveRestoreAction() {
        window.__v2DriveResume = { type: "restore" };
        const button = document.getElementById("driveRestoreBtn");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "☁️ 讀取雲端備份";
        try {
          const files = await listDriveBackups();
          if (!files.length) {
            GlobalModal.alert("個人雲端硬碟目前沒有「設備地圖備份」或匯出（批次匯出／巡視紀錄）開頭的檔案。");
            return;
          }
          const rows = driveBackupRows(files);
          let downloadOnlyId = "";
          window.__v2DriveDownloadOnly = () => {
            const checked = document.querySelector('input[name="driveBackupPick"]:checked');
            downloadOnlyId = checked ? checked.value : "";
            document.getElementById("gmCancelBtn").click();
          };
          const pickedId = await new Promise(resolve => {
            GlobalModal.show({
              title: "選擇雲端備份",
              content: rows + '<div style="margin-top:8px; font-size:12px; color:#64748b;">ZIP 備份可下載並還原；「僅下載檔案」可將任何雲端檔案（ZIP 或 Excel）存到本機。</div>' +
                '<button type="button" style="margin-top:8px; width:100%; padding:6px 8px; border:1px solid #cbd5e1; border-radius:5px; background:#fff; color:#334155; font-size:12px; cursor:pointer;" onclick="window.__v2DriveDownloadOnly()">⬇️ 僅下載檔案（不還原）</button>',
              type: "confirm",
              confirmText: "下載並還原",
              cancelText: "取消",
              onConfirm: () => {
                const checked = document.querySelector('input[name="driveBackupPick"]:checked');
                resolve(checked ? checked.value : "");
              },
              onCancel: () => resolve(""),
            });
          });
          if (!pickedId && !downloadOnlyId) return;
          const picked = files.find((f) => f.id === (downloadOnlyId || pickedId));
          if (downloadOnlyId) {
            if (!picked) return;
            button.textContent = "⬇️ 下載中";
            backupProgressUpdate(5, "下載中…");
            try {
              const blob = await downloadDriveFile(picked.id, (pct) => backupProgressUpdate(5 + Math.round(pct * 0.85), "下載中 " + pct + "%…"));
              backupProgressUpdate(100, "完成");
              downloadBlob(blob, picked.name);
              GlobalModal.alert("已下載雲端檔案：<strong>" + escapeHtml(picked.name) + "</strong>");
            } catch (error) {
              console.error("雲端檔案下載失敗：", error);
              GlobalModal.alert("雲端檔案下載失敗：" + error.message);
            }
            return;
          }
          if (!/\.zip$/i.test(picked.name)) {
            GlobalModal.alert("此檔不是 ZIP 備份（" + escapeHtml(picked.name) + "），無法還原。可使用「⬇️ 僅下載檔案」先存到本機。");
            return;
          }
          button.textContent = "☁️ 下載中";
          backupProgressUpdate(5, "下載備份…");
          const blob = await downloadDriveFile(pickedId, (pct) => backupProgressUpdate(5 + Math.round(pct * 0.6), "下載備份 " + pct + "%…"));
          backupProgressUpdate(68, "解壓與檢查備份…");
          await processBackupImport(new File([blob], picked.name, { type: "application/zip" }), "", (done, total) => backupProgressUpdate(68 + Math.round((done / Math.max(1, total)) * 28), "解壓照片 " + done + " / " + total + "…"));
          backupProgressUpdate(100, "完成");
        } catch (error) {
          console.error("Drive 還原失敗：", error);
          if (!/已取消/.test(error.message)) GlobalModal.alert("Drive 還原失敗：" + error.message);
        } finally {
          clearDriveAccessToken();
          backupProgressHide();
          button.disabled = false;
          button.textContent = originalText;
        }
      }
      async function driveDeleteAction() {
        window.__v2DriveResume = { type: "delete" };
        const button = document.getElementById("driveDeleteBtn");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "🗑 讀取雲端備份";
        try {
          backupProgressUpdate(5, "讀取雲端備份清單…");
          const files = await listDriveBackups();
          if (!files.length) {
            backupProgressHide();
            GlobalModal.alert("個人雲端硬碟目前沒有「設備地圖備份」開頭的檔案。");
            return;
          }
          backupProgressUpdate(30, "請確認要刪除的備份…");
          const rows = driveBackupRows(files, true);
          const pickedIds = await new Promise(resolve => {
            GlobalModal.show({
              title: "選擇要刪除的雲端備份",
              content: rows + '<div style="margin-top:8px; font-size:12px; color:#64748b;">可勾選多個備份一次刪除，刪除後無法從雲端還原，本機資料不受影響。</div>',
              type: "confirm",
              confirmText: "刪除",
              cancelText: "取消",
              onConfirm: () => {
                const checked = [...document.querySelectorAll('input[name="driveBackupPick"]:checked')];
                resolve(checked.map(c => c.value));
              },
              onCancel: () => resolve([]),
            });
          });
          if (!pickedIds.length) {
            backupProgressHide();
            GlobalModal.alert("未勾選任何備份。");
            return;
          }
          const pickedList = files.filter((f) => pickedIds.includes(f.id));
          const confirmed = await new Promise(resolve => {
            GlobalModal.confirm(
              "確定刪除所選的 <strong>" + pickedList.length + "</strong> 個備份？<br>此操作無法復原（本機資料不受影響）。",
              () => resolve(true),
              () => resolve(false)
            );
          });
          if (!confirmed) return;
          button.textContent = "🗑 刪除中";
          for (let i = 0; i < pickedList.length; i++) {
            backupProgressUpdate(40 + Math.round((i / Math.max(1, pickedList.length)) * 55), "刪除中 " + (i + 1) + " / " + pickedList.length + "…");
            await driveFetch("https://www.googleapis.com/drive/v3/files/" + pickedList[i].id, { method: "DELETE" });
          }
          backupProgressUpdate(100, "完成");
          GlobalModal.alert("已刪除 " + pickedList.length + " 個雲端備份。");
        } catch (error) {
          console.error("Drive 刪除失敗：", error);
          if (!/已取消/.test(error.message)) GlobalModal.alert("Drive 刪除失敗：" + error.message);
        } finally {
          clearDriveAccessToken();
          backupProgressHide();
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      async function exportSystemBackup() {
        try { await ensureJSZip(); } catch (e) { GlobalModal.alert(e.message); return; }
        await runSystemBackup("");
      }

      async function runSystemBackup(password = "") {
        const button = document.getElementById("exportSystemBtn");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = password ? "⏳ 加密備份中" : "⏳ 打包中";
        try {
          backupProgressUpdate(2, "準備打包…");
          normalizeInspectionState();
          const archive = await createPhotoArchive(
            state.records,
            state.folders,
            "土木設備分布地圖照片版完整備份",
            "original",
            (done, total) => backupProgressUpdate(3 + Math.round((done / Math.max(1, total)) * 62), "打包照片 " + done + " / " + total + "…")
          );
          backupProgressUpdate(68, password ? "加密中…" : "產生 ZIP…");
          const encryptedArchive = await encryptBackupBlob(archive.blob, password);
          backupProgressUpdate(100, "完成");
          const fileExtension = encryptedArchive.encrypted ? ".zip.enc" : ".zip";
          downloadBlob(encryptedArchive.blob, `土木設備照片版完整備份_${new Date().toISOString().slice(0, 10)}${fileExtension}`);
          saveBackupSummary({
            exportedAt: new Date().toISOString(),
            folders: state.folders.length,
            records: state.records.length,
            photos: archive.photoCount,
            profile: "original",
            encrypted: encryptedArchive.encrypted,
            formatVersion: BACKUP_FORMAT_VERSION,
            manifestHash: archive.manifestHash,
          });
          GlobalModal.alert(`完整備份已建立：${state.records.length} 筆紀錄、${archive.photoCount} 張照片。${encryptedArchive.encrypted ? "此檔案已加密，請妥善保存密碼。" : "ZIP 內含 manifest.json，可在還原前檢查完整性。"}`);
        } catch (error) {
          console.error("完整備份失敗：", error);
          GlobalModal.alert("完整備份失敗：" + error.message);
        } finally {
          backupProgressHide();
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      async function restoreBackupData(parsed, photoEntries = [], replacePhotos = true) {
        if (!parsed || !Array.isArray(parsed.folders) || !Array.isArray(parsed.records)) throw new Error("備份格式錯誤");
        if (replacePhotos) await replacePhotoStore(photoEntries);
        state.folders = parsed.folders;
        state.records = parsed.records;
        state.lastFolderId = state.records.length > 0 ? state.records[state.records.length - 1].folderId : null;
        normalizeInspectionState();
        state.hiddenRecordFolders.clear();
        state.expandedFolders.clear();
        state.selectedFolders.clear();
        state.selectedRecords.clear();
        beginEditPhotos(null);
        await clearEditDraft();
        saveToLocalStorage();
        renderer.redraw();
        renderPhotoBrowser();
        refreshStorageStatus();
        const folderSelect = document.getElementById("sidebar-folder");
        if (folderSelect) folderSelect.innerHTML = getFolderOptionsHtml(state.lastFolderId);
      }

      async function mergeZipBackup(file) {
        await ensureJSZip();
        const imported = await importZipBackup(file);
        const existingFolderIds = new Set(state.folders.map(folder => folder.id));
        const existingRecordIds = new Set(state.records.map(record => record.id));
        const localPhotoIds = new Set();
        for (const record of state.records) {
          for (const photo of record.photos || []) localPhotoIds.add(photo.id);
        }
        const newFolders = imported.parsed.folders.filter(folder => !existingFolderIds.has(folder.id));
        const allFolderIds = new Set([...existingFolderIds, ...newFolders.map(folder => folder.id)]);
        newFolders.forEach(folder => {
          if (folder.parentId && !allFolderIds.has(folder.parentId)) folder.parentId = null;
        });
        const newRecords = [];
        let photoMergedRecords = 0;
        for (const remote of imported.parsed.records) {
          if (!existingRecordIds.has(remote.id)) {
            newRecords.push(remote);
            continue;
          }
          const local = state.records.find(record => record.id === remote.id);
          const photosById = new Map((local.photos || []).map(photo => [photo.id, photo]));
          for (const photo of remote.photos || []) {
            if (!photosById.has(photo.id)) photosById.set(photo.id, photo);
          }
          const mergedPhotos = [...photosById.values()];
          if (mergedPhotos.length !== (local.photos || []).length) {
            local.photos = mergedPhotos;
            photoMergedRecords++;
          }
        }
        let photoAdded = 0, photoSkipped = 0;
        for (const entry of imported.photoEntries || []) {
          if (localPhotoIds.has(entry.id)) { photoSkipped++; continue; }
          if (await photoDbRequest("readonly", store => store.get(entry.id))) { photoSkipped++; continue; }
          await putPhotoBlob(entry.id, entry.blob);
          photoAdded++;
        }
        state.folders.push(...newFolders);
        state.records.push(...newRecords);
        normalizeInspectionState();
        saveToLocalStorage();
        renderer.redraw();
        renderPhotoBrowser();
        refreshStorageStatus();
        const folderSelect = document.getElementById("sidebar-folder");
        if (folderSelect) folderSelect.innerHTML = getFolderOptionsHtml(state.lastFolderId);
        return { folderCount: newFolders.length, recordCount: newRecords.length, photoMergedRecords, photoAdded, photoSkipped };
      }

      async function verifyZipManifest(zip, manifest) {
        if (!manifest || !Array.isArray(manifest.files)) {
          return { valid: true, legacy: true, checked: 0, errors: [] };
        }
        const errors = [];
        let checked = 0;
        for (const expected of manifest.files) {
          const entry = zip.file(expected.path);
          if (!entry || entry.dir) {
            errors.push(`${expected.path} 遺失`);
            continue;
          }
          const blob = await entry.async("blob");
          checked++;
          if (Number(expected.bytes) !== blob.size) errors.push(`${expected.path} 大小不符`);
          if (expected.sha256) {
            const actual = await sha256Hex(blob);
            if (actual !== expected.sha256) errors.push(`${expected.path} SHA-256 不符`);
          }
        }
        return { valid: errors.length === 0, legacy: false, checked, errors };
      }

      async function importZipBackup(file, onProgress = null) {
        await ensureJSZip();
        const zip = await JSZip.loadAsync(file);
        const recordsEntry = zip.file("records.json");
        if (!recordsEntry) throw new Error("找不到 records.json，這不是照片版完整備份");
        const parsed = JSON.parse(await recordsEntry.async("string"));
        if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.records)) throw new Error("records.json 格式錯誤");
        const manifestEntry = zip.file("manifest.json");
        const manifest = manifestEntry ? JSON.parse(await manifestEntry.async("string")) : null;
        const integrity = await verifyZipManifest(zip, manifest);
        if (!integrity.valid) throw new Error(`完整性檢查失敗：${integrity.errors.slice(0, 4).join("、")}`);

        const metaById = new Map(parsed.records.flatMap(record => (record.photos || []).map(photo => [photo.id, photo])));
        const photoPrefixes = [...metaById.keys()].map(id => [id + "_", id]).sort((a, b) => b[0].length - a[0].length);
        const photoEntries = [];
        let photoDone = 0;
        for (const path of Object.keys(zip.files)) {
          const entry = zip.files[path];
          if (entry.dir || !path.startsWith("photos/")) continue;
          const fileName = path.split("/").pop();
          const photoId = photoPrefixes.find(([prefix]) => fileName.startsWith(prefix))?.[1];
          if (!photoId) continue;
          const photo = metaById.get(photoId);
          const blob = normalizePhotoBlob(await entry.async("blob"), photo);
          photoEntries.push({ id: photoId, blob });
          photoDone++;
          if (onProgress) onProgress(photoDone, Math.max(1, metaById.size));
        }
        const metadataPhotos = [...metaById.values()];
        return {
          parsed,
          photoEntries,
          manifest,
          integrity,
          summary: {
            fileBytes: Number(file.size) || 0,
            folderCount: parsed.folders.length,
            recordCount: parsed.records.length,
            photoCount: photoEntries.length,
            metadataPhotoCount: metadataPhotos.length,
            photoBytes: photoEntries.reduce((total, entry) => total + (Number(entry.blob?.size) || 0), 0),
            profile: parsed.photoProfile || manifest?.photoProfile || "unknown",
            formatVersion: parsed.backupFormatVersion || manifest?.backupFormatVersion || 2,
          },
        };
      }

      async function getImportCapacitySummary(requiredBytes) {
        try {
          const estimate = await navigator.storage?.estimate?.();
          const remaining = Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage)
            ? Math.max(0, estimate.quota - estimate.usage)
            : null;
          return {
            quota: Number.isFinite(estimate?.quota) ? estimate.quota : null,
            remaining,
            enough: remaining === null ? null : requiredBytes <= remaining,
          };
        } catch { return { quota: null, remaining: null, enough: null }; }
      }

      async function confirmBackupRestore(fileName, imported, isZip) {
        const summary = imported.summary || {
          fileBytes: 0,
          folderCount: imported.parsed.folders.length,
          recordCount: imported.parsed.records.length,
          photoCount: 0,
          photoBytes: 0,
          profile: "records-only",
          formatVersion: imported.parsed.version || 1,
        };
        const capacity = await getImportCapacitySummary(summary.photoBytes || 0);
        const integrity = imported.integrity;
        const integrityText = !isZip
          ? "JSON 紀錄檔：未包含 ZIP 檔案清單"
          : integrity?.legacy
            ? "舊版備份：未包含 manifest.json，僅完成基本格式檢查"
            : integrity?.valid
              ? `完整性檢查通過（${imported.manifest?.checksum || "檔案清單"}，${integrity.checked} 個檔案）`
              : "完整性檢查未通過";
        const capacityText = capacity.remaining === null
          ? "瀏覽器未提供可用空間估算"
          : `目前可用：約 ${formatStorageBytes(capacity.remaining)}${capacity.enough === false ? "，可能不足" : ""}`;
        const warning = capacity.enough === false
          ? "<br><strong style='color:#b91c1c'>警告：照片預估容量超過目前可用空間，請先清理或改用壓縮版備份。</strong>"
          : "";
        const photoProfile = summary.profile === "compressed" ? "壓縮版" : summary.profile === "original" ? "原圖" : "未標示";
        GlobalModal.show({
          title: "還原前資料預覽",
          content: `<strong>${escapeHtml(fileName)}</strong><br><br>
            資料夾數：${summary.folderCount}<br>
            紀錄數：${summary.recordCount}<br>
            照片數：${summary.photoCount}${summary.metadataPhotoCount && summary.metadataPhotoCount !== summary.photoCount ? `（索引 ${summary.metadataPhotoCount} 張）` : ""}<br>
            照片版本：${photoProfile}<br>
            ZIP 大小：${formatStorageBytes(summary.fileBytes || 0)}<br>
            解壓後照片預估：${formatStorageBytes(summary.photoBytes || 0)}<br>
            ${capacityText}<br>
            ${integrityText}${warning}<br><br>
            還原會覆蓋目前的資料夾與紀錄。${isZip ? "照片資料庫也會依 ZIP 內容替換。" : "JSON 不含照片，現有照片檔案會保留。"}`,
          type: "confirm",
          confirmText: capacity.enough === false ? "仍要還原" : "確認還原",
          cancelText: "取消",
          onConfirm: async () => {
            try {
              await restoreBackupData(imported.parsed, imported.photoEntries || [], isZip);
              GlobalModal.alert(isZip ? "完整備份還原成功！" : "紀錄還原成功！JSON 不含照片，現有照片已保留。");
            } catch (error) {
              console.error("還原失敗：", error);
              GlobalModal.alert("還原失敗：" + error.message);
            }
          },
        });
      }

      async function processBackupImport(file, password = "", onProgress = null) {
        let source = file;
        const encrypted = await isEncryptedBackupFile(file);
        if (encrypted) source = await decryptBackupFile(file, password);
        if (/\.zip$/i.test(file.name) || encrypted || file.type === "application/zip") {
          const imported = await importZipBackup(source, onProgress);
          await confirmBackupRestore(file.name, imported, true);
          return;
        }
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.records)) throw new Error("格式錯誤");
        await confirmBackupRestore(file.name, {
          parsed,
          photoEntries: [],
          summary: {
            fileBytes: file.size,
            folderCount: parsed.folders.length,
            recordCount: parsed.records.length,
            photoCount: 0,
            profile: "records-only",
            formatVersion: parsed.backupFormatVersion || parsed.version || 1,
          },
        }, false);
      }

      document.getElementById("exportSystemBtn").addEventListener("click", exportSystemBackup);
      document.getElementById("importSystemBtn").addEventListener("click", () => document.getElementById("importSystemInput").click());
      document.getElementById("driveBackupBtn").addEventListener("click", driveBackupAction);
      document.getElementById("driveRestoreBtn").addEventListener("click", driveRestoreAction);
      document.getElementById("driveDeleteBtn").addEventListener("click", driveDeleteAction);
      document.getElementById("importSystemInput").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        try {
          backupProgressUpdate(5, "讀取備份…");
          if (await isEncryptedBackupFile(file)) {
            GlobalModal.prompt(
              "此備份已加密，請輸入密碼",
              "",
              async password => {
                try {
                  await processBackupImport(file, password, (done, total) => backupProgressUpdate(10 + Math.round((done / Math.max(1, total)) * 75), "解壓照片 " + done + " / " + total + "…"));
                  backupProgressUpdate(100, "完成");
                }
                catch (error) { GlobalModal.alert("讀取加密備份失敗：" + error.message); }
                finally { backupProgressHide(); }
              },
              { inputType: "password", confirmText: "解密並檢查", cancelText: "取消", onCancel: () => backupProgressHide() }
            );
            return;
          }
          await processBackupImport(file, "", (done, total) => backupProgressUpdate(10 + Math.round((done / Math.max(1, total)) * 75), "解壓照片 " + done + " / " + total + "…"));
          backupProgressUpdate(100, "完成");
        } catch (error) {
          GlobalModal.alert("讀取備份失敗：" + error.message);
        } finally {
          backupProgressHide();
        }
      });

      // ==========================================
      // Popup 相關函式
      // ==========================================
      function googleMapsPinUrl(point) {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        const query = Number.isFinite(lat) && Number.isFinite(lng)
          ? `${lat.toFixed(6)},${lng.toFixed(6)}`
          : `${point.lat},${point.lng}`;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      }
      function googleNavUrl(point) { return googleMapsPinUrl(point); }



      // ==========================================
      // 全頁 click / input 事件委派
      // ==========================================
      document.addEventListener("click", async (e) => {
        const editPanelEl = document.getElementById("defectEditPanel");
        const editToggleEl = document.getElementById("defectEditToggle");
        const isInsideEdit = e.target.closest?.("#defectEditPanel, #defectEditToggle");
        if (!isInsideEdit && editPanelEl && !editPanelEl.hasAttribute("hidden")) {
          const openAnother = e.target.closest?.("#v2AddressToggle, #mapSearchToggle, #layerMenuToggle, #v2CadastreToggle, #v2SyncToggle, #v2AddressPanel, #mapSearchPanel, #layerMenuPanel, #v2CadastrePanel, #v2SyncPanel");
          if (openAnother) closeDefectEditPanel();
        }
        const statHeader = e.target.closest('.defect-stat-header');
        if (statHeader) {
          const recordsDiv = statHeader.nextElementSibling, arrow = statHeader.querySelector('.defect-stat-arrow');
          const isOpen = recordsDiv.style.display !== 'none';
          document.querySelectorAll('.defect-stat-header').forEach(h => {
            if (h !== statHeader) { h.nextElementSibling.style.display = 'none'; const a = h.querySelector('.defect-stat-arrow'); if (a) a.style.transform = ''; }
          });
          recordsDiv.style.display = isOpen ? 'none' : 'block';
          arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
          return;
        }

        const statRecord = e.target.closest('.defect-stat-record');
        if (statRecord) { jumpToRecord(statRecord.dataset.folderId, statRecord.dataset.recordId); return; }

        const gotoLink = e.target.closest(".goto-folder-link");
        if (gotoLink) { jumpToRecord(gotoLink.dataset.folderId, gotoLink.dataset.recordId); return; }

        if (e.target.id === "sidebar-correction-flag") {
          const container = document.getElementById("sidebar-correct-code-container");
          const input = document.getElementById("sidebar-correct-code-input");
          if (e.target.checked) {
            container.style.display = "flex";
            input.focus();
          } else {
            container.style.display = "none";
            input.value = "";
          }
        }

        const gpsCodeButton = e.target.closest("#btn-fill-gps-code");
        if (gpsCodeButton) {
          const btn = gpsCodeButton;
          const input = document.getElementById("sidebar-correct-code-input");
          if (!navigator.geolocation) { GlobalModal.alert("您的裝置不支援 GPS 定位功能。"); return; }

          const originalText = btn.textContent;
          btn.textContent = "⏳ 定位中...";
          btn.disabled = true;
          btn.style.opacity = "0.7";

          try {
            const pos = await getBestCurrentPosition({ maximumAge: 8000, timeout: 12000 });
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const tpcCode = latLngToTpcCode(lat, lng);

            if (tpcCode && tpcCode !== "座標超出範圍") {
              input.value = tpcCode;
            } else {
              input.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }

            btn.textContent = "✅ 已帶入";
            btn.style.background = "#dcfce7"; btn.style.color = "#16a34a"; btn.style.borderColor = "#86efac"; btn.style.opacity = "1";
            setTimeout(() => {
              btn.textContent = originalText; btn.disabled = false;
              btn.style.background = "#fee2e2"; btn.style.color = "#b91c1c"; btn.style.borderColor = "#fca5a5";
            }, 2000);
          } catch (err) {
            console.error("GPS 定位失敗:", err);
            btn.textContent = "❌ 定位失敗"; btn.style.opacity = "1";
            setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
            GlobalModal.alert("無法取得位置，請確認手機的 GPS 定位權限是否開啟！");
          }
          return;
        }

        const defectChipBtn = e.target.closest(".defect-chip-btn");
        if (defectChipBtn) {
          const inputEl = document.getElementById("sidebar-defect-input");
          if (inputEl) {
            inputEl.value = defectChipBtn.dataset.val;
            updateSidebarIconPreview();
            scheduleEditDraftSave();
            const originalBg = defectChipBtn.style.background;
            defectChipBtn.style.background = "#bae6fd";
            setTimeout(() => { defectChipBtn.style.background = originalBg; }, 150);
          }
          return;
        }

        const iconChipBtn = e.target.closest(".icon-chip-btn");
        if (iconChipBtn && e.target.id !== "sidebar-icon-auto-btn") {
          const iconInput = document.getElementById("sidebar-icon-input");
          if (!iconInput) return;

          const selectedIcon = iconChipBtn.dataset.icon;
          iconInput.value = selectedIcon;

          document.querySelectorAll("#tabEdit .icon-chip-btn").forEach(btn => {
            btn.classList.toggle("is-selected", btn.dataset.icon === selectedIcon);
          });

          updateSidebarIconPreview();
          scheduleEditDraftSave();
          return;
        }

        if (e.target.id === "sidebar-icon-auto-btn") {
          document.getElementById("sidebar-icon-input").value = "";
          document.querySelectorAll("#tabEdit .icon-chip-btn").forEach(btn => btn.classList.remove("is-selected"));
          updateSidebarIconPreview();
          scheduleEditDraftSave();
          return;
        }

        if (e.target.id === "toggle-manual-icon-btn") {
          const iconGroups = document.getElementById("sidebar-icon-groups");

          if (iconGroups.style.display === "none") {
            iconGroups.style.display = "flex";
            e.target.textContent = "▲ 隱藏面板";
            e.target.style.background = "#eef8f9";
          } else {
            iconGroups.style.display = "none";
            e.target.textContent = "✎ 手動修改";
            e.target.style.background = "transparent";
          }
          return;
        }

        if (e.target.id === "sidebarSaveBtn") {
          const lat = parseFloat(document.getElementById("editLat").value);
          const lng = parseFloat(document.getElementById("editLng").value);
          const code = document.getElementById("editCode").value;
          const folderId = document.getElementById("sidebar-folder").value;
          const customName = document.getElementById("sidebar-name-input").value.trim() || "手動新增設備";
          const defect = document.getElementById("sidebar-defect-input").value.trim();
          const urgency = document.getElementById("sidebar-urgency").value;
          const customIcon = document.getElementById("sidebar-icon-input").value.trim();

          const needCorrection = document.getElementById("sidebar-correction-flag").checked;
          const correctCode = needCorrection ? document.getElementById("sidebar-correct-code-input").value.trim() : "";

          const editRecordId = document.getElementById("editRecordId").value;

          if (isNaN(lat) || isNaN(lng)) return;

          if (!folderId) {
            if (state.folders.length > 0) {
              const optionsHtml = `<option value="CREATE_NEW">➕ 建立新資料夾...</option>` + getFolderOptionsHtml().replace('<option value="">(請選擇資料夾)</option>', '');

              GlobalModal.select("📂 選擇或建立資料夾", "尚未選擇儲存位置，請選擇現有資料夾或建立新的：", optionsHtml, (selectedValue) => {
                if (selectedValue === "CREATE_NEW") {
                  setTimeout(() => {
                    GlobalModal.prompt("請輸入新資料夾名稱來建立：", "", (newName) => {
                      if (newName && newName.trim()) {
                        const newId = generateId();
                        state.folders.push({ id: newId, name: newName.trim(), parentId: null });
                        state.expandedFolders.add(newId);
                        saveToLocalStorage();

                        const folderSelect = document.getElementById("sidebar-folder");
                        folderSelect.innerHTML = getFolderOptionsHtml(newId);
                        folderSelect.value = newId;
                        document.getElementById("sidebarSaveBtn").click();
                      }
                    });
                  }, 150);
                } else if (selectedValue) {
                  const folderSelect = document.getElementById("sidebar-folder");
                  folderSelect.value = selectedValue;
                  document.getElementById("sidebarSaveBtn").click();
                }
              });
            } else {
              GlobalModal.prompt("目前尚未建立任何資料夾，請先建立資料夾：", "", (newName) => {
                if (newName && newName.trim()) {
                  const newId = generateId();
                  state.folders.push({ id: newId, name: newName.trim(), parentId: null });
                  state.expandedFolders.add(newId);
                  saveToLocalStorage();

                  const folderSelect = document.getElementById("sidebar-folder");
                  folderSelect.innerHTML = getFolderOptionsHtml(newId);
                  folderSelect.value = newId;
                  document.getElementById("sidebarSaveBtn").click();
                }
              });
            }
            return;
          }

          state.lastFolderId = folderId;

          const collisionRecord = state.records.find(
            r => r.folderId === folderId &&
                 isSameMapPoint(r, { lat, lng, code }) &&
                 r.id !== editRecordId
          );

          const performSave = async () => {
            const conflictPhotos = collisionRecord && collisionRecord.id !== editRecordId ? (collisionRecord.photos || []) : [];
            const finalRecordId = editRecordId || collisionRecord?.id || generateId();
            const finalExistingPhotos = [...editPhotoState.existing, ...conflictPhotos]
              .filter((photo, index, photos) => photo?.id && photos.findIndex(item => item.id === photo.id) === index);
            const finalPhotos = [...finalExistingPhotos];
            const removedPhotoIds = editPhotoState.originalExisting
              .filter(photo => !finalExistingPhotos.some(item => item.id === photo.id))
              .map(photo => photo.id);
            const writtenPhotoIds = [];
            try {
              for (const pending of editPhotoState.pending) {
                await putPhotoBlob(pending.meta.id, pending.blob);
                writtenPhotoIds.push(pending.meta.id);
                finalPhotos.push(pending.meta);
              }
            } catch (error) {
              await Promise.all(writtenPhotoIds.map(deletePhotoBlob));
              GlobalModal.alert("照片儲存失敗，巡檢紀錄尚未變更：" + error.message);
              return;
            }
            if (editRecordId) {
              state.records = state.records.filter(r => r.id !== editRecordId);
            }

            if (collisionRecord) {
              state.records = state.records.filter(r => r.id !== collisionRecord.id);
            }

            state.records.push({
              id: finalRecordId,
              lat, lng, name: customName, code, folderId, defect, urgency,
              icon: customIcon || undefined,
              photos: finalPhotos,
              needCorrection,
              correctCode
            });

            saveToLocalStorage();
            try { localStorage.setItem(LAST_SAVE_DATE_KEY, getTodayLocalStr()); } catch {}
            await clearEditDraft();
            refreshStorageStatus();
            deleteRecordPhotos([{ photos: removedPhotoIds.map(id => ({ id })) }]).catch(error => console.warn("移除舊照片失敗：", error));
            beginEditPhotos(state.records.find(record => record.id === finalRecordId));
            map.closePopup();

            const btn = document.getElementById("sidebarSaveBtn");
            btn.textContent = "✅ 已儲存";
            btn.style.background = "#16a34a";
            setTimeout(() => {
              btn.textContent = "💾 儲存紀錄";
              btn.style.background = "";
            }, 2000);

            if (isMobileLayout()) {
              setStatus("✅ 已儲存紀錄");
              window.setTimeout(() => {
                setPanelCollapsed(true);
                document.getElementById("panelToggle").setAttribute("aria-expanded", "false");
                document.getElementById("panelToggle").title = "展開面板";
              }, 450);
              window.setTimeout(() => setStatus(""), 2200);
            }
          };

          if (collisionRecord) {
            GlobalModal.confirm(
              `⚠️ 目標資料夾內已存在相同座標的設備：\n「${escapeHtml(collisionRecord.name || collisionRecord.code)}」\n\n按下「確定」將覆蓋該筆紀錄，按下「取消」請重新選擇資料夾。`,
              () => {
                performSave();
              }
            );
          } else {
            performSave();
          }
        }
      });

      document.addEventListener("input", (e) => {
        if (e.target.id === "sidebar-defect-input") {
          updateSidebarIconPreview();
        }
        if (e.target.closest("#tabEdit") && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
          scheduleEditDraftSave();
        }
      });
      document.addEventListener("change", (e) => {
        if (e.target.closest("#tabEdit") && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
          scheduleEditDraftSave();
        }
      });

      function updateRecordMarkers() {
        recordsLayer.clearLayers();
        const visibleRecords = state.records.filter(r => !state.hiddenRecordFolders.has(r.folderId));
        for (const record of visibleRecords) {
          const icon = getRecordIcon(record);

          const bgColor = record.needCorrection ? "#be185d" : getBadgeBgColor(icon);

          // [修改] 移除 if 判斷，讓巡視紀錄的「標籤+圖示」永遠完整顯示！
          const labelColor = colorForEquipmentName(record.name);
          const htmlContent = `
            <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, calc(-100% + 12px)); width:max-content;">
              <span class="point-label-chip" style="--label-color:${labelColor}; margin-bottom:2px;">${escapeHtml(record.name || record.code)}</span>
              <div class="saved-badge-marker" style="background-color: ${bgColor};">${icon}</div>
            </div>`;
          const iconAnchor = [0, 0];

          L.marker([record.lat, record.lng], {
            icon: L.divIcon({ className: "", html: htmlContent, iconSize: [0, 0], iconAnchor }),
          }).on("click", () => {
            L.popup({ autoPanPadding: [10, 10] })
              .setLatLng([record.lat, record.lng])
              .setContent(miniPopupHtml(record))
              .openOn(map);
            openEditPanel(record);
          }).addTo(recordsLayer);
        }
      }

      // ==========================================
      // 工具函式
      // ==========================================
      function setStatus(text) { statusBox.textContent = text; }
      function escapeHtml(value) {
        const map = {
          '&': '&' + 'amp;',
          '<': '&' + 'lt;',
          '>': '&' + 'gt;',
          '"': '&' + 'quot;',
          "'": '&' + '#39;'
        };
        return String(value ?? "").replace(/[&<>"']/g, m => map[m]);
      }

      function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
      }
      function isSameMapPoint(a, b) {
        if (!a || !b) return false;
        const sameCode = a.code && b.code && String(a.code) === String(b.code);
        const sameLatLng = Math.abs(Number(a.lat) - Number(b.lat)) < 0.0000001
          && Math.abs(Number(a.lng) - Number(b.lng)) < 0.0000001;
        return sameCode || sameLatLng;
      }
      function formatNumber(value) { return new Intl.NumberFormat("zh-TW").format(value); }
      function debounce(fn, wait = 180) {
        let timer = 0; return (...args) => { window.clearTimeout(timer); timer = window.setTimeout(() => fn(...args), wait); };
      }
      function codePrefix(code) {
        const match = String(code || "").trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z]\d{4})/);
        return match ? match[1] : (String(code || "").trim().slice(0, 5) || "未知");
      }
      function searchResultRank(point, search) {
        if (hasSearchTerm(point, search.terms)) return 0;
        if (search.prefixes.includes(codePrefix(point.code))) return 1;
        return 2;
      }
      function parseSearchQuery(query) {
        const tokens = String(query || "").trim().split(/[.\s,，、;；|｜/／]+/).map(t => t.trim()).filter(Boolean);
        const prefixes = [], terms = [];
        for (const t of tokens) { const n = t.toUpperCase(); if (/^[A-Z]\d{4}$/.test(n)) { if (!prefixes.includes(n)) prefixes.push(n); } else terms.push(t.toLowerCase()); }
        return { prefixes, terms };
      }
      function pointSearchText(point) { return `${point.name || ""} ${point.code || ""} ${codePrefix(point.code)}`.toLowerCase(); }
      function hasSearchTerm(point, terms) { if (!terms.length) return false; const text = pointSearchText(point); return terms.some(term => text.includes(term)); }
      function matchesSearch(point, search) {
        if (!search.prefixes.length && !search.terms.length) return true;
        return search.prefixes.includes(codePrefix(point.code)) || hasSearchTerm(point, search.terms);
      }
      function pointInBounds(point, bounds) {
        return point.lat >= bounds.getSouth() && point.lat <= bounds.getNorth() && point.lng >= bounds.getWest() && point.lng <= bounds.getEast();
      }
      function matchesFilters(point) {
        // 巡視紀錄不受區域過濾影響
        if (state.area && point.area !== "📂 巡視紀錄" && point.area !== state.area) return false;
        return matchesSearch(point, state.search);
      }
      function visibleFilteredPoints() {
        const bounds = map.getBounds(), output = [];
        for (const point of state.points) { if (pointInBounds(point, bounds) && matchesFilters(point)) output.push(point); }
        return output;
      }

      // ==========================================
      // 設備配色系統
      // ==========================================
      const EQUIPMENT_COLOR_PALETTE = [
        { color: "#b91c1c", hue: 0   }, { color: "#2563eb", hue: 220 },
        { color: "#15803d", hue: 145 }, { color: "#d97706", hue: 35  },
        { color: "#7e22ce", hue: 275 }, { color: "#0f766e", hue: 175 },
        { color: "#be185d", hue: 335 }, { color: "#4d7c0f", hue: 95  },
        { color: "#4338ca", hue: 245 }, { color: "#c2410c", hue: 20  },
        { color: "#047857", hue: 155 }, { color: "#0e7490", hue: 195 },
        { color: "#a21caf", hue: 295 }, { color: "#854d0e", hue: 45  },
        { color: "#1d4ed8", hue: 225 }, { color: "#64748b", hue: 215 },
      ];
      const PREFIX_COLORS = EQUIPMENT_COLOR_PALETTE.map(({ color }) => color);
      const EQUIPMENT_COLOR_HUES = new Map(EQUIPMENT_COLOR_PALETTE.map(({ color, hue }) => [color, hue]));
      const NEARBY_EQUIPMENT_THRESHOLD = 220;
      const UNKNOWN_EQUIPMENT_PREFIX = "未分類", UNKNOWN_EQUIPMENT_COLOR = "#64748b";

      function hashText(value) { let hash = 0; for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash; }
      function colorForPrefix(prefix) {
        const h = hashText(prefix), hue = (h * 137.508) % 360, sat = 58 + (h % 22), lit = 30 + (h % 16);
        return `hsl(${hue.toFixed(0)}, ${sat}%, ${lit}%)`;
      }
      function equipmentNamePrefix(name) {
        const match = String(name || "").trim().match(/^[\u3400-\u9fff]+/);
        return match ? match[0].slice(0, 4) : UNKNOWN_EQUIPMENT_PREFIX;
      }
      function equipmentRoutePrefix(name) {
        const match = String(name || "").trim().match(/^[\u3400-\u9fff]+/);
        return match ? match[0].slice(0, 4) : "";
      }
      const ROUTE_EXCLUDED_PREFIXES = new Set(["配電室", "亭置式", "地上配", "地下配"]);
      function shouldExcludeRoutePoint(point) {
        const name = String(point?.name || "").trim();
        return [...ROUTE_EXCLUDED_PREFIXES].some(prefix => name.startsWith(prefix));
      }
      function routeNumberKey(name) {
        const text = String(name || "");
        const main = text.match(/^[\u3400-\u9fff]+(\d+)/);
        const sideTokens = [...text.matchAll(/(左|右|前|後)(\d+)/g)]
          .map(m => `${m[1] === "左" || m[1] === "前" ? 0 : 1}:${String(m[2]).padStart(4, "0")}`);
        const branchTokens = [...text.matchAll(/[A-Z](\d*)|\d+/gi)].map(m => m[0]).join(":");
        return [
          main ? String(parseInt(main[1], 10)).padStart(6, "0") : "999999",
          sideTokens.join("|"),
          branchTokens,
          text
        ].join("|");
      }
      function routePointDistance(a, b) {
        return map.distance([a.lat, a.lng], [b.lat, b.lng]);
      }
      function routeColor(prefix) {
        return state.equipmentColorMap.get(prefix) || colorForPrefix(prefix);
      }
      function buildRouteGroups(points) {
        const groups = new Map();
        for (const point of points) {
          if (shouldExcludeRoutePoint(point)) continue;
          const prefix = equipmentRoutePrefix(point.name);
          if (!prefix || prefix === UNKNOWN_EQUIPMENT_PREFIX) continue;
          if (!groups.has(prefix)) groups.set(prefix, []);
          groups.get(prefix).push(point);
        }
        return [...groups.entries()]
          .filter(([, groupPoints]) => groupPoints.length >= 3)
          .sort(([aPrefix, aPoints], [bPrefix, bPoints]) => bPoints.length - aPoints.length || compareNatural(aPrefix, bPrefix));
      }
      function routeEdgeLimit(points) {
        const nearestDistances = points.map((point, index) => {
          let nearest = Infinity;
          for (let i = 0; i < points.length; i++) {
            if (i === index) continue;
            nearest = Math.min(nearest, routePointDistance(point, points[i]));
          }
          return nearest;
        }).filter(Number.isFinite).sort((a, b) => a - b);
        const median = nearestDistances[Math.floor(nearestDistances.length / 2)] || 90;
        return Math.max(80, Math.min(420, median * 4.2));
      }
      function buildRouteEdges(points) {
        const ordered = [...points].sort((a, b) => routeNumberKey(a.name).localeCompare(routeNumberKey(b.name), "zh-Hant", { numeric: true }));
        const maxEdge = routeEdgeLimit(ordered);
        const edges = [];
        for (let i = 0; i < ordered.length; i++) {
          const candidates = [];
          for (let j = i + 1; j < ordered.length; j++) {
            const seqGap = Math.abs(j - i);
            if (seqGap > 14) break;
            const distance = routePointDistance(ordered[i], ordered[j]);
            if (distance <= maxEdge) candidates.push({ a: i, b: j, distance, seqGap });
          }
          candidates.sort((a, b) => a.distance - b.distance || a.seqGap - b.seqGap);
          edges.push(...candidates.slice(0, 3));
        }
        edges.sort((a, b) => a.distance - b.distance || a.seqGap - b.seqGap);
        const parent = ordered.map((_, i) => i);
        const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
        const routeEdges = [];
        for (const edge of edges) {
          const rootA = find(edge.a), rootB = find(edge.b);
          if (rootA === rootB) continue;
          parent[rootA] = rootB;
          routeEdges.push([ordered[edge.a], ordered[edge.b]]);
        }
        return routeEdges;
      }
      function routeLabelPoints(edges) {
        const candidates = [];
        for (const [a, b] of edges) {
          candidates.push({
            lat: (a.lat + b.lat) / 2,
            lng: (a.lng + b.lng) / 2,
            weight: routePointDistance(a, b),
          });
        }
        candidates.sort((a, b) => b.weight - a.weight);
        const targetCount = Math.max(1, Math.min(6, Math.ceil(edges.length / 18)));
        const selected = [];
        const minGap = map.getZoom() >= 17 ? 90 : 150;
        for (const candidate of candidates) {
          if (selected.length >= targetCount) break;
          const tooClose = selected.some(existing => map.distance([existing.lat, existing.lng], [candidate.lat, candidate.lng]) < minGap);
          if (!tooClose) selected.push(candidate);
        }
        if (!selected.length && candidates.length) selected.push(candidates[0]);
        return selected;
      }
      function updateRouteLayer() {
        routeLayer.clearLayers();
        const btn = document.getElementById("routeLayerToggle");
        if (btn) {
          btn.classList.toggle("is-active", state.routeLayerVisible);
          btn.setAttribute("aria-pressed", String(state.routeLayerVisible));
        }
        syncLayerMenuState();
        if (!state.routeLayerVisible || !state.points.length) return;

        const sourcePoints = visibleFilteredPoints();
        if (sourcePoints.length < 3) {
          setStatus("目前視窗沒有足夠點位可形成路線");
          return;
        }
        if (sourcePoints.length > MAX_ROUTE_POINTS) {
          setStatus("路線點位過多，請放大地圖後再開啟路線圖層");
          return;
        }
        const groups = buildRouteGroups(sourcePoints);
        let routeCount = 0;
        for (const [prefix, groupPoints] of groups.slice(0, 80)) {
          const color = routeColor(prefix);
          const edges = buildRouteEdges(groupPoints);
          for (const edge of edges) {
            routeCount++;
            const latLngs = edge.map(point => [point.lat, point.lng]);
            L.polyline(latLngs, {
              color: "#fff",
              weight: 8,
              opacity: 0.38,
              lineCap: "round",
              lineJoin: "round",
              interactive: false,
              pane: "routePane",
            }).addTo(routeLayer);
            L.polyline(latLngs, {
              color,
              weight: 5,
              opacity: 0.78,
              lineCap: "round",
              lineJoin: "round",
              interactive: false,
              pane: "routePane",
            }).addTo(routeLayer);
          }
          for (const labelPoint of routeLabelPoints(edges)) {
            L.marker([labelPoint.lat, labelPoint.lng], {
              icon: L.divIcon({
                className: "route-prefix-label",
                html: `<span style="--route-color:${color}">${escapeHtml(prefix)}</span>`,
                iconSize: null,
                iconAnchor: [24, 18],
              }),
              interactive: false,
              pane: "routePane",
            }).addTo(routeLayer);
          }
        }
        if (routeCount === 0) setStatus("目前視窗沒有足夠點位可形成路線");
      }
      function disableRouteLayerForTools() {
        if (!state.routeLayerVisible) return false;
        state.routeLayerVisible = false;
        routeLayer.clearLayers();
        const routeBtn = document.getElementById("routeLayerToggle");
        if (routeBtn) {
          routeBtn.classList.remove("is-active");
          routeBtn.classList.add("is-hidden");
          routeBtn.setAttribute("aria-pressed", "false");
        }
        state.labelsHidden = false;
        const labelsBtn = document.getElementById("toggleLabelsBtn");
        if (labelsBtn) labelsBtn.classList.remove("is-hidden");
        syncMobileMapControls();
        syncLayerMenuState();
        renderer.redraw();
        updateRecordMarkers();
        return true;
      }

      const canvasLayer = L.Layer.extend({
        onAdd(currentMap) {
          this.canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated");
          this.canvas.style.pointerEvents = "none";
          this.context = this.canvas.getContext("2d");
          currentMap.getPanes().overlayPane.appendChild(this.canvas);
          currentMap.on("moveend zoomend resize", this.redraw, this);
          this.redraw();
        },
        onRemove(currentMap) { L.DomUtil.remove(this.canvas); currentMap.off("moveend zoomend resize", this.redraw, this); },
        redraw() {
          if (!this.canvas || !state.points.length) return;
          const size = map.getSize(), topLeft = map.containerPointToLayerPoint([0, 0]);
          L.DomUtil.setPosition(this.canvas, topLeft);
          this.canvas.width  = size.x; this.canvas.height = size.y;
          this.canvas.style.width = `${size.x}px`; this.canvas.style.height = `${size.y}px`;
          const ctx = this.context; ctx.clearRect(0, 0, size.x, size.y);
         // [新增] 只要按下隱藏，就直接清空畫布並中斷，讓背景的彩色方塊與圓點徹底消失！
          if (state.labelsHidden) {
            state.drawnItems = [];
            updateLabels();
            updateStats();
            updateRouteLayer();
            return;
          }
          state.visiblePoints = visibleFilteredPoints();
          if (map.getZoom() >= SHOW_POINTS_ZOOM && state.visiblePoints.length <= MAX_DIRECT_POINTS) {
            state.displayMode = "point";
            state.drawnItems = state.visiblePoints.map(p => { const pixel = map.latLngToContainerPoint([p.lat, p.lng]); return { type: "point", point: p, x: pixel.x, y: pixel.y, count: 1 }; });
            state.equipmentColorMap = buildEquipmentColorMap(state.drawnItems);
            drawPoints(ctx, state.drawnItems);
          } else {
            state.displayMode = "prefix";
            const groups = new Map();
            for (const point of state.visiblePoints) {
              const prefix = codePrefix(point.code); let group = groups.get(prefix);
              if (!group) { group = { type: "prefix", prefix, count: 0, latSum: 0, lngSum: 0 }; groups.set(prefix, group); }
              group.count++; group.latSum += point.lat; group.lngSum += point.lng;
            }
            state.drawnItems = placePrefixLabels(
              [...groups.values()].map(g => { const lat = g.latSum / g.count, lng = g.lngSum / g.count, pixel = map.latLngToContainerPoint([lat, lng]); return { ...g, lat, lng, x: pixel.x, y: pixel.y }; }).sort((a, b) => b.count - a.count)
            );
            drawPrefixLabels(ctx, state.drawnItems);
          }
          updateLabels(); updateStats(); updateRouteLayer();
        },
      });
      const renderer = new canvasLayer().addTo(map);

      function circularHueDistance(a, b) { const diff = Math.abs(a - b) % 360; return Math.min(diff, 360 - diff); }
      function colorContrastScore(color, usedNeighborColors) {
        if (!usedNeighborColors.length) return 180;
        const hue = EQUIPMENT_COLOR_HUES.get(color) ?? hashText(color) % 360;
        return Math.min(...usedNeighborColors.map(usedColor => circularHueDistance(hue, EQUIPMENT_COLOR_HUES.get(usedColor) ?? hashText(usedColor) % 360)));
      }
      function groupScreenGap(a, b) {
        const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX), dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
        return Math.sqrt(dx * dx + dy * dy);
      }
      function buildEquipmentColorMap(items) {
        const groups = new Map();
        for (const item of items) {
          const prefix = equipmentNamePrefix(item.point.name); if (prefix === UNKNOWN_EQUIPMENT_PREFIX) continue;
          let group = groups.get(prefix);
          if (!group) { group = { prefix, count: 0, xSum: 0, ySum: 0, minX: item.x, maxX: item.x, minY: item.y, maxY: item.y, color: "" }; groups.set(prefix, group); }
          group.count++; group.xSum += item.x; group.ySum += item.y;
          group.minX = Math.min(group.minX, item.x); group.maxX = Math.max(group.maxX, item.x);
          group.minY = Math.min(group.minY, item.y); group.maxY = Math.max(group.maxY, item.y);
        }
        const colorMap = new Map([[UNKNOWN_EQUIPMENT_PREFIX, UNKNOWN_EQUIPMENT_COLOR]]);
        const colorUse = new Map(PREFIX_COLORS.map(c => [c, 0]));
        const sortedGroups = [...groups.values()].map(g => ({ ...g, x: g.xSum / g.count, y: g.ySum / g.count })).sort((a, b) => b.count - a.count);
        const adjacency = new Map(sortedGroups.map(group => [group.prefix, new Set()]));
        for (let i = 0; i < sortedGroups.length; i++) {
          for (let j = i + 1; j < sortedGroups.length; j++) {
            if (groupScreenGap(sortedGroups[i], sortedGroups[j]) < NEARBY_EQUIPMENT_THRESHOLD) {
              adjacency.get(sortedGroups[i].prefix).add(sortedGroups[j].prefix);
              adjacency.get(sortedGroups[j].prefix).add(sortedGroups[i].prefix);
            }
          }
        }
        const orderedGroups = [...sortedGroups].sort((a, b) => { const d = adjacency.get(b.prefix).size - adjacency.get(a.prefix).size; if (d !== 0) return d; if (b.count !== a.count) return b.count - a.count; return compareNatural(a.prefix, b.prefix); });
        for (const group of orderedGroups) {
          const usedNeighborColors = [...adjacency.get(group.prefix)].map(prefix => colorMap.get(prefix)).filter(Boolean);
          const start = hashText(group.prefix) % PREFIX_COLORS.length;
          const rankedColors = PREFIX_COLORS.map((_, i) => PREFIX_COLORS[(start + i) % PREFIX_COLORS.length]).sort((a, b) => { const cd = colorContrastScore(b, usedNeighborColors) - colorContrastScore(a, usedNeighborColors); return cd !== 0 ? cd : (colorUse.get(a) || 0) - (colorUse.get(b) || 0); });
          group.color = rankedColors[0]; colorMap.set(group.prefix, group.color); colorUse.set(group.color, (colorUse.get(group.color) || 0) + 1);
        }
        return colorMap;
      }
      function colorForEquipmentName(name) { return state.equipmentColorMap.get(equipmentNamePrefix(name)) || colorForPrefix(equipmentNamePrefix(name)); }
      function drawPoints(ctx, items) {
        for (const item of items) {
          ctx.beginPath(); ctx.arc(item.x, item.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = colorForEquipmentName(item.point.name); ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"; ctx.stroke();
        }
      }
      let currentPrefixColors = new Map();
      function buildPrefixColorsByProximity(items) {
        const THRESHOLD = 160;
        const adj = new Map(items.map(it => [it.prefix, new Set()]));
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const dx = items[i].x - items[j].x, dy = items[i].y - items[j].y;
            if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) { adj.get(items[i].prefix).add(items[j].prefix); adj.get(items[j].prefix).add(items[i].prefix); }
          }
        }
        const sorted = [...items].sort((a, b) => adj.get(b.prefix).size - adj.get(a.prefix).size);
        const colorIdx = new Map();
        for (const { prefix } of sorted) { const usedIdx = new Set([...adj.get(prefix)].map(n => colorIdx.get(n)).filter(v => v !== undefined)); let c = 0; while (usedIdx.has(c)) c++; colorIdx.set(prefix, c); }
        const result = new Map();
        for (const [prefix, idx] of colorIdx) { const hue = (idx * 60 + Math.floor(idx / 6) * 30) % 360, sat = 65 + (idx % 3) * 10, lit = 28 + (idx % 2) * 12; result.set(prefix, `hsl(${hue}, ${sat}%, ${lit}%)`); }
        return result;
      }
      function drawPrefixLabels(ctx, items) {
        currentPrefixColors = buildPrefixColorsByProximity(items);
        for (const item of items) {
          const color = currentPrefixColors.get(item.prefix) || colorForPrefix(item.prefix);
          const label = `${item.prefix} · ${formatNumber(item.count)}`;
          const width = Math.max(74, Math.min(128, 28 + label.length * 7)), height = 30;
          const x = item.x - width / 2, y = item.y - height / 2;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, width, height, 8); else ctx.rect(x, y, width, height);
          ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "800 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(label, item.x, item.y + 0.5);
          item.hitBox = { x, y, width, height };
        }
      }
      function placePrefixLabels(items) {
        const occupied = new Set(), output = [];
        const gridW = map.getZoom() <= 10 ? 52 : 36, gridH = map.getZoom() <= 10 ? 28 : 20;
        for (const item of items) {
          const key = `${Math.floor(item.x / gridW)}:${Math.floor(item.y / gridH)}`;
          if (occupied.has(key)) continue; occupied.add(key); output.push(item);
          if (output.length >= 900) break;
        }
        return output;
      }
      function updateLabels() {
        labelsLayer.clearLayers();
        if (state.labelsHidden || state.displayMode !== "point" || state.visiblePoints.length > MAX_POINT_LABELS) return;
        for (const point of state.visiblePoints) {
          const labelColor = colorForEquipmentName(point.name);
          L.marker([point.lat, point.lng], {
            icon: L.divIcon({ className: "point-label", html: `<span class="point-label-chip" style="--label-color:${labelColor}">${escapeHtml(point.name)}</span>`, iconSize: null, iconAnchor: [-8, 20] }),
          }).on("click", () => {
            L.popup({ autoPanPadding: [10, 10] })
              .setLatLng([point.lat, point.lng])
              .setContent(miniPopupHtml(point))
              .openOn(map);
            openEditPanel(point);
          }).addTo(labelsLayer);
        }
      }
      function updateStats() {
        totalCount.textContent   = formatNumber(state.points.length);
        visibleCount.textContent = formatNumber(state.labelsHidden ? 0 : state.visiblePoints.length);
        drawCount.textContent    = formatNumber(state.drawnItems.length);
      }
      function fillAreas() {
        for (const area of state.meta?.areas || []) {
          const option = document.createElement("option"); option.value = area.name; option.textContent = `${area.name} (${formatNumber(area.count)})`; areaSelect.append(option);
        }
      }

      document.getElementById("toggleLabelsBtn").addEventListener("click", (e) => {
        state.labelsHidden = !state.labelsHidden;
        e.currentTarget.classList.toggle("is-hidden", state.labelsHidden);
        syncMobileMapControls();
        syncLayerMenuState();
        renderer.redraw(); updateRecordMarkers();
        try { e.currentTarget.blur(); } catch (err) {}
      });
      document.getElementById("routeLayerToggle").addEventListener("click", (e) => {
        state.routeLayerVisible = !state.routeLayerVisible;
        if (state.routeLayerVisible) {
          closeMapSearchPanel();
          collapsePanelControl();
          state.labelsHidden = true;
          document.getElementById("toggleLabelsBtn").classList.add("is-hidden");
          syncMobileMapControls();
          renderer.redraw();
        } else {
          updateRouteLayer();
        }
        syncLayerMenuState();
        if (state.routeLayerVisible) setStatus("已顯示設備開頭推估路線");
        window.setTimeout(() => setStatus(""), 1800);
        try { e.currentTarget.blur(); } catch (err) {}
      });

      document.getElementById("tpcGridToggle").addEventListener("click", (e) => {
        tpcGrid.visible = !tpcGrid.visible;
        const btn = document.getElementById("tpcGridToggle");
        btn.classList.toggle("is-active", tpcGrid.visible);
        btn.classList.toggle("is-hidden", !tpcGrid.visible);
        btn.setAttribute("aria-pressed", String(tpcGrid.visible));
        buildTpcGridLayer();
        updateTpcGridReadout();
        syncLayerMenuState();
        setStatus(tpcGrid.visible ? "已顯示圖號網格；精確圖號請看地圖上方中心讀值" : "已隱藏圖號網格");
        window.setTimeout(() => setStatus(""), 1800);
        try { e.currentTarget.blur(); } catch (err) {}
      });
      map.on("moveend zoomend", () => {
        updateTpcGridReadout();
        if (!tpcGrid.visible) return;
        if (tpcGrid.buildTimer) clearTimeout(tpcGrid.buildTimer);
        tpcGrid.buildTimer = setTimeout(buildTpcGridLayer, 60);
      });

      areaSelect.addEventListener("change", applyFilter);
      const TPC_NINE_DIGIT_IDLE_MS = 1000;
      let searchInputTimer = 0;
      function scheduleSearchInput() {
        window.clearTimeout(searchInputTimer);
        const code = normalizeTpcCode(searchInput.value);
        const delay = code && code.length === 9
          ? TPC_NINE_DIGIT_IDLE_MS
          : (code && code.length === 11 ? 0 : 180);
        searchInputTimer = window.setTimeout(() => {
          searchInputTimer = 0;
          applyFilter();
        }, delay);
      }
      function applySearchInputImmediately() {
        window.clearTimeout(searchInputTimer);
        searchInputTimer = 0;
        applyFilter();
      }
      searchInput.addEventListener("input", scheduleSearchInput);
      searchInput.addEventListener("keydown", event => {
        if (event.key !== "Enter" || !normalizeTpcCode(searchInput.value)) return;
        event.preventDefault();
        applySearchInputImmediately();
      });

      let tpcSearchMarker = null;
      let activeTpcSearchCode = "";

      function clearTpcSearchLocation() {
        if (tpcSearchMarker) {
          tpcSearchMarker.closePopup();
          map.removeLayer(tpcSearchMarker);
          tpcSearchMarker = null;
        }
        activeTpcSearchCode = "";
      }

      document.addEventListener("click", event => {
        const clearButton = event.target instanceof Element ? event.target.closest("[data-clear-tpc-location]") : null;
        if (!clearButton) return;
        event.preventDefault();
        clearTpcSearchLocation();
      });

      function tpcSearchCoordinateText(location) {
        return `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
      }

      function finishTpcSearchLocation(code) {
        if (activeTpcSearchCode !== code) return;
        closeMapSearchPanel();
        searchInput.value = "";
        applyFilter({ preserveTpcLocation: true });
        // 保留定位標記與 popup，但清除 active code，讓下次輸入同一圖號仍會重新飛行。
        activeTpcSearchCode = "";
      }

      function focusTpcSearchLocation(location, options = {}) {
        const shouldFly = options.force || activeTpcSearchCode !== location.code || !tpcSearchMarker;
        activeTpcSearchCode = location.code;
        if (!tpcSearchMarker) {
          tpcSearchMarker = L.circleMarker([location.lat, location.lng], {
            color: "#b45309",
            fillColor: "#f59e0b",
            fillOpacity: 0.9,
            radius: 9,
            weight: 3,
          }).addTo(map);
        } else {
          tpcSearchMarker.setLatLng([location.lat, location.lng]);
        }

        const coordinateText = tpcSearchCoordinateText(location);
        tpcSearchMarker.bindPopup(`<div class="popup-layout" style="min-width:180px; text-align:center;"><div class="popup-title">📍 圖號座標定位</div><div class="popup-meta" style="font-weight:800; margin-bottom:3px;">${escapeHtml(location.code)}</div><div class="popup-meta">${escapeHtml(coordinateText)}</div><div class="popup-action-row"><a class="popup-navigation-link" href="${googleNavUrl(location)}" target="_blank" rel="noopener">🗺️ 導航</a><button class="popup-clear-location-button" type="button" data-clear-tpc-location>✕ 清除定位</button></div></div>`);
        if (!shouldFly) return;

        map.closePopup();
        let completed = false;
        const complete = () => {
          if (completed || activeTpcSearchCode !== location.code) return;
          completed = true;
          tpcSearchMarker?.openPopup();
          finishTpcSearchLocation(location.code);
        };
        map.once("moveend", complete);
        window.setTimeout(complete, 900);
        map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 20), { duration: 0.45 });
      }

      function renderTpcCoordinateResult(location) {
        results.replaceChildren();
        const button = document.createElement("button");
        button.type = "button";
        button.className = "result-item tpc-coordinate-result";
        const title = document.createElement("strong");
        title.textContent = "📍 已依圖號座標定位";
        const code = document.createElement("span");
        code.textContent = location.code;
        const coordinate = document.createElement("span");
        coordinate.className = "tpc-coordinate-result-meta";
        coordinate.textContent = `經緯度 ${tpcSearchCoordinateText(location)}`;
        const note = document.createElement("span");
        note.textContent = "此位置沒有相符的設備清單資料";
        button.append(title, code, coordinate, note);
        button.addEventListener("click", () => focusTpcSearchLocation(location, { force: true }));
        results.append(button);
      }

      function applyFilter(options = {}) {
        disableRouteLayerForTools();
        state.area = areaSelect.value; state.query = searchInput.value.trim(); state.search = parseSearchQuery(state.query);
        const matches = searchMatches(state.search);
        const code = matches.length ? null : normalizeTpcCode(state.query);
        const coordinates = code ? tpcCodeToLatLng(code) : null;
        if (coordinates) {
          const location = { ...coordinates, code };
          focusTpcSearchLocation(location);
          renderTpcCoordinateResult(location);
        } else {
          if (!options.preserveTpcLocation) clearTpcSearchLocation();
          renderResults(matches);
        }
        renderer.redraw();
      }

      // ★ 修改後的 searchMatches：支援僅區域無關鍵字時列出點位，巡視紀錄不受區域過濾
      function searchMatches(search) {
        // 若無搜尋詞且無區域 → 空結果
        if (!search.prefixes.length && !search.terms.some(t => t.length >= 2) && !state.area) {
          return [];
        }

        const outputMap = new Map();

        // 1. 搜尋基礎圖資 (巡視紀錄例外，跳過區域過濾)
        for (const point of state.points) {
          if (state.area && point.area !== state.area && point.area !== "📂 巡視紀錄") continue;
          if (matchesSearch(point, search)) {
            outputMap.set(`${point.lat},${point.lng}`, point);
          }
        }

        // 2. 搜尋巡視紀錄
        for (const record of state.records) {
          if (matchesSearch(record, search)) {
            outputMap.set(`${record.lat},${record.lng}`, {
              ...record,
              area: "📂 巡視紀錄"
            });
          }
        }

        // 3. 排序並取前50筆
        return Array.from(outputMap.values())
          .sort((a, b) => {
            const r = searchResultRank(a, search) - searchResultRank(b, search);
            return r !== 0 ? r : comparePointsByName(a, b);
          })
          .slice(0, 50);
      }

function renderDefectStats() {
        const el = document.getElementById('defectStatsContent'); if (!el) return;

        // ★ 1. 獨立抓出所有勾選「需修正」的紀錄
        const correctionRecords = state.records.filter(r => r.needCorrection);

        // 2. 原本的不良項目分組邏輯
        const grouped = new Map();
        for (const r of state.records) {
          const d = (r.defect || '').trim(); if (!d || d === '無') continue;
          if (!grouped.has(d)) grouped.set(d, []); grouped.get(d).push(r);
        }
        const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

        // 若無任何不良與修正，顯示空狀態
        if (!sorted.length && !correctionRecords.length) {
          el.innerHTML = '<p style="color:#999;font-size:12px;margin:4px 0;">尚無不良或需修正紀錄</p>';
          return;
        }

        const max = sorted.length > 0 ? sorted[0][1].length : 1;
        const total = sorted.reduce((sum, [, recs]) => sum + recs.length, 0);

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0 8px; margin-bottom:8px; border-bottom:2px solid var(--line); font-weight:bold; font-size:13px;"><span style="color:var(--muted);">總計不良數</span><span style="color:var(--accent-dark);">${total} 筆</span></div>`;

        // 幫助產生內部紀錄列表的短函數
        const buildRecordsHtml = (recs) => recs.map(r => `
          <div class="defect-stat-record" data-record-id="${r.id}" data-folder-id="${r.folderId}"
            style="padding:5px 8px; cursor:pointer; border-radius:4px; font-size:12px; background:#f8fafc; margin-bottom:3px; border:1px solid var(--line);">
            <div style="font-weight:bold; color:var(--accent-dark);">
              <span style="display:inline-block; padding:1px 5px; border-radius:8px; font-size:10px; color:#fff; background-color:${getBadgeBgColor(getRecordIcon(r))}; vertical-align:middle; margin-right:2px;">${getRecordIcon(r)}</span>
              ${escapeHtml(r.name || r.code)}
              ${r.needCorrection ? '<span style="background-color:#b91c1c; color:#fff; font-size:10px; font-weight:bold; padding:2px 4px; border-radius:4px; margin-left:4px;">🔧圖號不符</span>' : ''}
            </div>
            <div style="color:var(--muted); font-size:11px; margin-top:1px;">📂 ${escapeHtml(getFullFolderPath(r.folderId))}</div>
          </div>`).join('');

        // ★ 3. 渲染特別獨立出來的「圖資需修正」專屬區塊 (置頂、醒目紅色)
        if (correctionRecords.length > 0) {
          html += `
            <div style="border:1px dashed #fca5a5; background:#fef2f2; border-radius:6px; margin-bottom:12px;">
              <div class="defect-stat-header" style="display:flex; align-items:center; gap:8px; padding:8px; cursor:pointer; user-select:none;">
                <span class="defect-stat-arrow" style="font-size:10px; color:#b91c1c; transition:transform 0.2s;">▶</span>
                <span style="flex:1; font-size:15px; color:#b91c1c; font-weight:bold;">⚠️ 圖號座標需修正</span>
                <span style="font-weight:bold; font-size:13px; color:#fff; background:#b91c1c; padding:2px 8px; border-radius:12px;">${correctionRecords.length}</span>
              </div>
              <div class="defect-stat-records" style="display:none; padding:0 8px 8px 12px;">${buildRecordsHtml(correctionRecords)}</div>
            </div>`;
        }

        // 4. 渲染原本的不良項目統計
        html += sorted.map(([name, recs]) => {
          const count = recs.length;
          return `
            <div style="border-bottom:1px solid #f1f5f9;">
              <div class="defect-stat-header" style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; user-select:none;">
                <span class="defect-stat-arrow" style="font-size:10px; color:var(--muted); transition:transform 0.2s;">▶</span>
                <span style="flex:1; font-size:15px; color:var(--text);">${escapeHtml(name)}</span>
                <div style="width:80px; background:#e2e8f0; border-radius:4px; height:8px; overflow:hidden;">
                  <div style="width:${Math.round(count / max * 100)}%; background:var(--accent); height:100%; border-radius:4px;"></div>
                </div>
                <span style="font-weight:bold; font-size:13px; color:var(--accent-dark); min-width:24px; text-align:right;">${count}</span>
              </div>
              <div class="defect-stat-records" style="display:none; padding:0 0 6px 12px;">${buildRecordsHtml(recs)}</div>
            </div>`;
        }).join('');

        el.innerHTML = html;
      }

      document.getElementById('scrollTopBtn').addEventListener('click', () => { document.querySelector('.folders-section').scrollTo({ top: 0, behavior: 'smooth' }); });
      document.getElementById('scrollBotBtn').addEventListener('click', () => { const el = document.querySelector('.folders-section'); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });
      document.getElementById('statsScrollTopBtn').addEventListener('click', () => { document.getElementById('defectStatsContent').scrollTo({ top: 0, behavior: 'smooth' }); });
      document.getElementById('statsScrollBotBtn').addEventListener('click', () => { const el = document.getElementById('defectStatsContent'); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });
      document.getElementById('photoScrollTopBtn').addEventListener('click', () => { document.querySelector('.photo-browser')?.scrollTo({ top: 0, behavior: 'smooth' }); });
      document.getElementById('photoScrollBotBtn').addEventListener('click', () => { const el = document.querySelector('.photo-browser'); el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });

      function renderResults(items) {
        results.innerHTML = "";
        if (!items.length) {
          const message = state.query
            ? "找不到相符設備。可輸入完整圖號座標，例如 M9993HC1197。"
            : "請輸入設備關鍵字或圖號座標。";
          results.innerHTML = `<p class="popup-meta">${message}</p>`;
          return;
        }
        for (const point of items) {
          const fragment = resultTemplate.content.cloneNode(true);
          fragment.querySelector("strong").textContent = point.name || "未命名";
          fragment.querySelector("span").textContent   = `${point.area || ""} / ${point.code || ""}`;
          fragment.querySelector("button").addEventListener("click", () => {
            disableRouteLayerForTools();
            map.flyTo([point.lat, point.lng], map.getMaxZoom(), { duration: 0.45 });
            L.popup({ autoPanPadding: [10, 10] }).setLatLng([point.lat, point.lng]).setContent(miniPopupHtml(point)).openOn(map);
            document.getElementById("mapSearchPanel").classList.remove("is-open");
            searchInput.value = ""; applyFilter();
          });
          results.append(fragment);
        }
      }

      map.on("click", (e) => {
        disableRouteLayerForTools();
        if (state.displayMode === "prefix") {
          const prefix = state.drawnItems.find(item => { const b = item.hitBox; return b && e.containerPoint.x >= b.x && e.containerPoint.x <= b.x + b.width && e.containerPoint.y >= b.y && e.containerPoint.y <= b.y + b.height; });
          if (prefix) map.flyTo([prefix.lat, prefix.lng], Math.max(map.getZoom() + 2, SHOW_POINTS_ZOOM), { duration: 0.45 });
        } else {
          if (state.labelsHidden) return;
          let best = null, bestDist = 16;
          for (const point of state.visiblePoints.slice(0, 6000)) { const dist = map.latLngToContainerPoint([point.lat, point.lng]).distanceTo(e.containerPoint); if (dist < bestDist) { best = point; bestDist = dist; } }
          if (best) {
            // 開啟迷你導航視窗，並聯動開啟側邊欄編輯表單
            L.popup({ autoPanPadding: [10, 10] }).setLatLng([best.lat, best.lng]).setContent(miniPopupHtml(best)).openOn(map);
            openEditPanel(best);
          }
        }
      });

      map.on("dragstart zoomstart", () => {
        collapseFloatingControls();
        pauseLocationFollowForMapInteraction();
      });

      map.on("contextmenu", (e) => {
        disableRouteLayerForTools();
        const { lat, lng } = e.latlng, code = latLngToTpcCode(lat, lng);
        const newPoint = { lat, lng, name: "手動新增設備", code, area: "自訂" };
        L.popup({ autoPanPadding: [10, 10] }).setLatLng([lat, lng]).setContent(miniPopupHtml(newPoint)).openOn(map);
        openEditPanel(newPoint); // ⬅️ 同步開啟左側編輯表單
      });

      // ==========================================
      // 定位功能
      // ==========================================
      let locationMarker = null, locationCircle = null, locationWatchId = null;
      const LOCATION_OPTIONS = Object.freeze({
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      });
      const LOCATION_FOLLOW_ZOOM = 19;
      const LOCATION_MIN_PAN_DISTANCE = 8;
      const LOCATION_PAN_INTERVAL = 900;
      const LOCATION_STALE_AFTER = 15000;
      const LOCATION_MAX_CIRCLE_RADIUS = 2000;
      const locationTracking = {
        follow: true,
        lastLatLng: null,
        lastPosition: null,
        lastReceivedAt: 0,
        followAnchor: null,
        lastFollowAt: 0,
        programmaticMoveUntil: 0,
        sessionId: 0,
        state: "idle",
        freshnessTimer: null,
      };

      const locationElements = {
        panel: document.getElementById("locationInfoPanel"),
        status: document.getElementById("locationStatus"),
        accuracy: document.getElementById("locationAccuracy"),
        tpcCode: document.getElementById("locationTpcCode"),
        latLng: document.getElementById("locationLatLng"),
        updatedAt: document.getElementById("locationUpdatedAt"),
        followButton: document.getElementById("locationFollowBtn"),
        addRecordButton: document.getElementById("locationAddRecordBtn"),
        locateButton: document.getElementById("locateButton"),
      };

      function formatLocationCode(lat, lng) {
        const code = String(latLngToTpcCode(lat, lng) || "").trim().toUpperCase();
        return /^[A-Z]\d{4}[A-Z]{2}\d{4}$/.test(code) ? code : "--";
      }

      function getPositionTimestamp(position) {
        const timestamp = Number(position?.timestamp);
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
      }

      function formatLocationTime(timestamp) {
        if (!timestamp) return "--";
        return new Date(timestamp).toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
      }

      function formatLocationAge(age) {
        if (!Number.isFinite(age) || age < 2000) return "剛剛";
        const seconds = Math.floor(age / 1000);
        if (seconds < 60) return `${seconds} 秒前`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes} 分鐘前`;
      }

      function getLocationAccuracy(position) {
        const accuracy = Number(position?.coords?.accuracy);
        return Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
      }

      function formatLocationAccuracy(position) {
        const accuracy = getLocationAccuracy(position);
        if (!accuracy) return "精度 --";
        return `精度 ±${Math.max(1, Math.round(accuracy))}m`;
      }

      function setLocationStatus(text, state = "active") {
        const { panel, status } = locationElements;
        if (!panel || !status) return;
        panel.dataset.state = state;
        panel.classList.toggle("is-stale", state === "stale");
        panel.classList.toggle("is-error", state === "error");
        status.className = `location-status is-${state}`;
        status.textContent = text;
      }

      function updateLocationFollowButton() {
        const button = locationElements.followButton;
        if (!button) return;
        const following = locationTracking.follow;
        button.classList.toggle("is-active", following);
        button.setAttribute("aria-pressed", following ? "true" : "false");
        button.textContent = following ? "⌖ 跟隨地圖" : "↻ 回到定位";
        button.title = following ? "地圖跟隨目前定位" : "恢復地圖跟隨目前定位";
        button.disabled = !locationTracking.lastLatLng;
        if (locationElements.addRecordButton) locationElements.addRecordButton.disabled = !locationTracking.lastLatLng;
      }

      function updateLocationInfo(position) {
        const { panel, accuracy, tpcCode, latLng, updatedAt } = locationElements;
        if (!panel) return;
        const { latitude, longitude } = position.coords;
        const receivedAt = locationTracking.lastReceivedAt || Date.now();
        if (tpcCode) tpcCode.textContent = formatLocationCode(latitude, longitude);
        if (latLng) latLng.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        if (accuracy) accuracy.textContent = formatLocationAccuracy(position);
        if (updatedAt) updatedAt.textContent = `${formatLocationTime(getPositionTimestamp(position))}（${formatLocationAge(Date.now() - receivedAt)}）`;
        panel.hidden = false;
        setLocationStatus(locationTracking.follow ? "已定位" : "手動瀏覽", "active");
        updateLocationFollowButton();
      }

      function updateLocationFreshness() {
        if (!locationTracking.lastReceivedAt || !locationElements.panel) return;
        const age = Date.now() - locationTracking.lastReceivedAt;
        if (locationElements.updatedAt) {
          const timestamp = getPositionTimestamp(locationTracking.lastPosition);
          locationElements.updatedAt.textContent = `${formatLocationTime(timestamp)}（${formatLocationAge(age)}）`;
        }
        if (locationTracking.state === "active" && age > LOCATION_STALE_AFTER) {
          locationTracking.state = "stale";
          setLocationStatus("訊號中斷", "stale");
        }
      }

      function startLocationFreshnessTimer() {
        if (locationTracking.freshnessTimer !== null) return;
        locationTracking.freshnessTimer = window.setInterval(updateLocationFreshness, 1000);
      }

      function stopLocationFreshnessTimer() {
        if (locationTracking.freshnessTimer !== null) {
          window.clearInterval(locationTracking.freshnessTimer);
          locationTracking.freshnessTimer = null;
        }
      }

      function removeLocationLayers() {
        if (locationMarker) { map.removeLayer(locationMarker); locationMarker = null; }
        if (locationCircle) { map.removeLayer(locationCircle); locationCircle = null; }
      }

      function resetLocationInfo() {
        const { panel, accuracy, tpcCode, latLng, updatedAt } = locationElements;
        if (panel) {
          panel.hidden = true;
          panel.dataset.state = "idle";
          panel.classList.remove("is-stale", "is-error");
        }
        if (accuracy) accuracy.textContent = "精度 --";
        if (tpcCode) tpcCode.textContent = "--";
        if (latLng) latLng.textContent = "--";
        if (updatedAt) updatedAt.textContent = "--";
        if (locationElements.status) {
          locationElements.status.className = "location-status";
          locationElements.status.textContent = "尚未定位";
        }
      }

      function getLocationCircleRadius(position) {
        const accuracy = getLocationAccuracy(position);
        return Math.min(LOCATION_MAX_CIRCLE_RADIUS, Math.max(5, accuracy || 30));
      }

      function centerMapOnLocation(initialFix = false, force = false) {
        if (!locationTracking.lastLatLng || !locationTracking.follow) return;
        const now = Date.now();
        const distanceFromAnchor = locationTracking.followAnchor
          ? map.distance(locationTracking.followAnchor, locationTracking.lastLatLng)
          : Infinity;
        if (!initialFix && !force && distanceFromAnchor < LOCATION_MIN_PAN_DISTANCE) return;
        if (!initialFix && !force && now - locationTracking.lastFollowAt < LOCATION_PAN_INTERVAL) return;

        const shouldZoom = initialFix || force;
        const zoom = shouldZoom ? Math.max(map.getZoom(), LOCATION_FOLLOW_ZOOM) : map.getZoom();
        locationTracking.followAnchor = locationTracking.lastLatLng;
        locationTracking.lastFollowAt = now;
        locationTracking.programmaticMoveUntil = now + (shouldZoom ? 1400 : 700);
        if (shouldZoom) map.flyTo(locationTracking.lastLatLng, zoom, { duration: 0.45 });
        else map.panTo(locationTracking.lastLatLng, { animate: true, duration: 0.35 });
      }

      function pauseLocationFollowForMapInteraction() {
        if (locationWatchId === null || !locationTracking.follow) return;
        if (Date.now() < locationTracking.programmaticMoveUntil) return;
        locationTracking.follow = false;
        if (locationTracking.state === "active") setLocationStatus("手動瀏覽", "active");
        updateLocationFollowButton();
      }

      function stopLocationTracking(button) {
        locationTracking.sessionId += 1;
        if (locationWatchId !== null) {
          navigator.geolocation.clearWatch(locationWatchId);
          locationWatchId = null;
        }
        stopLocationFreshnessTimer();
        removeLocationLayers();
        locationTracking.follow = true;
        locationTracking.lastLatLng = null;
        locationTracking.lastPosition = null;
        locationTracking.lastReceivedAt = 0;
        locationTracking.followAnchor = null;
        locationTracking.lastFollowAt = 0;
        locationTracking.programmaticMoveUntil = 0;
        locationTracking.state = "idle";
        resetLocationInfo();
        if (button) button.classList.remove("is-active");
        setLocateButtonState(button, "idle");
      }

      function setLocateButtonState(button, stateName) {
        if (!button) return;
        const labels = {
          idle: "⌖",
          loading: "…",
          active: "⌖",
          error: "!"
        };
        const titles = {
          idle: "定位目前位置",
          loading: "定位中",
          active: "關閉定位",
          error: "定位失敗，點擊重新定位"
        };
        button.textContent = labels[stateName] || labels.idle;
        button.title = titles[stateName] || titles.idle;
        button.setAttribute("aria-label", titles[stateName] || titles.idle);
        button.setAttribute("aria-pressed", stateName === "active" ? "true" : "false");
        button.classList.toggle("is-active", stateName === "active");
        button.classList.toggle("is-loading", stateName === "loading");
        button.classList.toggle("is-error", stateName === "error");
        button.dataset.state = stateName;
      }

      function isValidLocationPosition(position) {
        const { latitude, longitude } = position?.coords || {};
        return Number.isFinite(latitude) && Number.isFinite(longitude)
          && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
      }

      function updateLocationMarker(position, latlng) {
        const radius = getLocationCircleRadius(position);
        if (!locationMarker) {
          locationMarker = L.circleMarker(latlng, {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 0.95,
          }).addTo(map);
          locationCircle = L.circle(latlng, {
            radius,
            color: "#2563eb",
            weight: 1,
            fillColor: "#2563eb",
            fillOpacity: 0.12,
          }).addTo(map);
        } else {
          locationMarker.setLatLng(latlng);
          locationCircle.setLatLng(latlng).setRadius(radius);
        }
        locationMarker.bringToFront();
        locationCircle.bringToFront();
      }

      function handleLocationPosition(position, sessionId, button) {
        if (sessionId !== locationTracking.sessionId || !isValidLocationPosition(position)) return;
        const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
        const initialFix = !locationTracking.lastLatLng;
        locationTracking.lastLatLng = latlng;
        locationTracking.lastPosition = position;
        locationTracking.lastReceivedAt = Date.now();
        locationTracking.state = "active";
        updateLocationMarker(position, latlng);
        updateLocationInfo(position);
        centerMapOnLocation(initialFix);
        setLocateButtonState(button, "active");
        updateLocationFreshness();
      }

      function handleLocationError(error, sessionId, button) {
        if (sessionId !== locationTracking.sessionId) return;
        if (locationWatchId !== null) {
          navigator.geolocation.clearWatch(locationWatchId);
          locationWatchId = null;
        }
        stopLocationFreshnessTimer();
        locationTracking.state = "error";
        setLocateButtonState(button, "error");
        const reason = error?.code === 1
          ? "定位權限被拒絕"
          : error?.code === 2
            ? "目前無法取得位置"
            : "定位逾時，請重新嘗試";
        setLocationStatus(reason, "error");
        if (locationElements.panel) locationElements.panel.hidden = false;
        setStatus(`⚠️ ${reason}`);
        window.setTimeout(() => {
          if (locationTracking.state === "error") setStatus("");
        }, 2600);
        console.error("定位錯誤:", error);
      }

      function startLocationTracking(button) {
        if (!navigator.geolocation) {
          setLocateButtonState(button, "error");
          GlobalModal.alert("此瀏覽器不支援定位功能。");
          return;
        }

        locationTracking.sessionId += 1;
        const sessionId = locationTracking.sessionId;
        locationTracking.follow = true;
        locationTracking.lastLatLng = null;
        locationTracking.lastPosition = null;
        locationTracking.lastReceivedAt = 0;
        locationTracking.followAnchor = null;
        locationTracking.lastFollowAt = 0;
        locationTracking.programmaticMoveUntil = 0;
        locationTracking.state = "loading";
        removeLocationLayers();
        resetLocationInfo();
        if (locationElements.panel) locationElements.panel.hidden = false;
        setLocationStatus("定位中…", "loading");
        updateLocationFollowButton();
        setLocateButtonState(button, "loading");
        startLocationFreshnessTimer();

        try {
          locationWatchId = navigator.geolocation.watchPosition(
            (position) => handleLocationPosition(position, sessionId, button),
            (error) => handleLocationError(error, sessionId, button),
            LOCATION_OPTIONS,
          );
        } catch (error) {
          handleLocationError(error, sessionId, button);
        }
      }

      function getBestCurrentPosition({ maximumAge = 8000, timeout = 12000 } = {}) {
        const positionAge = Date.now() - locationTracking.lastReceivedAt;
        if (locationTracking.lastPosition && positionAge <= maximumAge) {
          return Promise.resolve(locationTracking.lastPosition);
        }
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            ...LOCATION_OPTIONS,
            maximumAge,
            timeout,
          });
        });
      }

      locationElements.locateButton.addEventListener("click", () => {
        disableRouteLayerForTools();
        if (locationWatchId !== null) {
          stopLocationTracking(locationElements.locateButton);
          return;
        }
        startLocationTracking(locationElements.locateButton);
      });

      locationElements.followButton.addEventListener("click", () => {
        if (!locationTracking.lastLatLng) return;
        const shouldFollow = !locationTracking.follow;
        locationTracking.follow = shouldFollow;
        updateLocationFollowButton();
        if (shouldFollow) {
          setLocationStatus("已定位", "active");
          centerMapOnLocation(false, true);
        } else {
          setLocationStatus("手動瀏覽", "active");
        }
      });

      locationElements.addRecordButton.addEventListener("click", () => {
        const latlng = locationTracking.lastLatLng;
        if (!latlng) return;
        disableRouteLayerForTools();
        const lat = latlng.lat, lng = latlng.lng;
        const code = latLngToTpcCode(lat, lng);
        const currentPoint = { lat, lng, name: "手動新增設備", code, area: "自訂" };
        L.popup({ autoPanPadding: [10, 10] }).setLatLng([lat, lng]).setContent(miniPopupHtml(currentPoint)).openOn(map);
        openEditPanel(currentPoint);
      });

      // ==========================================
      // 資料載入
      // ==========================================
      const DATA_URLS = [
        { meta: "../data/meta.json",  points: "../data/points.json" },
        { meta: "data/meta.json",     points: "data/points.json" },
        { meta: "https://aertyuloq8.github.io/taipower-equipment-map/data/meta.json",
          points: "https://aertyuloq8.github.io/taipower-equipment-map/data/points.json" },
      ];
      const DATA_VERSION_KEY = "tp_data_version_v1";

      function readDataVersion() {
        try { return JSON.parse(localStorage.getItem(DATA_VERSION_KEY) || "null"); }
        catch (e) { return null; }
      }

      function writeDataVersion(meta) {
        try {
          localStorage.setItem(DATA_VERSION_KEY, JSON.stringify({
            pointsHash: meta.pointsHash || "",
            addrUpdated: meta.addrUpdated || "",
          }));
        } catch (e) { /* ignore */ }
      }

      async function loadPointsWithVersion(meta, urls) {
        const version = readDataVersion();
        if (version && meta.pointsHash && version.pointsHash === meta.pointsHash) {
          const cached = await caches.match(new URL(urls.points, window.location.href)).catch(() => null);
          if (cached?.ok) return cached.json();
        }
        // 主線程 fetch + JSON.parse 會凍結 UI，改用 Worker 解析
        const worker = new Worker(new URL("./workers/points-worker.js", import.meta.url));
        try {
          return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { worker.terminate(); reject(new Error("points 解析逾時")); }, 60000);
            worker.onmessage = (e) => {
              const msg = e.data || {};
              if (msg.id !== "points") return;
              clearTimeout(timer);
              worker.terminate();
              if (msg.type === "done" && Array.isArray(msg.points)) resolve(msg.points);
              else reject(new Error(msg.error || "points 解析失敗"));
            };
            worker.onerror = (err) => { clearTimeout(timer); worker.terminate(); reject(new Error(err.message || "points Worker 錯誤")); };
            // 傳絕對 URL（基於頁面位置），避免 Worker 內 fetch 相對路徑解析錯誤
            const absUrl = new URL(urls.points, window.location.href).href;
            worker.postMessage({ id: "points", urls: [absUrl] });
          });
        } catch (e) {
          // Worker 失敗時退回主線程直接載入，確保功能不中斷
          console.warn("points Worker 載入失敗，退回主線程：", e.message);
          const pointsRes = await fetch(urls.points, { cache: "no-store" });
          if (!pointsRes.ok) throw new Error(`points ${pointsRes.status}`);
          return pointsRes.json();
        }
      }

      async function cacheEquipmentData(meta, points) {
        try {
          await putAppDataRecord(EQUIPMENT_CACHE_ID, { meta, points, cachedAt: new Date().toISOString() });
        } catch (error) { console.warn("設備資料快取失敗：", error); }
      }

      async function getCachedEquipmentData() {
        const cached = await getAppDataRecord(EQUIPMENT_CACHE_ID);
        return cached?.value?.meta && Array.isArray(cached.value.points) ? cached.value : null;
      }

      function setOfflineNotice(message = "") {
        const notice = document.getElementById("offlineNotice");
        if (!notice) return;
        const normalizedMessage = String(message || "");
        const messageElement = document.getElementById("offlineNoticeMessage");
        notice.hidden = !normalizedMessage;
        notice.classList.toggle("is-error", normalizedMessage.includes("無法"));
        if (messageElement) messageElement.textContent = normalizedMessage;
        else notice.textContent = normalizedMessage;
      }

      document.getElementById("offlineNoticeClose")?.addEventListener("click", () => setOfflineNotice(""));

      function updateNetworkNotice() {
        if (navigator.onLine === false) {
          setOfflineNotice("離線降級模式：設備資料、巡檢紀錄、照片與備份仍可使用；地圖底圖可能無法載入。\n恢復網路後可重新載入底圖。" );
        } else {
          setOfflineNotice("");
        }
      }

      window.addEventListener("offline", () => updateNetworkNotice());
      window.addEventListener("online", () => {
        updateNetworkNotice();
        setStatus("網路已恢復；可重新整理地圖底圖");
        window.setTimeout(() => setStatus(""), 2200);
      });

      async function tryFetchData() {
        let lastError = null;
        for (const urls of DATA_URLS) {
          try {
            const metaRes = await fetch(urls.meta, { cache: "no-cache" });
            if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`);
            const meta = await metaRes.json();
            const points = await loadPointsWithVersion(meta, urls);
            writeDataVersion(meta);
            return { meta, points };
          } catch (e) { console.warn("資料來源嘗試失敗，切換備用：", urls.meta, e.message); lastError = e; }
        }
        throw lastError || new Error("所有資料來源皆無法連線，請檢查網路或資料目錄是否存在。");
      }

      async function init() {
        setStatus("載入設備資料...");
		initSidebarForm(); // ★ 加入這行，初始化編輯表單內容
        loadFromLocalStorage(); purgeLegacyDefectUsageStorage(); renderFolders(); renderDefectStats(); renderDefectGroups(); updateRecordMarkers(); refreshStorageStatus();
        syncMobileMapControls();
        try {
          const { meta, points } = await tryFetchData();
          state.meta = meta; state.points = points;
          await cacheEquipmentData(meta, points);
          fillAreas(); renderResults([]);
          map.setView([23.7, 120.95], 8);
          if (state.meta?.bounds) map.fitBounds(state.meta.bounds, { padding: [28, 28] });
          renderer.redraw();
          updateNetworkNotice();
          setStatus("");
        } catch (e) {
          console.error(e);
          try {
            const cached = await getCachedEquipmentData();
            if (!cached) throw e;
            state.meta = cached.meta; state.points = cached.points;
            fillAreas(); renderResults([]);
            map.setView([23.7, 120.95], 8);
            if (state.meta?.bounds) map.fitBounds(state.meta.bounds, { padding: [28, 28] });
            renderer.redraw();
            setOfflineNotice(`離線降級模式：已使用 ${formatDateTime(cached.cachedAt)} 的設備資料。紀錄、照片與備份仍可使用；地圖底圖可能無法載入。`);
            setStatus("");
          } catch (cacheError) {
            setStatus("⚠️ 設備資料載入失敗：" + e.message);
          }
        }
        await checkForSavedDraft();
      }

      init();

      if ('serviceWorker' in navigator) {
        let refreshingForServiceWorker = false;
        const pwaBanner = document.getElementById('pwaUpdateBanner');
        const pwaReloadBtn = document.getElementById('pwaUpdateReload');
        const pwaDismissBtn = document.getElementById('pwaUpdateDismiss');
        let pendingRegistration = null;
        function showPWAUpdateBanner(registration) {
          if (!pwaBanner || pwaBanner.hidden === false) return;
          if (sessionStorage.getItem('v2-pwa-dismissed')) return;
          pendingRegistration = registration;
          pwaBanner.hidden = false;
        }
        pwaDismissBtn?.addEventListener('click', () => {
          if (pwaBanner) pwaBanner.hidden = true;
          try { sessionStorage.setItem('v2-pwa-dismissed', '1'); } catch (e) {}
        });
        pwaReloadBtn?.addEventListener('click', () => {
          if (pendingRegistration?.waiting) {
            pendingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            window.location.reload();
          }
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshingForServiceWorker) return;
          refreshingForServiceWorker = true;
          window.location.reload();
        });

        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./service-worker.js?rev=19', { scope: './' })
            .then((registration) => {
              console.log('✅ PWA 離線核心註冊成功，範圍:', registration.scope);

              if (registration.waiting) {
                showPWAUpdateBanner(registration);
              }

              registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                  if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showPWAUpdateBanner(registration);
                  }
                });
              });
            })
            .catch(err => console.log('❌ PWA 註冊失敗:', err));
        });
      }
    