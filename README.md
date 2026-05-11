# 土木設備分布地圖

這個資料夾已建立一個免費底圖的本機網頁地圖，用 OpenStreetMap 作為底圖來源，並把 Excel 的「圖號座標」轉成 WGS84 經緯度。

## 使用方式

1. 轉換 Excel：

   ```powershell
   python tools\convert_excel.py
   ```

2. 啟動地圖服務：

   ```powershell
   python server.py
   ```

3. 用瀏覽器開啟：

   ```text
   http://127.0.0.1:8765
   ```

## 檔案說明

- `tools/convert_excel.py`：讀取資料夾內最新的 Excel 檔，將 `土木設備 / 圖號座標 / 區域` 轉成 `data/points.json` 和 `data/points.csv`。
- `server.py`：本機 API 與靜態網頁伺服器。地圖移動或縮放時，只回傳目前視窗內需要的資料。
- `web/index.html`：地圖頁面。
- `web/app.js`：地圖互動、搜尋、區域篩選、聚合顯示、放大後標籤。
- `web/styles.css`：頁面樣式。
- `data/meta.json`：轉換摘要與地圖範圍。

## 大量點位處理方式

- 低倍率與中倍率：API 依目前地圖視窗做格網聚合，只顯示群集數量。
- 高倍率：只在視窗內點位量合理時回傳實際設備點。
- 標籤：放大到 16 級以上才顯示 `土木設備` 標籤，避免 238,104 筆標籤同時進入瀏覽器。
- 搜尋：可用 `土木設備` 或 `圖號座標` 快速定位。
