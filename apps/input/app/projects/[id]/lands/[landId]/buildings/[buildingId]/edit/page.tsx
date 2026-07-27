import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { BuildingForm } from "@/components/building/BuildingForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 建物の編集フォーム（削除もこのページから行う）。 */
export default async function BuildingEditPage({
  params,
}: {
  params: Promise<{ id: string; landId: string; buildingId: string }>;
}) {
  const { id, landId, buildingId } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/${landId}/buildings/${buildingId}/edit`);
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  const building = land?.buildings?.find((b) => b.id === buildingId);
  if (!proj || !land || !building) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="建物の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <BuildingForm proj={proj} land={land} building={building} />
      </div>
    </div>
  );
}
