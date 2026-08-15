from __future__ import annotations

import csv
import io
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ADDR_DIR = DATA_DIR / "addr"
ADDR_CSV = ROOT / "114年臺南市門牌坐標資料.csv"
OPENCC_DICT = Path(
    r"C:\Users\Administrator\AppData\Local\Programs\Python\Python313\Lib\site-packages\opencc\dictionary"
)
PI = math.pi

# ============================================================
# 1. 區碼(戶政系統) -> 區名 映射表
#    以 NLSC 鄉鎮市區清單(戶政) API + 門牌 CSV 村里名驗證：
#    每個區碼的村里名集合均唯一對應單一區，37/37 全部確認。
# ============================================================
DISTRICT_MAP = {
    "01": "新營區", "02": "鹽水區", "03": "白河區", "04": "柳營區", "05": "後壁區",
    "06": "東山區", "07": "麻豆區", "08": "下營區", "09": "六甲區", "10": "官田區",
    "11": "大內區", "12": "佳里區", "13": "學甲區", "14": "西港區", "15": "七股區",
    "16": "將軍區", "17": "北門區", "18": "新化區", "19": "善化區", "20": "新市區",
    "21": "安定區", "22": "山上區", "23": "玉井區", "24": "楠西區", "25": "南化區",
    "26": "左鎮區", "27": "仁德區", "28": "歸仁區", "29": "關廟區", "30": "龍崎區",
    "31": "永康區", "32": "東區", "33": "南區", "34": "北區", "35": "安南區",
    "36": "安平區", "37": "中西區",
}

# 自訂補充（opencc 未收錄或方向不對）：
# 塩(地名用) -> 鹽；后 -> 後（「后」為「後」簡體，臺南門牌資料 0 筆「后」可安全轉換）
CUSTOM_VARIANTS = {
    "塩": "鹽",
    "后": "後",
}

# 規則性統一：臺/台、裏/裡 -> 里（門牌地址幾乎無「裡/裏」義）
RULE_CHARS = {"臺": "台", "裏": "里", "裡": "里"}

# 門牌特殊字元：移除括號（「(檨)林里」「石[石曹]里」）
STRIP_RE = re.compile(r"[()\[\]（）　\s]+")


def load_variant_tables() -> tuple[dict[str, str], dict[str, str]]:
    variants: dict[str, str] = dict(CUSTOM_VARIANTS)
    simplified: dict[str, str] = {}

    if OPENCC_DICT.is_dir():
        # 異體字 -> 台灣正體（TWVariants.txt：第一欄異體、第二欄正體）
        try:
            with (OPENCC_DICT / "TWVariants.txt").open(encoding="utf-8") as f:
                for line in f:
                    line = line.rstrip("\n")
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split()
                    if len(parts) == 2 and len(parts[0]) == 1:
                        variants[parts[0]] = parts[1]
        except OSError:
            pass

        # 簡體 -> 繁體（僅收「一對一」且不歧義的單字；排除 台/里/庄/后/干 等多義字）
        try:
            with (OPENCC_DICT / "STCharacters.txt").open(encoding="utf-8") as f:
                for line in f:
                    line = line.rstrip("\n")
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split()
                    if len(parts) == 2 and len(parts[0]) == 1 and len(parts[1]) == 1 and parts[0] != parts[1]:
                        if parts[0] in {"台", "里", "庄", "后", "干", "发", "面", "钟", "舍", "系", "范", "郁", "沈"}:
                            continue
                        simplified[parts[0]] = parts[1]
        except OSError:
            pass
    return variants, simplified


def build_normalizer(variants: dict[str, str], simplified: dict[str, str]) -> dict[str, str]:
    table: dict[str, str] = {}
    for source, target in variants.items():
        if len(source) == 1:
            table.setdefault(source, target)
    for source, target in simplified.items():
        if len(source) == 1:
            table.setdefault(source, target)
    for source, target in RULE_CHARS.items():
        table.setdefault(source, target)
    return table


def tm2_to_lat_lng(x: float, y: float) -> tuple[float, float]:
    a, b = 6378137.0, 6356752.314245
    lng0 = 121.0 * PI / 180.0
    k0 = 0.9999
    x -= 250000.0
    e2 = 1.0 - (b**2.0) / (a**2.0)
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    m_val = y / k0
    mu = m_val / (a * (1.0 - e2 / 4.0 - 3.0 * (e2**2.0) / 64.0 - 5.0 * (e2**3.0) / 256.0))
    j1 = 3.0 * e1 / 2.0 - 27.0 * (e1**3.0) / 32.0
    j2 = 21.0 * (e1**2.0) / 16.0 - 55.0 * (e1**4.0) / 32.0
    j3 = 151.0 * (e1**3.0) / 96.0
    j4 = 1097.0 * (e1**4.0) / 512.0
    fp = mu + j1 * math.sin(2.0 * mu) + j2 * math.sin(4.0 * mu) + j3 * math.sin(6.0 * mu) + j4 * math.sin(8.0 * mu)
    ep2 = ((a**2.0) - (b**2.0)) / (b**2.0)
    c1 = ep2 * (math.cos(fp) ** 2.0)
    t1 = math.tan(fp) ** 2.0
    r1 = a * (1.0 - e2) / ((1.0 - e2 * (math.sin(fp) ** 2.0)) ** 1.5)
    n1 = a / math.sqrt(1.0 - e2 * (math.sin(fp) ** 2.0))
    d_val = x / (n1 * k0)
    q1 = n1 * math.tan(fp) / r1
    q2 = (d_val**2.0) / 2.0
    q3 = (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * (c1**2.0) - 9.0 * ep2) * (d_val**4.0) / 24.0
    q4 = (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * (t1**2.0) - 3.0 * (c1**2.0) - 252.0 * ep2) * (d_val**6.0) / 720.0
    lat = fp - q1 * (q2 - q3 + q4)
    q5 = d_val
    q6 = (1.0 + 2.0 * t1 + c1) * (d_val**3.0) / 6.0
    q7 = (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * (c1**2.0) + 8.0 * ep2 + 24.0 * (t1**2.0)) * (d_val**5.0) / 120.0
    lng = lng0 + (q5 - q6 + q7) / math.cos(fp)
    return lat * 180.0 / PI, lng * 180.0 / PI


