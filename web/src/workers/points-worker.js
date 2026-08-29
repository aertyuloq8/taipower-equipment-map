// points-worker.js - 將 23.8 萬點 JSON 的 fetch + parse 移出主線程，避免 UI 凍結
// 沿用 archive-worker.js 的 importScripts + postMessage 模式

self.onmessage = async (event) => {
  const { id, urls } = event.data || {};
  if (!id || !Array.isArray(urls)) return;

  try {
    let points = null;
    let lastError = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`points ${res.status}`);
        // 用 text() 再 JSON.parse 與主線程原本行為一致，但在 Worker 執行
        const text = await res.text();
        points = JSON.parse(text);
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!points || !Array.isArray(points)) {
      self.postMessage({ type: "error", id, error: lastError?.message || "points 載入失敗" });
      return;
    }

    self.postMessage({ type: "done", id, points });
  } catch (err) {
    self.postMessage({ type: "error", id, error: err && err.message ? err.message : String(err) });
  }
};
