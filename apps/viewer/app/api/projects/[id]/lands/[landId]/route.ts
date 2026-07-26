// PATCH  /api/projects/:id/lands/:landId — 土地の部分更新
// DELETE /api/projects/:id/lands/:landId — 土地削除

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { updateLand, deleteLand } from "@/lib/queries/lands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateLand(id, landId, body));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId } = await params;
    await deleteLand(id, landId);
    return jsonOk(null, 204);
  });
}
