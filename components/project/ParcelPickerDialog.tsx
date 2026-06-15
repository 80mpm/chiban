"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KouzuView, type CandidateParcel } from "@/components/kouzu/KouzuView";
import { useParcelTowns, useParcelsByTownWithPolygons } from "@/hooks/use-parcels";
import type { Project } from "@/lib/types";

/**
 * 公図ポリゴンから筆を選ぶワイドモーダル（土地追加・筆変更で共用）。
 * 町名を選ぶと候補筆がグレー表示され、クリックで onPick が呼ばれる。
 * 拡大縮小・移動はモーダル内の公図ビューでのみ有効（KouzuView interactive）。
 *
 * - 追加: keepOpenAfterPick=true（連続追加）
 * - 筆変更: keepOpenAfterPick=false（1件選んで閉じる）。selectedLandId で対象土地をハイライト
 */
export function ParcelPickerDialog({
  open,
  onOpenChange,
  proj,
  title,
  defaultTownName,
  selectedLandId = null,
  hintVerb,
  keepOpenAfterPick,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proj: Project;
  title: string;
  defaultTownName: string;
  selectedLandId?: string | null;
  hintVerb: string;
  keepOpenAfterPick: boolean;
  onPick: (cand: CandidateParcel) => Promise<void>;
}) {
  const { data: towns } = useParcelTowns(open);
  const [town, setTown] = useState<string | null>(null);

  // 開くたびに町名を既定値へリセットする（筆変更で対象土地が変わっても追従）
  useEffect(() => {
    if (open) setTown(null);
  }, [open]);

  const effectiveTown =
    town ?? (open ? defaultTownName || towns?.[0]?.name || null : null);

  const { data: parcels, isLoading } = useParcelsByTownWithPolygons(
    open ? effectiveTown : null,
  );

  // 案件内で使用中の全 parcelId を候補から除外（重複・現筆への無変更を防ぐ）
  const usedIds = useMemo(
    () => new Set((proj.lands ?? []).map((l) => l.parcelId)),
    [proj.lands],
  );
  const avail: CandidateParcel[] = useMemo(
    () => (parcels ?? []).filter((p) => !usedIds.has(p.parcelId)),
    [parcels, usedIds],
  );

  const hint = isLoading
    ? "読み込み中…"
    : avail.length
      ? `グレーの筆をクリックで${hintVerb}（${avail.length}筆）`
      : "この町名に選べる筆がありません";

  async function handlePick(cand: CandidateParcel) {
    await onPick(cand);
    if (!keepOpenAfterPick) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="mb-2 flex items-center gap-3">
          <label htmlFor="parcel-picker-town" className="text-sm font-medium">
            町名・丁目
          </label>
          <select
            id="parcel-picker-town"
            value={effectiveTown ?? ""}
            disabled={!towns}
            onChange={(e) => setTown(e.target.value)}
            className="rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
          >
            {!towns ? (
              <option>読み込み中…</option>
            ) : (
              towns.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}（{t.count}）
                </option>
              ))
            )}
          </select>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
        <div className="kouzu-host h-[60vh] p-0">
          <KouzuView
            interactive
            lands={proj.lands ?? []}
            candidates={avail}
            selectedLandId={selectedLandId}
            onCandidateClick={handlePick}
            emptyText={"この町名の候補筆がありません。\n別の町名を選んでください。"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