def normalize(text: str, table: dict[str, str]) -> str:
    text = unicodedata.normalize("NFKC", text)
    chars = [table.get(ch, ch) for ch in text]
    return STRIP_RE.sub("", "".join(chars)).replace("號", "")


def main() -> None:
    variants, simplified = load_variant_tables()
    table = build_normalizer(variants, simplified)
    print(f"異體字表: {len(table)} 字（異體 {len(variants)}、簡體 {len(simplified)}）")

    ADDR_DIR.mkdir(exist_ok=True)
    roads: list[dict] = []
    road_index: dict[tuple[str, str, str, str], int] = {}
    district_counts: Counter[str] = Counter()
    total = 0
    skipped = 0

    def addr_row(row: list[str]) -> dict | None:
        nonlocal total, skipped
        try:
            e, n = float(row[9]), float(row[10])
        except ValueError:
            skipped += 1
            return None
        lat, lng = tm2_to_lat_lng(e, n)
        if not (22.5 <= lat <= 23.8 and 119.9 <= lng <= 120.7):
            skipped += 1
            return None

        code2 = row[1][3:5]
        district = DISTRICT_MAP.get(code2, "")
        village = row[2].strip()
        neighborhood = row[3].strip()
        road = row[4].strip()
        region = row[5].strip()
        lane = row[6].strip()
        alley = row[7].strip()
        number = row[8].strip()

        full = f"{village}"
        if neighborhood:
            full += f"{neighborhood}鄰"
        full += region + road
        if lane and not lane.endswith("巷"):
            full += f"{lane}巷"
        elif lane:
            full += lane
        if alley and not alley.endswith("弄"):
            full += f"{alley}弄"
        elif alley:
            full += alley
        full += number

        total += 1
        district_counts[district] += 1
        return {
            "r": full,
            "la": round(lat, 5),
            "ln": round(lng, 5),
        }

    with io.open(ADDR_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        per_district: dict[str, list[dict]] = defaultdict(list)
        for row in reader:
            if len(row) < 11:
                skipped += 1
                continue
            record = addr_row(row)
            if record is None:
                continue
            code2 = row[1][3:5]
            per_district[code2].append(record)

            village = row[2].strip()
            region = row[5].strip()
            road = row[4].strip()
            key = (code2, village, region, road)
            if key not in road_index:
                road_index[key] = len(roads)
                roads.append({
                    "d": code2,
                    "v": village,
                    "r": f"{region}{road}",
                    "k": normalize(f"臺南市{DISTRICT_MAP[code2]}{village}{region}{road}", table),
                    "n": 0,
                    "la": record["la"],
                    "ln": record["ln"],
                })
            roads[road_index[key]]["n"] += 1

    # 寫分區門牌檔
    for code2, records in per_district.items():
        path = ADDR_DIR / f"{code2}.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  addr/{code2}.json: {len(records):,} 筆 ({path.stat().st_size/1024/1024:.1f} MB)")

    # 寫路名索引
    index = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "source": ADDR_CSV.name,
        "count": total,
        "districts": DISTRICT_MAP,
        "roads": roads,
    }
    index_path = DATA_DIR / "addr-index.json"
    with index_path.open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"addr-index.json: {len(roads):,} 條路名 ({index_path.stat().st_size/1024/1024:.1f} MB)")

    # 寫前端正規化表（異體+簡體，前端 JS 用）
    variant_data = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "variants": table,
    }
    var_path = DATA_DIR / "addr-variants.json"
    with var_path.open("w", encoding="utf-8") as f:
        json.dump(variant_data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"addr-variants.json: {len(table)} 字 ({var_path.stat().st_size/1024:.1f} KB)")

    print(f"總門牌 {total:,}，跳過 {skipped:,}")
    print("各區門牌數：", dict(district_counts.most_common()))

    # 更新 meta.json 的地址資料版本戳記（前端用它判斷地址資料是否需要重新下載）
    meta_path = DATA_DIR / "meta.json"
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        addr_files = [index_path, var_path, *ADDR_DIR.glob("*.json")]
        meta["addrUpdated"] = max(p.stat().st_mtime for p in addr_files).isoformat(timespec="seconds")
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"meta.json addrUpdated = {meta['addrUpdated']}")
    except (OSError, ValueError) as error:
        print(f"警告：無法更新 meta.json addrUpdated（{error}）")


if __name__ == "__main__":
    main()