// ============================================================
// 前面道路幅員の両端矢印アロー（detail.js drawRoadWidthArrows の移植）
// 案件領域ポリゴンの各辺について、frontRoads に幅員があれば中点から
// 外向き垂直方向へ幅員ぶん伸びる両端矢印を描く。
// ============================================================

import type L from "leaflet";
import type { FrontRoad, LatLng } from "@/lib/types";

const ARROW_COLOR = "#b91c1c";
const METER_PER_LAT = 111000;

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

  let cLat = 0;
  let cLng = 0;
  for (const [la, ln] of polygonPoints) {
    cLat += la;
    cLng += ln;
  }
  const centroid = Lib.latLng(cLat / polygonPoints.length, cLng / polygonPoints.length);

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

    const p1E = -edgeN;
    const p1N = edgeE;
    const p2E = edgeN;
    const p2N = -edgeE;

    const outRefE = (mid.lng - centroid.lng) * meterPerLng(latAvg);
    const outRefN = (mid.lat - centroid.lat) * METER_PER_LAT;
    const useP1 = p1E * outRefE + p1N * outRefN > p2E * outRefE + p2N * outRefN;
    const perpE = useP1 ? p1E : p2E;
    const perpN = useP1 ? p1N : p2N;

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
