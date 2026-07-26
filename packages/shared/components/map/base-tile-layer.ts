import L from "leaflet";
import { MAP_TILES_DISABLED } from "../../lib/map-flags";

/**
 * ZENRIN 背景タイルを地図に載せる。
 * タイル停止中（MAP_TILES_DISABLED）はタイルを読み込まず、
 * 左下に注記コントロールを出す（ポリゴン等のオーバーレイはそのまま動く）。
 */
export function addBaseTileLayer(map: L.Map): void {
  if (!MAP_TILES_DISABLED) {
    L.tileLayer("/tile/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
    return;
  }
  const notice = new L.Control({ position: "bottomleft" });
  notice.onAdd = () => {
    const div = L.DomUtil.create("div", "map-tiles-disabled-notice");
    div.textContent = "背景地図は一時的に非表示です";
    return div;
  };
  notice.addTo(map);
}
