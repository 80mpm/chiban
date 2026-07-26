"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@chiban/shared/components/ui/input";
import { Button } from "@chiban/shared/components/ui/button";
import type { Mortgage } from "@chiban/shared/lib/types";

/** フォーム編集中の抵当権行（金額は入力中の文字列のまま保持する）。 */
export interface MortgageDraft {
  date: string;
  amount: string;
  holder: string;
}

export function toMortgageDraft(m: Mortgage): MortgageDraft {
  return { date: m.date, amount: m.amount != null ? String(m.amount) : "", holder: m.holder };
}

/** 全項目が空の行か（保存時に除外する）。 */
export function isEmptyMortgage(m: MortgageDraft): boolean {
  return !m.date && !m.amount.trim() && !m.holder.trim();
}

/**
 * 抵当権行の一括バリデーション + Mortgage[] への変換。
 * 空行は除外する。エラー時は { error } を返す。
 */
export function buildMortgages(
  drafts: MortgageDraft[],
  subject: string,
): { mortgages: Mortgage[] } | { error: string } {
  const mortgages: Mortgage[] = [];
  for (const [i, d] of drafts.entries()) {
    if (isEmptyMortgage(d)) continue;
    let amount: number | null = null;
    const t = d.amount.trim();
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${subject}の ${i + 1} 行目：債権額は 0 以上の数値（万円）で入力してください` };
      }
      amount = n;
    }
    mortgages.push({ date: d.date, amount, holder: d.holder.trim() });
  }
  return { mortgages };
}

/**
 * 抵当権の複数行フィールドセット（土地・建物のフォームで共用）。
 * 行の追加・削除・編集はローカル state のみで、保存は親フォームで一括して行う。
 */
export function MortgagesFieldset({
  title,
  mortgages,
  onChange,
}: {
  title: string;
  mortgages: MortgageDraft[];
  onChange: (mortgages: MortgageDraft[]) => void;
}) {
  const patch = (i: number, p: Partial<MortgageDraft>) =>
    onChange(mortgages.map((m, j) => (j === i ? { ...m, ...p } : m)));

  const labelCls = "text-[11px] text-muted-foreground";

  return (
    <fieldset className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
          {title}（{mortgages.filter((m) => !isEmptyMortgage(m)).length}）
        </legend>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...mortgages, { date: "", amount: "", holder: "" }])}
        >
          ＋ 行を追加
        </Button>
      </div>

      {mortgages.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">抵当権なし</div>
      ) : (
        <div className="space-y-2.5">
          {mortgages.map((m, i) => (
            <div key={i} className="rounded-md border border-border bg-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-[color:var(--app-text-dark)]">
                  抵当権 {i + 1}
                </strong>
                <button
                  type="button"
                  aria-label="この行を削除"
                  title="この行を削除（保存で確定）"
                  onClick={() => onChange(mortgages.filter((_, j) => j !== i))}
                  className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-[#fef2f2] hover:text-[#dc2626]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-[64px_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm">
                <label className={labelCls}>設定日</label>
                <Input
                  type="date"
                  value={m.date}
                  onChange={(e) => patch(i, { date: e.target.value })}
                  className="h-8 text-sm"
                />
                <label className={labelCls}>債権額</label>
                <Input
                  type="number"
                  min={0}
                  value={m.amount}
                  onChange={(e) => patch(i, { amount: e.target.value })}
                  placeholder="例：3906（万円）"
                  className="h-8 text-sm"
                />
                <label className={labelCls}>抵当権者</label>
                <Input
                  value={m.holder}
                  onChange={(e) => patch(i, { holder: e.target.value })}
                  placeholder="例：◯◯銀行"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
