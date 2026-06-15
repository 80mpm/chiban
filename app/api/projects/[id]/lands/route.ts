// POST /api/projects/:id/lands — 土地追加（parcelId 必須）

import { withApi, jsonOk } from "@/lib/api-error";
import { readJsonBody } from "@/lib/request";
import { createLand } from "@/lib/queries/lands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const { id } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await createLand(id, body), 201);
  });
}
