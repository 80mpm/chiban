import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { BuildingForm } from "@/components/building/BuildingForm";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 建物の追加フォーム。 */
export default async function BuildingNewPage({
  params,
}: {
  params: Promise<{ id: string; landId: string }>;
}) {
  const { id, landId } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/${landId}/buildings/new`);
  const proj = await getProjectTree(id);
  const land = proj?.lands?.find((l) => l.id === landId);
  if (!proj || !land) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="建物を追加" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <BuildingForm proj={proj} land={land} />
      </div>
    </div>
  );
}
