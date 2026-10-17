import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { MortgageForm } from "@/components/mortgage/MortgageForm";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 建物の抵当権の編集・削除（[mortgageIndex] は並び順 1 始まり）。 */
export default async function BuildingMortgageEditPage({
  params,
}: {
  params: Promise<{ id: string; landId: string; buildingId: string; mortgageIndex: string }>;
}) {
  const { id, landId, buildingId, mortgageIndex } = await params;
  const user = await requireAppUser(`/projects/${id}/lands/${landId}/buildings/${buildingId}/mortgages/${mortgageIndex}/edit`);
  const proj = await getProjectTree(id);
  const land = proj?.lands?.find((l) => l.id === landId);
  const building = land?.buildings?.find((b) => b.id === buildingId);
  const n = Number(mortgageIndex);
  if (
    !proj ||
    !land ||
    !building ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > (building.mortgages ?? []).length
  ) {
    notFound();
  }
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="建物の抵当権の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <MortgageForm proj={proj} land={land} building={building} index={n} />
      </div>
    </div>
  );
}
