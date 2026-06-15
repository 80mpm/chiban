import { Topbar } from "@/components/Topbar";
import { ProjectListClient } from "@/components/project/ProjectListClient";
import { getProjectsTree } from "@/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 案件一覧（トップページ）。初期データはサーバで取得してクライアントへ渡す。 */
export default async function HomePage() {
  const projects = await getProjectsTree();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar screen="案件一覧" />
      <ProjectListClient initialProjects={projects} />
    </div>
  );
}
