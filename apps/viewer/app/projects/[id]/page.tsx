import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { SummaryBar } from "@/components/project/SummaryBar";
import { ProjectDetailClient } from "@/components/project/ProjectDetailClient";
import { getProjectsTree } from "@/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 案件詳細（公図風ビュー + 地図の左右半々）。 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);

  if (!proj) {
    return (
      <div className="flex h-screen flex-col">
        <Topbar screen="案件詳細" />
        <div className="m-8 rounded-lg border border-[#fca5a5] bg-white p-6 leading-relaxed text-[#991b1b]">
          案件が見つかりません。案件一覧から案件を選んでください。
          <br />
          <br />
          <Link href="/" className="text-[#991b1b] underline">
            ← 案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar screen={`${proj.name} — 案件詳細`} />
      <SummaryBar project={proj} />
      <ProjectDetailClient initialProjects={projects} projectId={id} />
    </div>
  );
}
