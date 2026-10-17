"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Input } from "@chiban/shared/components/ui/input";
import { Textarea } from "@chiban/shared/components/ui/textarea";
import { Label } from "@chiban/shared/components/ui/label";
import { updateLand } from "@chiban/shared/lib/data-client";
import type { Project, Land, Building } from "@chiban/shared/lib/types";

const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 建物の基本情報の作成/編集フォーム（所在・家屋番号・構造・種類・延床面積・
 * 新築年月日・備考のみ）。地権者・抵当権は建物詳細ページの行単位ページで編集する。
 *
 * API は建物単体のエンドポイントを持たないため、土地の buildings 配列を再構築して
 * PATCH {buildings} で全置換する（既存建物は id ごと再送されるため id は安定）。
 * 追加時は PATCH 応答から新しい建物の id を特定して建物詳細へ遷移する。
 */
export function BuildingForm({
  proj,
  land,
  building,
}: {
  proj: Project;
  land: Land;
  /** 編集対象の建物。undefined なら新規追加。 */
  building?: Building;
}) {
  const isCreate = !building;
  const { saving, error, setError, submit } = useFormSubmit();
  const [location, setLocation] = useState(building?.location ?? "");
  const [kaokuNumber, setKaokuNumber] = useState(building?.kaokuNumber ?? "");
  const [structure, setStructure] = useState(building?.structure ?? "");
  const [usage, setUsage] = useState(building?.usage ?? "");
  const [floorArea, setFloorArea] = useState(
    building?.floorArea != null ? String(building.floorArea) : "",
  );
  const [builtDate, setBuiltDate] = useState(building?.builtDate ?? "");
  const [description, setDescription] = useState(building?.description ?? "");

  const landBase = `/projects/${proj.id}/lands/${land.id}`;
  const backHref = isCreate
    ? landBase
    : `${landBase}/buildings/${encodeURIComponent(building.id)}`;
  const title = isCreate ? "建物を追加" : "建物の基本情報の編集";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = floorArea.trim();
    let area: number | null = null;
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        setError("延床面積は 0 以上の数値（㎡）で入力してください");
        return;
      }
      area = n;
    }
    const values: Building = {
      id: building?.id ?? "",
      location: location.trim(),
      kaokuNumber: kaokuNumber.trim(),
      structure: structure.trim(),
      usage: usage.trim(),
      floorArea: area,
      builtDate,
      description: description.trim(),
      // 追加時は空、編集時は既存の地権者・抵当権を維持して再送する
      owners: building?.owners ?? [],
      mortgages: building?.mortgages ?? [],
      createdAt: building?.createdAt ?? null,
      updatedAt: building?.updatedAt ?? null,
    };
    const current = land.buildings ?? [];
    const next = isCreate
      ? [...current, values]
      : current.map((b) => (b.id === building.id ? values : b));
    const knownIds = new Set(current.map((b) => b.id));
    await submit(() => updateLand(proj.id, land.id, { buildings: next }), {
      successMessage: isCreate ? "建物を追加しました" : "建物を保存しました",
      redirectTo: (saved) => {
        if (!isCreate) return backHref;
        // 追加時は応答から新規 id（送信前に存在しなかった id）を特定して詳細へ
        const created = (saved.buildings ?? []).find((b) => !knownIds.has(b.id));
        return created
          ? `${landBase}/buildings/${encodeURIComponent(created.id)}`
          : landBase;
      },
    });
  }

  const fieldCls = "grid grid-cols-[112px_1fr] items-center gap-x-3";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: landTitle(land), href: landBase },
          ...(isCreate
            ? []
            : [{ label: `建物 ${building.kaokuNumber || ""}`.trim(), href: backHref }]),
          { label: title },
        ]}
        title={title}
      />

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className={fieldCls}>
            <Label htmlFor="location" className="text-xs">所在</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例：西浅草二丁目24番地3"
              autoFocus={isCreate}
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="kaokuNumber" className="text-xs">家屋番号</Label>
            <Input
              id="kaokuNumber"
              value={kaokuNumber}
              onChange={(e) => setKaokuNumber(e.target.value)}
              placeholder="例：24番3"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="structure" className="text-xs">構造</Label>
            <Input
              id="structure"
              value={structure}
              onChange={(e) => setStructure(e.target.value)}
              placeholder="例：木造瓦葺2階建"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="usage" className="text-xs">種類・用途</Label>
            <Input
              id="usage"
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              placeholder="例：居宅／共同住宅"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="floorArea" className="text-xs">延床面積（㎡）</Label>
            <Input
              id="floorArea"
              type="number"
              min={0}
              step="0.01"
              value={floorArea}
              onChange={(e) => setFloorArea(e.target.value)}
              placeholder="例：96.52"
              className="max-w-56"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="builtDate" className="text-xs">新築年月日</Label>
            <Input
              id="builtDate"
              type="date"
              value={builtDate}
              onChange={(e) => setBuiltDate(e.target.value)}
              className="max-w-56"
            />
          </div>
          <div className="grid grid-cols-[112px_1fr] items-start gap-x-3">
            <Label htmlFor="description" className="pt-2 text-xs">備考</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：老朽化が進み建替え前提／借地上建物 など"
              rows={2}
            />
          </div>
        </div>

        <FormActions
          saving={saving}
          error={error}
          cancelHref={backHref}
          saveLabel={isCreate ? "追加" : "保存"}
        />
      </form>

      {isCreate && (
        <p className="mt-3 text-xs text-muted-foreground">
          建物の地権者・抵当権は、追加後の建物詳細ページから入力できます。
        </p>
      )}
    </main>
  );
}
