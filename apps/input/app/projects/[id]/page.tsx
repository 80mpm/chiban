import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { ProjectDetailView } from "@/components/project/ProjectDetailView";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 案件詳細（読み取り専用ハブ）。各リソースの編集ページへの導線を持つ。 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAppUser(`/projects/${id}`);
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  if (!proj) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="案件詳細" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <ProjectDetailView proj={proj} />
      </div>
    </div>
  );
}
