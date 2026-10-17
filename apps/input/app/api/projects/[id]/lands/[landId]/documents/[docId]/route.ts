// GET    /api/projects/:id/lands/:landId/documents/:docId — ダウンロード
// PUT    同パス — ファイルの差し替え（multipart/form-data）
// DELETE 同パス — 添付の削除

import { downloadDocument, putDocument, removeDocument } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; landId: string; docId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id, landId, docId } = await params;
  return downloadDocument({ projectId: id, landId }, docId);
}

export async function PUT(req: Request, { params }: Params) {
  const { id, landId, docId } = await params;
  return putDocument(req, { projectId: id, landId }, docId);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, landId, docId } = await params;
  return removeDocument({ projectId: id, landId }, docId);
}
