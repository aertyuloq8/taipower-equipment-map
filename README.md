# 土木設備分布地圖

這個專案將 Excel 的 `土木設備 / 圖號座標 / 區域` 轉成 WGS84 經緯度，並用免費的 OpenStreetMap 顯示設備分布。

線上 GitHub Pages：

```text
https://aertyuloq8.github.io/taipower-equipment-map/
```

## 功能

- 縮小時顯示圖號前綴標籤，例如 `M7507 · 123`，點擊前綴會縮放到該區域。
- 放大到高倍率後顯示實際點位與 `土木設備` 標籤。
- 點擊點位或標籤會打開資訊窗，資訊窗內有 `Google 導航` 和 `Google 街景`。
- 可依 `區域` 篩選，也可搜尋多個設備標籤或圖號前綴。
- 搜尋可用 `.、空白、逗號` 分隔，多個關鍵字採任一符合，例如 `Q1295.尖峰.安南`。
- 搜尋結果使用自然排序，例如 `安南1`、`安南2`、`安南10`。
- 標籤顏色用來分辨圖號前綴；放大後會依畫面位置替設備中文前綴避色，無中文前綴統一灰色。
- 地圖右上角有獨立 `定位` 開關，可顯示/關閉目前位置與誤差範圍。
- 搜尋/篩選側欄可收合，手機直向與橫向都使用左側滑出側欄，讓搜尋結果保留可捲動空間。

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

推送完成後，GitHub Pages 通常會在 1 到 3 分鐘內自動更新。網頁程式在 `web\`，Excel 更新時只要資料欄位不變，不需要另外修改網頁。

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
