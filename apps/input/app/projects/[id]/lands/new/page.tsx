import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { ParcelPickerClient } from "@/components/parcel/ParcelPickerClient";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const dynamic = "force-dynamic";

/** 土地の追加（公図風ビューから筆を選択して確定）。 */
export default async function LandNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projects = await getProjectsTree();
  const proj = projects.find((p) => p.id === id);
  if (!proj) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="土地を追加" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <ParcelPickerClient proj={proj} mode="add" />
      </div>
    </div>
  );
}
