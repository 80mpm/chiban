"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * ログインフォーム（両システム共用・中央カード）。
 * POST /api/auth/login に送信し、成功で ?next=（無ければ /）へ遷移する。
 * next はオープンリダイレクト防止のため同一オリジンのパスのみ許可する。
 */
export function LoginForm({ appName }: { appName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rawNext = searchParams.get("next") ?? "/";
  // "/path" 形式のみ許可（"//evil.example" や絶対 URL は / に落とす）
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
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
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--app-bg)] p-6">
      <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-white p-6 shadow-sm"
        >
          <h1 className="text-lg font-bold text-[color:var(--app-text-dark)]">
            {appName}
            <span className="ml-2 inline-block rounded-lg bg-badge px-[7px] py-0.5 align-middle text-[10px] font-medium text-white">
              DEMO
            </span>
          </h1>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            ログインIDとパスワードを入力してください
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="loginId" className="mb-1 block text-xs text-muted-foreground">
                ログインID
              </label>
              <input
                id="loginId"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoFocus
                autoComplete="username"
                className="w-full rounded-md border border-input bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs text-muted-foreground">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !loginId.trim() || !password}
            className="mt-4 w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "ログイン中…" : "ログイン"}
          </button>
        </form>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          デモ用アカウント: id / pass（閲覧・入力とも可）
        </p>
      </div>
    </div>
  );
}
