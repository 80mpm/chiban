"use client";

import { useState } from "react";
import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { emptyOwner, fmtDateOnly } from "@/lib/format";
import type { Owner } from "@/lib/types";

/**
 * 地権者の行編集（氏名・持分・住所・登記日・登記原因）。
 * 土地の地権者と建物の地権者の双方で使う。どの変更も owners 配列全体を
 * 再構築して onChange に渡し、PATCH で全置換する。
 *
 * サーバは氏名が空の行を捨てるため、追加直後の行は氏名が確定するまで
 * ローカルの下書き（drafts）として保持し、氏名の確定時にまとめて保存する。
 */
export function OwnersEditor({
  owners,
  onChange,
  title,
}: {
  owners: Owner[];
  onChange: (owners: Owner[]) => Promise<boolean>;
  title: string;
}) {
  const list = owners ?? [];
  const [drafts, setDrafts] = useState<Owner[]>([]);

  /** index の地権者に patch を当てた新配列で保存する。 */
  function patchOwner(index: number, patch: Partial<Owner>): Promise<boolean> {
    return onChange(list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  /** 下書き行の編集。氏名が入った時点でサーバへ送って下書きから外す。 */
  async function patchDraft(index: number, patch: Partial<Owner>): Promise<boolean> {
    const next = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
    if (next[index].name.trim()) {
      const ok = await onChange([...list, next[index]]);
      if (ok !== false) setDrafts(next.filter((_, i) => i !== index));
      return ok;
    }
    setDrafts(next);
    return true;
  }

  function removeOwner(index: number) {
    const o = list[index];
    if (!window.confirm(`地権者「${o.name}」を削除します。よろしいですか？`)) return;
    onChange(list.filter((_, i) => i !== index));
  }

  const labelCls = "text-[11px] text-muted-foreground";

  function ownerFields(
    o: Owner,
    patch: (p: Partial<Owner>) => Promise<boolean>,
    isDraft: boolean,
  ) {
    return (
      <div className="grid grid-cols-[64px_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm">
        <label className={labelCls}>氏名{isDraft && <span className="text-destructive"> *</span>}</label>
        <InlineTextField
          type="input"
          placeholder="例：田中一郎（確定すると保存されます）"
          value={o.name}
          onConfirm={(next) => {
            if (isDraft && !next.trim()) {
              toast.error("氏名を入力してください");
              return false;
            }
            return patch({ name: next.trim() });
          }}
        />

        <label className={labelCls}>持分</label>
        <InlineTextField
          type="input"
          placeholder="例：1/2（単独所有は空欄）"
          value={o.share}
          formatDisplay={(v) => `持分${v}`}
          onConfirm={(next) => patch({ share: next.trim() })}
        />

        <label className={labelCls}>住所</label>
        <InlineTextField
          type="input"
          placeholder="例：東京都台東区竜泉三丁目23番9号"
          value={o.address}
          onConfirm={(next) => patch({ address: next.trim() })}
        />

        <label className={labelCls}>登記日</label>
        <InlineTextField
          type="date"
          value={o.regDate}
          formatDisplay={(v) => fmtDateOnly(String(v))}
          onConfirm={(next) => patch({ regDate: next.trim() })}
        />

        <label className={labelCls}>登記原因</label>
        <InlineTextField
          type="input"
          placeholder="例：相続／売買／遺贈／所有権保存"
          value={o.regCause}
          onConfirm={(next) => patch({ regCause: next.trim() })}
        />

        <label className={labelCls}>備考</label>
        <InlineTextField
          type="textarea"
          placeholder="例：連絡は長男経由／平日日中は不在がち など"
          value={o.description}
          onConfirm={(next) => patch({ description: next.trim() })}
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
          onClick={() => setDrafts([...drafts, emptyOwner()])}
          className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
        >
          ＋ 地権者を追加
        </button>
      </div>

      {list.length === 0 && drafts.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">地権者が未設定です</div>
      ) : (
        <div className="space-y-2.5">
          {list.map((o, i) => (
            <div key={`${o.name}-${i}`} className="rounded-md border border-border bg-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-[color:var(--app-text-dark)]">
                  {o.name}
                  {o.share && <span className="ml-1 font-normal text-muted-foreground">（持分{o.share}）</span>}
                </strong>
                <button
                  type="button"
                  onClick={() => removeOwner(i)}
                  className="rounded-md border border-[#fca5a5] bg-white px-2 py-0.5 text-[11px] text-[#dc2626] hover:bg-[#fef2f2]"
                >
                  削除
                </button>
              </div>
              {ownerFields(o, (p) => patchOwner(i, p), false)}
            </div>
          ))}

          {drafts.map((d, i) => (
            <div
              key={`draft-${i}`}
              className="rounded-md border border-dashed border-[#94a3b8] bg-white px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-muted-foreground">新しい地権者（未保存）</strong>
                <button
                  type="button"
                  onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
                  className="rounded-md border border-[#fca5a5] bg-white px-2 py-0.5 text-[11px] text-[#dc2626] hover:bg-[#fef2f2]"
                >
                  取消
                </button>
              </div>
              {ownerFields(d, (p) => patchDraft(i, p), true)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
