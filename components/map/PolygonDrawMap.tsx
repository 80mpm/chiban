"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import type { LatLng } from "@/lib/types";

const POLY_STYLE: L.PolylineOptions = {
  color: "#065a82",
  weight: 3,
  opacity: 0.9,
  dashArray: "6 6",
  fillColor: "#065a82",
  fillOpacity: 0.12,
};

type Mode = "empty" | "drawing" | "editing" | "set";

/**
 * 領域ポリゴンの描画マップ（旧 edit.js setupPolygonMap）。
 * 初期は閲覧のみ。「ポリゴンを描く/描き直す」で描画モードに入り、
 * 描画完了後そのまま頂点ドラッグで微調整できる。Leaflet.draw を命令的に扱う。
 * 利用側は dynamic(ssr:false) で読み込むこと。
 */
export default function PolygonDrawMap({
  initialPolygon,
  onChange,
}: {
  initialPolygon: LatLng[] | null;
  onChange: (polygon: LatLng[] | null) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const layerRef = useRef<L.Polygon | null>(null);
  const drawRef = useRef<L.Draw.Polygon | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [mode, setMode] = useState<Mode>("empty");
  const modeRef = useRef<Mode>("empty");
  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };

  function getPolygonArray(): LatLng[] | null {
    const layer = layerRef.current;
    if (!layer) return null;
    const ll = (layer.getLatLngs()[0] as L.LatLng[]) || [];
    if (ll.length < 3) return null;
    return ll.map((p) => [p.lat, p.lng] as LatLng);
  }

  function setReadonlyLayer(layer: L.Polygon | null) {
    const group = groupRef.current!;
    if (layerRef.current) {
      try {
        (layerRef.current as unknown as { editing: { disable(): void } }).editing.disable();
      } catch {
        /* noop */
      }
      layerRef.current.off("edit");
      group.removeLayer(layerRef.current);
    }
    layerRef.current = layer;
    if (layer) group.addLayer(layer);
    setModeBoth(layer ? "set" : "empty");
  }

  function adoptDrawnLayer(layer: L.Polygon) {
    const group = groupRef.current!;
    if (layerRef.current) {
      try {
        (layerRef.current as unknown as { editing: { disable(): void } }).editing.disable();
      } catch {
        /* noop */
      }
      layerRef.current.off("edit");
      group.removeLayer(layerRef.current);
    }
    layerRef.current = layer;
    group.addLayer(layer);
    try {
      (layer as unknown as { editing: { enable(): void } }).editing.enable();
    } catch {
      /* noop */
    }
    layer.on("edit", () => onChangeRef.current(getPolygonArray()));
    setModeBoth("editing");
  }

  function startDraw() {
    const map = mapRef.current!;
    if (drawRef.current) {
      try {
        drawRef.current.disable();
      } catch {
        /* noop */
      }
      drawRef.current = null;
    }
    setReadonlyLayer(null);
    const handler = new L.Draw.Polygon(map as unknown as L.DrawMap, {
      shapeOptions: POLY_STYLE,
      allowIntersection: false,
      showArea: false,
    });
    handler.enable();
    drawRef.current = handler;
    setModeBoth("drawing");
  }

  function clear() {
    if (drawRef.current) {
      try {
        drawRef.current.disable();
      } catch {
        /* noop */
      }
      drawRef.current = null;
    }
    setReadonlyLayer(null);
    onChangeRef.current(null);
  }

  // 初期化（一度きり）
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
    const group = new L.FeatureGroup().addTo(map);
    mapRef.current = map;
    groupRef.current = group;

    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      drawRef.current = null;
      adoptDrawnLayer((e as unknown as { layer: L.Polygon }).layer);
      onChangeRef.current(getPolygonArray());
    });
    map.on(L.Draw.Event.DRAWSTOP, () => {
      drawRef.current = null;
    });

    if (Array.isArray(initialPolygon) && initialPolygon.length >= 3) {
      const layer = L.polygon(initialPolygon, POLY_STYLE);
      setReadonlyLayer(layer);
      try {
        map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 22 });
      } catch {
        /* noop */
      }
    }
    setTimeout(() => map.invalidateSize(), 60);

    return () => {
      if (drawRef.current) {
        try {
          drawRef.current.disable();
        } catch {
          /* noop */
        }
      }
      map.remove();
      mapRef.current = null;
    };
    // 初期化のみ。initialPolygon の追従は不要（編集はこの中で完結する）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText = {
    empty: "未設定",
    drawing: "描画中 — 始点クリックで閉じる",
    editing: "編集中（頂点ドラッグで調整可）",
    set: "設定済み",
  }[mode];
  const statusColor = mode === "set" ? "text-status-acquired" : mode === "empty" ? "text-muted-foreground" : "text-brand";
  const drawLabel = mode === "empty" ? "＋ ポリゴンを描く" : mode === "drawing" ? "やり直す" : "描き直す";
  const showClear = mode === "drawing" || mode === "editing";

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--app-text-dark)]">領域マップ</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
          <button
            type="button"
            onClick={startDraw}
            className="rounded-md border border-border bg-white px-2.5 py-1 text-xs hover:bg-secondary"
          >
            {drawLabel}
          </button>
          {showClear && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-[#fca5a5] bg-white px-2.5 py-1 text-xs text-[#dc2626] hover:bg-[#fef2f2]"
            >
              クリア
            </button>
          )}
        </div>
      </div>
      <div ref={elRef} className="h-[360px] w-full rounded-md border border-border" />
    </>
  );
}
