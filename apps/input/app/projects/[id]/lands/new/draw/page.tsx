import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { LandDrawClient } from "@/components/land/LandDrawClient";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { fetchProjectKouzu } from "@chiban/shared/lib/queries/documents";
import { getAllTownNames } from "@chiban/shared/lib/queries/parcels";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 土地の追加（公図から筆を描く）。筆マスタに無い筆を運用で登録する（Issue #44）。 */
export default async function LandDrawPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/new/draw`);
  const [proj, kouzu, towns] = await Promise.all([
    getProjectTree(id),
    fetchProjectKouzu(id),
    getAllTownNames(),
  ]);
  if (!proj) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="土地を追加" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        {/* 下地に使えるのは位置合わせ済みの公図だけ */}
        <LandDrawClient proj={proj} kouzu={kouzu.filter((d) => d.overlay)} towns={towns} />
      </div>
    </div>
  );
}
