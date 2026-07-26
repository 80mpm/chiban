import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { OwnerForm } from "@/components/owner/OwnerForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 土地の地権者の編集・削除（[ownerIndex] は並び順 1 始まり）。 */
export default async function LandOwnerEditPage({
  params,
}: {
  params: Promise<{ id: string; landId: string; ownerIndex: string }>;
}) {
  const { id, landId, ownerIndex } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  const n = Number(ownerIndex);
  if (!proj || !land || !Number.isInteger(n) || n < 1 || n > (land.owners ?? []).length) {
    notFound();
  }
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="地権者の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <OwnerForm proj={proj} land={land} index={n} />
      </div>
    </div>
  );
}
