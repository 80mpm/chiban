"use client";

import Link from "next/link";
import { Button } from "@chiban/shared/components/ui/button";

/**
 * フォーム共通のフッター（エラーバナー + 保存/キャンセル）。
 * error はサーバ・バリデーションの日本語メッセージをそのまま表示する。
 */
export function FormActions({
  saving,
  error,
  cancelHref,
  saveLabel = "保存",
}: {
  saving: boolean;
  error: string;
  cancelHref: string;
  saveLabel?: string;
}) {
  return (
    <div className="mt-5">
      {error && (
        <div className="mb-3 rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "保存中…" : saveLabel}
        </Button>
        <Link href={cancelHref} className="text-sm text-brand hover:underline">
          キャンセル
        </Link>
      </div>
    </div>
  );
}
