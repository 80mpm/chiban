"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ProjectKouzuCard } from "@/components/kouzu/ProjectKouzuCard";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { KouzuView } from "@chiban/shared/components/kouzu/KouzuView";
import { deleteProject } from "@chiban/shared/lib/data-client";
import { formatOwners, fmtDateOnly, fmtDateTime, fmtTsubo, STATUS_DEFS } from "@chiban/shared/lib/format";
import type { Project, Land, RegistryDocument } from "@chiban/shared/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む
const ProjectAreaMap = dynamic(
  () => import("@chiban/shared/components/map/ProjectAreaMap"),
  { ssr: false, loading: () => <div className="h-full w-full bg-[#eef2f7]" /> },
);

const dash = (s: string | null | undefined) => (s ? s : "—");
const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/** dl 形式の 1 行。 */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">{value ?? "—"}</dd>
    </>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--app-text-dark)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** カード右上の「編集」系リンクボタン。 */
function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-white px-2.5 py-1 text-xs hover:bg-secondary"
    >
      {label}
    </Link>
  );
}

/** 案件詳細（読み取り専用ハブ）。各リソースの編集ページへの導線を持つ。 */
export function ProjectDetailView({
  proj,
  kouzu,
}: {
  proj: Project;
  /** 案件の公図（筆を描く下地。Issue #44）。 */
  kouzu: RegistryDocument[];
}) {
  const router = useRouter();
  const lands = proj.lands ?? [];
  const viewerOrigin = process.env.NEXT_PUBLIC_VIEWER_ORIGIN;
  const frontRoads = proj.frontRoads ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHeader
        crumbs={[{ label: "案件一覧", href: "/" }, { label: proj.name }]}
        title={proj.name}
        actions={
          viewerOrigin ? (
            <a
              href={`${viewerOrigin}/projects/${encodeURIComponent(proj.id)}`}
              className="rounded-md border border-border bg-white px-2.5 py-1 text-xs text-brand hover:bg-secondary"
              target="_blank"
              rel="noreferrer"
            >
              閲覧システムで見る ↗
            </a>
          ) : undefined
        }
      />

      {/* 案件情報 */}
      <Card title="案件情報" action={<EditLink href={`/projects/${proj.id}/edit`} label="編集" />}>
        <dl className="grid grid-cols-[96px_1fr_96px_1fr] items-baseline gap-x-3 gap-y-2">
          <Row label="概要" value={dash(proj.description)} />
          <Row label="所在地" value={dash(proj.address)} />
          <Row label="アクセス" value={dash(proj.access)} />
          <Row label="担当" value={dash(proj.staff)} />
          <Row label="用途地域" value={dash(proj.zoning)} />
          <Row label="建蔽率" value={proj.currentBcr != null ? `${proj.currentBcr}%` : "—"} />
          <Row label="現況容積率" value={proj.currentFar != null ? `${proj.currentFar}%` : "—"} />
          <Row label="想定容積率" value={proj.targetFar != null ? `${proj.targetFar}%` : "—"} />
          <Row label="登録日" value={dash(fmtDateOnly(proj.createdAt))} />
          <Row label="更新日時" value={dash(fmtDateTime(proj.updatedAt ?? proj.createdAt))} />
        </dl>
      </Card>

      {/* 領域マップ（読み取り専用プレビュー） */}
      <Card
        title="領域マップ・前面道路"
        action={<EditLink href={`/projects/${proj.id}/map`} label="領域・前面道路を編集" />}
      >
        {Array.isArray(proj.polygon) && proj.polygon.length >= 3 ? (
          <>
            <div className="relative h-[300px] overflow-hidden rounded-md border border-border">
              <ProjectAreaMap project={proj} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              領域：設定済み ／ 前面道路幅員：
              {frontRoads.length > 0
                ? frontRoads
                    .map((r) => `辺${r.edgeIndex + 1} = ${r.width.toFixed(1)} m`)
                    .join("、")
                : "未設定"}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            領域が未設定です。「領域・前面道路を編集」から描画してください。
          </div>
        )}
      </Card>

      {/* 土地一覧（公図ナビ + テーブル） */}
      <Card
        title={`土地（${lands.length}）`}
        action={<EditLink href={`/projects/${proj.id}/lands/new`} label="＋ 土地を追加" />}
      >
        <div className="grid grid-cols-2 gap-4">
          <KouzuView
            lands={lands}
            interactive
            onSelectLand={(landId) => router.push(`/projects/${proj.id}/lands/${landId}`)}
            className="h-[380px] rounded-md border border-border"
            emptyText="土地がありません。「＋ 土地を追加」から筆を選択してください"
          />
          <div className="min-h-0 overflow-y-auto">
            {lands.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">土地がありません</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">地番</th>
                    <th className="px-2 py-1.5 font-medium">状態</th>
                    <th className="px-2 py-1.5 text-right font-medium">坪数</th>
                    <th className="px-2 py-1.5 font-medium">地権者</th>
                    <th className="px-2 py-1.5 text-right font-medium">建物</th>
                  </tr>
                </thead>
                <tbody>
                  {lands.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => router.push(`/projects/${proj.id}/lands/${l.id}`)}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-[color:var(--app-bg)]"
                    >
                      <td className="px-2 py-1.5 font-medium text-brand">
                        {landTitle(l)}
                        {l.parcelSource === "manual" && (
                          <span
                            title="公図から描いた筆"
                            className="ml-1.5 rounded border border-border px-1 text-[10px] font-normal text-muted-foreground"
                          >
                            公図
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ background: (STATUS_DEFS[l.status] ?? STATUS_DEFS.target).color }}
                        >
                          {(STATUS_DEFS[l.status] ?? STATUS_DEFS.target).label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {l.areaTsubo != null ? fmtTsubo(l.areaTsubo) : "—"}
                      </td>
                      <td className="max-w-40 truncate px-2 py-1.5 text-muted-foreground">
                        {formatOwners(l.owners) || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {(l.buildings ?? []).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      {/* 公図（筆マスタに無い筆を描く下地） */}
      <ProjectKouzuCard projectId={proj.id} kouzu={kouzu} />

      {/* 削除 */}
      <div className="flex justify-end">
        <ConfirmDeleteButton
          label="この案件を削除"
          confirmMessage={`案件「${proj.name}」を削除します。土地・訪問記録もすべて削除されます。よろしいですか？`}
          successMessage="案件を削除しました"
          redirectTo="/"
          onDelete={() => deleteProject(proj.id)}
        />
      </div>
    </main>
  );
}
