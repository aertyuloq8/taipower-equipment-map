// 座標轉換：WGS84 ↔ TWD67 TM2 / TPC 圖號碼
// 從 indexV2.html 內聯主邏輯抽離，數學完全不動
const PI = Math.PI;

function wgs84ToTwd67Tm2(latDeg, lngDeg) {
  const lat = (latDeg * PI) / 180.0, lng = (lngDeg * PI) / 180.0;
  const a84 = 6378137.0, b84 = 6356752.314245;
  const a67 = 6378160.0, b67 = 6356774.7192;
  const e2_84 = 1 - b84 ** 2 / a84 ** 2;
  const n84 = a84 / Math.sqrt(1 - e2_84 * Math.sin(lat) ** 2);
  const x84 = n84 * Math.cos(lat) * Math.cos(lng), y84 = n84 * Math.cos(lat) * Math.sin(lng), z84 = n84 * (1 - e2_84) * Math.sin(lat);
  const dx = -752.0, dy = -358.0, dz = -179.0, rx = -0.0000011698, ry = 0.0000018398, rz = 0.0000009822, s = 0.00002329;
  const x67 = x84 - dx - s * x84 + rz * y84 - ry * z84, y67 = y84 - dy - rz * x84 - s * y84 + rx * z84, z67 = z84 - dz + ry * x84 - rx * y84 - s * z84;
  const e2_67 = 1 - b67 ** 2 / a67 ** 2, ep2_67 = (a67 ** 2 - b67 ** 2) / b67 ** 2;
  const p = Math.sqrt(x67 ** 2 + y67 ** 2), theta = Math.atan2(z67 * a67, p * b67);
  const lat67 = Math.atan2(z67 + ep2_67 * b67 * Math.sin(theta) ** 3, p - e2_67 * a67 * Math.cos(theta) ** 3), lng67 = Math.atan2(y67, x67);
  const lng0 = (121.0 * PI) / 180.0, k0 = 0.9999, e_prime2 = e2_67 / (1.0 - e2_67), nu = a67 / Math.sqrt(1.0 - e2_67 * Math.sin(lat67) ** 2), p_lon = lng67 - lng0;
  const A = a67 * (1.0 - e2_67 / 4.0 - (3.0 * e2_67 ** 2) / 64.0 - (5.0 * e2_67 ** 3) / 256.0), B = a67 * ((3.0 * e2_67) / 8.0 + (3.0 * e2_67 ** 2) / 32.0 + (45.0 * e2_67 ** 3) / 1024.0), C = a67 * ((15.0 * e2_67 ** 2) / 256.0 + (45.0 * e2_67 ** 3) / 1024.0), D = a67 * ((35.0 * e2_67 ** 3) / 3072.0);
  const M = A * lat67 - B * Math.sin(2.0 * lat67) + C * Math.sin(4.0 * lat67) - D * Math.sin(6.0 * lat67);
  const sinLat = Math.sin(lat67), cosLat = Math.cos(lat67), tanLat = Math.tan(lat67), t = tanLat ** 2, c = e_prime2 * cosLat ** 2;
  const tm2_x = k0 * nu * p_lon * cosLat * (1.0 + (p_lon ** 2 / 6.0) * cosLat ** 2 * (1.0 - t + c) + (p_lon ** 4 / 120.0) * cosLat ** 4 * (5.0 - 18.0 * t + t ** 2 + 72.0 * c - 58.0 * e_prime2));
  const tm2_y = k0 * (M + nu * tanLat * ((p_lon ** 2 / 2.0) * cosLat ** 2 + (p_lon ** 4 / 24.0) * cosLat ** 4 * (5.0 - t + 9.0 * c + 4.0 * c ** 2) + (p_lon ** 6 / 720.0) * cosLat ** 6 * (61.0 - 58.0 * t + t ** 2 + 600.0 * c - 330.0 * e_prime2)));
  return { x: tm2_x + 250000.0, y: tm2_y };
}

const GRID_BASES = {
  A: [170000, 2750000], B: [250000, 2750000], C: [330000, 2750000],
  D: [170000, 2700000], E: [250000, 2700000], F: [330000, 2700000],
  G: [170000, 2650000], H: [250000, 2650000],
  J: [90000,  2600000], K: [170000, 2600000], L: [250000, 2600000],
  M: [90000,  2550000], N: [170000, 2550000], O: [250000, 2550000],
  P: [90000,  2500000], Q: [170000, 2500000], R: [250000, 2500000],
  T: [170000, 2450000], U: [250000, 2450000],
  V: [170000, 2400000], W: [250000, 2400000],
  // X、Y 位於左下方（西側）的兩個圖組。
  X: [90000, 2450000], Y: [90000, 2400000],
};

