from __future__ import annotations

import json
import shutil
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "portable-map"
ASSETS = DIST / "assets"
PORTABLE_DATA = DIST / "portable"
ZIP_PATH = ROOT / "portable-map.zip"

LEAFLET_VERSION = "1.9.4"
LEAFLET_FILES = {
    "leaflet.css": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/leaflet.css",
    "leaflet.js": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/leaflet.js",
    "images/layers.png": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/images/layers.png",
    "images/layers-2x.png": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/images/layers-2x.png",
    "images/marker-icon.png": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/images/marker-icon.png",
    "images/marker-icon-2x.png": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/images/marker-icon-2x.png",
    "images/marker-shadow.png": f"https://unpkg.com/leaflet@{LEAFLET_VERSION}/dist/images/marker-shadow.png",
}


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return
    print(f"download {url}")
    with urllib.request.urlopen(url, timeout=60) as response:
        target.write_bytes(response.read())


def portable_html() -> str:
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    html = html.replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "assets/leaflet.css")
    html = html.replace('<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>', '<script src="assets/leaflet.js"></script>')
    html = html.replace('<script src="app.js"></script>', '<script src="portable/data.js"></script>\n    <script src="app.js"></script>')
    return html


def write_portable_data() -> None:
    meta = json.loads((ROOT / "data" / "meta.json").read_text(encoding="utf-8"))
    points_text = (ROOT / "data" / "points.json").read_text(encoding="utf-8")
    PORTABLE_DATA.mkdir(parents=True, exist_ok=True)
    data_js = (
        "window.PORTABLE_MAP_META = "
        + json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.PORTABLE_MAP_POINTS = "
        + points_text.strip()
        + ";\n"
    )
    (PORTABLE_DATA / "data.js").write_text(data_js, encoding="utf-8")


def write_readme() -> None:
    text = """# USB 可攜版土木設備分布地圖

使用方式：

1. 將整個 `portable-map` 資料夾複製到 USB。
2. 在任何電腦上直接雙擊 `index.html`。

不需要安裝 Python、Git 或其他軟體。

注意：

- 離線時，道路底圖無法從 OpenStreetMap 下載，但設備點位、聚合、搜尋、標籤與資訊窗仍可使用。
- 若電腦有網路，請使用線上 GitHub Pages 版本，會有完整道路底圖。
- 瀏覽器定位功能可能需要 HTTPS 或瀏覽器權限；離線 file 模式下部分瀏覽器可能不允許定位。
"""
    (DIST / "README.txt").write_text(text, encoding="utf-8")


def make_zip() -> None:
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in DIST.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT))


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    ASSETS.mkdir()

    (DIST / "index.html").write_text(portable_html(), encoding="utf-8")
    shutil.copy2(ROOT / "web" / "app.js", DIST / "app.js")
    shutil.copy2(ROOT / "web" / "styles.css", DIST / "styles.css")
    write_portable_data()
    write_readme()

    for relative, url in LEAFLET_FILES.items():
        download(url, ASSETS / relative)

    make_zip()
    print(f"created {DIST}")
    print(f"created {ZIP_PATH}")


if __name__ == "__main__":
    main()
