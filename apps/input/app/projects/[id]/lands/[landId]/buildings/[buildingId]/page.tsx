import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { BuildingDetailView } from "@/components/building/BuildingDetailView";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 建物詳細（読み取り専用）。基本情報・地権者・抵当権の編集導線と削除を持つ。 */
export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string; landId: string; buildingId: string }>;
}) {
  const { id, landId, buildingId } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  const building = land?.buildings?.find((b) => b.id === buildingId);
  if (!proj || !land || !building) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="建物詳細" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <BuildingDetailView proj={proj} land={land} building={building} />
      </div>
    </div>
  );
}
