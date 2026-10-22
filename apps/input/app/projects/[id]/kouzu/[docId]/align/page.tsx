import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { KouzuAlignClient } from "@/components/kouzu/KouzuAlignClient";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { fetchProjectKouzu } from "@chiban/shared/lib/queries/documents";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 案件の公図を地図に重ねて位置を合わせる（筆を描く前の準備。Issue #44）。 */
export default async function KouzuAlignPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const user = await requireAppUser(`/projects/${id}/kouzu/${docId}/align`);
  const [proj, kouzu] = await Promise.all([getProjectTree(id), fetchProjectKouzu(id)]);
  const doc = kouzu.find((d) => d.id === docId);
  if (!proj || !doc) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="公図の位置合わせ" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <KouzuAlignClient proj={proj} doc={doc} />
      </div>
    </div>
  );
}
