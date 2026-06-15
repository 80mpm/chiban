// GET  /api/projects — 全案件を lands・visits 込みのツリーで返す
// POST /api/projects — 案件作成

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { getProjectsTree, createProject } from "@/lib/queries/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => jsonOk(await getProjectsTree()));
}

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return jsonOk(await createProject(body), 201);
  });
}
