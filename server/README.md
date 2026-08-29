# V2 地籍查詢 Proxy

## 不需要 Proxy 的查詢下拉清單

V2 已內建公開資料快照，可直接提供與國家地圖平臺相同順序的：

```text
縣市 → 鄉鎮市區 → 地段 → 地號
```

資料檔為 `../data/cadastral-dropdowns-tw.json`，不含 Token，使用者不需登入、也不需啟動本資料夾的服務。要更新清單時，在專案根目錄執行：

```powershell
node .\tools\build-cadastral-dropdown-data.mjs
```

## 僅供合法地籍圖形套繪使用

V2 是靜態網頁，不能安全地保存 ArcGIS Token。本資料夾提供一個零相依套件的 Node.js Proxy：

```text
V2 查詢面板 → Proxy → 已正式授權的地段／地籍圖服務 → GeoJSON → Leaflet 疊繪
```

## 啟動方式

1. 向地籍資料提供方取得可供本網站使用的正式服務授權與 Token。
2. 複製 `.env.example` 為本機未提交的 `.env`，填入 Token、地段清單端點及 V2 網址。
3. 在 PowerShell 載入環境變數後啟動：

   ```powershell
   Get-Content .env | ForEach-Object {
     if ($_ -match '^(?!#)([^=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
   }
   node .\cadastre-proxy.mjs
   ```

4. 在 `web/cadastre-config.js` 設定：

   ```js
   window.CADASTRE_API_BASE = "http://localhost:8787/api/cadastre";
   ```

   部署後請改成 HTTPS Proxy 的完整網址。

## 可用端點

- `GET /api/cadastre/health`
- `GET /api/cadastre/towns`
- `GET /api/cadastre/sections?town=永康區`
- `GET /api/cadastre/parcel?section=G701&number=10-1`

`parcel` 只回傳 Leaflet 所需的 GeoJSON 與最小必要公開屬性；Token 不會傳到瀏覽器、回應內容或 Git。

## 部署提醒

- GitHub Pages 無法執行這個 Node.js 服務；請部署到自己的 Node 主機、Render、Railway、Vercel Function 或 Cloudflare Worker 等可保存環境變數的平台。
- 將 `CADASTRE_ALLOWED_ORIGINS` 設成 V2 的實際網址，不要在正式環境使用萬用來源。
- 不要以抓取、複製或轉送「府城南籍圈」網站自己的短效 Token 來取代正式授權；那會造成安全、維運與授權風險。
