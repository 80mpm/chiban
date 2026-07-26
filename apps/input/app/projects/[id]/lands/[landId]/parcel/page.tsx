import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { ParcelPickerClient } from "@/components/parcel/ParcelPickerClient";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 筆の変更（公図風ビューから別の筆を選択して確定）。 */
export default async function LandParcelChangePage({
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
      <Topbar appName="案件入力システム" screen="筆を変更" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <ParcelPickerClient proj={proj} mode="change" land={land} />
      </div>
    </div>
  );
}
