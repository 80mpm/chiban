import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { LandDetailView } from "@/components/land/LandDetailView";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 土地詳細（読み取り専用）。土地編集・筆変更・建物ページへの導線を持つ。 */
export default async function LandDetailPage({
  params,
}: {
  params: Promise<{ id: string; landId: string }>;
}) {
  const { id, landId } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/${landId}`);
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  if (!proj || !land) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="土地詳細" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <LandDetailView proj={proj} land={land} />
      </div>
    </div>
  );
}
