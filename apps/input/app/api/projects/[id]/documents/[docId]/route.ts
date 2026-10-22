// GET    /api/projects/:id/documents/:docId — 案件の公図のダウンロード（地図に重ねる画像の取得にも使う）
// PUT    同パス — 画像の差し替え（multipart/form-data。位置合わせは未設定に戻る）
// PATCH  同パス — 位置合わせの保存 {overlay}（null で未設定に戻す）
// DELETE 同パス — 公図の削除

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { updateProjectKouzuOverlay } from "@chiban/shared/lib/queries/documents";
import { requireAppApiUser } from "@/lib/auth";
import { downloadDocument, putDocument, removeDocument } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; docId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id, docId } = await params;
  return downloadDocument({ projectId: id }, docId);
}

export async function PUT(req: Request, { params }: Params) {
  const { id, docId } = await params;
  return putDocument(req, { projectId: id }, docId);
}

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    await requireAppApiUser();
    const { id, docId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateProjectKouzuOverlay(id, docId, body.overlay ?? null));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, docId } = await params;
  return removeDocument({ projectId: id }, docId);
}
