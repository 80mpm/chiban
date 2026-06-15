"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Project, LatLng } from "@/lib/types";

const POLY_STYLE: L.PolylineOptions = {
  color: "#065a82",
  weight: 3,
  opacity: 0.9,
  dashArray: "6 6",
  fillColor: "#065a82",
  fillOpacity: 0.12,
};

/**
 * 案件一覧の地図。全案件の polygon を青破線 + 常時ツールチップで表示し、
 * クリックで詳細へ遷移する。searchTarget が変わると flyTo する。
 * Leaflet は window 前提なので利用側は dynamic(ssr:false) で読み込む。
 */
export default function ProjectListMap({
  projects,
  searchTarget,
  onProjectClick,
}: {
  projects: Project[];
  searchTarget: LatLng | null;
  onProjectClick: (projectId: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clickRef = useRef(onProjectClick);
  clickRef.current = onProjectClick;

  // 地図初期化（一度きり）
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: [35.71, 139.78],
      zoom: 16,
      minZoom: 13,
      maxZoom: 22,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("/tile/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 案件ポリゴンの描画（projects が変わるたび貼り直す）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers: L.Layer[] = [];
    const bounds: L.LatLngBounds[] = [];
    for (const p of projects) {
      if (!Array.isArray(p.polygon) || p.polygon.length < 3) continue;
      const layer = L.polygon(p.polygon, POLY_STYLE).addTo(map);
      layer.bindTooltip(p.name, {
        permanent: true,
        direction: "center",
        className: "list-map-label",
      });
      layer.on("click", () => clickRef.current(p.id));
      layers.push(layer);
      bounds.push(layer.getBounds());
    }
    if (bounds.length > 0) {
      const merged = bounds.reduce(
        (acc, b) => acc.extend(b),
        L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()),
      );
      try {
        map.fitBounds(merged, { padding: [32, 32], maxZoom: 18 });
      } catch {
        /* 単一頂点等で失敗しても初期ビューのまま */
      }
    }
    return () => {
      for (const l of layers) l.remove();
    };
  }, [projects]);

  // 住所検索による移動
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !searchTarget) return;
    try {
      map.flyTo(searchTarget, 18, { duration: 0.8 });
    } catch {
      map.setView(searchTarget, 18);
    }
  }, [searchTarget]);

  return <div ref={elRef} className="h-full w-full" />;
}
