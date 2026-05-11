from __future__ import annotations

import json
import math
import mimetypes
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "points.json"
META_PATH = ROOT / "data" / "meta.json"
WEB_DIR = ROOT / "web"

POINTS: list[dict] = []
META: dict = {}


def load_data() -> None:
    global POINTS, META
    if not DATA_PATH.exists():
        raise FileNotFoundError("缺少 data/points.json，請先執行 python tools/convert_excel.py")
    POINTS = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if META_PATH.exists():
        META = json.loads(META_PATH.read_text(encoding="utf-8"))
    else:
        META = {"converted": len(POINTS)}
    print(f"Loaded {len(POINTS):,} points")


def to_float(params: dict[str, list[str]], key: str, default: float) -> float:
    try:
        return float(params.get(key, [default])[0])
    except (TypeError, ValueError):
        return default


def to_int(params: dict[str, list[str]], key: str, default: int) -> int:
    try:
        return int(float(params.get(key, [default])[0]))
    except (TypeError, ValueError):
        return default


def json_response(handler: SimpleHTTPRequestHandler, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def point_in_bounds(point: dict, south: float, west: float, north: float, east: float) -> bool:
    return south <= point["lat"] <= north and west <= point["lng"] <= east


def filter_points(params: dict[str, list[str]]) -> list[dict]:
    south = to_float(params, "south", -90)
    west = to_float(params, "west", -180)
    north = to_float(params, "north", 90)
    east = to_float(params, "east", 180)
    area = unquote(params.get("area", [""])[0]).strip()
    q = unquote(params.get("q", [""])[0]).strip().lower()

    filtered = []
    for point in POINTS:
        if not point_in_bounds(point, south, west, north, east):
            continue
        if area and point["area"] != area:
            continue
        if q and q not in point["name"].lower() and q not in point["code"].lower():
            continue
        filtered.append(point)
    return filtered


def cluster_points(points: list[dict], params: dict[str, list[str]], zoom: int) -> list[dict]:
    south = to_float(params, "south", -90)
    west = to_float(params, "west", -180)
    north = to_float(params, "north", 90)
    east = to_float(params, "east", 180)
    width = max(320, min(to_int(params, "width", 1280), 4096))
    height = max(240, min(to_int(params, "height", 720), 4096))

    cell_px = 72 if zoom <= 10 else 60 if zoom <= 12 else 48
    lat_cell = max((north - south) / max(1, height / cell_px), 0.00008)
    lng_cell = max((east - west) / max(1, width / cell_px), 0.00008)

    clusters: dict[tuple[int, int], dict] = {}
    for point in points:
        key = (math.floor(point["lat"] / lat_cell), math.floor(point["lng"] / lng_cell))
        cluster = clusters.get(key)
        if cluster is None:
            clusters[key] = {
                "type": "cluster",
                "count": 1,
                "latSum": point["lat"],
                "lngSum": point["lng"],
                "sample": point["name"],
                "area": point["area"],
            }
        else:
            cluster["count"] += 1
            cluster["latSum"] += point["lat"]
            cluster["lngSum"] += point["lng"]

    return [
        {
            "type": "cluster",
            "count": cluster["count"],
            "lat": round(cluster["latSum"] / cluster["count"], 7),
            "lng": round(cluster["lngSum"] / cluster["count"], 7),
            "sample": cluster["sample"],
            "area": cluster["area"],
        }
        for cluster in clusters.values()
    ]


def points_payload(params: dict[str, list[str]]) -> dict:
    zoom = to_int(params, "zoom", 8)
    limit = max(100, min(to_int(params, "limit", 1800), 5000))
    filtered = filter_points(params)

    if zoom >= 15 or len(filtered) <= limit:
        return {
            "mode": "points",
            "total": len(filtered),
            "returned": min(len(filtered), limit),
            "items": [
                {
                    "type": "point",
                    "id": point["id"],
                    "name": point["name"],
                    "code": point["code"],
                    "area": point["area"],
                    "lat": point["lat"],
                    "lng": point["lng"],
                }
                for point in filtered[:limit]
            ],
        }

    clusters = cluster_points(filtered, params, zoom)
    if len(clusters) > limit:
        clusters = sorted(clusters, key=lambda item: item["count"], reverse=True)[:limit]

    return {
        "mode": "clusters",
        "total": len(filtered),
        "returned": len(clusters),
        "items": clusters,
    }


def search_payload(params: dict[str, list[str]]) -> dict:
    q = unquote(params.get("q", [""])[0]).strip().lower()
    area = unquote(params.get("area", [""])[0]).strip()
    limit = max(1, min(to_int(params, "limit", 20), 50))
    if not q:
        return {"items": []}

    matches = []
    for point in POINTS:
        if area and point["area"] != area:
            continue
        name = point["name"].lower()
        code = point["code"].lower()
        if q in name or q in code:
            matches.append(point)
            if len(matches) >= limit:
                break

    return {
        "items": [
            {
                "id": point["id"],
                "name": point["name"],
                "code": point["code"],
                "area": point["area"],
                "lat": point["lat"],
                "lng": point["lng"],
            }
            for point in matches
        ]
    }


class MapHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/api/meta":
            json_response(self, META | {"loaded": len(POINTS)})
            return
        if parsed.path == "/api/points":
            json_response(self, points_payload(params))
            return
        if parsed.path == "/api/search":
            json_response(self, search_payload(params))
            return

        if parsed.path in {"/", "/index.html"}:
            self.path = "/web/index.html"
        elif parsed.path.startswith("/web/"):
            self.path = parsed.path
        else:
            target = WEB_DIR / parsed.path.lstrip("/")
            if target.exists():
                self.path = f"/web/{parsed.path.lstrip('/')}"

        return super().do_GET()

    def guess_type(self, path: str) -> str:
        if path.endswith(".js"):
            return "text/javascript"
        return mimetypes.guess_type(path)[0] or "application/octet-stream"

    def log_message(self, format: str, *args: object) -> None:
        if self.path.startswith("/api/points"):
            return
        super().log_message(format, *args)


def main() -> None:
    load_data()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), MapHandler)
    print("Open http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
