// ============================================================
// 登記簿等の添付ファイル（registry_documents）の CRUD
// 土地・建物のどちらか一方に紐づく。ファイル本体は bytea に保存し、
// 一覧・ツリー読み出しではメタデータのみを SELECT する（data は引かない）。
// 将来 Vercel Blob へ移す場合に変更が要るのはこのファイルだけ。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { uuid } from "../db/ids";
import { ApiError } from "../api-error";
import { parseProjectId } from "./helpers";
import { iso } from "./serialize";
import type { UploadedFile } from "../request";
import type { DocumentKind, RegistryDocument } from "../types";

type SqlLike = Sql | TransactionSql;

/** 1 ファイルの上限（10MB）。登記事項証明書のスキャン PDF を想定した値。 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** 受け付ける MIME タイプ（登記簿の PDF とスキャン画像）。 */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/** 受け付ける種別。公図（kouzu）は建物にのみ添付できる。 */
const DOCUMENT_KINDS: readonly DocumentKind[] = ["registry", "kouzu"];

/** クエリ文字列等で受け取った種別を検証する（未指定は登記簿）。 */
export function parseDocumentKind(value: string | null | undefined): DocumentKind {
  if (!value) return "registry";
  if (!(DOCUMENT_KINDS as readonly string[]).includes(value)) {
    throw new ApiError(400, "添付の種別が不正です");
  }
  return value as DocumentKind;
}

/** 添付先（土地、または土地上の建物）。 */
export interface DocumentScope {
  projectId: string;
  landId: string;
  /** 指定時は建物の登記簿として扱う。 */
  buildingId?: string;
}

/** メタデータのみの列並び（data を含めない）。 */
const META_COLUMNS = `id, kind, file_name, content_type, byte_size, uploaded_by, created_at, updated_at`;

interface DocumentRow {
  id: string;
  kind: DocumentKind;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: Date | null;
  updated_at: Date | null;
}

function documentJson(row: DocumentRow): RegistryDocument {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    uploadedBy: row.uploaded_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// ----- 読み出し（ツリー組み立て用） -----

/** 添付ファイルを land_id ごとにまとめて返す（土地の登記簿のみ。公図は土地に付かない）。 */
export async function fetchDocumentsByLand(
  db: SqlLike,
  landIds?: string[],
): Promise<Map<string, RegistryDocument[]>> {
  const rows = landIds
    ? await db.unsafe<(DocumentRow & { land_id: string })[]>(
        `SELECT land_id, ${META_COLUMNS} FROM registry_documents
          WHERE land_id = ANY($1) AND kind = 'registry' ORDER BY land_id, created_at, id`,
        [landIds] as never[],
      )
    : await db.unsafe<(DocumentRow & { land_id: string })[]>(
        `SELECT land_id, ${META_COLUMNS} FROM registry_documents
          WHERE land_id IS NOT NULL AND kind = 'registry' ORDER BY land_id, created_at, id`,
      );
  const byLand = new Map<string, RegistryDocument[]>();
  for (const row of rows) {
    if (!byLand.has(row.land_id)) byLand.set(row.land_id, []);
    byLand.get(row.land_id)!.push(documentJson(row));
  }
  return byLand;
}

/** 添付ファイルを building_id ごとにまとめて返す（登記簿・公図の両方。画面側で kind ごとに分ける）。 */
export async function fetchDocumentsByBuilding(
  db: SqlLike,
  buildingIds?: string[],
): Promise<Map<string, RegistryDocument[]>> {
  const rows = buildingIds
    ? await db.unsafe<(DocumentRow & { building_id: string })[]>(
        `SELECT building_id, ${META_COLUMNS} FROM registry_documents
          WHERE building_id = ANY($1) ORDER BY building_id, created_at, id`,
        [buildingIds] as never[],
      )
    : await db.unsafe<(DocumentRow & { building_id: string })[]>(
        `SELECT building_id, ${META_COLUMNS} FROM registry_documents
          WHERE building_id IS NOT NULL ORDER BY building_id, created_at, id`,
      );
  const byBuilding = new Map<string, RegistryDocument[]>();
  for (const row of rows) {
    if (!byBuilding.has(row.building_id)) byBuilding.set(row.building_id, []);
    byBuilding.get(row.building_id)!.push(documentJson(row));
  }
  return byBuilding;
}

// ----- 検証 -----

/** ファイル名をサニタイズする（パス区切りを除去し、長すぎる名前を切る）。 */
function safeFileName(name: string): string {
  const base = (name || "").replace(/[\\/]/g, "_").trim();
  if (!base) return "登記簿";
  return base.length > 180 ? base.slice(0, 180) : base;
}

/** サイズ・種別を検証する。違反は 400（メッセージはそのまま UI に出る）。 */
function assertUploadable(file: UploadedFile): void {
  if (file.bytes.length === 0) {
    throw new ApiError(400, "ファイルが空です");
  }
  if (file.bytes.length > MAX_DOCUMENT_BYTES) {
    const mb = Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024);
    throw new ApiError(400, `ファイルサイズが上限（${mb}MB）を超えています`);
  }
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.contentType)) {
    throw new ApiError(400, "PDF・JPEG・PNG のいずれかを選択してください");
  }
}

