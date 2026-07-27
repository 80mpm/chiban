// GET  /api/projects — 全案件を lands・visits 込みのツリーで返す
// POST /api/projects — 案件作成

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { getProjectsTree, createProject } from "@chiban/shared/lib/queries/projects";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireAppApiUser();
    return jsonOk(await getProjectsTree());
  });
}

export async function POST(req: Request) {
  return withApi(async () => {
    await requireAppApiUser();
    const body = await readJsonBody(req);
    return jsonOk(await createProject(body), 201);
  });
}
