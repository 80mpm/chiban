// 案件の公図画像を地図に重ねる Leaflet レイヤー（Issue #44）。
// 画素 → 地図座標のアフィン変換を CSS の matrix() でかける。回転できる画像レイヤーは
// Leaflet 本体に無いため自前で持つ（プラグインに頼らない）。window 前提なので
// dynamic(ssr:false) で読み込む地図コンポーネントからのみ import すること。

import L from "leaflet";
import type { KouzuOverlay, LatLng } from "@chiban/shared/lib/types";
import { pixelToLatLng } from "./kouzu-overlay-geom";

/** 公図を描く専用ペイン（地図タイルの上・ポリゴンや描画中の線の下）。 */
const PANE = "kouzuPane";

/**
 * 公図画像のレイヤー。setOverlay で位置合わせを差し替えると即座に描き直す。
 * クリックは下の地図へ通す（pointer-events: none）ので、上に描画ツールを重ねられる。
 */
export class KouzuImageLayer extends L.Layer {
  private img: HTMLImageElement;
  private overlay: KouzuOverlay;

  constructor(src: string, overlay: KouzuOverlay) {
    super();
    this.overlay = overlay;
    this.img = document.createElement("img");
    this.img.src = src;
    this.img.alt = "";
    this.img.draggable = false;
    Object.assign(this.img.style, {
      position: "absolute",
      left: "0",
      top: "0",
      transformOrigin: "0 0",
      pointerEvents: "none",
      userSelect: "none",
      maxWidth: "none",
    });
  }

  onAdd(map: L.Map): this {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    map.getPane(PANE)!.appendChild(this.img);
    map.on("zoomend viewreset", this.update, this);
    // ズームアニメーション中は位置がずれるので隠し、終わったら描き直す
    map.on("zoomstart", this.hide, this);
    this.update();
    return this;
  }

  onRemove(map: L.Map): this {
    this.img.remove();
    map.off("zoomend viewreset", this.update, this);
    map.off("zoomstart", this.hide, this);
    return this;
  }

  setOverlay(overlay: KouzuOverlay): this {
    this.overlay = overlay;
    this.update();
    return this;
  }

  private hide() {
    this.img.style.visibility = "hidden";
  }

  private update() {
    const map = (this as unknown as { _map?: L.Map })._map;
    if (!map) return;
    const o = this.overlay;
    const toPt = (ll: LatLng) => map.latLngToLayerPoint(L.latLng(ll[0], ll[1]));
    const tl = toPt(pixelToLatLng(o, 0, 0));
    const tr = toPt(pixelToLatLng(o, o.imageWidth, 0));
    const bl = toPt(pixelToLatLng(o, 0, o.imageHeight));
    const a = (tr.x - tl.x) / o.imageWidth;
    const b = (tr.y - tl.y) / o.imageWidth;
    const c = (bl.x - tl.x) / o.imageHeight;
    const d = (bl.y - tl.y) / o.imageHeight;
    Object.assign(this.img.style, {
      width: `${o.imageWidth}px`,
      height: `${o.imageHeight}px`,
      opacity: String(o.opacity),
      transform: `matrix(${a}, ${b}, ${c}, ${d}, ${tl.x}, ${tl.y})`,
      visibility: "visible",
    });
  }
}
