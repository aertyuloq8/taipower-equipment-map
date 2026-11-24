# 本專案規範：台南區土木設備分布地圖（台南版）

- **專案識別**：此為【台南版】專屬專案（目錄：`webpro`，遠端：`taipower-equipment-map`，分支：`main`）。
- **網頁標題**：`<title>土木設備分布地圖</title>`
- **版本號規則**：必須以 `-tn` 結尾（例如 `v2.8.0-tn`）。
- **底層核心架構**：
  - 本專案採用靜態 GeoJSON / CSV / points.json 架構（台南 23 萬筆點位）。
  - **嚴格禁令**：本專案完全沒有 `pmtiles_layer.js`，`web/src/main.js` **絕對嚴禁引用** `pmtiles_layer.js`！
  - 嚴禁整份複製全台版的 `main.js`。跨專案移植功能時，只允許精確移植業務函式，不可破壞模組 import。
- **發布驗證**：推送至 GitHub 前，必須透過無頭瀏覽器驗證 `window.__appBooted === true` 且地圖成功載入。
