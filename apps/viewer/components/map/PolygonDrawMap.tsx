"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { drawRoadWidthArrows, polygonWindingCCW, outwardPerp } from "./road-width-arrows";
import type { FrontRoad, LatLng } from "@/lib/types";

const POLY_STYLE: L.PolylineOptions = {
  color: "#065a82",
  weight: 3,
  opacity: 0.9,
  dashArray: "6 6",
  fillColor: "#065a82",
  fillOpacity: 0.12,
};

type Mode = "empty" | "drawing" | "editing" | "set";

const METER_PER_LAT = 111000;
const meterPerLng = (lat: number) => 111000 * Math.cos((lat * Math.PI) / 180);
/** 幅員未設定の辺を選択したときに出すドラッグハンドルの初期距離（m）。 */
const DEFAULT_HANDLE_WIDTH = 4;

/** 辺 i の中点と、ポリゴン外向きの単位法線（メートル空間）。
 *  外向きは巻き方向（winding）で決める（road-width-arrows と同一ロジック・凹形でも正しい）。 */
function edgeNormal(points: LatLng[], i: number) {
  const n = points.length;
  const a = points[i];
  const b = points[(i + 1) % n];
  const mid = { lat: (a[0] + b[0]) / 2, lng: (a[1] + b[1]) / 2 };
  const dE = (b[1] - a[1]) * meterPerLng(mid.lat);
  const dN = (b[0] - a[0]) * METER_PER_LAT;
  const len = Math.hypot(dE, dN) || 1;
  const { perpE, perpN } = outwardPerp(dE / len, dN / len, polygonWindingCCW(points));
  return { mid, perpE, perpN };
}

/** 中点から東西 dE / 南北 dN メートルずらした緯度経度。 */
function offsetLatLng(lat: number, lng: number, dE: number, dN: number): [number, number] {
  return [lat + dN / METER_PER_LAT, lng + dE / meterPerLng(lat)];
}

/**
 * 領域ポリゴンの描画マップ（旧 edit.js setupPolygonMap）。
 * 初期は閲覧のみ。「ポリゴンを描く/描き直す」で描画モードに入り、
 * 描画完了後そのまま頂点ドラッグで微調整できる。Leaflet.draw を命令的に扱う。
 * 利用側は dynamic(ssr:false) で読み込むこと。
 */
