"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Button } from "@chiban/shared/components/ui/button";
import { KouzuView, type CandidateParcel } from "@chiban/shared/components/kouzu/KouzuView";
import { useParcelTowns, useParcelsByTownWithPolygons } from "@chiban/shared/hooks/use-parcels";
import { createLand, updateLand } from "@chiban/shared/lib/data-client";
import type { Project, Land } from "@chiban/shared/lib/types";

const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 公図ポリゴンから筆を選ぶページ（土地追加 / 筆の変更で共用）。
 * 町名を選ぶと候補筆がグレー表示され、クリックで選択（青ハイライト）→
 * 「この筆で…」ボタンで確定する（クリック即保存はしない）。
 *
 * - mode="add": 確定で土地を追加し、新しい土地の詳細ページへ
 * - mode="change": 確定で対象土地の parcelId を変更し、土地詳細へ戻る
 */
export function ParcelPickerClient({
  proj,
  mode,
  land,
}: {
  proj: Project;
  mode: "add" | "change";
  land?: Land;
}) {
  const { saving, error, submit } = useFormSubmit();
  const { data: towns } = useParcelTowns(true);
  const [town, setTown] = useState<string | null>(null);
  const [selected, setSelected] = useState<CandidateParcel | null>(null);

  // 既定の町名: 変更時は対象土地の町名、追加時は案件内で最も使われている町名
  const defaultTownName = useMemo(() => {
    if (mode === "change" && land?.aza) return land.aza;
    const counts = new Map<string, number>();
    for (const l of proj.lands ?? []) if (l.aza) counts.set(l.aza, (counts.get(l.aza) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [mode, land, proj.lands]);

  const effectiveTown = town ?? defaultTownName ?? towns?.[0]?.name ?? null;
  const { data: parcels, isLoading } = useParcelsByTownWithPolygons(effectiveTown);

  // 案件内で使用中の全 parcelId を候補から除外（重複・現筆への無変更を防ぐ）
  const usedIds = useMemo(
    () => new Set((proj.lands ?? []).map((l) => l.parcelId)),
    [proj.lands],
  );
  const avail: CandidateParcel[] = useMemo(
    () => (parcels ?? []).filter((p) => !usedIds.has(p.parcelId)),
    [parcels, usedIds],
  );

  const verb = mode === "add" ? "追加" : "変更";
  const hint = isLoading
    ? "読み込み中…"
    : avail.length
      ? `グレーの筆をクリックで選択 → 下のボタンで${verb}を確定`
      : "この町名に選べる筆がありません";

  const title = mode === "add" ? "土地を追加（筆を選択）" : `筆を変更（${land ? landTitle(land) : ""}）`;
  const backHref =
    mode === "add" ? `/projects/${proj.id}` : `/projects/${proj.id}/lands/${land?.id}`;

  function handleConfirm() {
    if (!selected) return;
    if (mode === "add") {
      submit(() => createLand(proj.id, { parcelId: selected.parcelId, status: "target" }), {
        successMessage: `${selected.chiban} を追加しました（領域・坪数は筆マスタから自動設定）`,
        redirectTo: (created) => `/projects/${proj.id}/lands/${created.id}`,
      });
    } else if (land) {
      submit(() => updateLand(proj.id, land.id, { parcelId: selected.parcelId }), {
        successMessage: `筆を ${selected.chiban} に変更しました（地番・領域・面積は再導出されます）`,
        redirectTo: `/projects/${proj.id}/lands/${land.id}`,
      });
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          ...(mode === "change" && land
            ? [{ label: landTitle(land), href: backHref }]
            : []),
          { label: title },
        ]}
        title={title}
      />

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-3">
          <label htmlFor="parcel-picker-town" className="text-sm font-medium">
            町名・丁目
          </label>
          <select
            id="parcel-picker-town"
            value={effectiveTown ?? ""}
            disabled={!towns}
            onChange={(e) => {
              setTown(e.target.value);
              setSelected(null);
            }}
            className="rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
          >
            {!towns ? (
              <option>読み込み中…</option>
            ) : (
              towns.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))
            )}
          </select>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>

        <div className="kouzu-host h-[60vh] p-0">
          <KouzuView
            interactive
            fitToLands
            minZoom={0.1}
            labelMode="chiban"
            showCandidateChiban
            landColor="#065a82"
            lands={proj.lands ?? []}
            candidates={avail}
            selectedCandidateId={selected?.parcelId ?? null}
            selectedLandId={mode === "change" ? land?.id ?? null : null}
            onCandidateClick={setSelected}
            emptyText={"この町名の候補筆がありません。\n別の町名を選んでください。"}
          />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          {error && (
            <div className="mb-3 rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleConfirm} disabled={!selected || saving}>
              {saving
                ? "保存中…"
                : selected
                  ? mode === "add"
                    ? `「${selected.chiban}」で土地を追加`
                    : `「${selected.chiban}」に変更`
                  : "筆を選択してください"}
            </Button>
            <a href={backHref} className="text-sm text-brand hover:underline">
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
