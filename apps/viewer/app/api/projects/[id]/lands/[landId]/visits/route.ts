// POST /api/projects/:id/lands/:landId/visits — 訪問記録追加（追加のみ）

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { addVisit } from "@chiban/shared/lib/queries/visits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string }> };

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id, landId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await addVisit(id, landId, body), 201);
  });
}
