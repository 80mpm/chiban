"use client";

import { PageHeader } from "@/components/PageHeader";
import { Card, EditLink } from "@/components/Card";
import { DocumentsCard } from "@/components/document/DocumentsCard";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { deleteLand } from "@chiban/shared/lib/data-client";
import {
  STATUS_DEFS,
  formatRegistration,
  formatMortgage,
  formatBuilding,
  fmtDateOnly,
  fmtDateTime,
  fmtTsubo,
} from "@chiban/shared/lib/format";
import type { Project, Land, Owner, Mortgage } from "@chiban/shared/lib/types";

const dash = (s: string | null | undefined) => (s ? s : "—");
const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 地権者の一覧（土地・建物共通）。editHrefFor を渡すと行ごとに
 * 「編集」リンク（行単位の編集ページ）を出す。
 */
export function OwnersList({
  owners,
  editHrefFor,
}: {
  owners: Owner[] | undefined;
  editHrefFor?: (index: number) => string;
}) {
  if (!owners || owners.length === 0) {
    return <div className="text-xs text-muted-foreground">地権者が未設定です</div>;
  }
  return (
    <div className="space-y-1.5">
      {owners.map((o, i) => (
        <div key={i} className="rounded-md border border-border bg-[#f8fafc] px-2.5 py-1.5 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="font-medium text-[color:var(--app-text-dark)]">{o.name}</span>
              {o.share && <span className="ml-1 text-muted-foreground">（持分{o.share}）</span>}
            </div>
            {editHrefFor && <EditLink href={editHrefFor(i + 1)} label="編集" />}
          </div>
          {o.address && <div className="mt-0.5 text-muted-foreground">{o.address}</div>}
          {formatRegistration(o) && (
            <div className="mt-0.5 text-muted-foreground">{formatRegistration(o)}</div>
          )}
          {o.description && <div className="mt-0.5 text-muted-foreground">{o.description}</div>}
        </div>
      ))}
    </div>
  );
}

/** 抵当権の一覧。editHrefFor を渡すと行ごとに「編集」リンクを出す。 */
export function MortgagesList({
  mortgages,
  editHrefFor,
}: {
  mortgages: Mortgage[] | undefined;
  editHrefFor?: (index: number) => string;
}) {
  if (!mortgages || mortgages.length === 0) {
    return <div className="text-xs text-muted-foreground">抵当権なし</div>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {mortgages.map((m, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-[#f8fafc] px-2.5 py-1.5"
        >
          <span className="min-w-0">{formatMortgage(m) || "—"}</span>
          {editHrefFor && <EditLink href={editHrefFor(i + 1)} label="編集" />}
        </li>
      ))}
    </ul>
  );
}

/** 土地詳細（読み取り専用）。土地編集・筆変更・建物追加/編集への導線を持つ。 */
export function LandDetailView({ proj, land }: { proj: Project; land: Land }) {
  const base = `/projects/${proj.id}/lands/${land.id}`;
  const def = STATUS_DEFS[land.status] ?? STATUS_DEFS.target;
  const buildings = land.buildings ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: landTitle(land) },
        ]}
        title={landTitle(land)}
        actions={
          <>
            <span
              className="rounded-lg px-2 py-0.5 text-xs font-medium text-white"
              style={{ background: def.color }}
            >
              {def.label}
            </span>
            <EditLink href={`${base}/parcel`} label="筆を変更" />
          </>
        }
      />

      <Card title="基本情報" action={<EditLink href={`${base}/edit`} label="編集" />}>
        <dl className="grid grid-cols-[96px_1fr] items-baseline gap-x-3 gap-y-2">
          <dt className="text-[11px] text-muted-foreground">筆の出所</dt>
          <dd className="text-sm">
            {land.parcelSource === "manual"
              ? "公図から描いた筆（筆マスタに手動で登録）"
              : "登記所備付地図データ"}
          </dd>
          <dt className="text-[11px] text-muted-foreground">面積</dt>
          <dd className="text-sm">
            {land.areaM2 != null
              ? `${land.areaM2} ㎡（${land.areaTsubo != null ? fmtTsubo(land.areaTsubo) : "—"} 坪）`
              : "—"}
          </dd>
          <dt className="text-[11px] text-muted-foreground">概要</dt>
          <dd className="whitespace-pre-wrap break-words text-sm">{dash(land.description)}</dd>
          <dt className="text-[11px] text-muted-foreground">登録日</dt>
          <dd className="text-sm">{dash(fmtDateOnly(land.createdAt))}</dd>
          <dt className="text-[11px] text-muted-foreground">更新日時</dt>
          <dd className="text-sm">{dash(fmtDateTime(land.updatedAt ?? land.createdAt))}</dd>
        </dl>
      </Card>

      <Card
        title={`土地の地権者（${(land.owners ?? []).length}）`}
        action={<EditLink href={`${base}/owners/new`} label="＋ 地権者を追加" />}
      >
        <OwnersList owners={land.owners} editHrefFor={(n) => `${base}/owners/${n}/edit`} />
      </Card>

      <Card
        title={`抵当権（土地）（${(land.mortgages ?? []).length}）`}
        action={<EditLink href={`${base}/mortgages/new`} label="＋ 抵当権を追加" />}
      >
        <MortgagesList mortgages={land.mortgages} editHrefFor={(n) => `${base}/mortgages/${n}/edit`} />
      </Card>

      <DocumentsCard
        title="登記簿（土地）"
        projectId={proj.id}
        landId={land.id}
        documents={land.documents}
      />

      <Card
        title={`建物（${buildings.length}）`}
        action={<EditLink href={`${base}/buildings/new`} label="＋ 建物を追加" />}
      >
        {buildings.length === 0 ? (
          <div className="text-xs text-muted-foreground">建物なし（更地）</div>
        ) : (
          <div className="space-y-2.5">
            {buildings.map((b, i) => (
              <div key={b.id || i} className="rounded-md border border-border bg-[#f8fafc] px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <strong className="text-[12px] text-[color:var(--app-text-dark)]">
                    {b.kaokuNumber ? `家屋番号 ${b.kaokuNumber}` : `建物 ${i + 1}`}
                  </strong>
                  <EditLink href={`${base}/buildings/${encodeURIComponent(b.id)}`} label="詳細" />
                </div>
                {b.location && (
                  <div className="text-[11px] text-muted-foreground">所在：{b.location}</div>
                )}
                {formatBuilding(b) && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{formatBuilding(b)}</div>
                )}
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  地権者 {(b.owners ?? []).length} 名・抵当権 {(b.mortgages ?? []).length} 件
                  （編集は「詳細」から）
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <ConfirmDeleteButton
          label="この土地を削除"
          confirmMessage={`土地「${landTitle(land)}」を削除します。建物・訪問記録も削除されます。よろしいですか？`}
          successMessage="土地を削除しました"
          redirectTo={`/projects/${proj.id}`}
          onDelete={() => deleteLand(proj.id, land.id)}
        />
      </div>
    </main>
  );
}
