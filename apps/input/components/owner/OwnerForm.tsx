"use client";

import { useState } from "react";
import { PageHeader, type Crumb } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Input } from "@chiban/shared/components/ui/input";
import { Textarea } from "@chiban/shared/components/ui/textarea";
import { Label } from "@chiban/shared/components/ui/label";
import { updateLand } from "@chiban/shared/lib/data-client";
import { emptyOwner } from "@chiban/shared/lib/format";
import type { Project, Land, Building, Owner } from "@chiban/shared/lib/types";

const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 地権者 1 人の追加・編集・削除フォーム（土地の地権者 / 建物の地権者で共用）。
 *
 * API は行単位のエンドポイントを持たないため、owners 配列を再構築して
 * PATCH で全置換する（建物の場合は該当建物を差し替えた buildings 配列を送る。
 * 既存建物 id は再送されるため安定）。
 *
 * @param index 編集対象の並び順（1 始まり）。未指定なら新規追加
 */
export function OwnerForm({
  proj,
  land,
  building,
  index,
}: {
  proj: Project;
  land: Land;
  building?: Building;
  index?: number;
}) {
  const isCreate = index == null;
  const currentOwners: Owner[] = (building ? building.owners : land.owners) ?? [];
  const initial = isCreate ? emptyOwner() : currentOwners[index - 1];
  const { saving, error, setError, submit } = useFormSubmit();
  const [values, setValues] = useState<Owner>(initial);
  const set = (patch: Partial<Owner>) => setValues((v) => ({ ...v, ...patch }));

  const landBase = `/projects/${proj.id}/lands/${land.id}`;
  const backHref = building ? `${landBase}/buildings/${encodeURIComponent(building.id)}` : landBase;
  const subject = building ? "建物の地権者" : "土地の地権者";
  const title = isCreate ? `${subject}を追加` : `${subject}の編集（${initial.name || `${index} 人目`}）`;

  /** 再構築した owners 配列を PATCH の fields に変換する。 */
  function fieldsFor(nextOwners: Owner[]): Partial<Land> {
    if (!building) return { owners: nextOwners };
    return {
      buildings: (land.buildings ?? []).map((b) =>
        b.id === building.id ? { ...building, owners: nextOwners } : b,
      ),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setError("氏名は必須です");
      return;
    }
    const share = values.share.trim().replace(/\s+/g, "");
    if (share && !/^\d+\/[1-9]\d*$/.test(share)) {
      setError("持分は「1/2」のような分数（分子/分母）で入力してください（単独所有は空欄）");
      return;
    }
    const cleaned: Owner = { ...values, name, share };
    const nextOwners = isCreate
      ? [...currentOwners, cleaned]
      : currentOwners.map((o, i) => (i === index - 1 ? cleaned : o));
    await submit(() => updateLand(proj.id, land.id, fieldsFor(nextOwners)), {
      successMessage: isCreate ? `${subject}を追加しました` : `${subject}を保存しました`,
      redirectTo: backHref,
    });
  }

  const crumbs: Crumb[] = [
    { label: "案件一覧", href: "/" },
    { label: proj.name, href: `/projects/${proj.id}` },
    { label: landTitle(land), href: landBase },
    ...(building
      ? [{ label: `建物 ${building.kaokuNumber || ""}`.trim(), href: backHref }]
      : []),
    { label: title },
  ];

  const fieldCls = "grid grid-cols-[112px_1fr] items-center gap-x-3";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader crumbs={crumbs} title={title} />

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className={fieldCls}>
            <Label htmlFor="name" className="text-xs">
              氏名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="例：田中一郎"
              autoFocus={isCreate}
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="share" className="text-xs">持分</Label>
            <Input
              id="share"
              value={values.share}
              onChange={(e) => set({ share: e.target.value })}
              placeholder="例：1/2（単独所有は空欄）"
              className="max-w-56"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="address" className="text-xs">住所</Label>
            <Input
              id="address"
              value={values.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="例：東京都台東区竜泉三丁目23番9号"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="regDate" className="text-xs">登記日</Label>
            <Input
              id="regDate"
              type="date"
              value={values.regDate}
              onChange={(e) => set({ regDate: e.target.value })}
              className="max-w-56"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="regCause" className="text-xs">登記原因</Label>
            <Input
              id="regCause"
              value={values.regCause}
              onChange={(e) => set({ regCause: e.target.value })}
              placeholder="例：相続／売買／遺贈／所有権保存"
            />
          </div>
          <div className="grid grid-cols-[112px_1fr] items-start gap-x-3">
            <Label htmlFor="description" className="pt-2 text-xs">備考</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="例：連絡は長男経由／平日日中は不在がち など"
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

      {!isCreate && (
        <div className="mt-4 flex justify-end">
          <ConfirmDeleteButton
            label="この地権者を削除"
            confirmMessage={`地権者「${initial.name}」を削除します。よろしいですか？`}
            successMessage="地権者を削除しました"
            redirectTo={backHref}
            onDelete={() =>
              updateLand(
                proj.id,
                land.id,
                fieldsFor(currentOwners.filter((_, i) => i !== index - 1)),
              )
            }
          />
        </div>
      )}
    </main>
  );
}
