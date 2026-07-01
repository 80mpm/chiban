// PATCH  /api/projects/:id/lands/:landId/buildings/:buildingId — 建物の部分更新
// DELETE /api/projects/:id/lands/:landId/buildings/:buildingId — 建物削除

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { updateBuilding, deleteBuilding } from "@/lib/queries/buildings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string; buildingId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId, buildingId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateBuilding(id, landId, buildingId, body));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId, buildingId } = await params;
    await deleteBuilding(id, landId, buildingId);
    return jsonOk(null, 204);
  });
}
