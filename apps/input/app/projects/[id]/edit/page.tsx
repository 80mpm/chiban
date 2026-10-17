import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { ProjectForm } from "@/components/project/ProjectForm";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 案件情報の編集フォーム（領域は /map、土地は /lands/... の各ページで編集する）。 */
export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAppUser(`/projects/${id}/edit`);
  const proj = await getProjectTree(id);
  if (!proj) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="案件情報の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <ProjectForm proj={proj} />
      </div>
    </div>
  );
}