export default function PolygonDrawMap({
  initialPolygon,
  onChange,
  frontRoads = [],
  selectedEdge = null,
  onSelectEdge,
  onCommitWidth,
}: {
  initialPolygon: LatLng[] | null;
  onChange: (polygon: LatLng[] | null) => void;
  /** 各辺の前面道路幅員（矢印で表示）。 */
  frontRoads?: FrontRoad[];
  /** 選択中の辺インデックス（バッジをハイライト）。 */
  selectedEdge?: number | null;
  /** 辺番号バッジのクリックで辺を選択する。 */
  onSelectEdge?: (edgeIndex: number) => void;
  /** ハンドルのドラッグ確定時に、その辺の幅員（m）を保存する。 */
  onCommitWidth?: (edgeIndex: number, width: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const layerRef = useRef<L.Polygon | null>(null);
  const drawRef = useRef<L.Draw.Polygon | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 辺番号バッジ + 幅員矢印のオーバーレイ（命令的に再描画する）。
  const badgeGroupRef = useRef<L.FeatureGroup | null>(null);
  const arrowLayersRef = useRef<L.Layer[]>([]);
  const frontRoadsRef = useRef<FrontRoad[]>(frontRoads);
  frontRoadsRef.current = frontRoads;
  const selectedEdgeRef = useRef<number | null>(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const onSelectEdgeRef = useRef(onSelectEdge);
  onSelectEdgeRef.current = onSelectEdge;
  const onCommitWidthRef = useRef(onCommitWidth);
  onCommitWidthRef.current = onCommitWidth;

  // 幅員ドラッグハンドル（選択辺に 1 つだけ出す draggable マーカー）。
  const handleRef = useRef<L.Marker | null>(null);
  const handleEdgeRef = useRef<number | null>(null);
  const dragWidthRef = useRef<number>(0);
  const dragMovedRef = useRef<boolean>(false);

  const widthOf = (i: number) =>
    frontRoadsRef.current.find((r) => r.edgeIndex === i)?.width ?? null;

  /** 矢印＋番号バッジを描き直す（override で選択辺の幅員を一時上書きできる＝ドラッグ追従用）。 */
  function drawArrowsBadges(override?: { edgeIndex: number; width: number }) {
    const map = mapRef.current;
    const badgeGroup = badgeGroupRef.current;
    if (!map || !badgeGroup) return;
    badgeGroup.clearLayers();
    for (const layer of arrowLayersRef.current) map.removeLayer(layer);
    arrowLayersRef.current = [];

    const pts = getPolygonArray();
    if (!pts || pts.length < 3) return;

    let roads = frontRoadsRef.current;
    if (override) {
      roads = [
        ...roads.filter((r) => r.edgeIndex !== override.edgeIndex),
        { edgeIndex: override.edgeIndex, width: override.width },
      ];
    }
    arrowLayersRef.current = drawRoadWidthArrows(L, map, pts, roads);

    for (let i = 0; i < pts.length; i++) {
      const a = L.latLng(pts[i]);
      const b = L.latLng(pts[(i + 1) % pts.length]);
      const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
      const selected = i === selectedEdgeRef.current;
      const marker = L.marker(mid, {
        icon: L.divIcon({
          className: selected ? "edge-index-badge edge-index-badge--selected" : "edge-index-badge",
          html: String(i),
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        keyboard: false,
        zIndexOffset: 1000,
      });
      marker.on("click", () => onSelectEdgeRef.current?.(i));
      badgeGroup.addLayer(marker);
    }
  }

  /** 選択辺に幅員ドラッグハンドルを配置する（ドラッグ中の付け替えは避ける）。 */
  function placeHandle() {
    const map = mapRef.current;
    if (!map) return;
    const pts = getPolygonArray();
    const sel = selectedEdgeRef.current;
    const editable = modeRef.current === "set" || modeRef.current === "editing";

    // 選択解除・範囲外・編集不可・コールバック無しならハンドルを除去
    if (
      !pts ||
      sel == null ||
      sel < 0 ||
      sel >= pts.length ||
      !editable ||
      !onCommitWidthRef.current
    ) {
      if (handleRef.current) {
        map.removeLayer(handleRef.current);
        handleRef.current = null;
        handleEdgeRef.current = null;
      }
      return;
    }

    const { mid, perpE, perpN } = edgeNormal(pts, sel);
    const w = widthOf(sel) ?? DEFAULT_HANDLE_WIDTH;
    const tip = offsetLatLng(mid.lat, mid.lng, perpE * w, perpN * w);

    // 既存ハンドルが同じ辺なら位置だけ更新（ドラッグ中の再生成を防ぐ）
    if (handleRef.current && handleEdgeRef.current === sel) {
      handleRef.current.setLatLng(tip);
      return;
    }
    if (handleRef.current) map.removeLayer(handleRef.current);

    const marker = L.marker(tip, {
      draggable: true,
      keyboard: false,
      zIndexOffset: 2000,
      icon: L.divIcon({ className: "road-width-handle", html: "", iconSize: [16, 16] }),
    });
    marker.on("dragstart", () => {
      dragMovedRef.current = false;
    });
    marker.on("drag", () => {
      const cur = getPolygonArray();
      const e = selectedEdgeRef.current;
      if (!cur || e == null || e < 0 || e >= cur.length) return;
      const g = edgeNormal(cur, e);
      const p = marker.getLatLng();
      const hE = (p.lng - g.mid.lng) * meterPerLng(g.mid.lat);
      const hN = (p.lat - g.mid.lat) * METER_PER_LAT;
      let width = hE * g.perpE + hN * g.perpN; // 外向き法線への射影＝幅員
      width = Math.max(0, Math.round(width * 10) / 10); // 0.1m 丸め・負値はクランプ
      dragWidthRef.current = width;
      dragMovedRef.current = true;
      // 法線上にスナップして道路方向の幅として扱う
      const snapped = offsetLatLng(g.mid.lat, g.mid.lng, g.perpE * width, g.perpN * width);
      marker.setLatLng(snapped);
      drawArrowsBadges({ edgeIndex: e, width });
    });
    marker.on("dragend", () => {
      const e = selectedEdgeRef.current;
      if (e == null || !dragMovedRef.current) return;
      onCommitWidthRef.current?.(e, dragWidthRef.current);
    });
    handleRef.current = marker;
    handleEdgeRef.current = sel;
    marker.addTo(map);
  }

  /** 現在のポリゴン形状から矢印・バッジ・ハンドルを描き直す。 */
  function redrawOverlays() {
    drawArrowsBadges();
    placeHandle();
  }

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
    redrawOverlays();
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
    layer.on("edit", () => {
      onChangeRef.current(getPolygonArray());
      redrawOverlays();
    });
    setModeBoth("editing");
    redrawOverlays();
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
    const badgeGroup = new L.FeatureGroup().addTo(map);
    mapRef.current = map;
    groupRef.current = group;
    badgeGroupRef.current = badgeGroup;

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

  // 幅員データ・選択辺が変わったらバッジと矢印を描き直す。
  useEffect(() => {
    redrawOverlays();
    // redrawOverlays は ref 経由で最新値を読むので依存は値そのものでよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontRoads, selectedEdge]);

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
