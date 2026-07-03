"use client";

import { useState } from "react";
import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { fmtDateOnly } from "@/lib/format";
import type { Mortgage } from "@/lib/types";

function emptyMortgage(): Mortgage {
  return { date: "", amount: null, holder: "" };
}

/** 3 項目とも空の行はサーバが捨てる（保存対象にならない）。 */
function isEmpty(m: Mortgage): boolean {
  return !m.date && m.amount == null && !m.holder;
}

/**
 * 抵当権の行編集（設定日・債権額・抵当権者）。土地・建物の双方で使う。
 * どの変更も mortgages 配列全体を再構築して onChange に渡し、PATCH で全置換する。
 * 追加直後の行は何か 1 項目が入るまでローカルの下書き（drafts）として保持する
 * （OwnersEditor と同じ流儀）。
 */
export function MortgagesEditor({
  mortgages,
  onChange,
  title = "抵当権",
}: {
  mortgages: Mortgage[];
  onChange: (mortgages: Mortgage[]) => Promise<boolean>;
  title?: string;
}) {
  const list = mortgages ?? [];
  const [drafts, setDrafts] = useState<Mortgage[]>([]);

  function patchMortgage(index: number, patch: Partial<Mortgage>): Promise<boolean> {
    return onChange(list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async function patchDraft(index: number, patch: Partial<Mortgage>): Promise<boolean> {
    const next = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
    if (!isEmpty(next[index])) {
      const ok = await onChange([...list, next[index]]);
      if (ok !== false) setDrafts(next.filter((_, i) => i !== index));
      return ok;
    }
    setDrafts(next);
    return true;
  }

  function removeMortgage(index: number) {
    if (!window.confirm("この抵当権を削除します。よろしいですか？")) return;
    onChange(list.filter((_, i) => i !== index));
  }

  const labelCls = "text-[11px] text-muted-foreground";

  function mortgageFields(m: Mortgage, patch: (p: Partial<Mortgage>) => Promise<boolean>) {
    return (
      <div className="grid grid-cols-[64px_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm">
        <label className={labelCls}>設定日</label>
        <InlineTextField
          type="date"
          value={m.date}
          formatDisplay={(v) => fmtDateOnly(String(v))}
          onConfirm={(next) => patch({ date: next.trim() })}
        />

        <label className={labelCls}>債権額</label>
        <InlineTextField
          type="number"
          placeholder="例：3906"
          value={m.amount}
          formatDisplay={(v) => `${v} 万円`}
          onConfirm={(next) => {
            const t = next.trim();
            if (t === "") return patch({ amount: null });
            const n = Number(t);
            if (!Number.isFinite(n) || n < 0) {
              toast.error("債権額は 0 以上の数値（万円）で入力してください");
              return false;
            }
            return patch({ amount: n });
          }}
        />

        <label className={labelCls}>抵当権者</label>
        <InlineTextField
          type="input"
          placeholder="例：◯◯銀行"
          value={m.holder}
          onConfirm={(next) => patch({ holder: next.trim() })}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 mt-3.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
          {title} ({list.length})
        </h4>
        <button
          type="button"
          onClick={() => setDrafts([...drafts, emptyMortgage()])}
          className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
        >
          ＋ 抵当権を追加
        </button>
      </div>

      {list.length === 0 && drafts.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">抵当権なし</div>
      ) : (
        <div className="space-y-2.5">
          {list.map((m, i) => (
            <div key={`${m.date}-${m.holder}-${i}`} className="rounded-md border border-border bg-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-[color:var(--app-text-dark)]">抵当権 {i + 1}</strong>
                <button
                  type="button"
                  onClick={() => removeMortgage(i)}
                  className="rounded-md border border-[#fca5a5] bg-white px-2 py-0.5 text-[11px] text-[#dc2626] hover:bg-[#fef2f2]"
                >
                  削除
                </button>
              </div>
              {mortgageFields(m, (p) => patchMortgage(i, p))}
            </div>
          ))}

          {drafts.map((d, i) => (
            <div
              key={`draft-${i}`}
              className="rounded-md border border-dashed border-[#94a3b8] bg-white px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-muted-foreground">新しい抵当権（未保存）</strong>
                <button
                  type="button"
                  onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                  className="rounded-md border border-[#fca5a5] bg-white px-2 py-0.5 text-[11px] text-[#dc2626] hover:bg-[#fef2f2]"
                >
                  取消
                </button>
              </div>
              {mortgageFields(d, (p) => patchDraft(i, p))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
