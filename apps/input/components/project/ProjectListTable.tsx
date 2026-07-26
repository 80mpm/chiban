"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjects } from "@chiban/shared/hooks/use-projects";
import { StatusBar } from "@chiban/shared/components/project/StatusBar";
import { Button } from "@chiban/shared/components/ui/button";
import { fmtTsubo, fmtDateTime } from "@chiban/shared/lib/format";
import type { Project } from "@chiban/shared/lib/types";
import { ProjectCreateDialog } from "@/components/project/ProjectCreateDialog";

/** 案件の総坪数（土地の坪数の合計）。 */
function totalTsubo(p: Project): number {
  return (p.lands ?? []).reduce((sum, l) => sum + (l.areaTsubo ?? 0), 0);
}

/**
 * 事務向けの案件一覧テーブル（入力システムのトップ）。
 * 行クリック（または「編集」）で案件編集画面へ。「＋ 新規案件」で作成モーダルを開く。
 */
export function ProjectListTable({ initialProjects }: { initialProjects: Project[] }) {
  const router = useRouter();
  const { data: projects = [] } = useProjects(initialProjects);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)] p-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-[color:var(--app-text-light)]">
            {projects.length} 件の案件
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            ＋ 新規案件
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[color:var(--app-border)] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--app-border)] bg-[color:var(--app-bg)] text-left text-xs text-[color:var(--app-text-light)]">
                <th className="px-4 py-2.5 font-medium">案件名</th>
                <th className="px-4 py-2.5 font-medium">住所</th>
                <th className="px-4 py-2.5 text-right font-medium">土地数</th>
                <th className="px-4 py-2.5 text-right font-medium">総坪数</th>
                <th className="w-32 px-4 py-2.5 font-medium">取得状況</th>
                <th className="px-4 py-2.5 font-medium">更新日時</th>
                <th className="w-16 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[color:var(--app-text-light)]">
                    案件がありません。「＋ 新規案件」から作成してください。
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/projects/${encodeURIComponent(p.id)}/edit`)}
                  className="cursor-pointer border-b border-[color:var(--app-border)] last:border-b-0 hover:bg-[color:var(--app-bg)]"
                >
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-[color:var(--app-text-light)]">
                    {p.address || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.lands?.length ?? 0}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {(p.lands?.length ?? 0) > 0 ? `${fmtTsubo(totalTsubo(p))} 坪` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBar lands={p.lands ?? []} compact />
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--app-text-light)]">
                    {fmtDateTime(p.updatedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/projects/${encodeURIComponent(p.id)}/edit`}
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
      </div>

      <ProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
