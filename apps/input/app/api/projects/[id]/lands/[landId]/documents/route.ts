// POST /api/projects/:id/lands/:landId/documents — 土地の登記簿を添付（multipart/form-data）

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readUploadFile } from "@chiban/shared/lib/request";
import { addDocument } from "@chiban/shared/lib/queries/documents";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string }> };

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const user = await requireAppApiUser();
    const { id, landId } = await params;
    const file = await readUploadFile(req);
    return jsonOk(await addDocument({ projectId: id, landId }, file, user.name), 201);
  });
}
