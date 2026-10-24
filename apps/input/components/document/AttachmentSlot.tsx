"use client";

import { FileText, FileUp } from "lucide-react";
import type { RegistryDocument } from "@chiban/shared/lib/types";

/**
 * 添付ファイル 1 つ分の枠（土地・建物の登記簿/公図カードと案件の公図カードで共用）。
 * 添付は種類ごとに 1 つまでなので、件数や一覧ではなく「枠が空いているか埋まっているか」で見せる。
 * 未添付は点線の空き枠 + 「ファイルを選んで添付」、添付済みはファイル 1 件の行 + actions（差し替え・削除など）。
 */
export function AttachmentSlot({
  doc,
  href,
  emptyText,
  hint,
  busy,
  onPick,
  meta,
  actions,
}: {
  doc: RegistryDocument | undefined;
  /** 添付済みファイルを開く URL。 */
  href: string | undefined;
  emptyText: string;
  /** 受け付ける形式・サイズの補足（空き枠に出す）。 */
  hint: string;
  busy: boolean;
  /** 空き枠の「ファイルを選んで添付」でファイル選択を開く。 */
  onPick: () => void;
  meta: React.ReactNode;
  actions: React.ReactNode;
}) {
  if (!doc) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-md border-2 border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
        <FileUp className="size-5" aria-hidden />
        <div>{emptyText}</div>
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="mt-1 rounded-md border border-border bg-white px-3 py-1 text-xs text-[color:var(--app-text-dark)] hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          ファイルを選んで添付
        </button>
        <div>{hint}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md border border-border bg-[#f8fafc] px-3 py-2 text-xs">
      <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-all font-medium text-[color:var(--app-brand)] underline-offset-2 hover:underline"
        >
          {doc.fileName}
        </a>
        <div className="mt-0.5 text-muted-foreground">{meta}</div>
      </div>
      <div className="flex shrink-0 gap-1.5">{actions}</div>
    </div>
  );
}
