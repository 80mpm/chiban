"use client";

import { Trash2 } from "lucide-react";
import { InlineTextField } from "@/components/InlineTextField";
import { toast } from "sonner";
import type { FrontRoad, LatLng } from "@/lib/types";

/** 2 点間の距離（メートル）。Leaflet の distanceTo と同じ haversine。 */
function edgeLengthMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 案件領域ポリゴンの各辺に対する前面道路幅員の編集 UI。
 * 辺ごとに「辺長（自動算出）＋幅員（メートル）」を並べ、空で消去・正の数で設定する。
 * 確定すると frontRoads 全体を onChange で返す（呼び出し側が saveProject する）。
 */
export function FrontRoadEditor({
  polygon,
  frontRoads,
  selectedEdge,
  onSelectEdge,
  onChange,
}: {
  polygon: LatLng[] | null;
  frontRoads: FrontRoad[];
  selectedEdge: number | null;
  onSelectEdge: (edgeIndex: number) => void;
  onChange: (frontRoads: FrontRoad[]) => Promise<boolean> | boolean;
}) {
  const n = Array.isArray(polygon) ? polygon.length : 0;

  if (n < 3) {
    return (
      <p className="text-xs text-muted-foreground">
        領域ポリゴンを設定すると、各辺の前面道路幅員を入力できます。
      </p>
    );
  }

  const widthOf = (i: number) => frontRoads.find((r) => r.edgeIndex === i)?.width ?? null;

  function commit(edgeIndex: number, raw: string): Promise<boolean> | boolean {
    const w = Number(raw.trim());
    if (!Number.isFinite(w) || w <= 0) {
      toast.error("幅員は 0 より大きい数値（メートル）で入力してください（削除は右のゴミ箱ボタン）");
      return false;
    }
    const others = frontRoads.filter((r) => r.edgeIndex !== edgeIndex);
    const next = [...others, { edgeIndex, width: w }].sort((a, b) => a.edgeIndex - b.edgeIndex);
    return onChange(next);
  }

  function remove(edgeIndex: number) {
    const next = frontRoads
      .filter((r) => r.edgeIndex !== edgeIndex)
      .sort((a, b) => a.edgeIndex - b.edgeIndex);
    onChange(next);
  }

  // 前面道路が設定されている辺だけを表示する（未設定は出さない）。
  const setEdges = frontRoads
    .map((r) => r.edgeIndex)
    .filter((i) => i >= 0 && i < n)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-1.5">
      {setEdges.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          前面道路は未設定です。地図で辺番号を選び、出てくる赤いハンドルをドラッグして設定してください。
        </p>
      ) : (
        setEdges.map((i) => {
          const a = polygon![i];
          const b = polygon![(i + 1) % n];
          const len = edgeLengthMeters(a, b);
          const selected = i === selectedEdge;
          return (
            <div
              key={i}
              onClick={() => onSelectEdge(i)}
              className={`grid grid-cols-[auto_1fr_minmax(120px,150px)_auto] items-center gap-x-3 rounded-md border px-2.5 py-1.5 ${
                selected ? "border-brand bg-[#eff6fb]" : "border-border bg-white"
              }`}
            >
              <span
                className={`flex size-5 flex-none items-center justify-center rounded-full border text-[11px] font-bold ${
                  selected ? "border-brand bg-brand text-white" : "border-brand text-brand"
                }`}
              >
                {i}
              </span>
              <span className="text-xs text-muted-foreground">辺 {i}・辺長 {len.toFixed(1)} m</span>
              <InlineTextField
                type="number"
                placeholder="幅員（m）"
                value={widthOf(i)}
                formatDisplay={(v) => `${v} m`}
                onConfirm={(next) => commit(i, next)}
              />
              <button
                type="button"
                aria-label="削除"
                title="この前面道路を削除"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-[#fef2f2] hover:text-[#dc2626]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })
      )}
      <p className="pt-0.5 text-[11px] text-muted-foreground">
        辺を選ぶと地図に赤いハンドルが出ます。ドラッグで幅員を設定、数値はここで微調整できます。
        削除は各行のゴミ箱ボタンから行います。
      </p>
    </div>
  );
}
