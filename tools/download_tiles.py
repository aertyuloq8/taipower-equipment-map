from __future__ import annotations

import argparse
import json
import math
import time
import urllib.request
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
    parser = argparse.ArgumentParser(description="Download permitted map tiles for the USB portable map.")
    parser.add_argument("--url-template", required=True, help="Tile URL template, for example https://example.com/tiles/{z}/{x}/{y}.png")
    parser.add_argument("--min-zoom", type=int, default=8)
    parser.add_argument("--max-zoom", type=int, default=15)
    parser.add_argument("--attribution", default="本機離線圖磚")
    parser.add_argument("--delay", type=float, default=0.05, help="Delay between tile requests in seconds")
    parser.add_argument("--yes-i-have-permission", action="store_true", help="Confirm the provider allows offline/bulk tile downloads")
    args = parser.parse_args()

    if not args.yes_i_have_permission:
        raise SystemExit(
            "請先確認圖磚來源允許離線/批次下載，再加上 --yes-i-have-permission。\n"
            "不要用官方 tile.openstreetmap.org 大量下載圖磚。"
        )

    bounds = load_bounds()
    total = 0
    for zoom in range(args.min_zoom, args.max_zoom + 1):
        xs, ys = tile_ranges(bounds, zoom)
        total += len(xs) * len(ys)
    print(f"Will download up to {total:,} tiles for zoom {args.min_zoom}-{args.max_zoom}.")

    downloaded = 0
    skipped = 0
    failed = 0
    for zoom in range(args.min_zoom, args.max_zoom + 1):
        xs, ys = tile_ranges(bounds, zoom)
        for x in xs:
            for y in ys:
                target = TILES_DIR / str(zoom) / str(x) / f"{y}.png"
                if target.exists() and target.stat().st_size > 0:
                    skipped += 1
                    continue

                target.parent.mkdir(parents=True, exist_ok=True)
                url = args.url_template.format(z=zoom, x=x, y=y)
                try:
                    with urllib.request.urlopen(url, timeout=30) as response:
                        target.write_bytes(response.read())
                    downloaded += 1
                    if downloaded % 100 == 0:
                        print(f"downloaded {downloaded:,}, skipped {skipped:,}, failed {failed:,}")
                    time.sleep(args.delay)
                except Exception as exc:
                    failed += 1
                    print(f"failed {url}: {exc}")

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
    print(f"Done. downloaded={downloaded:,}, skipped={skipped:,}, failed={failed:,}")
    print("Run python tools\\build_portable.py again to include tiles in portable-map.")


if __name__ == "__main__":
    main()
