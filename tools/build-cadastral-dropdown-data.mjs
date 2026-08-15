/**
 * 下載內政部國土測繪中心公開的地籍查詢下拉資料，建立給 V2 使用的靜態快照。
 *
 * 此指令只讀取公開的「縣市 → 鄉鎮市區 → 地段」資料；不讀取、不儲存 Token，
 * 也不下載地籍圖形或任何個人資料。
 *
 * 執行：node .\tools\build-cadastral-dropdown-data.mjs
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_BASE_URL = "https://easymap.moi.gov.tw/Z10Web/";
const TARGET_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "cadastral-dropdowns-tw.json");
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 20_000;

function toEntries(payload, label) {
  const entries = Array.isArray(payload) ? payload : payload?.value;
  if (!Array.isArray(entries)) throw new Error(`${label} 回傳格式不正確。`);
  return entries;
}

function normalizeEntry(entry, label) {
  const code = String(entry?.id ?? "").trim();
  const name = String(entry?.name ?? "").trim();
  if (!code || !name) throw new Error(`${label} 含有不完整資料。`);
  return { code, name };
}

async function fetchList(path, params, label) {
  const url = new URL(path, SOURCE_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${label} 請求失敗（HTTP ${response.status}）。`);
  return toEntries(await response.json(), label);
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const cities = (await fetchList("City_json_getList", {}, "縣市清單"))
    .map(entry => normalizeEntry(entry, "縣市清單"));

  const townsByCity = await mapWithConcurrency(cities, CONCURRENCY, async city => {
    const towns = (await fetchList("City_json_getTownList", { cityCode: city.code }, `${city.name} 鄉鎮市區清單`))
      .map(entry => normalizeEntry(entry, `${city.name} 鄉鎮市區清單`));
    return { city, towns };
  });

  const townRequests = townsByCity.flatMap(({ city, towns }) => towns.map(town => ({ city, town })));
  const sectionsByTown = await mapWithConcurrency(townRequests, CONCURRENCY, async ({ city, town }) => {
    const sections = (await fetchList(
      "City_json_getSectionList",
      { cityCode: city.code, townCode: town.code },
      `${city.name}${town.name}地段清單`,
    )).map(entry => normalizeEntry(entry, `${city.name}${town.name}地段清單`));
    return { cityCode: city.code, townCode: town.code, sections };
  });

  const sectionLookup = new Map(sectionsByTown.map(entry => [`${entry.cityCode}:${entry.townCode}`, entry.sections]));
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: "內政部國土測繪中心－國土測繪圖資服務雲",
      url: "https://easymap.moi.gov.tw/Z10Web/Normal",
      endpoints: [
        "City_json_getList",
        "City_json_getTownList",
        "City_json_getSectionList",
      ],
      note: "公開下拉清單的離線快照；不含 Token 或地籍圖形資料。",
    },
    cities: townsByCity.map(({ city, towns }) => ({
      ...city,
      towns: towns.map(town => ({
        ...town,
        sections: sectionLookup.get(`${city.code}:${town.code}`) || [],
      })),
    })),
  };

  await mkdir(dirname(TARGET_PATH), { recursive: true });
  const temporaryPath = `${TARGET_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(temporaryPath, TARGET_PATH);

  const townCount = townRequests.length;
  const sectionCount = sectionsByTown.reduce((total, entry) => total + entry.sections.length, 0);
  console.log(`已建立 ${TARGET_PATH}`);
  console.log(`縣市 ${cities.length} 筆、鄉鎮市區 ${townCount} 筆、地段 ${sectionCount} 筆。`);
}

main().catch(error => {
  console.error(`建立地籍下拉清單失敗：${error.message}`);
  process.exitCode = 1;
});
