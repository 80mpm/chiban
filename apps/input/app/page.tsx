import { Topbar } from "@chiban/shared/components/Topbar";
import { ProjectListTable } from "@/components/project/ProjectListTable";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 案件一覧（入力システムのトップページ）。事務作業向けのテーブル一覧。 */
export default async function InputHomePage() {
  const projects = await getProjectsTree();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="案件一覧" />
      <ProjectListTable initialProjects={projects} />
    </div>
  );
}
