"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { FrontRoadEditor } from "@/components/project/FrontRoadEditor";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Button } from "@chiban/shared/components/ui/button";
import { updateProject } from "@chiban/shared/lib/data-client";
import type { Project, LatLng, FrontRoad } from "@chiban/shared/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む
const PolygonDrawMap = dynamic(() => import("@/components/map/PolygonDrawMap"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full rounded-md border border-border bg-[#eef2f7]" />,
});

/**
 * 領域マップの編集ページ本体。ポリゴン描画・頂点編集・前面道路幅員の
 * ドラッグ/数値入力を**ローカル state に溜め**、「保存」で {polygon, frontRoads} を
 * 一括 PATCH する（保存せず離脱すれば変更は反映されない）。
 */
export function AreaMapEditClient({ proj }: { proj: Project }) {
  const { saving, error, submit } = useFormSubmit();
  const [polygon, setPolygon] = useState<LatLng[] | null>(proj.polygon ?? null);
  const [frontRoads, setFrontRoads] = useState<FrontRoad[]>(proj.frontRoads ?? []);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [drawing, setDrawing] = useState(false);

  /** ポリゴン変更（描画完了・頂点ドラッグ・消去）。頂点数が変わると
      frontRoads の辺インデックスが無効になるためクリアする（従来仕様）。 */
  function handlePolygonChange(next: LatLng[] | null) {
    const oldCount = Array.isArray(polygon) ? polygon.length : 0;
    const newCount = Array.isArray(next) ? next.length : 0;
    setPolygon(next);
    if (newCount !== oldCount) {
      setFrontRoads([]);
      setSelectedEdge(null);
    }
    setDirty(true);
  }

  /** 地図上の赤ハンドルのドラッグ確定。幅員 0 以下は無視（削除は一覧のゴミ箱）。 */
  function handleCommitWidth(edgeIndex: number, width: number) {
    if (!(width > 0)) return;
    setFrontRoads((prev) =>
      [...prev.filter((r) => r.edgeIndex !== edgeIndex), { edgeIndex, width }].sort(
        (a, b) => a.edgeIndex - b.edgeIndex,
      ),
    );
    setDirty(true);
  }

  function handleFrontRoadsChange(next: FrontRoad[]) {
    setFrontRoads(next);
    setDirty(true);
  }

  function handleSave() {
    submit(() => updateProject(proj.id, { polygon, frontRoads }), {
      successMessage: "領域マップを保存しました",
      redirectTo: `/projects/${proj.id}`,
    });
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: "領域・前面道路の編集" },
        ]}
        title="領域・前面道路の編集"
      />

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <PolygonDrawMap
          initialPolygon={proj.polygon ?? null}
          onChange={handlePolygonChange}
          frontRoads={frontRoads}
          selectedEdge={selectedEdge}
          onSelectEdge={setSelectedEdge}
          onCommitWidth={handleCommitWidth}
          onModeChange={(mode) => setDrawing(mode === "drawing")}
          heightClassName="h-[480px]"
        />

        <div className="mt-4 border-t border-border pt-3">
          <h4 className="mb-2 text-sm font-semibold text-[color:var(--app-text-dark)]">
            前面道路の幅員
          </h4>
          <FrontRoadEditor
            polygon={polygon}
            frontRoads={frontRoads}
            selectedEdge={selectedEdge}
            onSelectEdge={setSelectedEdge}
            onChange={handleFrontRoadsChange}
          />
        </div>

        <div className="mt-5 border-t border-border pt-4">
          {error && (
            <div className="mb-3 rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || drawing || !dirty}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <Link href={`/projects/${proj.id}`} className="text-sm text-brand hover:underline">
              キャンセル（変更を破棄）
            </Link>
            {drawing && (
              <span className="text-xs text-muted-foreground">
                描画中は保存できません（始点をクリックして閉じてください）
              </span>
            )}
            {!dirty && !drawing && (
              <span className="text-xs text-muted-foreground">変更はありません</span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
