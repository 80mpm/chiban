"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { OwnersList, MortgagesList } from "@/components/land/LandDetailView";
import { updateLand } from "@chiban/shared/lib/data-client";
import { fmtDateOnly } from "@chiban/shared/lib/format";
import type { Project, Land, Building } from "@chiban/shared/lib/types";

const dash = (s: string | null | undefined) => (s ? s : "—");
const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

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

/** 建物詳細（読み取り専用ハブ）。基本情報・建物の地権者・抵当権の各編集ページへの導線を持つ。 */
export function BuildingDetailView({
  proj,
  land,
  building,
}: {
  proj: Project;
  land: Land;
  building: Building;
}) {
  const landBase = `/projects/${proj.id}/lands/${land.id}`;
  const base = `${landBase}/buildings/${encodeURIComponent(building.id)}`;
  const title = building.kaokuNumber ? `建物（家屋番号 ${building.kaokuNumber}）` : "建物";

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: landTitle(land), href: landBase },
          { label: title },
        ]}
        title={title}
      />

      <Card title="基本情報" action={<EditLink href={`${base}/edit`} label="編集" />}>
        <dl className="grid grid-cols-[96px_1fr] items-baseline gap-x-3 gap-y-2">
          <dt className="text-[11px] text-muted-foreground">所在</dt>
          <dd className="text-sm">{dash(building.location)}</dd>
          <dt className="text-[11px] text-muted-foreground">家屋番号</dt>
          <dd className="text-sm">{dash(building.kaokuNumber)}</dd>
          <dt className="text-[11px] text-muted-foreground">構造</dt>
          <dd className="text-sm">{dash(building.structure)}</dd>
          <dt className="text-[11px] text-muted-foreground">種類・用途</dt>
          <dd className="text-sm">{dash(building.usage)}</dd>
          <dt className="text-[11px] text-muted-foreground">延床面積</dt>
          <dd className="text-sm">{building.floorArea != null ? `${building.floorArea} ㎡` : "—"}</dd>
          <dt className="text-[11px] text-muted-foreground">新築年月日</dt>
          <dd className="text-sm">{building.builtDate ? fmtDateOnly(building.builtDate) : "—"}</dd>
          <dt className="text-[11px] text-muted-foreground">備考</dt>
          <dd className="whitespace-pre-wrap break-words text-sm">{dash(building.description)}</dd>
        </dl>
      </Card>

      <Card
        title={`建物の地権者（${(building.owners ?? []).length}）`}
        action={<EditLink href={`${base}/owners/new`} label="＋ 地権者を追加" />}
      >
        <OwnersList owners={building.owners} editHrefFor={(n) => `${base}/owners/${n}/edit`} />
      </Card>

      <Card
        title={`抵当権（建物）（${(building.mortgages ?? []).length}）`}
        action={<EditLink href={`${base}/mortgages/new`} label="＋ 抵当権を追加" />}
      >
        <MortgagesList
          mortgages={building.mortgages}
          editHrefFor={(n) => `${base}/mortgages/${n}/edit`}
        />
      </Card>

      <div className="flex justify-end">
        <ConfirmDeleteButton
          label="この建物を削除"
          confirmMessage={`建物「${building.kaokuNumber || "家屋番号未設定"}」を削除します。よろしいですか？`}
          successMessage="建物を削除しました"
          redirectTo={landBase}
          onDelete={() =>
            updateLand(proj.id, land.id, {
              buildings: (land.buildings ?? []).filter((b) => b.id !== building.id),
            })
          }
        />
      </div>
    </main>
  );
}
