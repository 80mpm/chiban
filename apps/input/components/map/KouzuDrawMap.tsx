"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import PolygonDrawMap from "@/components/map/PolygonDrawMap";
import { KouzuImageLayer } from "@/components/map/kouzu-overlay";
import { overlayCorners } from "@/components/map/kouzu-overlay-geom";
import type { ReferenceShapes } from "@/components/map/KouzuAlignMap";
import type { KouzuOverlay, LatLng } from "@chiban/shared/lib/types";

/**
 * 案件の公図を下地にして筆の領域を描く地図（Issue #44）。
 * 描画そのものは案件領域と同じ PolygonDrawMap（Leaflet.draw）で、
 * その下に位置合わせ済みの公図画像と、目安の案件領域・追加済みの土地を重ねる。
 * 利用側は dynamic(ssr:false) で読み込むこと。
 */
export default function KouzuDrawMap({
  src,
  overlay,
  reference,
  onChange,
  onModeChange,
}: {
  /** 下地の公図画像の URL（null なら公図なしで地図だけ）。 */
  src: string | null;
  overlay: KouzuOverlay | null;
  reference: ReferenceShapes;
  onChange: (polygon: LatLng[] | null) => void;
  onModeChange?: (mode: "empty" | "drawing" | "editing" | "set") => void;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<KouzuImageLayer | null>(null);
  const shownSrcRef = useRef<string | null>(null);

  /** 公図レイヤーを src・overlay に合わせて置き直す（画像が変わったら作り直す）。 */
  function syncLayer(fit: boolean) {
    const map = mapRef.current;
    if (!map) return;
    if (!src || !overlay) {
      layerRef.current?.remove();
      layerRef.current = null;
      shownSrcRef.current = null;
      return;
    }
    if (layerRef.current && shownSrcRef.current === src) {
      layerRef.current.setOverlay(overlay);
    } else {
      layerRef.current?.remove();
      layerRef.current = new KouzuImageLayer(src, overlay).addTo(map);
      shownSrcRef.current = src;
      fit = true;
    }
    if (fit) {
      // 地図の初期化直後はコンテナの大きさが確定していないので、確定を待ってから合わせる
      const bounds = L.latLngBounds(overlayCorners(overlay));
      setTimeout(() => {
        if (mapRef.current !== map) return;
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 20 });
      }, 80);
    }
  }

  function handleMapReady(map: L.Map) {
    // 地図が作り直された（StrictMode の再マウント等）ら、前の地図に付けたレイヤーは使えない
    mapRef.current = map;
    layerRef.current = null;
    shownSrcRef.current = null;
    if (reference.projectPolygon) {
      L.polygon(reference.projectPolygon, {
        color: "#065a82",
        weight: 2,
        dashArray: "6 6",
        fill: false,
        interactive: false,
      }).addTo(map);
    }
    for (const land of reference.lands) {
      L.polygon(land.polygon, { color: "#0f766e", weight: 1, fillOpacity: 0.05, interactive: false })
        .bindTooltip(land.label, { permanent: false, direction: "center" })
        .addTo(map);
    }
    syncLayer(true);
  }

  // 公図の切り替え・不透明度の変更を反映する
  useEffect(() => {
    syncLayer(false);
    // syncLayer は ref と最新の props を読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, overlay]);

  return (
    <PolygonDrawMap
      initialPolygon={null}
      onChange={onChange}
      onModeChange={onModeChange}
      onMapReady={handleMapReady}
      showEdgeBadges={false}
      title="筆の領域"
      heightClassName="h-[560px]"
    />
  );
}
