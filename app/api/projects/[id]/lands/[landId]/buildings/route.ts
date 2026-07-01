// POST /api/projects/:id/lands/:landId/buildings — 建物追加

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { createBuilding } from "@/lib/queries/buildings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string }> };

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await createBuilding(id, landId, body), 201);
  });
}
