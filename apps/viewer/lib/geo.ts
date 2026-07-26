// ============================================================
// 幾何ヘルパー（db.py の parcel_ring / polygon_area_tsubo / convex_hull の移植。
// 面積は ㎡ 保存へ移行し polygonAreaM2 になった）
// ============================================================

import type { LatLng } from "./types";

/** GeoJSON Polygon の geometry。座標は [lng, lat] 順・外周リング末尾は始点の繰り返し。 */
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/**
 * GeoJSON リング（[lng,lat]・末尾は始点の繰り返し）→ [[lat,lng]]。
 * 末尾の繰り返し点を落とす。
 */
export function parcelRing(geometry: GeoJsonPolygon): LatLng[] {
  return geometry.coordinates[0]
    .slice(0, -1)
    .map(([lng, lat]) => [lat, lng] as LatLng);
}

/** 1 坪 = 3.305785 ㎡。 */
export const M2_PER_TSUBO = 3.305785;

/**
 * ㎡ → 坪（小数第 3 位以下は切り捨て）。null 透過（表示用）。
 * 不動産の坪表記は面積を過大に見せない切り捨てが慣行
 * （地権者一覧シートも 2.51㎡ → 0.75坪、267.86㎡ → 81.02坪）。
 * 1e-9 は浮動小数の誤差で 1 つ下に落ちるのを防ぐ補正。
 */
export function m2ToTsubo(m2: number | null): number | null {
  if (m2 === null || m2 === undefined || !Number.isFinite(Number(m2))) return null;
  return Math.floor((Number(m2) / M2_PER_TSUBO) * 100 + 1e-9) / 100;
}

/**
 * [[lat,lng]] ポリゴンの面積を ㎡ で返す（重心緯度での平面近似 + 靴ひも公式）。
 * 小数第 2 位で四捨五入。保存単位は登記の正本にあわせ ㎡（坪は表示時に換算）。
 */
export function polygonAreaM2(latlngs: LatLng[]): number {
  if (!latlngs || latlngs.length < 3) return 0;
  const lat0 = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
  const lng0 = latlngs[0][1];
  const M_PER_LAT = 111320;
  const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const pts = latlngs.map(
    ([lat, lng]) => [(lng - lng0) * mPerLng, (lat - lat0) * M_PER_LAT] as const,
  );
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area2 += x1 * y2 - x2 * y1;
  }
  const sqm = Math.abs(area2) / 2;
  return Math.round(sqm * 100) / 100;
}

/**
 * 点群の凸包（Andrew's monotone chain）。サンプル案件の領域自動生成に使う。
 * 入力・出力ともに [lat, lng]。db.py の convex_hull と同じく座標タプルの
 * 辞書順ソート（lat 優先）で計算する。
 */
export function convexHull(points: LatLng[]): LatLng[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;

  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: LatLng[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: LatLng[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
