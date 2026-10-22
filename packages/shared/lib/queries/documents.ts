// ============================================================
// 登記簿等の添付ファイル（registry_documents）の CRUD
// 土地・建物・案件のいずれか 1 つに紐づく（案件には筆を描く下地の公図画像のみ）。ファイル本体は bytea に保存し、
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
import type { DocumentKind, KouzuOverlay, RegistryDocument } from "../types";

type SqlLike = Sql | TransactionSql;

/** 1 ファイルの上限（10MB）。登記事項証明書のスキャン PDF を想定した値。 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** 受け付ける MIME タイプ（登記簿の PDF とスキャン画像）。 */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/** 案件の公図（筆を描く下地）として受け付ける MIME タイプ。地図に重ねるため画像のみ。 */
export const ALLOWED_PROJECT_KOUZU_TYPES = ["image/jpeg", "image/png"] as const;

/** 受け付ける種別。公図（kouzu）は土地・案件に添付できる（建物は登記簿のみ）。どれも種類ごとに 1 つまで。 */
const DOCUMENT_KINDS: readonly DocumentKind[] = ["registry", "kouzu"];

/** クエリ文字列等で受け取った種別を検証する（未指定は登記簿）。 */
export function parseDocumentKind(value: string | null | undefined): DocumentKind {
  if (!value) return "registry";
  if (!(DOCUMENT_KINDS as readonly string[]).includes(value)) {
    throw new ApiError(400, "添付の種別が不正です");
  }
  return value as DocumentKind;
}

/**
 * 添付先。landId があれば土地、さらに buildingId があれば土地上の建物、
 * どちらも無ければ案件そのもの（下地の公図）に紐づく。
 */
export interface DocumentScope {
  projectId: string;
  landId?: string;
  /** 指定時は建物の登記簿として扱う（landId 必須）。 */
  buildingId?: string;
}

/** 添付先の列と値（WHERE・INSERT 用）。 */
function ownerOf(scope: DocumentScope): {
  column: "project_id" | "land_id" | "building_id";
  value: string | number;
} {
  if (scope.buildingId) return { column: "building_id", value: scope.buildingId };
  if (scope.landId) return { column: "land_id", value: scope.landId };
  return { column: "project_id", value: parseProjectId(scope.projectId) };
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
  /** 案件の公図を読むときだけ SELECT する。 */
  overlay?: KouzuOverlay | null;
}

