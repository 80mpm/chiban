// 公図の位置合わせ・筆の描画で、目安として地図に出す案件の形（案件領域・追加済みの土地）。

import type { LatLng, Project } from "@chiban/shared/lib/types";
import type { ReferenceShapes } from "@/components/map/KouzuAlignMap";

/** 台東区の中心付近（案件領域も土地も無いときの既定位置）。 */
const DEFAULT_CENTER: LatLng = [35.71, 139.78];

export function referenceShapes(proj: Project): ReferenceShapes {
  return {
    projectPolygon: Array.isArray(proj.polygon) && proj.polygon.length >= 3 ? proj.polygon : null,
    lands: (proj.lands ?? [])
      .filter((l) => Array.isArray(l.polygon) && l.polygon.length >= 3)
      .map((l) => ({ polygon: l.polygon, label: l.chiban })),
  };
}

/** 公図を初めて置く位置（案件領域 → 土地 → 既定位置の順で、その点群の外接矩形の中心）。 */
export function referenceCenter(proj: Project): LatLng {
  const shapes = referenceShapes(proj);
  const pts = shapes.projectPolygon ?? shapes.lands.flatMap((l) => l.polygon);
  if (pts.length === 0) return DEFAULT_CENTER;
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];
}
