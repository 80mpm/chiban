// PATCH  /api/projects/:id — 案件の部分更新
// DELETE /api/projects/:id — 案件削除（土地・訪問記録もカスケード）

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { updateProject, deleteProject } from "@chiban/shared/lib/queries/projects";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    await requireAppApiUser();
    const { id } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateProject(id, body));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApi(async () => {
    await requireAppApiUser();
    const { id } = await params;
    await deleteProject(id);
    return jsonOk(null, 204);
  });
}
