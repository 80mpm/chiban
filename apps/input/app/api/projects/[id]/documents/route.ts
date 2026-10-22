// POST /api/projects/:id/documents — 案件の公図（筆を描く下地の画像）を添付（multipart/form-data）
// 案件に添付できるのは公図のみ（JPEG・PNG・1 案件につき 1 つまで。2 つ目は 409）。種別は常に kouzu として扱う

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readUploadFile } from "@chiban/shared/lib/request";
import { addDocument } from "@chiban/shared/lib/queries/documents";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return withApi(async () => {
    const user = await requireAppApiUser();
    const { id } = await params;
    const file = await readUploadFile(req);
    return jsonOk(await addDocument({ projectId: id }, file, user.name, "kouzu"), 201);
  });
}
