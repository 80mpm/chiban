// GET /api/projects — 全案件を lands・visits 込みのツリーで返す
// （案件の作成・更新・削除は案件入力システム側の API が担う）

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { getProjectsTree } from "@chiban/shared/lib/queries/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => jsonOk(await getProjectsTree()));
}
