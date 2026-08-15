(() => {
  "use strict";

  const panel = document.getElementById("v2SyncPanel");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const toggleBtn = $("v2SyncToggle");
  const closeBtn = $("v2SyncClose");
  const qrEl = $("v2SyncQr");
  const codeEl = $("v2SyncCode");
  const regenBtn = $("v2SyncRegen");
  const joinInput = $("v2SyncJoinInput");
  const joinBtn = $("v2SyncJoinBtn");
  const scanBtn = $("v2SyncScanBtn");
  const scanVideo = $("v2SyncScanVideo");
  const statusEl = $("v2SyncStatus");
  const progressEl = $("v2SyncProgress");
  const fillEl = $("v2SyncProgressFill");
  const progressText = $("v2SyncProgressText");
  const sendChk = $("v2SyncSend");
  const recvChk = $("v2SyncRecv");
  const maxMbInput = $("v2SyncMaxMb");

  const CDN_PREFIX = "tp2-";
  const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const CODE_LEN = 6;
  const CHUNK_SIZE = 64 * 1024;
  const MAX_MB_KEY = "tp_sync_max_mb_v1";

  let peer = null;
  let clientPeer = null;
  let conn = null;
  let hostCode = "";
  let qrCode = null;
  let scanStream = null;
  let scanRaf = 0;
  let sending = null;
  let receiving = null;
  let active = false;

  function fmtMB(bytes) {
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", kind === "error");
    statusEl.classList.toggle("is-ok", kind === "ok");
  }

  function setProgress(visible, pct = 0, text = "") {
    progressEl.hidden = !visible;
    fillEl.style.width = pct + "%";
    progressText.textContent = text;
  }

  function readMaxBytes() {
    const mb = Math.max(10, Math.min(2048, Number(maxMbInput.value) || 200));
    maxMbInput.value = mb;
    try { localStorage.setItem(MAX_MB_KEY, String(mb)); } catch (e) {}
    return mb * 1048576;
  }

  function initMaxMb() {
    try {
      const saved = Number(localStorage.getItem(MAX_MB_KEY));
      if (saved >= 10 && saved <= 2048) maxMbInput.value = saved;
    } catch (e) {}
  }

  function genCode() {
    let s = "";
    const buf = new Uint32Array(CODE_LEN);
    crypto.getRandomValues(buf);
    for (let i = 0; i < CODE_LEN; i++) s += CHARSET[buf[i] % CHARSET.length];
    return s;
  }

  function normalizeCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "").slice(0, CODE_LEN);
  }

  function destroyQr() {
    if (qrCode) {
      try { qrCode.clear(); } catch (e) {}
      qrCode = null;
    }
    qrEl.innerHTML = "";
  }

  function showQr(text) {
    destroyQr();
    if (!window.QRCode) return;
    try {
      qrCode = new QRCode(qrEl, { text, width: 118, height: 118, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {}
  }

  function destroyPeers() {
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    if (clientPeer) { try { clientPeer.destroy(); } catch (e) {} clientPeer = null; }
    stopScan();
    sending = null;
    receiving = null;
  }

  function startHost() {
    destroyPeers();
    hostCode = genCode();
    codeEl.textContent = hostCode;
    showQr(hostCode);
    setStatus(`配對碼 ${hostCode}，等待對方連線…`);
    setProgress(false);
    peer = new Peer(CDN_PREFIX + hostCode, { debug: 1 });
    peer.on("open", () => {
      setStatus(`配對碼 ${hostCode}，等待對方連線…（對方輸入此碼或掃描 QR）`);
    });
    peer.on("connection", (c) => {
      if (!conn) {
        conn = c;
        wireConn(c);
      } else {
        try { c.close(); } catch (e) {}
      }
    });
    peer.on("error", (err) => {
      console.error("PeerJS host error:", err);
      if (err.type === "unavailable-id") {
        setStatus("配對碼衝突，重新產生中…");
        startHost();
      } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "disconnected") {
        setStatus("無法連上配對伺服器，請檢查網路後按「重新產生」。", "error");
      } else {
        setStatus("連線錯誤：" + err.type, "error");
      }
    });
  }

  function join(code) {
    if (conn) {
      setStatus("已有連線，請先關閉面板重新開始。", "error");
      return;
    }
    if (!code) {
      setStatus("請輸入 6 位配對碼。", "error");
      return;
    }
    setStatus(`正在連線 ${code}…`);
    setProgress(false);
    clientPeer = new Peer({ debug: 1 });
    clientPeer.on("open", () => {
      const c = clientPeer.connect(CDN_PREFIX + code, { reliable: true });
      c.on("open", () => {
        conn = c;
        wireConn(c);
      });
      c.on("error", (err) => {
        console.error("PeerJS conn error:", err);
        setStatus("連線失敗：" + (err.type || "未知錯誤"), "error");
        conn = null;
      });
      c.on("close", handleConnClose);
    });
    clientPeer.on("error", (err) => {
      console.error("PeerJS client error:", err);
      if (err.type === "peer-unavailable") {
        setStatus("找不到該配對碼，請確認對方裝置已開啟同步面板且配對碼一致。", "error");
      } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "disconnected") {
        setStatus("無法連上配對伺服器，請檢查網路。", "error");
      } else {
        setStatus("連線錯誤：" + err.type, "error");
      }
    });
  }

  function handleConnClose() {
    const wasTransferring = sending || receiving;
    conn = null;
    sending = null;
    receiving = null;
    setProgress(false);
    if (wasTransferring) setStatus("連線中斷，傳輸未完成。", "error");
    else setStatus("連線已結束。");
  }

  function wireConn(c) {
    setStatus("已連線，協商中…");
    c.on("data", (msg) => handleData(c, msg));
    c.on("close", handleConnClose);
    const sendHello = () => {
      c.send({ t: "hello", send: sendChk.checked, recv: recvChk.checked, maxBytes: readMaxBytes() });
    };
    if (c.open) sendHello();
    else c.on("open", sendHello);
  }

  function handleData(c, msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.t) {
      case "hello": onHello(c, msg); break;
      case "meta": onMeta(c, msg); break;
      case "chunk": onChunk(c, msg); break;
      case "done": onDone(c, msg); break;
      case "abort": onAbort(c, msg); break;
    }
  }

  function onHello(c, msg) {
    const maxBytes = Math.min(readMaxBytes(), Number(msg.maxBytes) || readMaxBytes());
    const theirSend = !!msg.send;
    const theirRecv = !!msg.recv;
    const iSend = sendChk.checked && theirRecv;
    const iRecv = recvChk.checked && theirSend;
    if (iSend && iRecv) setStatus("雙方互傳模式。");
    else if (iSend) setStatus("對端將接收，本機開始傳送…");
    else if (iRecv) setStatus("等待對方傳送資料…");
    else setStatus("已連線；請勾選「傳送」或「接收」（需與對方互相搭配）。");
    if (iSend) sendBackup(c, maxBytes);
  }

  async function sendBackup(c, maxBytes) {
    if (sending) return;
    setStatus("正在建立備份 ZIP…");
    try {
      const archive = await window.__syncBridge.buildBackup();
      if (archive.blob.size > maxBytes) {
        c.send({ t: "abort", reason: `備份大小 ${fmtMB(archive.blob.size)} 超過同步上限 ${fmtMB(maxBytes)}，請調高上限後重試。` });
        setStatus(`備份太大：${fmtMB(archive.blob.size)} 超過上限 ${fmtMB(maxBytes)}，已取消。`, "error");
        return;
      }
      const total = Math.ceil(archive.blob.size / CHUNK_SIZE);
      c.send({ t: "meta", size: archive.blob.size, total, records: archive.recordCount, photos: archive.photoCount });
      sending = { total, sent: 0, conn: c };
      setStatus("傳送中…");
      setProgress(true, 0, "準備傳送");
      const u8 = new Uint8Array(await archive.blob.arrayBuffer());
      for (let i = 0; i < total; i++) {
        const slice = u8.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, archive.blob.size));
        c.send({ t: "chunk", i, d: slice });
        sending.sent += slice.byteLength;
        if (i % 32 === 0) {
          const pct = Math.round((sending.sent / archive.blob.size) * 100);
          setProgress(true, pct, `傳送中 ${fmtMB(sending.sent)} / ${fmtMB(archive.blob.size)}（${pct}%）`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      c.send({ t: "done" });
      setProgress(true, 100, `傳送完成：${archive.recordCount} 筆紀錄、${archive.photoCount} 張照片`);
      setStatus("資料已傳送完成。", "ok");
      sending = null;
    } catch (err) {
      console.error("sendBackup error:", err);
      setStatus("建立備份失敗：" + err.message, "error");
      try { c.send({ t: "abort", reason: "傳送端建立備份失敗" }); } catch (e) {}
      sending = null;
    }
  }

  function onMeta(c, msg) {
    const maxBytes = readMaxBytes();
    if (msg.size > maxBytes) {
      c.send({ t: "abort", reason: `對端備份大小 ${fmtMB(msg.size)} 超過您的同步上限 ${fmtMB(maxBytes)}，請調高上限後重試。` });
      setStatus(`接收被拒絕：對端備份 ${fmtMB(msg.size)} 超過上限 ${fmtMB(maxBytes)}。`, "error");
      return;
    }
    receiving = { parts: [], got: 0, size: msg.size, total: msg.total, records: msg.records, photos: msg.photos };
    setStatus("接收中…");
    setProgress(true, 0, "準備接收");
  }

  function onChunk(c, msg) {
    if (!receiving || !msg.d) return;
    const bytes = msg.d.byteLength || msg.d.length || 0;
    if (!bytes) return;
    receiving.parts.push(msg.d);
    receiving.got += bytes;
    const pct = Math.round((receiving.got / receiving.size) * 100);
    setProgress(true, pct, `接收中 ${fmtMB(receiving.got)} / ${fmtMB(receiving.size)}（${pct}%）`);
  }

  async function onDone(c, msg) {
    if (!receiving) return;
    const recv = receiving;
    receiving = null;
    setProgress(true, 100, "接收完成，準備還原…");
    try {
      const blob = new Blob(recv.parts, { type: "application/zip" });
      const file = new File([blob], "同步備份.zip", { type: "application/zip" });
      const choice = await window.__syncBridge.confirmMerge({
        records: recv.records ?? "?",
        photos: recv.photos ?? "?",
        sizeMB: fmtMB(recv.size),
      });
      if (choice === "cancel") {
        setStatus("已取消還原，接收的資料已捨棄。");
        setProgress(false);
        return;
      }
      if (choice === "merge") {
        setStatus("正在合併…");
        const result = await window.__syncBridge.mergeBackup(file);
        setStatus(`同步完成，已合併 ${result.recordCount} 筆紀錄（新增 ${result.photoAdded} 張照片）。`, "ok");
      } else {
        setStatus("正在還原…");
        await window.__syncBridge.restoreBackup(file);
        setStatus("同步完成，資料已還原。", "ok");
      }
    } catch (err) {
      console.error("restore error:", err);
      setStatus("還原失敗：" + err.message, "error");
    }
  }

  function onAbort(c, msg) {
    receiving = null;
    setProgress(false);
    setStatus("對方已取消傳輸：" + (msg.reason || ""), "error");
  }

  function stopScan() {
    if (scanRaf) { cancelAnimationFrame(scanRaf); scanRaf = 0; }
    if (scanStream) {
      try { scanStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      scanStream = null;
    }
    scanVideo.hidden = true;
    scanVideo.srcObject = null;
  }

  async function startScan() {
    if (!("BarcodeDetector" in window)) {
      setStatus("此瀏覽器不支援相機掃描，請手動輸入對方配對碼。", "error");
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (err) {
      setStatus("無法開啟相機，請手動輸入對方配對碼。", "error");
      return;
    }
    scanVideo.hidden = false;
    scanVideo.srcObject = scanStream;
    await scanVideo.play();
    setStatus("正在掃描 QR…（對準對方裝置上的 QR 碼，再按一次「掃 QR」可停止）");
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const loop = async () => {
      scanRaf = requestAnimationFrame(loop);
      try {
        const codes = await detector.detect(scanVideo);
        if (codes && codes.length && codes[0].rawValue) {
          stopScan();
          const code = normalizeCode(codes[0].rawValue);
          if (code) join(code);
        }
      } catch (e) {}
    };
    loop();
  }

  function closeOtherFloatingPanels() {
    try { window.__closeAddressPanel && window.__closeAddressPanel(); } catch (e) {}
    try { window.__closeCadastrePanel && window.__closeCadastrePanel(); } catch (e) {}
    const layerToggle = document.getElementById("layerMenuToggle");
    const mapSearchToggle = document.getElementById("mapSearchToggle");
    if (layerToggle && layerToggle.classList.contains("is-active")) layerToggle.click();
    if (mapSearchToggle && mapSearchToggle.classList.contains("is-active")) mapSearchToggle.click();
  }

  function openPanel() {
    closeOtherFloatingPanels();
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    active = true;
    initMaxMb();
    startHost();
  }

  function closePanel() {
    if (!active) return;
    active = false;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    destroyPeers();
    destroyQr();
    codeEl.textContent = "--------";
    setStatus("");
    setProgress(false);
    joinInput.value = "";
  }
  window.__closeSyncPanel = closePanel;

  document.addEventListener("v2-address-open", closePanel);
  document.addEventListener("v2-cadastre-open", closePanel);
  document.addEventListener("map-panel-open", closePanel);
  document.addEventListener("layer-panel-open", closePanel);

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (active) closePanel();
    else openPanel();
  });
  closeBtn.addEventListener("click", closePanel);
  regenBtn.addEventListener("click", startHost);
  joinBtn.addEventListener("click", () => join(normalizeCode(joinInput.value)));
  joinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") join(normalizeCode(joinInput.value));
  });
  scanBtn.addEventListener("click", () => {
    if (scanStream) stopScan();
    else startScan();
  });
  maxMbInput.addEventListener("change", () => {
    readMaxBytes();
    setStatus(`同步上限已設定為 ${maxMbInput.value} MB。`);
  });

  if ("BarcodeDetector" in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    scanBtn.hidden = false;
  }
})();