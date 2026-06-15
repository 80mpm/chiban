// ============================================================
// 地権者ヘルパー（db.py の _parse_share / _replace_owners の移植）
// land_owners テーブルへの全置換と持分文字列の分解。
// サンプル生成・土地 CRUD の双方から使う。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import type { Owner } from "../types";

/** postgres.js の sql またはトランザクション sql のどちらでも受ける。 */
type SqlLike = Sql | TransactionSql;

/**
 * 持分文字列 '1520/6755' → [分子, 分母]。
 * 分数として解釈できなければ [null, null]（持分指定なし扱い）。
 */
export function parseShare(share: string | undefined | null): [number | null, number | null] {
  const s = (share ?? "").trim();
  const slash = s.indexOf("/");
  if (slash < 0) return [null, null];
  const num = Number(s.slice(0, slash).trim());
  const den = Number(s.slice(slash + 1).trim());
  if (!Number.isInteger(num) || !Number.isInteger(den)) return [null, null];
  return den > 0 ? [num, den] : [null, null];
}

/** 土地の地権者を全置換する（DELETE 旧 + INSERT 新）。name 空は捨てる。 */
export async function replaceOwners(
  sql: SqlLike,
  landId: string,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await sql`DELETE FROM land_owners WHERE land_id = ${landId}`;
  for (const o of owners ?? []) {
    const name = (o?.name ?? "").trim();
    if (!name) continue;
    const [num, den] = parseShare(o?.share);
    await sql`
      INSERT INTO land_owners (land_id, name, share_num, share_den)
      VALUES (${landId}, ${name}, ${num}, ${den})
    `;
  }
}
