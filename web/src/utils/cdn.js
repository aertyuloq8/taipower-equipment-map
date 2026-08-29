export const CDN_ASSETS = {
  jszip: { src: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", integrity: "sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG" },
  xlsx: { src: "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js", integrity: "sha384-QCIdq2UMVEoSRhR3ZWZwdz2/pivLowr+eokFMdYyukq7qI26VYRxFa4Nl6FKetmL" },
  peerjs: { src: "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js", integrity: "sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu" },
  qrcode: { src: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", integrity: "sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU" }
};

const cdnCache = {};

export function loadScript(src, integrity) {
  if (cdnCache[src]) return cdnCache[src];
  cdnCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    if (integrity) s.integrity = integrity;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("CDN 載入失敗：" + src));
    document.head.appendChild(s);
  });
  return cdnCache[src];
}

export async function ensureJSZip() {
  if (window.JSZip) return;
  await loadScript(CDN_ASSETS.jszip.src, CDN_ASSETS.jszip.integrity);
  if (!window.JSZip) throw new Error("JSZip 載入失敗");
}

export async function ensureXLSX() {
  if (window.XLSX) return;
  await loadScript(CDN_ASSETS.xlsx.src, CDN_ASSETS.xlsx.integrity);
  if (!window.XLSX) throw new Error("XLSX 載入失敗");
}

export async function ensurePeerDeps() {
  const needPeer = !window.Peer;
  const needQR = !window.QRCode;
  const tasks = [];
  if (needPeer) tasks.push(loadScript(CDN_ASSETS.peerjs.src, CDN_ASSETS.peerjs.integrity));
  if (needQR) tasks.push(loadScript(CDN_ASSETS.qrcode.src, CDN_ASSETS.qrcode.integrity));
  if (tasks.length) await Promise.all(tasks);
}

if (typeof window !== "undefined") {
  window.__CDN_ASSETS = CDN_ASSETS;
  window.loadScript = loadScript;
  window.ensureJSZip = ensureJSZip;
  window.ensureXLSX = ensureXLSX;
  window.ensurePeerDeps = ensurePeerDeps;
}
