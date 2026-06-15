"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { KouzuView } from "@/components/kouzu/KouzuView";
import { StatusBar } from "@/components/project/StatusBar";
import { LandDetailPanel } from "@/components/project/LandDetailPanel";
import { ParcelPickerDialog } from "@/components/project/ParcelPickerDialog";
import { useProjects, useProjectMutations } from "@/hooks/use-projects";
import { fmtDateTime } from "@/lib/format";
import type { Project, LatLng } from "@/lib/types";

const PolygonDrawMap = dynamic(() => import("@/components/map/PolygonDrawMap"), {
  ssr: false,
  loading: () => <div className="h-[360px] w-full rounded-md border border-border bg-[#eef2f7]" />,
});

const dash = (s: string) => s || "—";

export function ProjectEditClient({
  initialProjects,
  projectId,
}: {
  initialProjects: Project[];
  projectId: string;
}) {
  const router = useRouter();
  const { data: projects = [] } = useProjects(initialProjects);
  const { createLand, updateProject, deleteProject, deleteLand } = useProjectMutations();
  const proj = projects.find((p) => p.id === projectId);

  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  if (!proj) {
    return (
      <div className="m-6 rounded-lg border border-border bg-white p-6">
        案件が見つかりません。<Link href="/" className="text-brand underline">案件一覧へ戻る</Link>
      </div>
    );
  }

  const lands = proj.lands ?? [];
  const selectedLand = lands.find((l) => l.id === selectedLandId) ?? null;
  const total = lands.length;
  const acquired = lands.filter((l) => l.status === "acquired").length;
  const pct = total === 0 ? 0 : Math.round((acquired / total) * 100);
  const totalTsubo = lands.reduce((s, l) => s + (Number(l.areaTsubo) || 0), 0);

  // 土地追加モーダルの初期町名（案件内で最も使われている aza）
  const defaultAddTown = (() => {
    const counts = new Map<string, number>();
    for (const l of lands) if (l.aza) counts.set(l.aza, (counts.get(l.aza) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  })();

  async function addParcel(cand: { parcelId: number }) {
    try {
      const land = await createLand.mutateAsync({
        projectId,
        fields: { parcelId: cand.parcelId, status: "target" },
      });
      toast.success(`${land.aza} ${land.chiban} を追加しました（領域・坪数は筆マスタから自動設定）`);
      setSelectedLandId(land.id);
    } catch (e) {
      toast.error(`追加に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function saveProject(fields: Partial<Project>): Promise<boolean> {
    setSaveStatus("保存中…");
    try {
      await updateProject.mutateAsync({ id: projectId, fields });
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setSaveStatus(`保存しました · ${hhmm}`);
      return true;
    } catch (e) {
      setSaveStatus("保存に失敗しました");
      toast.error(`保存に失敗しました: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  function handlePolygonChange(polygon: LatLng[] | null) {
    const oldCount = Array.isArray(proj!.polygon) ? proj!.polygon.length : 0;
    const newCount = Array.isArray(polygon) ? polygon.length : 0;
    // 頂点数が変わると frontRoads の辺インデックスが無効になるためクリアする
    if (newCount !== oldCount) saveProject({ polygon, frontRoads: [] });
    else saveProject({ polygon });
  }

  function deleteProjectConfirm() {
    const msg =
      total > 0
        ? `「${proj!.name}」を削除します。\n含まれる ${total} 件の土地・訪問記録もすべて削除されます。\n本当によろしいですか？`
        : `「${proj!.name}」を削除します。よろしいですか？`;
    if (!window.confirm(msg)) return;
    deleteProject
      .mutateAsync(projectId)
      .then(() => {
        toast.success("案件を削除しました");
        router.push("/");
      })
      .catch((e) => toast.error(`削除に失敗しました: ${e instanceof Error ? e.message : e}`));
  }

  function deleteLandConfirm(landId: string) {
    const land = lands.find((l) => l.id === landId);
    if (!land) return;
    const cnt = land.visits?.length ?? 0;
    const msg =
      cnt > 0
        ? `「${land.chiban}」を削除します。\n${cnt} 件の訪問記録もすべて削除されます。\nよろしいですか？`
        : `「${land.chiban}」を削除します。よろしいですか？`;
    if (!window.confirm(msg)) return;
    deleteLand
      .mutateAsync({ projectId, landId })
      .then(() => {
        if (selectedLandId === landId) setSelectedLandId(null);
        toast.success("土地を削除しました");
      })
      .catch((e) => toast.error(`削除に失敗しました: ${e instanceof Error ? e.message : e}`));
  }

  const fieldLabel = "text-sm text-muted-foreground";

  return (
    <main className="mx-auto max-w-6xl space-y-4 overflow-y-auto p-6">
      {/* パンくず + タイトル */}
      <div>
        <div className="text-xs text-muted-foreground">
          <Link href="/" className="text-brand hover:underline">案件一覧</Link>
          {" › "}
          <Link href={`/projects/${proj.id}`} className="text-brand hover:underline">案件詳細</Link>
          {" › "}
          <span>案件編集</span>
          {" › "}
          <span>{proj.name}</span>
        </div>
        <h2 className="mt-1 text-xl font-bold text-[color:var(--app-text-dark)]">{proj.name}</h2>
      </div>

      {/* 上段 2 カラム: 領域マップ / 案件情報 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <PolygonDrawMap initialPolygon={proj.polygon} onChange={handlePolygonChange} />
        </div>

        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--app-text-dark)]">案件情報</h3>
            <span className="text-xs text-muted-foreground">{saveStatus}</span>
          </div>

          <div className="mb-3 rounded-md bg-[#f8fafc] p-2.5">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>取得状況：取得済 <strong>{acquired}</strong> / {total} 件</span>
              <span className={`text-lg font-bold ${acquired === 0 ? "text-[color:var(--app-text-light)]" : "text-status-acquired"}`}>
                {pct}%
              </span>
            </div>
            <StatusBar lands={lands} compact />
          </div>

          <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
            <label className={fieldLabel}>案件名 <span className="text-destructive">*</span></label>
            <InlineTextField
              type="input"
              placeholder="例：川口駅東口案件"
              value={proj.name}
              onConfirm={(next) => {
                if (!next.trim()) {
                  toast.error("案件名は必須です");
                  return false;
                }
                return saveProject({ name: next.trim() });
              }}
            />

            <label className={fieldLabel}>概要</label>
            <InlineTextField type="textarea" placeholder="案件の概要・狙いなど" value={proj.description || ""} onConfirm={(next) => saveProject({ description: next.trim() })} />

            <label className={fieldLabel}>所在地</label>
            <InlineTextField type="input" placeholder="例：東京都台東区西浅草2-4-8" value={proj.address || ""} onConfirm={(next) => saveProject({ address: next.trim() })} />

            <label className={fieldLabel}>アクセス</label>
            <InlineTextField type="textarea" placeholder="例：東京メトロ銀座線「田原町」駅 徒歩5分" value={proj.access || ""} onConfirm={(next) => saveProject({ access: next.trim() })} />

            <label className={fieldLabel}>現況容積率</label>
            <InlineTextField
              type="number"
              placeholder="例：500"
              value={proj.currentFar}
              formatDisplay={(v) => `${v}%`}
              onConfirm={(next) => {
                const t = next.trim();
                if (t === "") return saveProject({ currentFar: null });
                const num = Number(t);
                if (!Number.isFinite(num) || num < 0) {
                  toast.error("容積率は 0 以上の数値で入力してください");
                  return false;
                }
                return saveProject({ currentFar: num });
              }}
            />

            <label className={fieldLabel}>想定容積率</label>
            <InlineTextField
              type="number"
              placeholder="例：480"
              value={proj.targetFar}
              formatDisplay={(v) => `${v}%`}
              onConfirm={(next) => {
                const t = next.trim();
                if (t === "") return saveProject({ targetFar: null });
                const num = Number(t);
                if (!Number.isFinite(num) || num < 0) {
                  toast.error("容積率は 0 以上の数値で入力してください");
                  return false;
                }
                return saveProject({ targetFar: num });
              }}
            />

            <label className={fieldLabel}>登録日</label>
            <div className="text-sm">{dash(fmtDateTime(proj.createdAt))}</div>

            <label className={fieldLabel}>更新日</label>
            <div className="text-sm">{dash(fmtDateTime(proj.updatedAt ?? proj.createdAt))}</div>

            <label className={fieldLabel}>土地数</label>
            <div className="text-sm">{total} 件 / 合計 {totalTsubo} 坪</div>
          </div>
        </div>
      </div>

      {/* 土地カード */}
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[color:var(--app-text-dark)]">土地</h3>
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            ＋ 土地を追加
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="kouzu-host h-[480px]">
            <KouzuView
              lands={lands}
              selectedLandId={selectedLandId}
              onSelectLand={setSelectedLandId}
              emptyText={"土地がありません。\n「＋ 土地を追加」で町名を選び、公図ビューに表示される筆をクリックして追加してください。"}
            />
          </div>
          <div className="max-h-[480px] overflow-hidden rounded-md border border-border p-3">
            <LandDetailPanel proj={proj} land={selectedLand} onDeleteLand={deleteLandConfirm} />
          </div>
        </div>
      </div>

      {/* 削除ゾーン */}
      <div className="pt-2">
        <button
          onClick={deleteProjectConfirm}
          className="rounded-md border border-[#fca5a5] bg-white px-4 py-2 text-sm text-[#dc2626] hover:bg-[#fef2f2]"
        >
          案件を削除
        </button>
      </div>

      <ParcelPickerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        proj={proj}
        title="土地を追加"
        defaultTownName={defaultAddTown}
        hintVerb="追加"
        keepOpenAfterPick
        onPick={addParcel}
      />
    </main>
  );
}
