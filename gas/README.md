# V3 地籍套繪的 GAS Web App

這個 GAS 專案是 V3 與臺南市／國土測繪公開查詢端點之間的最小中介：

```text
GitHub Pages 的 indexV3.html
  └─ JSONP → GAS Web App
                └─ 固定的臺南市地籍查詢
                     ├─ GeoJSON（action=parcel）→ Leaflet 向量套繪
                     └─ 國土測繪公開圖片端點
                          └─ IMG + EXT（action=parcelImage）→ Leaflet 圖片套繪
```

它不接受任意網址，也不會把 ArcGIS Token 或上游圖片原始回應以外的秘密資料回傳給 GitHub Pages。公開入口支援一筆
`action=parcel` 或 `action=parcelImage` 查詢，並限制為臺南市、有效行政區、地段與八碼地號。

## 部署

1. 以自己的 Google 帳戶開啟 [Google Apps Script](https://script.google.com/)，建立新的專案。
2. 將 [Code.gs](Code.gs) 的內容貼入程式檔，並在「專案設定」啟用顯示 `appsscript.json` 後，將 [appsscript.json](appsscript.json) 的內容貼入 manifest。
3. 按「部署 → 新增部署作業 → 網頁應用程式」。
   - 執行身分：**我自己**
   - 存取權：依你的使用情境選擇可讓 GitHub Pages 使用者呼叫的權限（一般為「任何人」）。
4. 完成授權後，複製部署的 **`/exec`** 網址，不要使用僅供開發者測試的 `/dev` 網址。
5. 在 [web/cadastre-config-v3.js](../web/cadastre-config-v3.js) 填入：

   ```js
   window.CADASTRE_GAS_URL = "https://script.google.com/macros/s/你的部署ID/exec";
   ```

   `/exec` 網址可放在 GitHub Pages；它不是 Token。不要把任何 ArcGIS Token、Bearer Token 或 Google 憑證放入 `web/`。

6. 在 [web/cadastre-config-v3.js](../web/cadastre-config-v3.js) 保持 `window.CADASTRE_GAS_MODE = "image"`，重新載入 V3，依序選擇「臺南市 → 永康區 → 二王段」，輸入地號後按「定位並套繪地籍圖片」。每次送出新查詢會立即移除上一筆圖層；按「清除地籍圖層」也會取消尚未完成的舊查詢並清空地號欄位。

### 更新既有部署

若已經部署過 Web App，更新 `Code.gs` 後請使用「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」。這會保留相同的 `/exec` 網址，V3 不需要再改設定。

國土測繪圖片端點目前接受固定欄位的 GET：`sectNo`、`office`、`landNo`。本版 `Code.gs` 只呼叫這兩個固定的 `easymap.moi.gov.tw` 公開端點，且不接受任何使用者傳入的網址。這能避免舊版先建立工作階段、取得 form token 再 POST 時，在 GAS 端逾時而讓 V3 沒有回應。若你的 `/exec` 仍使用舊版，需貼上新版 `Code.gs` 後建立新版本部署。

圖片模式的 GAS 回應格式為：

```json
{
  "ok": true,
  "type": "imageLayers",
  "imageLayers": [
    {
      "image": "iVBOR...",
      "mimeType": "image/png",
      "extent": [120.0, 23.0, 120.1, 23.1]
    }
  ]
}
```

`extent` 順序是 `[最小經度, 最小緯度, 最大經度, 最大緯度]`；V3 會轉成 Leaflet 的 `[[南, 西], [北, 東]]`。

## GeoJSON 模式的上游 Token 限制

`Code.gs` 會先嘗試臺南圖台網頁公開提供的短效工作階段 Token，且只在 GAS 記憶體／快取中短暫使用。它不會寫入 GitHub 或送給瀏覽器。

不過上游目前可能對 Token 綁定來源、IP 或官方 Proxy。開發時已觀察到：公開 Token 可取得，但從網頁以外的環境直查 MapServer 有機會回覆 ArcGIS `400 Unable to complete operation`。因此這個 GAS 是可部署、可測試的 adapter，但**不能保證**上游會接受 Google 的伺服器請求。

若 V3 顯示「官方 MapServer 未接受本次服務端查詢」，表示 V3、JSONP 與 GAS 已收到回應，但官方服務拒絕該工作階段。請不要將官方網站自己的 Proxy 當成通用轉送服務或嘗試繞過限制。可行的下一步是向資料主管機關取得可由服務端使用的正式 Token／服務授權。

若主管機關已提供這類 Token，請在 GAS 的「專案設定 → 指令碼屬性」新增：

```text
名稱：CADASTRE_ARCGIS_TOKEN
值：主管機關核發、可供服務端使用的 Token
```

此值只會留在你的 GAS 專案中；`Code.gs` 會優先使用它，不需也不應修改前端檔案。

`parcelImage` 圖片模式不使用上述 ArcGIS Token；它透過固定的國土測繪端點取得 PNG 與經緯度範圍，但仍受該服務的可用性與使用規範限制。

## 範圍與日後擴充

- V3 的下拉清單仍含全臺縣市、鄉鎮市區與地段，資料檔是 `data/cadastral-dropdowns-tw.json`。
- 目前實作的圖形 adapter 僅支援臺南市（代碼 `D`）。圖片模式會由 GAS 先向國土測繪公開地段清單取得 `officeCode`，再呼叫固定的 `Land_json_getMapImageLayers` 端點。
- 其他縣市需要各自合法、可由後端使用的圖形資料服務；擴充時請增加明確的縣市 adapter，不要把 GAS 改成任意 URL Proxy。
- 地籍圖僅供參考，實際界址、權利範圍與登記資料仍以主管機關正式文件為準。