/**
 * 添付先が存在することを確認する（案件 → 土地 → 建物の親子関係も検証）。
 * URL のパスを辿れない組み合わせは 404 にして、他案件の土地を掴めないようにする。
 */
async function assertScope(db: SqlLike, scope: DocumentScope): Promise<void> {
  const pid = parseProjectId(scope.projectId);
  const [land] = await db<{ id: string }[]>`
    SELECT id FROM lands WHERE project_id = ${pid} AND id = ${scope.landId}
  `;
  if (!land) throw new ApiError(404, "土地が見つかりません");
  if (scope.buildingId) {
    const [building] = await db<{ id: string }[]>`
      SELECT id FROM buildings WHERE land_id = ${scope.landId} AND id = ${scope.buildingId}
    `;
    if (!building) throw new ApiError(404, "建物が見つかりません");
  }
}

// ----- 書き込み -----

/** 添付ファイルを追加する（kind 既定は登記簿。公図は建物にのみ添付できる）。 */
export async function addDocument(
  scope: DocumentScope,
  file: UploadedFile,
  uploadedBy: string,
  kind: DocumentKind = "registry",
): Promise<RegistryDocument> {
  await ensureDbReady();
  assertUploadable(file);
  if (kind === "kouzu" && !scope.buildingId) {
    throw new ApiError(400, "公図は建物にのみ添付できます");
  }

  return sql.begin(async (tx) => {
    await assertScope(tx, scope);
    const id = uuid();
    const [row] = await tx.unsafe<DocumentRow[]>(
      `INSERT INTO registry_documents
         (id, land_id, building_id, file_name, content_type, byte_size, data, uploaded_by, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${META_COLUMNS}`,
      [
        id,
        scope.buildingId ? null : scope.landId,
        scope.buildingId ?? null,
        safeFileName(file.fileName),
        file.contentType,
        file.bytes.length,
        file.bytes,
        uploadedBy,
        kind,
      ] as never[],
    );
    return documentJson(row);
  });
}

/** 添付ファイルを差し替える（メタデータも新しいファイルのものに更新する）。 */
export async function replaceDocument(
  scope: DocumentScope,
  documentId: string,
  file: UploadedFile,
  uploadedBy: string,
): Promise<RegistryDocument> {
  await ensureDbReady();
  assertUploadable(file);

  return sql.begin(async (tx) => {
    await assertScope(tx, scope);
    const rows = await tx.unsafe<DocumentRow[]>(
      `UPDATE registry_documents
          SET file_name = $1, content_type = $2, byte_size = $3, data = $4,
              uploaded_by = $5, updated_at = now()
        WHERE id = $6 AND ${scope.buildingId ? "building_id = $7" : "land_id = $7"}
        RETURNING ${META_COLUMNS}`,
      [
        safeFileName(file.fileName),
        file.contentType,
        file.bytes.length,
        file.bytes,
        uploadedBy,
        documentId,
        scope.buildingId ?? scope.landId,
      ] as never[],
    );
    if (rows.length === 0) throw new ApiError(404, "添付ファイルが見つかりません");
    return documentJson(rows[0]);
  });
}

/** 添付ファイルを削除する。 */
export async function deleteDocument(
  scope: DocumentScope,
  documentId: string,
): Promise<void> {
  await ensureDbReady();
  await assertScope(sql, scope);
  const res = await sql.unsafe(
    `DELETE FROM registry_documents
      WHERE id = $1 AND ${scope.buildingId ? "building_id = $2" : "land_id = $2"}`,
    [documentId, scope.buildingId ?? scope.landId] as never[],
  );
  if (res.count === 0) throw new ApiError(404, "添付ファイルが見つかりません");
}

/** ダウンロード用にファイル本体を読む。 */
export async function readDocumentBytes(
  scope: DocumentScope,
  documentId: string,
): Promise<{ fileName: string; contentType: string; bytes: Buffer }> {
  await ensureDbReady();
  await assertScope(sql, scope);
  const rows = await sql.unsafe<
    { file_name: string; content_type: string; data: Buffer }[]
  >(
    `SELECT file_name, content_type, data FROM registry_documents
      WHERE id = $1 AND ${scope.buildingId ? "building_id = $2" : "land_id = $2"}`,
    [documentId, scope.buildingId ?? scope.landId] as never[],
  );
  if (rows.length === 0) throw new ApiError(404, "添付ファイルが見つかりません");
  return {
    fileName: rows[0].file_name,
    contentType: rows[0].content_type,
    bytes: Buffer.from(rows[0].data),
  };
}