function tm2ToTpc(x, y) {
  let bestBase = "", bx = 0, by = 0;
  for (const [char, [cx, cy]] of Object.entries(GRID_BASES)) {
    const dx = x - cx, dy = y - cy;
    if (dx >= 0 && dx < 80000 && dy >= 0 && dy < 50000) { bestBase = char; bx = cx; by = cy; break; }
  }
  if (!bestBase) return "座標超出範圍";
  const dx = x - bx, dy = y - by;
  const t2x = String(Math.floor(dx / 800)).padStart(2, "0"), t2y = String(Math.floor(dy / 500)).padStart(2, "0");
  const remX = dx % 800, remY = dy % 500;
  const t3x = String.fromCharCode(65 + Math.floor(remX / 100)), t3y = String.fromCharCode(65 + Math.floor(remY / 100));
  const rremX = remX % 100, rremY = remY % 100;
  const t5x = String(Math.floor(rremX / 10)), t5y = String(Math.floor(rremY / 10));
  const t99x = String(Math.floor(rremX % 10)), t99y = String(Math.floor(rremY % 10));
  return `${bestBase}${t2x}${t2y}${t3x}${t3y}${t5x}${t5y}${t99x}${t99y}`;
}

function latLngToTpcCode(lat, lng) {
  try { const { x, y } = wgs84ToTwd67Tm2(lat, lng); return tm2ToTpc(x, y); }
  catch (e) { return `GPS_${lat.toFixed(4)}_${lng.toFixed(4)}`; }
}

function twd67Tm2ToWgs84(tm2X, tm2Y) {
  const a67 = 6378160.0, b67 = 6356774.7192, e2_67 = 1 - (b67 * b67) / (a67 * a67), e_p2 = e2_67 / (1 - e2_67);
  const k0 = 0.9999, lng0 = (121.0 * PI) / 180.0;
  const A = a67 * (1 - e2_67 / 4 - (3 * e2_67 ** 2) / 64 - (5 * e2_67 ** 3) / 256);
  const M0 = tm2Y / k0, mu = M0 / A;
  const e1 = (1 - Math.sqrt(1 - e2_67)) / (1 + Math.sqrt(1 - e2_67));
  const lat1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sinL1 = Math.sin(lat1), cosL1 = Math.cos(lat1), tanL1 = Math.tan(lat1);
  const N1 = a67 / Math.sqrt(1 - e2_67 * sinL1 ** 2), R1 = (a67 * (1 - e2_67)) / Math.pow(1 - e2_67 * sinL1 ** 2, 1.5);
  const T1 = tanL1 ** 2, C1 = e_p2 * cosL1 ** 2, D2 = (tm2X - 250000) / (N1 * k0);
  const lat67 = lat1 - ((N1 * tanL1) / R1) * (D2 ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e_p2) * D2 ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e_p2 - 3 * C1 ** 2) * D2 ** 6) / 720);
  const lng67 = lng0 + (D2 - ((1 + 2 * T1 + C1) * D2 ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e_p2 + 24 * T1 ** 2) * D2 ** 5) / 120) / cosL1;
  const N67 = a67 / Math.sqrt(1 - e2_67 * Math.sin(lat67) ** 2);
  const x67 = N67 * Math.cos(lat67) * Math.cos(lng67), y67 = N67 * Math.cos(lat67) * Math.sin(lng67), z67 = N67 * (1 - e2_67) * Math.sin(lat67);
  const dxH = -752.0, dyH = -358.0, dzH = -179.0, rx = -0.0000011698, ry = 0.0000018398, rz = 0.0000009822, s = 0.00002329;
  const x84 = x67 + dxH + s * x67 - rz * y67 + ry * z67, y84 = y67 + dyH + rz * x67 + s * y67 - rx * z67, z84 = z67 + dzH - ry * x67 + rx * y67 + s * z67;
  const a84 = 6378137.0, b84 = 6356752.314245, e2_84 = 1 - (b84 * b84) / (a84 * a84), ep2_84 = (a84 * a84 - b84 * b84) / (b84 * b84);
  const p = Math.sqrt(x84 ** 2 + y84 ** 2), theta = Math.atan2(z84 * a84, p * b84);
  const lat84 = Math.atan2(z84 + ep2_84 * b84 * Math.sin(theta) ** 3, p - e2_84 * a84 * Math.cos(theta) ** 3), lng84 = Math.atan2(y84, x84);
  return { lat: (lat84 * 180) / PI, lng: (lng84 * 180) / PI };
}

const TPC_CODE_PATTERN = /^[A-Z]\d{4}[A-H][A-E]\d{2}(?:\d{2})?$/;
function normalizeTpcCode(rawCode) {
  const code = String(rawCode ?? "").trim().toUpperCase().replace(/[\s._\-．－]+/g, "");
  return TPC_CODE_PATTERN.test(code) && GRID_BASES[code[0]] ? code : null;
}

