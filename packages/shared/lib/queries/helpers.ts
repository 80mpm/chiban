// ============================================================
// クエリ共通ヘルパー（db.py の _parse_project_id / _parse_parcel_id / _parse_dt の移植）
// ============================================================

import { ApiError } from "../api-error";

/** API から来た projectId（文字列のことがある）を int に正規化する。 */
export function parseProjectId(projectId: string | number): number {
  const n = Number(projectId);
  if (!Number.isInteger(n)) throw new ApiError(404, "案件が見つかりません");
  return n;
}

/** API から来た parcelId（文字列のことがある）を int に正規化する。 */
export function parseParcelId(parcelId: unknown): number {
  const n = Number(parcelId);
  if (!Number.isInteger(n)) throw new ApiError(400, "筆マスタに存在しない筆です");
  return n;
}

/** ISO 文字列（'Z' 終端含む）→ Date。空・不正は fallback。 */
export function parseDt(value: unknown, fallback: Date | null = null): Date | null {
  if (!value) return fallback;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d;
}
