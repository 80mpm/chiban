"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KouzuView, type CandidateParcel } from "@/components/kouzu/KouzuView";
import { useProjectMutations } from "@/hooks/use-projects";
import { useParcelTowns, useParcelsByTownWithPolygons } from "@/hooks/use-parcels";
import type { Project } from "@/lib/types";

/** 案件内で最も使われている町名（無ければ最初の町名）を初期値にする。 */
function defaultTown(proj: Project, towns: { name: string }[] | undefined): string {
  const counts = new Map<string, number>();
  for (const l of proj.lands ?? []) {
    if (l.aza) counts.set(l.aza, (counts.get(l.aza) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ?? towns?.[0]?.name ?? "";
}

/**
 * 土地追加のワイドモーダル（旧 edit.js openLandAddModal）。
 * 町名を選ぶと候補筆がグレー表示され、クリックでその場で追加（連続追加可）。
 */
export function LandAddDialog({
  open,
  onOpenChange,
  proj,
  onLandAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proj: Project;
  onLandAdded: (landId: string) => void;
}) {
  const { createLand } = useProjectMutations();
  const { data: towns } = useParcelTowns(open);
  const [town, setTown] = useState<string | null>(null);
  const effectiveTown = town ?? (open ? defaultTown(proj, towns) : null);

  const { data: parcels, isLoading } = useParcelsByTownWithPolygons(
    open ? effectiveTown : null,
  );

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
      ? `グレーの筆をクリックで追加（${avail.length}筆）`
      : "この町名の筆はすべて追加済みです";

  async function addCandidate(cand: CandidateParcel) {
    try {
      const land = await createLand.mutateAsync({
        projectId: proj.id,
        fields: { parcelId: cand.parcelId, status: "target" },
      });
      toast.success(`${land.aza} ${land.chiban} を追加しました（領域・坪数は筆マスタから自動設定）`);
      onLandAdded(land.id);
    } catch (e) {
      toast.error(`追加に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>土地を追加</DialogTitle>
        </DialogHeader>
        <div className="mb-2 flex items-center gap-3">
          <label htmlFor="land-add-town" className="text-sm font-medium">
            町名・丁目
          </label>
          <select
            id="land-add-town"
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
        <div className="kouzu-host h-[60vh]">
          <KouzuView
            lands={proj.lands ?? []}
            candidates={avail}
            onCandidateClick={addCandidate}
            emptyText={"この町名の候補筆がありません。\n別の町名を選んでください。"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
