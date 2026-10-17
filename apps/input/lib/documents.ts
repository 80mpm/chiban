// 添付ファイル 1 件に対する API 処理（土地用・建物用のルートで共用）。
// ルートファイル側は params を解いて scope を作るだけにする。

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readUploadFile } from "@chiban/shared/lib/request";
import {
  readDocumentBytes,
  replaceDocument,
  deleteDocument,
  type DocumentScope,
} from "@chiban/shared/lib/queries/documents";
import { requireAppApiUser } from "@/lib/auth";

/** Content-Disposition のファイル名（日本語ファイル名は RFC 5987 形式で付ける）。 */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** ファイル本体を返す（PDF・画像はブラウザ内で開けるよう inline）。 */
export function downloadDocument(scope: DocumentScope, documentId: string) {
  return withApi(async () => {
    await requireAppApiUser();
    const doc = await readDocumentBytes(scope, documentId);
    return new Response(new Uint8Array(doc.bytes), {
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": contentDisposition(doc.fileName),
        "Content-Length": String(doc.bytes.length),
        // 登記簿は非公開情報。CDN・ブラウザにキャッシュさせない
        "Cache-Control": "no-store",
      },
    });
  });
}

/** 同じ添付枠のファイルを差し替える。 */
export function putDocument(req: Request, scope: DocumentScope, documentId: string) {
  return withApi(async () => {
    const user = await requireAppApiUser();
    const file = await readUploadFile(req);
    return jsonOk(await replaceDocument(scope, documentId, file, user.name));
  });
}

/** 添付を削除する。 */
export function removeDocument(scope: DocumentScope, documentId: string) {
  return withApi(async () => {
    await requireAppApiUser();
    await deleteDocument(scope, documentId);
    return jsonOk(null, 204);
  });
}
