"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@chiban/shared/components/ui/input";
import { Textarea } from "@chiban/shared/components/ui/textarea";
import { Button } from "@chiban/shared/components/ui/button";
import { emptyOwner } from "@chiban/shared/lib/format";
import type { Owner } from "@chiban/shared/lib/types";

/** 全項目が空の行か（保存時に除外する）。 */
export function isEmptyOwner(o: Owner): boolean {
  return !o.name.trim() && !o.share.trim() && !o.address.trim() && !o.regDate && !o.regCause.trim() && !o.description.trim();
}

/**
 * 地権者行の一括バリデーション。エラーメッセージ（日本語）を返す。問題なければ null。
 * 空行は無視する（保存側で除外される前提）。
 */
export function validateOwners(owners: Owner[], subject: string): string | null {
  for (const [i, o] of owners.entries()) {
    if (isEmptyOwner(o)) continue;
    if (!o.name.trim()) return `${subject}の ${i + 1} 行目：氏名を入力してください`;
    const share = o.share.trim().replace(/\s+/g, "");
    if (share && !/^\d+\/[1-9]\d*$/.test(share)) {
      return `${subject}の ${i + 1} 行目：持分は「1/2」のような分数（分子/分母）で入力してください（単独所有は空欄）`;
    }
  }
  return null;
}

/**
 * 地権者の複数行フィールドセット（土地・建物のフォームで共用）。
 * 行の追加・削除・編集はすべてローカル state 操作のみで、保存は親フォームの
 * 保存ボタンで一括して行う（行単位の即時保存はしない）。
 */
export function OwnersFieldset({
  title,
  owners,
  onChange,
}: {
  title: string;
  owners: Owner[];
  onChange: (owners: Owner[]) => void;
}) {
  const patch = (i: number, p: Partial<Owner>) =>
    onChange(owners.map((o, j) => (j === i ? { ...o, ...p } : o)));

  const labelCls = "text-[11px] text-muted-foreground";
  const fieldCls = "grid grid-cols-[64px_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm";

  return (
    <fieldset className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
          {title}（{owners.filter((o) => !isEmptyOwner(o)).length}）
        </legend>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...owners, emptyOwner()])}
        >
          ＋ 行を追加
        </Button>
      </div>

      {owners.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">
          地権者が未設定です（「＋ 行を追加」で入力欄を追加）
        </div>
      ) : (
        <div className="space-y-2.5">
          {owners.map((o, i) => (
            <div key={i} className="rounded-md border border-border bg-white px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-[color:var(--app-text-dark)]">
                  {o.name.trim() || `地権者 ${i + 1}`}
                </strong>
                <button
                  type="button"
                  aria-label="この行を削除"
                  title="この行を削除（保存で確定）"
                  onClick={() => onChange(owners.filter((_, j) => j !== i))}
                  className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-[#fef2f2] hover:text-[#dc2626]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className={fieldCls}>
                <label className={labelCls}>
                  氏名 <span className="text-destructive">*</span>
                </label>
                <Input
                  value={o.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  placeholder="例：田中一郎"
                  className="h-8 text-sm"
                />
                <label className={labelCls}>持分</label>
                <Input
                  value={o.share}
                  onChange={(e) => patch(i, { share: e.target.value })}
                  placeholder="例：1/2（単独所有は空欄）"
                  className="h-8 text-sm"
                />
                <label className={labelCls}>住所</label>
                <Input
                  value={o.address}
                  onChange={(e) => patch(i, { address: e.target.value })}
                  placeholder="例：東京都台東区竜泉三丁目23番9号"
                  className="h-8 text-sm"
                />
                <label className={labelCls}>登記日</label>
                <Input
                  type="date"
                  value={o.regDate}
                  onChange={(e) => patch(i, { regDate: e.target.value })}
                  className="h-8 text-sm"
                />
                <label className={labelCls}>登記原因</label>
                <Input
                  value={o.regCause}
                  onChange={(e) => patch(i, { regCause: e.target.value })}
                  placeholder="例：相続／売買／遺贈／所有権保存"
                  className="h-8 text-sm"
                />
                <label className={labelCls}>備考</label>
                <Textarea
                  value={o.description}
                  onChange={(e) => patch(i, { description: e.target.value })}
                  placeholder="例：連絡は長男経由／平日日中は不在がち など"
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
