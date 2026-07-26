// ============================================================
// 公図風 SVG の座標計算（detail.js buildKouzuView / edit.js setupKouzuView から抽出）
// 緯度経度 → ローカル平面メートル座標（重心緯度の正距円筒近似・北上）。
// 純関数なのでテスト容易。SVG 描画は KouzuView が担う。
// ============================================================

import { polygonAreaM2 } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

export interface KouzuLayout {
  viewW: number;
  viewH: number;
  pad: number;
  fontSize: number;
  /** [lat,lng] → SVG 座標 [x,y]（左上原点・北が上）。 */
  toView: (p: LatLng) => [number, number];
}

/**
 * 表示対象の全ポリゴン（土地 + 候補筆）から SVG レイアウトを計算する。
 * labelPolys はラベル文字サイズ算出の基準（通常は土地、無ければ候補）。
 */
export function computeKouzuLayout(
  allPolys: LatLng[][],
  labelPolys: LatLng[][],
): KouzuLayout | null {
  const allPts = allPolys.flat();
  if (allPts.length === 0) return null;

  const lat0 = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
  const lng0 = allPts.reduce((s, p) => s + p[1], 0) / allPts.length;
  const M_PER_LAT = 111320;
  const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([lat, lng]: LatLng): [number, number] => [
    (lng - lng0) * mPerLng,
    -(lat - lat0) * M_PER_LAT,
  ];

  const xys = allPts.map(toXY);
  const minX = Math.min(...xys.map((p) => p[0]));
  const maxX = Math.max(...xys.map((p) => p[0]));
  const minY = Math.min(...xys.map((p) => p[1]));
  const maxY = Math.max(...xys.map((p) => p[1]));
  const extent = Math.max(maxX - minX, maxY - minY);
  const pad = extent * 0.08;
  const viewW = maxX - minX + pad * 2;
  const viewH = maxY - minY + pad * 2;

  const base = labelPolys.length ? labelPolys : allPolys;
  const avgAreaM2 =
    base.reduce((s, poly) => s + polygonAreaM2(poly), 0) / base.length;
  const fontSize = Math.min(extent / 30, Math.sqrt(avgAreaM2) * 0.16);

  const toView = (p: LatLng): [number, number] => {
    const [x, y] = toXY(p);
    return [x - minX + pad, y - minY + pad];
  };

  return { viewW, viewH, pad, fontSize, toView };
}

/** ポリゴンの重心（SVG 座標）。 */
export function centroid(pts: [number, number][]): [number, number] {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  return [cx / pts.length, cy / pts.length];
}
