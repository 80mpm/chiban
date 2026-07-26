import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { OwnerForm } from "@/components/owner/OwnerForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 建物の地権者を追加。 */
export default async function BuildingOwnerNewPage({
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
      <Topbar appName="案件入力システム" screen="建物の地権者を追加" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <OwnerForm proj={proj} land={land} building={building} />
      </div>
    </div>
  );
}
