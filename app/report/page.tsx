import { Topbar } from "@/components/Topbar";
import { ReportClient } from "@/components/report/ReportClient";
import { getProjectsTree } from "@/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 業務報告シート（全案件 × 土地 × 最新訪問1件の一覧）。 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const projects = await getProjectsTree();
  return (
    <div className="grid min-h-screen grid-rows-[56px_1fr]">
      <Topbar screen="業務報告シート" showReport={false} />
      <ReportClient initialProjects={projects} initialProjectId={projectId} />
    </div>
  );
}
