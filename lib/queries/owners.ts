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

/** 'YYYY-MM-DD' 文字列 → date 列の値。空・不正な日付は NULL（parseShare と同じ寛容方針）。 */
export function dateOrNull(s: string | undefined | null): string | null {
  const t = (s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return Number.isNaN(new Date(t).getTime()) ? null : t;
}

/**
 * 地権者を [{name, share, address, regDate, regCause, description}] に集約する
 * 相関サブクエリ（id 順 = 追加順）。LAND_SELECT / BUILDING_SELECT に埋め込む。
 * パラメータを持たない文字列断片なので呼び出し側の sql.unsafe 内でのみ使う。
 */
export function ownersSelect(table: string, fkCol: string, parentAlias: string): string {
  return `
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'name', o.name,
                      'share', CASE WHEN o.share_num IS NOT NULL
                                    THEN o.share_num || '/' || o.share_den ELSE '' END,
                      'address', o.address,
                      'regDate', COALESCE(to_char(o.reg_date, 'YYYY-MM-DD'), ''),
                      'regCause', o.reg_cause,
                      'description', o.description
                    ) ORDER BY o.id)
               FROM ${table} o WHERE o.${fkCol} = ${parentAlias}.id
           ), '[]'::jsonb) AS owners`;
}

/**
 * 地権者テーブルを全置換する（DELETE 旧 + INSERT 新）。name 空は捨てる。
 * 土地(land_owners/land_id)・建物(building_owners/building_id)の双方から使う汎用版。
 */
export async function replaceOwnersInto(
  sql: SqlLike,
  table: string,
  fkCol: string,
  ownerId: string,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await sql`DELETE FROM ${sql(table)} WHERE ${sql(fkCol)} = ${ownerId}`;
  for (const o of owners ?? []) {
    const name = (o?.name ?? "").trim();
    if (!name) continue;
    const [num, den] = parseShare(o?.share);
    await sql`
      INSERT INTO ${sql(table)} (${sql(fkCol)}, name, share_num, share_den,
                                 address, reg_date, reg_cause, description)
      VALUES (${ownerId}, ${name}, ${num}, ${den},
              ${(o?.address ?? "").trim()}, ${dateOrNull(o?.regDate)},
              ${(o?.regCause ?? "").trim()}, ${(o?.description ?? "").trim()})
    `;
  }
}

/** 土地の地権者を全置換する。 */
export function replaceOwners(
  sql: SqlLike,
  landId: string,
  owners: Owner[] | undefined | null,
): Promise<void> {
  return replaceOwnersInto(sql, "land_owners", "land_id", landId, owners);
}
