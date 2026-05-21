from __future__ import annotations

import argparse
import json
import math
import time
import urllib.request
import ssl
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TILES_DIR = ROOT / "tiles"

def lat_lng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2**zoom
    x = int((lng + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y

def tile_ranges(bounds: list[list[float]], zoom: int) -> tuple[range, range]:
    (south, west), (north, east) = bounds
    west_x, north_y = lat_lng_to_tile(north, west, zoom)
    east_x, south_y = lat_lng_to_tile(south, east, zoom)
    return range(west_x, east_x + 1), range(north_y, south_y + 1)

def load_bounds() -> list[list[float]]:
    meta = json.loads((ROOT / "data" / "meta.json").read_text(encoding="utf-8"))
    return meta["bounds"]

def main() -> None:
    parser = argparse.ArgumentParser(description="下載內政部國土測繪中心地圖圖磚")
    parser.add_argument("--url-template", default="https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}")
    parser.add_argument("--min-zoom", type=int, default=8)
    parser.add_argument("--max-zoom", type=int, default=15)
    parser.add_argument("--attribution", default="© 內政部國土測繪中心")
    parser.add_argument("--delay", type=float, default=0.2, help="每次下載停頓秒數")
    parser.add_argument("--insecure", action="store_true", help="遇到憑證問題時才使用：略過 SSL 憑證驗證")
    args = parser.parse_args()

    bounds = load_bounds()
    total = 0
    for zoom in range(args.min_zoom, args.max_zoom + 1):
        xs, ys = tile_ranges(bounds, zoom)
        total += len(xs) * len(ys)
    print(f"準備下載 {args.min_zoom}-{args.max_zoom} 級圖磚，共計約 {total:,} 張。")

    ctx = None
    if args.insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    downloaded = 0
    skipped = 0
    failed = 0

    for zoom in range(args.min_zoom, args.max_zoom + 1):
        xs, ys = tile_ranges(bounds, zoom)
        for x in xs:
            for y in ys:
                target = TILES_DIR / str(zoom) / str(x) / f"{y}.png"

                # 斷點續傳：如果檔案已經存在且有內容，就跳過
                if target.exists() and target.stat().st_size > 0:
                    skipped += 1
                    continue

                target.parent.mkdir(parents=True, exist_ok=True)
                url = args.url_template.format(z=zoom, x=x, y=y)

                try:
                    req = urllib.request.Request(
                        url,
                        headers={
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    )

                    with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
                        target.write_bytes(response.read())
                    downloaded += 1

                    if downloaded % 100 == 0:
                        print(f"已下載 {downloaded:,} 張, 跳過 {skipped:,} 張, 失敗 {failed:,} 張")

                    time.sleep(args.delay)

                except Exception as exc:
                    failed += 1
                    print(f"下載失敗 {url}: {exc}")

    manifest = {
        "minZoom": args.min_zoom,
        "maxZoom": args.max_zoom,
        "bounds": bounds,
        "attribution": args.attribution,
    }
    (TILES_DIR / "manifest.js").write_text(
        "window.PORTABLE_TILE_MANIFEST = " + json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"下載完成！總計下載={downloaded:,}, 跳過={skipped:,}, 失敗={failed:,}")

if __name__ == "__main__":
    main()
