// GET /api/projects — 全案件を lands・visits 込みのツリーで返す。
// PR2 では読み出しのみ。POST（案件作成）は PR3 で追加する。

import { withApi, jsonOk } from "@/lib/api-error";
import { getProjectsTree } from "@/lib/queries/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => jsonOk(await getProjectsTree()));
}
