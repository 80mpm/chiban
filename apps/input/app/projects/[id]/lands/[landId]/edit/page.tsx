import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { LandForm } from "@/components/land/LandForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 土地の編集フォーム（ステータス・面積・概要・地権者・抵当権）。 */
export default async function LandEditPage({
  params,
}: {
  params: Promise<{ id: string; landId: string }>;
}) {
  const { id, landId } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  if (!proj || !land) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="土地の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
      <LandForm proj={proj} land={land} />
      </div>
    </div>
  );
}
