"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Button } from "@chiban/shared/components/ui/button";
import { createLand, projectKouzuPath } from "@chiban/shared/lib/data-client";
import { polygonAreaM2, m2ToTsubo } from "@chiban/shared/lib/geo";
import { fmtTsubo } from "@chiban/shared/lib/format";
import { referenceShapes } from "@/components/kouzu/reference";
import type { LatLng, Project, RegistryDocument } from "@chiban/shared/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む
const KouzuDrawMap = dynamic(() => import("@/components/map/KouzuDrawMap"), {
  ssr: false,
  loading: () => <div className="h-[560px] w-full rounded-md border border-border bg-[#eef2f7]" />,
});

const fieldClass =
  "rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]";

/**
 * 公図から筆を描いて土地を追加するページ本体（Issue #44）。
 * 位置合わせ済みの案件の公図を下地に、案件領域と同じやり方（Leaflet.draw）で筆の領域を描き、
 * 町名・地番を入力して保存する。保存すると筆マスタに手動の筆として登録され、その筆で土地が追加される。
 */
export function LandDrawClient({
  proj,
  kouzu,
  towns,
}: {
  proj: Project;
  /** 位置合わせ済みの案件の公図。 */
  kouzu: RegistryDocument[];
  /** 住所マスタの町名すべて。 */
  towns: string[];
}) {
  const { saving, error, submit } = useFormSubmit();
  const [kouzuId, setKouzuId] = useState<string | null>(kouzu[0]?.id ?? null);
  const selected = kouzu.find((d) => d.id === kouzuId) ?? null;
  const [opacity, setOpacity] = useState<number>(selected?.overlay?.opacity ?? 0.6);
  const overlay = useMemo(
    () => (selected?.overlay ? { ...selected.overlay, opacity } : null),
    [selected, opacity],
  );
  const src = selected ? `${projectKouzuPath(proj.id)}/${encodeURIComponent(selected.id)}` : null;
  const reference = useMemo(() => referenceShapes(proj), [proj]);

  // 既定の町名: 案件内で最も使われている町名（筆選択ページと同じ考え方）
  const defaultTown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of proj.lands ?? []) if (l.aza) counts.set(l.aza, (counts.get(l.aza) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? towns[0] ?? "";
  }, [proj.lands, towns]);
  const [town, setTown] = useState(defaultTown);
  const [chiban, setChiban] = useState("");
  const [polygon, setPolygon] = useState<LatLng[] | null>(null);
  const [drawing, setDrawing] = useState(false);

  const areaM2 = polygon && polygon.length >= 3 ? polygonAreaM2(polygon) : null;
  const canSave = !!polygon && polygon.length >= 3 && !!town && chiban.trim() !== "" && !drawing;

  function handleSave() {
    if (!polygon) return;
    const label = `${town} ${chiban.trim()}`;
    submit(
      () =>
        createLand(proj.id, {
          manualParcel: { town, chiban: chiban.trim(), polygon },
          status: "target",
        }),
      {
        successMessage: `${label} を追加しました（公図から描いた筆として筆マスタに登録しました）`,
        redirectTo: (created) => `/projects/${proj.id}/lands/${created.id}`,
      },
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: "土地を追加", href: `/projects/${proj.id}/lands/new` },
          { label: "公図から描く" },
        ]}
        title="土地を追加（公図から筆を描く）"
      />

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        {kouzu.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            位置合わせ済みの公図がありません。
            <br />
            案件詳細の「公図」から画像を添付し、「位置合わせ」をしてから描いてください。
            <div className="mt-3">
              <Link href={`/projects/${proj.id}`} className="text-brand hover:underline">
                案件詳細へ戻る
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              筆マスタ（登記所備付地図データ）に無い筆を、公図をなぞって登録します。
              「＋ ポリゴンを描く」で頂点をクリックし、始点をクリックして閉じてください。
              描いた後も頂点をドラッグして調整できます。
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                下地の公図
                <select
                  value={kouzuId ?? ""}
                  onChange={(e) => {
                    const next = kouzu.find((d) => d.id === e.target.value) ?? null;
                    setKouzuId(next?.id ?? null);
                    setOpacity(next?.overlay?.opacity ?? 0.6);
                  }}
                  className={fieldClass}
                >
                  {kouzu.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fileName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                不透明度
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
                {Math.round(opacity * 100)}%
              </label>
            </div>

            <KouzuDrawMap
              src={src}
              overlay={overlay}
              reference={reference}
              onChange={setPolygon}
              onModeChange={(mode) => setDrawing(mode === "drawing")}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <label htmlFor="land-draw-town" className="text-sm font-medium">
                町名・丁目
              </label>
              <select
                id="land-draw-town"
                value={town}
                onChange={(e) => setTown(e.target.value)}
                className={`${fieldClass} w-fit`}
              >
                {towns.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label htmlFor="land-draw-chiban" className="text-sm font-medium">
                地番
              </label>
              <input
                id="land-draw-chiban"
                value={chiban}
                onChange={(e) => setChiban(e.target.value)}
                placeholder="例: 24-3"
                maxLength={50}
                className={`${fieldClass} w-48`}
              />
              <span className="text-sm font-medium">面積</span>
              <span className="text-sm">
                {areaM2 != null
                  ? `${areaM2.toFixed(2)} ㎡（${fmtTsubo(m2ToTsubo(areaM2))} 坪）`
                  : "筆の領域を描くと自動で計算します"}
                <span className="ml-2 text-xs text-muted-foreground">
                  登記の地積と違う場合は、追加後に土地の編集で直せます
                </span>
              </span>
            </div>
          </>
        )}

        <div className="mt-5 border-t border-border pt-4">
          {error && (
            <div className="mb-3 rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "保存中…" : "この筆で土地を追加"}
            </Button>
            <Link href={`/projects/${proj.id}/lands/new`} className="text-sm text-brand hover:underline">
              キャンセル
            </Link>
            {drawing && (
              <span className="text-xs text-muted-foreground">
                描画中は保存できません（始点をクリックして閉じてください）
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
