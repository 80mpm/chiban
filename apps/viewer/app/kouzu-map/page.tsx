import { KouzuMapPageClient } from "@/components/kouzu/KouzuMapPageClient";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 登記所備付地図ビューア（独立デモ画面・DataStore 非依存）。 */
export default async function KouzuMapPage() {
  const user = await requireAppUser("/kouzu-map");
  return <KouzuMapPageClient user={user} />;
}