function tpcCodeToLatLng(code) {
  try {
    const c = normalizeTpcCode(code);
    if (!c) return null;
    const base = c[0]; const baseCoords = GRID_BASES[base]; if (!baseCoords) return null;
    const [bx, by] = baseCoords;
    const t2x = parseInt(c.slice(1, 3)), t2y = parseInt(c.slice(3, 5));
    const t3x = c.charCodeAt(5) - 65, t3y = c.charCodeAt(6) - 65;
    const t5x = parseInt(c[7]), t5y = parseInt(c[8]);
    if ([t2x, t2y, t3x, t3y, t5x, t5y].some(isNaN)) return null;
    let t99x = 5, t99y = 5;
    if (c.length >= 11) { t99x = parseInt(c[9]) + 0.5; t99y = parseInt(c[10]) + 0.5; }
    const dx = t2x * 800 + t3x * 100 + t5x * 10 + t99x, dy = t2y * 500 + t3y * 100 + t5y * 10 + t99y;
    const tm2_x_fe = bx + dx, tm2_y = by + dy;
    const a67 = 6378160.0, b67 = 6356774.7192, e2_67 = 1 - (b67 * b67) / (a67 * a67), e_p2 = e2_67 / (1 - e2_67);
    const k0 = 0.9999, lng0 = (121.0 * PI) / 180.0;
    const A = a67 * (1 - e2_67 / 4 - (3 * e2_67 ** 2) / 64 - (5 * e2_67 ** 3) / 256);
    const M0 = tm2_y / k0, mu = M0 / A;
    const e1 = (1 - Math.sqrt(1 - e2_67)) / (1 + Math.sqrt(1 - e2_67));
    const lat1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const sinL1 = Math.sin(lat1), cosL1 = Math.cos(lat1), tanL1 = Math.tan(lat1);
    const N1 = a67 / Math.sqrt(1 - e2_67 * sinL1 ** 2), R1 = (a67 * (1 - e2_67)) / Math.pow(1 - e2_67 * sinL1 ** 2, 1.5);
    const T1 = tanL1 ** 2, C1 = e_p2 * cosL1 ** 2, D2 = (tm2_x_fe - 250000) / (N1 * k0);
    const lat67 = lat1 - ((N1 * tanL1) / R1) * (D2 ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e_p2) * D2 ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e_p2 - 3 * C1 ** 2) * D2 ** 6) / 720);
    const lng67 = lng0 + (D2 - ((1 + 2 * T1 + C1) * D2 ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e_p2 + 24 * T1 ** 2) * D2 ** 5) / 120) / cosL1;
    const N67 = a67 / Math.sqrt(1 - e2_67 * Math.sin(lat67) ** 2);
    const x67 = N67 * Math.cos(lat67) * Math.cos(lng67), y67 = N67 * Math.cos(lat67) * Math.sin(lng67), z67 = N67 * (1 - e2_67) * Math.sin(lat67);
    const dxH = -752.0, dyH = -358.0, dzH = -179.0, rx = -0.0000011698, ry = 0.0000018398, rz = 0.0000009822, s = 0.00002329;
    const x84 = x67 + dxH + s * x67 - rz * y67 + ry * z67, y84 = y67 + dyH + rz * x67 + s * y67 - rx * z67, z84 = z67 + dzH - ry * x67 + rx * y67 + s * z67;
    const a84 = 6378137.0, b84 = 6356752.314245, e2_84 = 1 - (b84 * b84) / (a84 * a84), ep2_84 = (a84 * a84 - b84 * b84) / (b84 * b84);
    const p = Math.sqrt(x84 ** 2 + y84 ** 2), theta = Math.atan2(z84 * a84, p * b84);
    const lat84 = Math.atan2(z84 + ep2_84 * b84 * Math.sin(theta) ** 3, p - e2_84 * a84 * Math.cos(theta) ** 3), lng84 = Math.atan2(y84, x84);
    return { lat: (lat84 * 180) / PI, lng: (lng84 * 180) / PI };
  } catch (e) { return null; }
}

window.wgs84ToTwd67Tm2 = wgs84ToTwd67Tm2;
window.GRID_BASES = GRID_BASES;
window.tm2ToTpc = tm2ToTpc;
window.latLngToTpcCode = latLngToTpcCode;
window.twd67Tm2ToWgs84 = twd67Tm2ToWgs84;
window.normalizeTpcCode = normalizeTpcCode;
window.tpcCodeToLatLng = tpcCodeToLatLng;

export { wgs84ToTwd67Tm2, GRID_BASES, tm2ToTpc, latLngToTpcCode, twd67Tm2ToWgs84, normalizeTpcCode, tpcCodeToLatLng };
