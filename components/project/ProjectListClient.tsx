"use client";

import { useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProjects } from "@/hooks/use-projects";
import { StatusBar } from "@/components/project/StatusBar";
import { ProjectCreateDialog } from "@/components/project/ProjectCreateDialog";
import { fmtDateOnly } from "@/lib/format";
import type { Project, LatLng } from "@/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む
const ProjectListMap = dynamic(() => import("@/components/project/ProjectListMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#eef2f7]" />,
});

function totalTsubo(p: Project) {
  return (p.lands ?? []).reduce((s, l) => s + (Number(l.areaTsubo) || 0), 0);
}

export function ProjectListClient({ initialProjects }: { initialProjects: Project[] }) {
  const router = useRouter();
  const { data: projects = [] } = useProjects(initialProjects);
  const [searchTarget, setSearchTarget] = useState<LatLng | null>(null);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const goToDetail = (id: string) =>
    router.push(`/projects/${encodeURIComponent(id)}`);

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("q") as HTMLInputElement);
    const q = input.value.trim();
    if (!q) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        toast("該当する住所が見つかりませんでした");
        return;
      }
      const lat = parseFloat(arr[0].lat);
      const lng = parseFloat(arr[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast("住所の座標を取得できませんでした");
        return;
      }
      setSearchTarget([lat, lng]);
    } catch {
      toast("住所検索に失敗しました");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="grid min-h-0 grid-cols-[1fr_340px]">
      {/* 地図エリア */}
      <div className="relative min-h-0">
        <form
          onSubmit={handleSearch}
          autoComplete="off"
          className="absolute left-3 top-3 z-[500] w-72"
        >
          <input
            name="q"
            type="search"
            disabled={searching}
            placeholder="住所で地図を移動"
            className="w-full rounded-md border border-border bg-white/95 px-3 py-2 text-sm shadow-md outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
          />
        </form>
        <ProjectListMap
          projects={projects}
          searchTarget={searchTarget}
          onProjectClick={goToDetail}
        />
      </div>

      {/* サイドリスト */}
      <aside className="flex min-h-0 flex-col border-l border-border bg-[color:var(--app-surface)]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[color:var(--app-text-dark)]">
              案件一覧
            </h2>
            <div className="text-xs text-muted-foreground">{projects.length} 件</div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            ＋ 新規案件
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {projects.length === 0 ? (
            <div className="px-2 py-10 text-center text-sm text-muted-foreground">
              案件がありません。
              <br />
              「＋ 新規案件」から作成してください。
            </div>
          ) : (
            projects.map((p) => {
              const total = (p.lands ?? []).length;
              const acquired = (p.lands ?? []).filter((l) => l.status === "acquired").length;
              const pct = total > 0 ? Math.round((acquired / total) * 100) : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => goToDetail(p.id)}
                  className="block w-full rounded-lg border border-border bg-white p-3 text-left shadow-sm transition-colors hover:border-brand/40 hover:bg-[#f8fafc]"
                >
                  <div className="font-semibold text-[color:var(--app-text-dark)]">
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{total} 件</span>
                    <span>·</span>
                    <span>{totalTsubo(p)} 坪</span>
                    <span>·</span>
                    <span>更新 {fmtDateOnly(p.updatedAt ?? p.createdAt)}</span>
                  </div>
                  <div className="mt-2">
                    <StatusBar lands={p.lands ?? []} compact />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {total > 0 ? `取得済 ${acquired} / ${total} 件（${pct}%）` : "土地なし"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <ProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}
