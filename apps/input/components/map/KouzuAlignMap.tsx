"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { addBaseTileLayer } from "@chiban/shared/components/map/base-tile-layer";
import "leaflet/dist/leaflet.css";
import type { KouzuOverlay, LatLng } from "@chiban/shared/lib/types";
import { KouzuImageLayer } from "@/components/map/kouzu-overlay";
import { overlayCorners, scaleRotateFromCorner } from "@/components/map/kouzu-overlay-geom";

/** 位置合わせの目安に出す案件領域・既存の土地。 */
export interface ReferenceShapes {
  projectPolygon: LatLng[] | null;
  lands: { polygon: LatLng[]; label: string }[];
}

/**
 * 案件の公図を地図に重ねて位置を合わせる地図（Issue #44）。
 * 中心の青いハンドルで移動、右上隅の赤いハンドルで拡大縮小・回転する。
 * overlay は呼び出し側が持ち（数値入力と同期させるため）、ここは表示と操作の通知だけを行う。
 * 利用側は dynamic(ssr:false) で読み込むこと。
 */
export default function KouzuAlignMap({
  src,
  overlay,
  onChange,
  reference,
  heightClassName = "h-[560px]",
}: {
  src: string;
  overlay: KouzuOverlay;
  onChange: (next: KouzuOverlay) => void;
  reference: ReferenceShapes;
  heightClassName?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<KouzuImageLayer | null>(null);
  const centerRef = useRef<L.Marker | null>(null);
  const cornerRef = useRef<L.Marker | null>(null);
  const outlineRef = useRef<L.Polygon | null>(null);
  /** ドラッグ中のハンドル（そのハンドル自身は overlay から位置を戻さない）。 */
  const draggingRef = useRef<"center" | "corner" | null>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 初期化（一度きり）
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: overlay.center,
      zoom: 17,
      minZoom: 13,
      maxZoom: 22,
      attributionControl: false,
    });
    addBaseTileLayer(map);
    mapRef.current = map;

    // 目安: 案件領域（破線）と既存の土地（細線 + 地番）
    if (reference.projectPolygon && reference.projectPolygon.length >= 3) {
      L.polygon(reference.projectPolygon, {
        color: "#065a82",
        weight: 2,
        dashArray: "6 6",
        fill: false,
        interactive: false,
      }).addTo(map);
    }
    for (const land of reference.lands) {
      L.polygon(land.polygon, {
        color: "#0f766e",
        weight: 1,
        fillOpacity: 0.05,
        interactive: false,
      })
        .bindTooltip(land.label, { permanent: false, direction: "center" })
        .addTo(map);
    }

    const layer = new KouzuImageLayer(src, overlay).addTo(map);
    layerRef.current = layer;
    outlineRef.current = L.polygon(overlayCorners(overlay), {
      color: "#dc2626",
      weight: 1,
      dashArray: "4 4",
      fill: false,
      interactive: false,
    }).addTo(map);

    const center = L.marker(overlay.center, {
      draggable: true,
      keyboard: false,
      zIndexOffset: 2000,
      title: "ドラッグで公図を移動",
      icon: L.divIcon({ className: "kouzu-align-handle kouzu-align-handle--move", iconSize: [18, 18] }),
    }).addTo(map);
    center.on("dragstart", () => (draggingRef.current = "center"));
    center.on("dragend", () => (draggingRef.current = null));
    center.on("drag", () => {
      const p = center.getLatLng();
      onChangeRef.current({ ...overlayRef.current, center: [p.lat, p.lng] });
    });
    centerRef.current = center;

    const corner = L.marker(overlayCorners(overlay)[1], {
      draggable: true,
      keyboard: false,
      zIndexOffset: 2000,
      title: "ドラッグで拡大縮小・回転",
      icon: L.divIcon({ className: "kouzu-align-handle kouzu-align-handle--rotate", iconSize: [16, 16] }),
    }).addTo(map);
    corner.on("dragstart", () => (draggingRef.current = "corner"));
    corner.on("dragend", () => {
      draggingRef.current = null;
      cornerRef.current?.setLatLng(overlayCorners(overlayRef.current)[1]); // 丸めた回転角に合わせる
    });
    corner.on("drag", () => {
      const p = corner.getLatLng();
      const o = overlayRef.current;
      onChangeRef.current({ ...o, ...scaleRotateFromCorner(o, [p.lat, p.lng]) });
    });
    cornerRef.current = corner;

    map.fitBounds(L.latLngBounds(overlayCorners(overlay)), { padding: [24, 24], maxZoom: 20 });
    setTimeout(() => map.invalidateSize(), 60);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // 初期化のみ（以降の overlay 変更は下の effect で反映する）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // overlay の変更（ドラッグ・数値入力）を画像・枠・ハンドルへ反映する
  useEffect(() => {
    layerRef.current?.setOverlay(overlay);
    const corners = overlayCorners(overlay);
    outlineRef.current?.setLatLngs(corners);
    // ドラッグ中のハンドル自身は動かさない（Leaflet がポインタ位置で動かしている）
    if (draggingRef.current !== "center") centerRef.current?.setLatLng(overlay.center);
    if (draggingRef.current !== "corner") cornerRef.current?.setLatLng(corners[1]);
  }, [overlay]);

  return <div ref={elRef} className={`${heightClassName} w-full rounded-md border border-border`} />;
}
