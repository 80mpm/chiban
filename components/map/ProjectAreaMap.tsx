"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { drawRoadWidthArrows } from "./road-width-arrows";
import type { Project } from "@/lib/types";

/**
 * 案件詳細の地図。ZENRIN タイルに案件領域ポリゴンのみ表示し、
 * 各辺の辺長ラベルと前面道路幅員の矢印を重ねる（筆ポリゴンは重ねない）。
 * Leaflet は window 前提なので利用側は dynamic(ssr:false) で読み込む。
 */
export default function ProjectAreaMap({ project }: { project: Project }) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: [35.71, 139.78],
      zoom: 17,
      minZoom: 13,
      maxZoom: 22,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("/tile/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
    setTimeout(() => map.invalidateSize(), 0);

    const pts = project.polygon;
    if (Array.isArray(pts) && pts.length >= 3) {
      const layer = L.polygon(pts, {
        color: "#065a82",
        weight: 3,
        opacity: 0.9,
        dashArray: "6 6",
        fillColor: "#065a82",
        fillOpacity: 0.12,
      }).addTo(map);

      // 各辺の長さラベル（辺の中点）
      for (let i = 0; i < pts.length; i++) {
        const a = L.latLng(pts[i]);
        const b = L.latLng(pts[(i + 1) % pts.length]);
        const len = a.distanceTo(b);
        const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
        L.marker(mid, {
          icon: L.divIcon({
            className: "edge-length-label",
            html: `${len.toFixed(1)} m`,
            iconSize: undefined,
          }),
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }

      drawRoadWidthArrows(L, map, pts, project.frontRoads ?? []);

      try {
        map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 22 });
      } catch {
        /* 単一頂点等で失敗しても初期ビューのまま */
      }
    }

    return () => {
      map.remove();
    };
    // project は詳細表示中は不変。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={elRef} className="absolute inset-0" />;
}
