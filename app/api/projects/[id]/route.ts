// PATCH  /api/projects/:id — 案件の部分更新
// DELETE /api/projects/:id — 案件削除（土地・訪問記録もカスケード）

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { updateProject, deleteProject } from "@/lib/queries/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateProject(id, body));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApi(async () => {
    const { id } = await params;
    await deleteProject(id);
    return jsonOk(null, 204);
  });
}
