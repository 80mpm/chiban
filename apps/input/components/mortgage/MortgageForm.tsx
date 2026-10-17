"use client";

import { useState } from "react";
import { PageHeader, type Crumb } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Input } from "@chiban/shared/components/ui/input";
import { Label } from "@chiban/shared/components/ui/label";
import { updateLand } from "@chiban/shared/lib/data-client";
import { formatMortgage } from "@chiban/shared/lib/format";
import type { Project, Land, Building, Mortgage } from "@chiban/shared/lib/types";

const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 抵当権 1 件の追加・編集・削除フォーム（土地 / 建物で共用）。
 * OwnerForm と同様、mortgages 配列を再構築して PATCH で全置換する。
 *
 * @param index 編集対象の並び順（1 始まり）。未指定なら新規追加
 */
export function MortgageForm({
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
  const current: Mortgage[] = (building ? building.mortgages : land.mortgages) ?? [];
  const initial = isCreate ? { date: "", amount: null, holder: "" } : current[index - 1];
  const { saving, error, setError, submit } = useFormSubmit();
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : "");
  const [holder, setHolder] = useState(initial.holder);

  const landBase = `/projects/${proj.id}/lands/${land.id}`;
  const backHref = building ? `${landBase}/buildings/${encodeURIComponent(building.id)}` : landBase;
  const subject = building ? "抵当権（建物）" : "抵当権（土地）";
  const title = isCreate ? `${subject}を追加` : `${subject}の編集（${index} 件目）`;

  /** 再構築した mortgages 配列を PATCH の fields に変換する。 */
  function fieldsFor(next: Mortgage[]): Partial<Land> {
    if (!building) return { mortgages: next };
    return {
      buildings: (land.buildings ?? []).map((b) =>
        b.id === building.id ? { ...building, mortgages: next } : b,
      ),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let amountNum: number | null = null;
    const t = amount.trim();
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        setError("債権額は 0 以上の数値（万円）で入力してください");
        return;
      }
      amountNum = n;
    }
    const cleaned: Mortgage = { date, amount: amountNum, holder: holder.trim() };
    if (!cleaned.date && cleaned.amount == null && !cleaned.holder) {
      setError("設定日・債権額・抵当権者のいずれかを入力してください");
      return;
    }
    const next = isCreate
      ? [...current, cleaned]
      : current.map((m, i) => (i === index - 1 ? cleaned : m));
    await submit(() => updateLand(proj.id, land.id, fieldsFor(next)), {
      successMessage: isCreate ? "抵当権を追加しました" : "抵当権を保存しました",
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
            <Label htmlFor="date" className="text-xs">設定日</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-56"
              autoFocus={isCreate}
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="amount" className="text-xs">債権額（万円）</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例：3906"
              className="max-w-56"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="holder" className="text-xs">抵当権者</Label>
            <Input
              id="holder"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="例：◯◯銀行"
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
            label="この抵当権を削除"
            confirmMessage={`抵当権「${formatMortgage(initial) || `${index} 件目`}」を削除します。よろしいですか？`}
            successMessage="抵当権を削除しました"
            redirectTo={backHref}
            onDelete={() =>
              updateLand(proj.id, land.id, fieldsFor(current.filter((_, i) => i !== index - 1)))
            }
          />
        </div>
      )}
    </main>
  );
}
