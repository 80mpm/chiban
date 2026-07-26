import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { MortgageForm } from "@/components/mortgage/MortgageForm";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 土地の抵当権の編集・削除（[mortgageIndex] は並び順 1 始まり）。 */
export default async function LandMortgageEditPage({
  params,
}: {
  params: Promise<{ id: string; landId: string; mortgageIndex: string }>;
}) {
  const { id, landId, mortgageIndex } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  const land = proj?.lands?.find((l) => l.id === landId);
  const n = Number(mortgageIndex);
  if (!proj || !land || !Number.isInteger(n) || n < 1 || n > (land.mortgages ?? []).length) {
    notFound();
  }
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="抵当権の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <MortgageForm proj={proj} land={land} index={n} />
      </div>
    </div>
  );
}
