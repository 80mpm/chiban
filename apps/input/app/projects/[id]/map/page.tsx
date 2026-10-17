import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { AreaMapEditClient } from "@/components/map/AreaMapEditClient";
import { getProjectTree } from "@chiban/shared/lib/queries/projects";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 領域・前面道路の編集（ポリゴン描画 + 前面道路幅員。保存で一括反映）。 */
export default async function AreaMapEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAppUser(`/projects/${id}/map`);
  const proj = await getProjectTree(id);
  if (!proj) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="領域・前面道路の編集" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <AreaMapEditClient proj={proj} />
      </div>
    </div>
  );
}
