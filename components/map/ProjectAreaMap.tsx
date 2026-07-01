"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { drawRoadWidthArrows } from "./road-width-arrows";
import type { Project } from "@/lib/types";

/**
 * 用途地域の凡例（色 → 用途地域名）。
 * 色は ZENRIN wms/youto の実描画から採取し、GetFeatureInfo で用途地域名を突き合わせて確定した値。
 * 赤い細線は用途地域界（境界線）で塗りではない。
 */
const YOUTO_LEGEND: { color: string; label: string }[] = [
  { color: "#00C900", label: "第一種低層住居専用" },
  { color: "#C9FC00", label: "第一種中高層住居専用" },
  { color: "#FCFCC9", label: "第二種中高層住居専用" },
  { color: "#FCFC00", label: "第一種住居" },
  { color: "#FCC996", label: "第二種住居" },
  { color: "#FCC9FC", label: "近隣商業" },
  { color: "#FC96C9", label: "商業" },
  { color: "#C996FC", label: "準工業" },
  { color: "#C9FCFC", label: "工業" },
  { color: "#96C9C9", label: "工業専用" },
  { color: "#C6C6C6", label: "指定なし・調整区域" },
];

/**
 * 案件詳細の地図。ZENRIN タイルに案件領域ポリゴンのみ表示し、
 * 各辺の辺長ラベルと前面道路幅員の矢印を重ねる（筆ポリゴンは重ねない）。
 * 右上トグルで ZENRIN データ重畳「用途地域」(wms/youto) を重ねられ、凡例も表示する。
 * Leaflet は window 前提なので利用側は dynamic(ssr:false) で読み込む。
 */
export default function ProjectAreaMap({ project }: { project: Project }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const youtoRef = useRef<L.TileLayer.WMS | null>(null);
  const [showYouto, setShowYouto] = useState(false);

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
    mapRef.current = map;
    L.tileLayer("/tile/{z}/{x}/{y}.png", { maxZoom: 22 }).addTo(map);
    // 用途地域オーバーレイ（生成のみ。トグルで addTo/removeLayer する）。
    youtoRef.current = L.tileLayer.wms("/api/youto-wms", {
      layers: "lp1",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      opacity: 0.55,
      maxZoom: 22,
    });
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
      mapRef.current = null;
      youtoRef.current = null;
    };
    // project は詳細表示中は不変。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // トグルに応じて用途地域レイヤーを付け外しする。
  useEffect(() => {
    const map = mapRef.current;
    const youto = youtoRef.current;
    if (!map || !youto) return;
    if (showYouto) youto.addTo(map);
    else map.removeLayer(youto);
  }, [showYouto]);

  return (
    <>
      <div ref={elRef} className="absolute inset-0" />
      <label className="absolute right-2 top-2 z-[500] flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white/95 px-2.5 py-1.5 text-xs font-medium text-[color:var(--app-text-dark)] shadow-sm">
        <input
          type="checkbox"
          checked={showYouto}
          onChange={(e) => setShowYouto(e.target.checked)}
          className="accent-brand"
        />
        用途地域
      </label>

      {showYouto && (
        <div className="absolute right-2 top-11 z-[500] max-h-[calc(100%-3.5rem)] overflow-y-auto rounded-md border border-border bg-white/95 px-2.5 py-2 shadow-sm">
          <div className="mb-1 text-[11px] font-semibold text-[color:var(--app-text-dark)]">用途地域 凡例</div>
          <ul className="space-y-1">
            {YOUTO_LEGEND.map((e) => (
              <li key={e.color} className="flex items-center gap-1.5 text-[11px] text-[#334155]">
                <span
                  className="inline-block size-3 flex-none rounded-[2px] border border-black/20"
                  style={{ backgroundColor: e.color }}
                />
                {e.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
