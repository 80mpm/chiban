// POST /api/projects/:id/lands/:landId/buildings/:buildingId/documents
// 建物の登記簿・公図を添付（multipart/form-data）。公図は ?kind=kouzu を付ける

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readUploadFile } from "@chiban/shared/lib/request";
import { addDocument, parseDocumentKind } from "@chiban/shared/lib/queries/documents";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; landId: string; buildingId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const user = await requireAppApiUser();
    const { id, landId, buildingId } = await params;
    const kind = parseDocumentKind(new URL(req.url).searchParams.get("kind"));
    const file = await readUploadFile(req);
    return jsonOk(
      await addDocument({ projectId: id, landId, buildingId }, file, user.name, kind),
      201,
    );
  });
}