function documentJson(row: DocumentRow): RegistryDocument {
  const doc: RegistryDocument = {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    uploadedBy: row.uploaded_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (row.overlay !== undefined) doc.overlay = row.overlay;
  return doc;
}

// ----- 読み出し（ツリー組み立て用） -----

/** 添付ファイルを land_id ごとにまとめて返す（登記簿・公図の両方。画面側で kind ごとに分ける）。 */
export async function fetchDocumentsByLand(
  db: SqlLike,
  landIds?: string[],
): Promise<Map<string, RegistryDocument[]>> {
  const rows = landIds
    ? await db.unsafe<(DocumentRow & { land_id: string })[]>(
        `SELECT land_id, ${META_COLUMNS} FROM registry_documents
          WHERE land_id = ANY($1) ORDER BY land_id, created_at, id`,
        [landIds] as never[],
      )
    : await db.unsafe<(DocumentRow & { land_id: string })[]>(
        `SELECT land_id, ${META_COLUMNS} FROM registry_documents
          WHERE land_id IS NOT NULL ORDER BY land_id, created_at, id`,
      );
  const byLand = new Map<string, RegistryDocument[]>();
  for (const row of rows) {
    if (!byLand.has(row.land_id)) byLand.set(row.land_id, []);
    byLand.get(row.land_id)!.push(documentJson(row));
  }
  return byLand;
}

/**
 * 添付ファイルを building_id ごとにまとめて返す（登記簿のみ）。
 * 建物に公図は無い（かつて添付できた公図の行はスキーマ初期化時に削除済み。念のため kind でも絞る）。
 */
export async function fetchDocumentsByBuilding(
  db: SqlLike,
  buildingIds?: string[],
): Promise<Map<string, RegistryDocument[]>> {
  const rows = buildingIds
    ? await db.unsafe<(DocumentRow & { building_id: string })[]>(
        `SELECT building_id, ${META_COLUMNS} FROM registry_documents
          WHERE building_id = ANY($1) AND kind = 'registry' ORDER BY building_id, created_at, id`,
        [buildingIds] as never[],
      )
    : await db.unsafe<(DocumentRow & { building_id: string })[]>(
        `SELECT building_id, ${META_COLUMNS} FROM registry_documents
          WHERE building_id IS NOT NULL AND kind = 'registry' ORDER BY building_id, created_at, id`,
      );
  const byBuilding = new Map<string, RegistryDocument[]>();
  for (const row of rows) {
    if (!byBuilding.has(row.building_id)) byBuilding.set(row.building_id, []);
    byBuilding.get(row.building_id)!.push(documentJson(row));
  }
  return byBuilding;
}

/**
 * 案件の公図（筆を描く下地）を位置合わせ込みで返す。
 * ページから直接呼ぶため、不正な案件 ID は例外にせず空配列にする（呼び出し側が notFound() を出す）。
 */
export async function fetchProjectKouzu(projectId: string): Promise<RegistryDocument[]> {
  await ensureDbReady();
  const pid = Number(projectId);
  if (!Number.isInteger(pid)) return [];
  const rows = await sql.unsafe<DocumentRow[]>(
    `SELECT ${META_COLUMNS}, overlay FROM registry_documents
      WHERE project_id = $1 ORDER BY created_at, id`,
    [pid] as never[],
  );
  return rows.map(documentJson);
}

// ----- 検証 -----

/** ファイル名をサニタイズする（パス区切りを除去し、長すぎる名前を切る）。 */
function safeFileName(name: string): string {
  const base = (name || "").replace(/[\\/]/g, "_").trim();
  if (!base) return "登記簿";
  return base.length > 180 ? base.slice(0, 180) : base;
}

/** サイズ・種別を検証する。違反は 400（メッセージはそのまま UI に出る）。 */
function assertUploadable(file: UploadedFile, scope: DocumentScope): void {
  if (file.bytes.length === 0) {
    throw new ApiError(400, "ファイルが空です");
  }
  if (file.bytes.length > MAX_DOCUMENT_BYTES) {
    const mb = Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024);
    throw new ApiError(400, `ファイルサイズが上限（${mb}MB）を超えています`);
  }
  if (!scope.landId) {
    // 案件の公図は地図に重ねる下地なので画像のみ（PDF は画像に変換して使う運用）
    if (!(ALLOWED_PROJECT_KOUZU_TYPES as readonly string[]).includes(file.contentType)) {
      throw new ApiError(400, "公図は JPEG・PNG の画像を選択してください（PDF は画像に変換してください）");
    }
    return;
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
  if (!scope.landId) {
    const [proj] = await db<{ id: number }[]>`SELECT id FROM projects WHERE id = ${pid}`;
    if (!proj) throw new ApiError(404, "案件が見つかりません");
    return;
  }
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

/** 紐づけ先の列に対応する、行ロック用のテーブルと表示名。 */
const OWNER_TABLES = {
  project_id: { table: "projects", label: "案件" },
  land_id: { table: "lands", label: "土地" },
  building_id: { table: "buildings", label: "建物" },
} as const;

/**
 * 添付ファイルを追加する（kind 既定は登記簿。案件には下地の公図のみ、建物には登記簿のみ添付できる）。
 * どの添付も**紐づけ先ごと・種類ごとに 1 つまで**（案件の公図・土地の登記簿・土地の公図・建物の登記簿）。
 * 2 つ目は 409 にして、差し替えで更新してもらう。
 */
export async function addDocument(
  scope: DocumentScope,
  file: UploadedFile,
  uploadedBy: string,
  kind: DocumentKind = "registry",
): Promise<RegistryDocument> {
  await ensureDbReady();
  assertUploadable(file, scope);
  if (!scope.landId) kind = "kouzu"; // 案件に添付できるのは下地の公図だけ
  if (scope.buildingId && kind !== "registry") {
    throw new ApiError(400, "建物に添付できるのは登記簿のみです");
  }
  const owner = ownerOf(scope);
  const { table, label } = OWNER_TABLES[owner.column];

  return sql.begin(async (tx) => {
    await assertScope(tx, scope);
    // 同じ紐づけ先への同時追加で 2 つ目が入らないよう、紐づけ先の行をロックしてから数える
    await tx.unsafe(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [owner.value] as never[]);
    const [{ n }] = await tx.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM registry_documents WHERE ${owner.column} = $1 AND kind = $2`,
      [owner.value, kind] as never[],
    );
    if (n > 0) {
      const what = kind === "kouzu" ? "公図" : "登記簿";
      throw new ApiError(409, `${label}の${what}は 1 つまでです。差し替えで更新してください`);
    }
    const id = uuid();
    const [row] = await tx.unsafe<DocumentRow[]>(
      `INSERT INTO registry_documents
         (id, ${owner.column}, file_name, content_type, byte_size, data, uploaded_by, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${META_COLUMNS}`,
      [
        id,
        owner.value,
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

/**
 * 添付ファイルを差し替える（メタデータも新しいファイルのものに更新する）。
 * 案件の公図は画像が変わると位置合わせが合わなくなるため、overlay を未設定に戻す。
 */
export async function replaceDocument(
  scope: DocumentScope,
  documentId: string,
  file: UploadedFile,
  uploadedBy: string,
): Promise<RegistryDocument> {
  await ensureDbReady();
  assertUploadable(file, scope);
  const owner = ownerOf(scope);

  return sql.begin(async (tx) => {
    await assertScope(tx, scope);
    const rows = await tx.unsafe<DocumentRow[]>(
      `UPDATE registry_documents
          SET file_name = $1, content_type = $2, byte_size = $3, data = $4,
              uploaded_by = $5, overlay = NULL, updated_at = now()
        WHERE id = $6 AND ${owner.column} = $7
        RETURNING ${META_COLUMNS}`,
      [
        safeFileName(file.fileName),
        file.contentType,
        file.bytes.length,
        file.bytes,
        uploadedBy,
        documentId,
        owner.value,
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
  const owner = ownerOf(scope);
  const res = await sql.unsafe(
    `DELETE FROM registry_documents WHERE id = $1 AND ${owner.column} = $2`,
    [documentId, owner.value] as never[],
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
  const owner = ownerOf(scope);
  const rows = await sql.unsafe<
    { file_name: string; content_type: string; data: Buffer }[]
  >(
    `SELECT file_name, content_type, data FROM registry_documents
      WHERE id = $1 AND ${owner.column} = $2`,
    [documentId, owner.value] as never[],
  );
  if (rows.length === 0) throw new ApiError(404, "添付ファイルが見つかりません");
  return {
    fileName: rows[0].file_name,
    contentType: rows[0].content_type,
    bytes: Buffer.from(rows[0].data),
  };
}

// ----- 案件の公図の位置合わせ -----

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** クライアントから受け取った位置合わせを検証・正規化する。不正は 400。 */
function parseOverlay(value: unknown): KouzuOverlay | null {
  if (value === null) return null;
  const o = value as Partial<KouzuOverlay> | undefined;
  const c = o?.center;
  if (
    !o ||
    !Array.isArray(c) ||
    c.length !== 2 ||
    !finite(c[0]) ||
    !finite(c[1]) ||
    Math.abs(c[0]) > 90 ||
    Math.abs(c[1]) > 180 ||
    !finite(o.metersPerPixel) ||
    o.metersPerPixel <= 0 ||
    !finite(o.rotationDeg) ||
    !finite(o.opacity) ||
    !finite(o.imageWidth) ||
    o.imageWidth <= 0 ||
    !finite(o.imageHeight) ||
    o.imageHeight <= 0
  ) {
    throw new ApiError(400, "公図の位置合わせの値が不正です");
  }
  return {
    center: [c[0], c[1]],
    metersPerPixel: o.metersPerPixel,
    rotationDeg: ((((o.rotationDeg + 180) % 360) + 360) % 360) - 180, // -180〜180 に正規化
    opacity: Math.min(1, Math.max(0, o.opacity)),
    imageWidth: Math.round(o.imageWidth),
    imageHeight: Math.round(o.imageHeight),
  };
}

/** 案件の公図の位置合わせを保存する（null で未設定に戻す）。 */
export async function updateProjectKouzuOverlay(
  projectId: string,
  documentId: string,
  overlay: unknown,
): Promise<RegistryDocument> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);
  const value = parseOverlay(overlay);
  // jsonb は安全テンプレートの sql.json で書く（sql.unsafe では二重エンコードになる）
  const rows = await sql<DocumentRow[]>`
    UPDATE registry_documents
       SET overlay = ${value === null ? null : sql.json(value as never)}, updated_at = now()
     WHERE id = ${documentId} AND project_id = ${pid}
     RETURNING ${sql.unsafe(META_COLUMNS)}, overlay
  `;
  if (rows.length === 0) throw new ApiError(404, "公図が見つかりません");
  return documentJson(rows[0]);
}
