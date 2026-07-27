import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { OwnerForm } from "@/components/owner/OwnerForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 土地の地権者を追加。 */
export default async function LandOwnerNewPage({
  params,
}: {
  params: Promise<{ id: string; landId: string }>;
}) {
  const { id, landId } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/${landId}/owners/new`);
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  if (!proj || !land) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="地権者を追加" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <OwnerForm proj={proj} land={land} />
      </div>
    </div>
  );
}
