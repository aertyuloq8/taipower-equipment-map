/*
 * V2 地籍範圍查詢設定。
 * 這個網址是公開的 GAS Web App，不包含任何 Token 或帳密。GAS 會在伺服器端
 * 取得短效 Token、向臺南市地政地籍圖層查詢，再只把 GeoJSON 回傳給瀏覽器。
 */
window.CADASTRE_GAS_URL = "https://script.google.com/macros/s/AKfycbw5rYwcEBKZcvqQJS4OZtHtu3gDBsoH7pCD8H2N4_ZWl7F6E1oovg881EQhvUNuqXXbPA/exec";
window.CADASTRE_GAS_SUPPORTED_CITY_CODES = ["D"];
window.CADASTRE_GAS_MODE = "geojson";
window.CADASTRE_DROPDOWN_DATA_URL = "../data/cadastral-dropdowns-tw.json";
