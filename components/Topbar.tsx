"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * 4 画面共通のトップバー（旧 topbar.css）。
 * 構造: h1（システム名リンク + 画面名 + DEMO バッジ）→ サンプルデータに戻す → 業務報告シート ↗
 *
 * @param screen 画面名（「案件一覧」「案件編集」など）
 * @param showReport 業務報告シートへのリンクを出すか（report 画面では出さない）
 */
export function Topbar({
  screen,
  showReport = true,
  showReset = true,
}: {
  screen: string;
  showReport?: boolean;
  showReset?: boolean;
}) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (
      !window.confirm(
        "すべての案件・土地・訪問記録を破棄してサンプルデータに戻します。よろしいですか？",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* JSON でないエラー応答はステータスのまま */
        }
        throw new Error(msg);
      }
      await queryClient.invalidateQueries();
      toast.success("サンプルデータに戻しました");
      // 全画面の状態を確実に作り直すためリロードする（旧 common.js と同挙動）
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "リセットに失敗しました");
      setResetting(false);
    }
  }

  return (
    <header className="z-10 flex h-14 flex-none items-center gap-3 bg-header px-5 text-white shadow-[0_1px_4px_rgba(0,0,0,.15)]">
      <h1 className="flex-1 text-[15px] font-semibold">
        <Link
          href="/"
          className="-mx-1.5 -my-0.5 rounded px-1.5 py-0.5 text-inherit no-underline transition-colors hover:bg-white/10"
        >
          案件管理システム
        </Link>{" "}
        — {screen}{" "}
        <span className="ml-2 inline-block rounded-lg bg-badge px-[7px] py-0.5 align-middle text-[10px] font-medium">
          DEMO
        </span>
      </h1>

      {showReset && (
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="cursor-pointer rounded-md border border-[rgba(248,113,113,.35)] bg-white/[.06] px-3 py-1.5 text-xs text-[#fecaca] transition-colors hover:bg-[rgba(248,113,113,.15)] hover:text-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetting ? "リセット中…" : "サンプルデータに戻す"}
        </button>
      )}

      {showReport && (
        <Link
          href="/report"
          target="_blank"
          rel="noopener"
          className="rounded-md bg-white/[.08] px-3 py-1.5 text-xs text-[#c8e6f5] no-underline transition-colors hover:bg-white/[.18]"
        >
          業務報告シート ↗
        </Link>
      )}
    </header>
  );
}
