/* archive-worker.js - offload JSZip generation to avoid main thread freeze */
let __jszipReady = false;
try {
  importScripts("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
  __jszipReady = typeof JSZip !== "undefined";
} catch (e) {
  __jszipReady = false;
}
self.onmessage = async (event) => {
  const { id, files } = event.data || {};
  if (!id || !Array.isArray(files)) return;
  if (!__jszipReady) {
    self.postMessage({ type: "error", id, error: "JSZip 載入失敗（Worker）" });
    return;
  }
  try {
    const zip = new JSZip();
    for (const f of files) {
      // f.data is Blob (from main thread) - JSZip can handle Blob directly
      // For string data, it will be Blob with text type, also handled
      zip.file(f.path, f.data);
    }
    const blob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (metadata) => {
        try { self.postMessage({ type: "progress", id, percent: metadata.percent }); } catch (e) {}
      }
    );
    self.postMessage({ type: "done", id, blob });
  } catch (err) {
    self.postMessage({ type: "error", id, error: err && err.message ? err.message : String(err) });
  }
};