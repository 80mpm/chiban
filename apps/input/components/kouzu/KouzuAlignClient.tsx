"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Button } from "@chiban/shared/components/ui/button";
import { projectKouzuPath, updateProjectKouzuOverlay } from "@chiban/shared/lib/data-client";
import { initialOverlay } from "@/components/map/kouzu-overlay-geom";
import { referenceCenter, referenceShapes } from "@/components/kouzu/reference";
import type { KouzuOverlay, Project, RegistryDocument } from "@chiban/shared/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む
const KouzuAlignMap = dynamic(() => import("@/components/map/KouzuAlignMap"), {
  ssr: false,
  loading: () => <div className="h-[560px] w-full rounded-md border border-border bg-[#eef2f7]" />,
});

const inputClass =
  "w-24 rounded-md border border-input bg-white px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]";

/**
 * 案件の公図の位置合わせページ本体（Issue #44）。
 * 地図上のハンドル操作と数値入力の両方で位置合わせを変え、「保存」で PATCH する。
 * まだ合わせていない公図は、画像の画素数を読んでから案件の中心に幅 150m で置く。
 */
export function KouzuAlignClient({ proj, doc }: { proj: Project; doc: RegistryDocument }) {
  const { saving, error, submit } = useFormSubmit();
  const src = `${projectKouzuPath(proj.id)}/${encodeURIComponent(doc.id)}`;
  const [overlay, setOverlay] = useState<KouzuOverlay | null>(doc.overlay ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const reference = useMemo(() => referenceShapes(proj), [proj]);

  // 位置合わせが無ければ画像の画素数を読んで初期配置する
  useEffect(() => {
    if (overlay) return;
    const img = new Image();
    img.onload = () => {
      setOverlay(initialOverlay(referenceCenter(proj), img.naturalWidth, img.naturalHeight));
      setDirty(true);
    };
    img.onerror = () => setLoadError("公図の画像を読み込めませんでした");
    img.src = src;
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(next: KouzuOverlay) {
    setOverlay(next);
    setDirty(true);
  }

  function handleSave() {
    if (!overlay) return;
    submit(() => updateProjectKouzuOverlay(proj.id, doc.id, overlay), {
      successMessage: "公図の位置合わせを保存しました",
      redirectTo: `/projects/${proj.id}`,
    });
  }

  const widthM = overlay ? overlay.imageWidth * overlay.metersPerPixel : 0;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: "公図の位置合わせ" },
        ]}
        title={`公図の位置合わせ（${doc.fileName}）`}
      />

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs text-muted-foreground">
          公図を地図に重ねて、道路や街区が合うように調整してください。
          青い丸のドラッグで移動、赤い丸（右上の角）のドラッグで拡大縮小・回転できます。
          破線は案件の領域、緑の線は追加済みの土地です。
        </p>

        {loadError ? (
          <div className="rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
            {loadError}
          </div>
        ) : !overlay ? (
          <div className="h-[560px] w-full rounded-md border border-border bg-[#eef2f7]" />
        ) : (
          <>
            <KouzuAlignMap src={src} overlay={overlay} onChange={change} reference={reference} />

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <label className="flex items-center gap-2">
                画像の幅
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Math.round(widthM * 10) / 10}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0) change({ ...overlay, metersPerPixel: v / overlay.imageWidth });
                  }}
                  className={inputClass}
                />
                m
              </label>
              <label className="flex items-center gap-2">
                回転
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step={0.1}
                  value={overlay.rotationDeg}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) change({ ...overlay, rotationDeg: v });
                  }}
                  className={inputClass}
                />
                度（時計回り）
              </label>
              <label className="flex items-center gap-2">
                不透明度
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={overlay.opacity}
                  onChange={(e) => change({ ...overlay, opacity: Number(e.target.value) })}
                />
                {Math.round(overlay.opacity * 100)}%
              </label>
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
            <Button onClick={handleSave} disabled={saving || !overlay || !dirty}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <Link href={`/projects/${proj.id}`} className="text-sm text-brand hover:underline">
              キャンセル（変更を破棄）
            </Link>
            {overlay && !dirty && (
              <span className="text-xs text-muted-foreground">変更はありません</span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
