// ============================================================
// 前面道路幅員の両端矢印アロー（detail.js drawRoadWidthArrows の移植）
// 案件領域ポリゴンの各辺について、frontRoads に幅員があれば中点から
// 外向き垂直方向へ幅員ぶん伸びる両端矢印を描く。
// ============================================================

import type L from "leaflet";
import type { FrontRoad, LatLng } from "@/lib/types";

const ARROW_COLOR = "#b91c1c";
const METER_PER_LAT = 111000;

/**
 * ポリゴンの巻き方向（反時計回りか）。x=lng, y=lat の符号付き面積で判定する。
 * 外向き法線の向きはこの巻き方向だけで一意に決まる（凹多角形でも正しい。
 * 重心からの方向で判定する旧方式は凹形で破綻するため使わない）。
 */
export function polygonWindingCCW(points: LatLng[]): boolean {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    area += lng1 * lat2 - lng2 * lat1;
  }
  return area > 0;
}

/** 辺方向の単位ベクトル (eE,eN) に対するポリゴン外向き単位法線。 */
export function outwardPerp(eE: number, eN: number, ccw: boolean): { perpE: number; perpN: number } {
  // CCW: 内側は進行方向左 → 外向きは右回り (eN,-eE)。CW はその反対。
  return ccw ? { perpE: eN, perpN: -eE } : { perpE: -eN, perpN: eE };
}

/** map に矢印・矢頭・ラベルを描く。追加した Layer 配列を返す（cleanup 用）。 */
export function drawRoadWidthArrows(
  Lib: typeof L,
  map: L.Map,
  polygonPoints: LatLng[],
  frontRoads: FrontRoad[],
): L.Layer[] {
  const layers: L.Layer[] = [];
  if (!Array.isArray(frontRoads) || frontRoads.length === 0) return layers;
  if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) return layers;

  const meterPerLng = (lat: number) => 111000 * Math.cos((lat * Math.PI) / 180);
  const offsetLL = (latlng: L.LatLng, dE: number, dN: number) =>
    Lib.latLng(
      latlng.lat + dN / METER_PER_LAT,
      latlng.lng + dE / meterPerLng(latlng.lat),
    );

  const ccw = polygonWindingCCW(polygonPoints);

  const makeArrowhead = (
    apex: L.LatLng,
    dirE: number,
    dirN: number,
    size: number,
    perpE: number,
    perpN: number,
  ): L.LatLngExpression[] => {
    const baseCenter = offsetLL(apex, -dirE * size, -dirN * size);
    const v1 = offsetLL(baseCenter, perpE * size * 0.5, perpN * size * 0.5);
    const v2 = offsetLL(baseCenter, -perpE * size * 0.5, -perpN * size * 0.5);
    return [apex, v1, v2];
  };

  const add = (layer: L.Layer) => {
    layer.addTo(map);
    layers.push(layer);
  };

  for (const entry of frontRoads) {
    const i = entry.edgeIndex;
    const w = Number(entry.width);
    if (!isFinite(w) || w <= 0) continue;
    if (i < 0 || i >= polygonPoints.length) continue;

    const a = Lib.latLng(polygonPoints[i]);
    const b = Lib.latLng(polygonPoints[(i + 1) % polygonPoints.length]);
    const mid = Lib.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const latAvg = mid.lat;

    const dE = (b.lng - a.lng) * meterPerLng(latAvg);
    const dN = (b.lat - a.lat) * METER_PER_LAT;
    const edgeLen = Math.sqrt(dE * dE + dN * dN);
    if (edgeLen === 0) continue;
    const edgeE = dE / edgeLen;
    const edgeN = dN / edgeLen;

    // 外向き法線は巻き方向だけで決まる（凹形でも正しい）。
    const { perpE, perpN } = outwardPerp(edgeE, edgeN, ccw);

    const start = mid;
    const end = offsetLL(start, perpE * w, perpN * w);

    add(
      Lib.polyline([start, end], {
        color: ARROW_COLOR,
        weight: 2,
        opacity: 0.95,
        interactive: false,
      }),
    );

    const arrowSize = Math.min(Math.max(w * 0.18, 0.6), 1.4);

    add(
      Lib.polygon(makeArrowhead(start, -perpE, -perpN, arrowSize, edgeE, edgeN), {
        color: ARROW_COLOR,
        fillColor: ARROW_COLOR,
        weight: 0,
        fillOpacity: 1,
        opacity: 1,
        interactive: false,
      }),
    );
    add(
      Lib.polygon(makeArrowhead(end, perpE, perpN, arrowSize, edgeE, edgeN), {
        color: ARROW_COLOR,
        fillColor: ARROW_COLOR,
        weight: 0,
        fillOpacity: 1,
        opacity: 1,
        interactive: false,
      }),
    );

    const labelOffsetTangent = arrowSize * 1.4;
    const labelPos = offsetLL(
      start,
      perpE * (w / 2) + edgeE * labelOffsetTangent,
      perpN * (w / 2) + edgeN * labelOffsetTangent,
    );
    add(
      Lib.marker(labelPos, {
        icon: Lib.divIcon({
          className: "road-width-label",
          html: `${w.toFixed(1)} m`,
          iconSize: undefined,
        }),
        interactive: false,
        keyboard: false,
      }),
    );
  }

  return layers;
}
