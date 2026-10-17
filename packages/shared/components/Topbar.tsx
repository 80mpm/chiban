"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { USER_ROLE_DEFS } from "@chiban/shared/lib/format";
import type { User } from "@chiban/shared/lib/types";

/**
 * 全画面共通のトップバー（旧 topbar.css）。
 * 構造: h1（システム名リンク + 画面名 + DEMO バッジ）→ ユーザー名 + ログアウト → サンプルデータに戻す
 *
 * @param screen 画面名（「案件一覧」「案件編集」など）
 * @param appName システム名（既定は「案件管理システム」。入力システムでは「案件入力システム」）
 * @param user ログイン中のユーザー（渡すと氏名・種別とログアウトボタンを表示）
 */
export function Topbar({
  screen,
  showReset = true,
  appName = "案件管理システム",
  user,
}: {
  screen: string;
  showReset?: boolean;
  appName?: string;
  user?: User;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("ログアウトに失敗しました");
      setLoggingOut(false);
    }
  }

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
    <header className="relative z-10 flex h-14 flex-none items-center gap-3 bg-header px-4 text-white shadow-[0_1px_4px_rgba(0,0,0,.15)] sm:px-5">
      <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        <Link
          href="/"
          className="-mx-1.5 -my-0.5 rounded px-1.5 py-0.5 text-inherit no-underline transition-colors hover:bg-white/10"
        >
          {appName}
        </Link>
        {/* 画面名は狭幅では省略する（システム名 + DEMO は常に出す） */}
        <span className="hidden sm:inline"> — {screen}</span>{" "}
        <span className="ml-2 inline-block rounded-lg bg-badge px-[7px] py-0.5 align-middle text-[10px] font-medium">
          DEMO
        </span>
      </h1>

      {/* PC（md〜）: 従来どおり横並び */}
      {user && (
        <div className="hidden items-center gap-2 text-xs md:flex">
          <span className="text-white/85">
            {user.name}
            <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px]">
              {USER_ROLE_DEFS[user.role].label}
            </span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="cursor-pointer rounded-md border border-white/25 bg-white/[.06] px-2.5 py-1 text-xs text-white/85 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? "ログアウト中…" : "ログアウト"}
          </button>
        </div>
      )}

      {showReset && (
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="hidden cursor-pointer rounded-md border border-[rgba(248,113,113,.35)] bg-white/[.06] px-3 py-1.5 text-xs text-[#fecaca] transition-colors hover:bg-[rgba(248,113,113,.15)] hover:text-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-60 md:block"
        >
          {resetting ? "リセット中…" : "サンプルデータに戻す"}
        </button>
      )}

      {/* モバイル（md 未満）: ユーザー操作を ⋮ メニューに集約 */}
      {(user || showReset) && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="メニュー"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-md border border-white/25 bg-white/[.06] text-lg leading-none hover:bg-white/15"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              {/* 背面クリックで閉じる */}
              <div className="fixed inset-0 z-[690]" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-3 top-[52px] z-[700] w-56 rounded-lg border border-border bg-white py-1.5 text-[color:var(--app-text-dark)] shadow-lg">
                {user && (
                  <div className="border-b border-border px-3 py-2 text-sm">
                    {user.name}
                    <span className="ml-1.5 rounded bg-[color:var(--app-bg)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {USER_ROLE_DEFS[user.role].label}
                    </span>
                  </div>
                )}
                {user && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--app-bg)] disabled:opacity-60"
                  >
                    {loggingOut ? "ログアウト中…" : "ログアウト"}
                  </button>
                )}
                {showReset && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleReset();
                    }}
                    disabled={resetting}
                    className="block w-full px-3 py-2 text-left text-sm text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    {resetting ? "リセット中…" : "サンプルデータに戻す"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
