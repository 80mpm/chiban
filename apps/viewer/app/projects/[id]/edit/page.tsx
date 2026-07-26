import { Topbar } from "@/components/Topbar";
import { ProjectEditClient } from "@/components/project/ProjectEditClient";
import { getProjectsTree } from "@/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 案件編集（インライン編集 + 領域描画 + 公図ビュー/土地パネル）。 */
export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projects = await getProjectsTree();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar screen="案件編集" />
      <div className="min-h-0 overflow-hidden">
        <ProjectEditClient initialProjects={projects} projectId={id} />
      </div>
    </div>
  );
}
