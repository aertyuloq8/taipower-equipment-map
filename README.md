# 土木設備分布地圖

這個專案將 Excel 的 `土木設備 / 圖號座標 / 區域` 轉成 WGS84 經緯度，並用 OpenStreetMap 顯示設備分布。

線上 GitHub Pages：

```text
https://aertyuloq8.github.io/taipower-equipment-map/
```

## 功能

- 全圖使用聚合點顯示，避免一次繪製 238,104 筆點位。
- 放大到高倍率後顯示實際點位與 `土木設備` 標籤。
- 點擊點位或標籤會打開資訊窗，資訊窗內有 `Google 導航` 和 `OSM 查看`。
- 可依 `區域` 篩選，也可搜尋 `土木設備` 或 `圖號座標`。
- 有 `定位` 按鈕，可跳到目前手機或電腦的位置。
- 手機版搜尋/篩選區預設收折，避免佔用太多畫面。

## 本機使用

```powershell
python server.py
```

然後開啟：

```text
http://127.0.0.1:8765
```

## 更新 Excel 資料並同步線上網頁

1. 把新的 Excel 放到專案資料夾。
2. Excel 欄位需包含：

   ```text
   土木設備    圖號座標    區域
   ```

3. 執行：

   ```powershell
   .\update_data.ps1
   ```

這個腳本會：

- 重新執行 `tools\convert_excel.py`
- 更新 `data\points.json`、`data\points.csv`、`data\meta.json`
- 建立 Git commit
- 推送到 GitHub

推送完成後，GitHub Pages 通常會在 1 到 3 分鐘內自動更新。

## 產生 USB 可攜版

執行：

```powershell
python tools\build_portable.py
```

會產生：

- `portable-map\`：整個資料夾可複製到 USB，直接雙擊 `index.html` 開啟。
- `portable-map.zip`：同一份可攜版壓縮檔。

可攜版不需要安裝 Python、Git 或任何軟體。離線時仍可使用設備點位、聚合、搜尋與資訊窗；只有道路底圖需要網路才會顯示。

### 離線道路底圖

官方 OpenStreetMap 圖磚不允許大量預先下載作為離線包使用。若你有合法授權、允許離線/批次下載的圖磚來源，可以先下載到 `tiles\`，再重新產生可攜版：

```powershell
python tools\download_tiles.py --url-template "https://你的圖磚來源/{z}/{x}/{y}.png" --min-zoom 8 --max-zoom 15 --attribution "你的圖資來源" --yes-i-have-permission
python tools\build_portable.py
```

產生後 `portable-map\tiles\` 會被一起放入 USB 版，離線時就會顯示本機道路底圖。

## 手動更新指令

如果不使用腳本，也可以手動執行：

```powershell
python tools\convert_excel.py
git add data\points.json data\points.csv data\meta.json
git commit -m "Update map data"
git push
```

## 注意

GitHub Pages 是公開網站；若 repository 設為公開，`data/points.json` 裡的設備座標也會公開可下載。
