"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@chiban/shared/components/ui/button";
import { USER_ROLE_DEFS, USER_ROLE_KEYS, fmtDateTime } from "@chiban/shared/lib/format";
import type { User, UserRole } from "@chiban/shared/lib/types";

type Filter = "all" | UserRole;

/**
 * ユーザー一覧（種別フィルタタブ付き）。行クリックで編集ページへ。
 * 営業タブ = 案件閲覧システムのアカウント、事務タブ = 案件入力システムのアカウント。
 */
export function UserListTable({ initialUsers }: { initialUsers: User[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const users = initialUsers.filter((u) => filter === "all" || u.role === filter);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: `すべて（${initialUsers.length}）` },
    ...USER_ROLE_KEYS.map((r) => ({
      key: r as Filter,
      label: `${USER_ROLE_DEFS[r].label}（${initialUsers.filter((u) => u.role === r).length}）`,
    })),
  ];

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader
        crumbs={[{ label: "案件一覧", href: "/" }, { label: "ユーザー管理" }]}
        title="ユーザー管理"
        actions={
          <Button size="sm" asChild>
            <Link href="/users/new">＋ ユーザーを登録</Link>
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-md border px-3 py-1 text-xs ${
              filter === t.key
                ? "border-brand bg-brand text-white"
                : "border-border bg-white text-[color:var(--app-text-dark)] hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          営業 = 案件閲覧システム / 事務 = 案件入力システムのアカウント
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[color:var(--app-bg)] text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">ログインID</th>
              <th className="px-4 py-2.5 font-medium">氏名</th>
              <th className="px-4 py-2.5 font-medium">種別</th>
              <th className="px-4 py-2.5 font-medium">状態</th>
              <th className="px-4 py-2.5 font-medium">更新日時</th>
              <th className="w-16 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  ユーザーがいません。「＋ ユーザーを登録」から作成してください。
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr
                key={u.id}
                onClick={() => router.push(`/users/${encodeURIComponent(u.id)}/edit`)}
                className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-[color:var(--app-bg)] ${
                  u.isActive ? "" : "text-muted-foreground opacity-70"
                }`}
              >
                <td className="px-4 py-2.5 font-mono text-[13px]">{u.loginId}</td>
                <td className="px-4 py-2.5 font-medium">{u.name}</td>
                <td className="px-4 py-2.5">{USER_ROLE_DEFS[u.role].label}</td>
                <td className="px-4 py-2.5">
                  {u.isActive ? (
                    <span className="rounded bg-[#10b981]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#059669]">
                      有効
                    </span>
                  ) : (
                    <span className="rounded bg-[#94a3b8]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#64748b]">
                      停止中
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {fmtDateTime(u.updatedAt)}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/users/${encodeURIComponent(u.id)}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
