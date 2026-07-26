"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_DEFS, fmtTsubo } from "@/lib/format";
import type { Land, LatLng } from "@/lib/types";
import { computeKouzuLayout, centroid } from "./kouzu-geom";

/** 候補筆（土地追加・筆変更モードでグレー表示する筆）。 */
export interface CandidateParcel {
  parcelId: number;
  chiban: string;
  polygon: LatLng[];
}

const MAX_K = 12;
const DRAG_THRESHOLD_PX = 4;

/**
 * 公図風 SVG ビュー（detail / edit / 筆選択モーダルで共用）。
 * 白地・北上、土地はステータス色・候補筆はグレーで描画する。
 * `interactive` のときだけホイールズーム・ドラッグパンを有効化する
 * （筆選択モーダル用。常時表示の公図はクリック選択のまま）。
 */
export function KouzuView({
  lands,
  candidates = [],
  selectedLandId = null,
  onSelectLand,
  onCandidateClick,
  emptyText = "領域が設定された土地がありません",
  className,
  interactive = false,
  labelMode = "full",
  showCandidateChiban = false,
  landColor,
  fitToLands = false,
  minZoom = 1,
}: {
  lands: Land[];
  candidates?: CandidateParcel[];
  selectedLandId?: string | null;
  onSelectLand?: (landId: string) => void;
  onCandidateClick?: (parcel: CandidateParcel) => void;
  emptyText?: string;
  className?: string;
  interactive?: boolean;
  /** 土地ラベル: full=地番/地権者/坪数, chiban=地番のみ, none=なし。筆選択モーダルは chiban。 */
  labelMode?: "full" | "chiban" | "none";
  /** 候補筆にも地番を描くか（筆選択モーダルで筆を識別するため）。 */
  showCandidateChiban?: boolean;
  /** 土地をステータス色でなく単色で塗る（筆選択モーダルで「案件対象か否か」だけ示すため）。 */
  landColor?: string;
  /** viewBox を案件の土地に合わせる（初期表示を土地までズームイン。候補筆はパン/ズームアウトで見える）。 */
  fitToLands?: boolean;
  /** ズームアウトの下限（fitToLands 時に町全体まで引けるよう小さくする）。 */
  minZoom?: number;
}) {
  const drawLands = useMemo(
    () => lands.filter((l) => Array.isArray(l.polygon) && l.polygon.length >= 3),
    [lands],
  );
  const drawCands = useMemo(
    () => candidates.filter((c) => Array.isArray(c.polygon) && c.polygon.length >= 3),
    [candidates],
  );

  const layout = useMemo(() => {
    const landPolys = drawLands.map((l) => l.polygon);
    const candPolys = drawCands.map((c) => c.polygon);
    // fitToLands: 案件の土地だけで viewBox を決める（候補筆は同じ toView で描かれ、
    // viewBox 外はクリップ。パン/ズームアウトで見える）。土地が無ければ全体にフィット。
    const fitPolys =
      fitToLands && landPolys.length ? landPolys : [...landPolys, ...candPolys];
    return computeKouzuLayout(fitPolys, landPolys);
  }, [drawLands, drawCands, fitToLands]);

  // ----- 拡大縮小・移動の状態（interactive 時のみ使用） -----
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // ドラッグ追跡
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);
  const didDragRef = useRef(false);

  // クライアント座標 → viewBox 座標（preserveAspectRatio の余白も考慮）
  function toViewBox(clientX: number, clientY: number) {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y, ctm };
  }

  // ホイールズーム（カーソル下の点を固定）。React の onWheel は passive のことがあるため
  // ネイティブリスナーで preventDefault する。
  useEffect(() => {
    if (!interactive) return;
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = toViewBox(e.clientX, e.clientY);
      if (!m) return;
      const { k, tx, ty } = viewRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const k2 = Math.min(MAX_K, Math.max(minZoom, k * factor));
      if (k2 === k) return;
      setView({
        k: k2,
        tx: m.x - (k2 / k) * (m.x - tx),
        ty: m.y - (k2 / k) * (m.y - ty),
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive, minZoom]);

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    didDragRef.current = false;
    const { tx, ty } = viewRef.current;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
    // setPointerCapture は使わない（SVG にキャプチャされると筆ポリゴンの click が
    // 発火しなくなるため）。pointermove は筆から svg へバブリングするのでパンは効く。
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!interactive || !d?.active) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (Math.abs(dxPx) > DRAG_THRESHOLD_PX || Math.abs(dyPx) > DRAG_THRESHOLD_PX) {
      didDragRef.current = true;
    }
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    setView((v) => ({ ...v, tx: d.startTx + dxPx / ctm.a, ty: d.startTy + dyPx / ctm.d }));
  }
  function onPointerUp() {
    if (dragRef.current) dragRef.current.active = false;
  }

  // ズームボタン: viewBox 中心を基準に拡大縮小
  function zoomBy(factor: number) {
    if (!layout) return;
    const cx = layout.viewW / 2;
    const cy = layout.viewH / 2;
    setView((v) => {
      const k2 = Math.min(MAX_K, Math.max(minZoom, v.k * factor));
      if (k2 === v.k) return v;
      return { k: k2, tx: cx - (k2 / v.k) * (cx - v.tx), ty: cy - (k2 / v.k) * (cy - v.ty) };
    });
  }
  function resetView() {
    setView({ k: 1, tx: 0, ty: 0 });
  }

  if (!layout) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "1.5rem",
          textAlign: "center",
          color: "var(--app-text-light)",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        <span style={{ whiteSpace: "pre-line" }}>{emptyText}</span>
      </div>
    );
  }

  const { viewW, viewH, pad, fontSize, toView } = layout;
  const lineHeightEm = 1.2;

  // ドラッグ判定後はクリック発火を抑止する
  const guardClick = (fn: () => void) => () => {
    if (interactive && didDragRef.current) return;
    fn();
  };

  // 土地のクリック選択が無い場合（筆選択モーダル）は土地を不活性にする
  // （ホバーで色が変わったりポインターになって「押せそう」に見えるのを防ぐ）。
  const landsInteractive = onSelectLand != null;

  const content = (
    <>
      {/* 候補筆（グレー）を先に描き、土地が上に重なるようにする */}
      {drawCands.map((cand) => {
        const pts = cand.polygon.map(toView);
        const [cx, cy] = centroid(pts);
        return (
          <g key={`cand-${cand.parcelId}`}>
            <polygon
              className="fude-candidate"
              points={pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                guardClick(() => onCandidateClick?.(cand))();
              }}
            >
              <title>{`${cand.chiban}（クリックで選択）`}</title>
            </polygon>
            {showCandidateChiban && (
              <text
                className="fude-label"
                textAnchor="middle"
                x={cx.toFixed(2)}
                y={cy.toFixed(2)}
                dominantBaseline="central"
                fontSize={fontSize.toFixed(2)}
                strokeWidth={(fontSize * 0.22).toFixed(2)}
              >
                {cand.chiban}
              </text>
            )}
          </g>
        );
      })}

      {drawLands.map((land) => {
        const def = STATUS_DEFS[land.status] ?? STATUS_DEFS.target;
        const color = landColor ?? def.color;
        const pts = land.polygon.map(toView);
        const [cx, cy] = centroid(pts);
        const ownerLines = (land.owners ?? [])
          .map((o) => (o?.name ? (o.share ? `${o.name}（${o.share}）` : o.name) : ""))
          .filter(Boolean);
        // labelMode: full=地番+地権者+坪数 / chiban=地番のみ / none=なし
        const lines =
          labelMode === "chiban"
            ? [land.chiban || "—"]
            : [land.chiban || "—", ...ownerLines, `${fmtTsubo(land.areaTsubo)}坪`];
        const startDy = -((lines.length - 1) / 2) * lineHeightEm;
        return (
          <g key={land.id}>
            <polygon
              className={`fude${selectedLandId === land.id ? " selected" : ""}`}
              points={pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              fill={color}
              fillOpacity={0.4}
              stroke={color}
              style={landsInteractive ? undefined : { pointerEvents: "none", cursor: "default" }}
              onClick={(e) => {
                e.stopPropagation();
                guardClick(() => onSelectLand?.(land.id))();
              }}
            >
              <title>{`${land.chiban || "—"} / ${def.label} / ${fmtTsubo(land.areaTsubo)}坪`}</title>
            </polygon>
            {labelMode !== "none" && (
              <text
                className="fude-label"
                textAnchor="middle"
                x={cx.toFixed(2)}
                y={cy.toFixed(2)}
                fontSize={fontSize.toFixed(2)}
                strokeWidth={(fontSize * 0.22).toFixed(2)}
              >
                {lines.map((line, i) => (
                  <tspan
                    key={i}
                    x={cx.toFixed(2)}
                    dy={i === 0 ? `${startDy.toFixed(2)}em` : `${lineHeightEm}em`}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </>
  );

  const northMark = (
    <text
      className="north-mark"
      textAnchor="end"
      x={(viewW - pad * 0.4).toFixed(2)}
      y={(pad * 0.8).toFixed(2)}
      fontSize={(fontSize * 1.2).toFixed(2)}
    >
      N ↑
    </text>
  );

  if (!interactive) {
    return (
      <svg
        viewBox={`0 0 ${viewW.toFixed(2)} ${viewH.toFixed(2)}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        className={className}
        style={{ maxHeight: "100%", display: "block" }}
      >
        {content}
        {northMark}
      </svg>
    );
  }

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW.toFixed(2)} ${viewH.toFixed(2)}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          maxHeight: "100%",
          display: "block",
          touchAction: "none",
          cursor: dragRef.current?.active ? "grabbing" : "grab",
        }}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>{content}</g>
        {northMark}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[
          { label: "＋", title: "拡大", on: () => zoomBy(1.3) },
          { label: "－", title: "縮小", on: () => zoomBy(1 / 1.3) },
          { label: "⟳", title: "リセット", on: resetView },
        ].map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            onClick={b.on}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-white/95 text-sm text-[color:var(--app-text)] shadow-sm hover:bg-secondary"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
