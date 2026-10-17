// GET / PUT / DELETE
// /api/projects/:id/lands/:landId/buildings/:buildingId/documents/:docId
// 建物の登記簿のダウンロード・差し替え・削除

import { downloadDocument, putDocument, removeDocument } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
    landId: string;
    buildingId: string;
    docId: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { id, landId, buildingId, docId } = await params;
  return downloadDocument({ projectId: id, landId, buildingId }, docId);
}

export async function PUT(req: Request, { params }: Params) {
  const { id, landId, buildingId, docId } = await params;
  return putDocument(req, { projectId: id, landId, buildingId }, docId);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, landId, buildingId, docId } = await params;
  return removeDocument({ projectId: id, landId, buildingId }, docId);
}
