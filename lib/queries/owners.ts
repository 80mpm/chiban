// ============================================================
// 地権者ヘルパー（db.py の _parse_share / _replace_owners の移植）
// land_owners / building_owners / building_unit_owners への全置換と
// 持分文字列の分解。3 テーブルとも同形（name + share_num/share_den）なので
// 置換処理は共通実装に寄せる。サンプル生成・CRUD の双方から使う。
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

/** 所有者テーブル（land_owners と同形）を全置換する（DELETE 旧 + INSERT 新）。name 空は捨てる。 */
async function replaceOwnersIn(
  sql: SqlLike,
  table: string,
  fkColumn: string,
  parentId: string | number,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await sql`DELETE FROM ${sql(table)} WHERE ${sql(fkColumn)} = ${parentId}`;
  for (const o of owners ?? []) {
    const name = (o?.name ?? "").trim();
    if (!name) continue;
    const [num, den] = parseShare(o?.share);
    await sql`
      INSERT INTO ${sql(table)} ${sql({
        [fkColumn]: parentId,
        name,
        share_num: num,
        share_den: den,
      })}
    `;
  }
}

/** 土地の地権者を全置換する。 */
export async function replaceOwners(
  sql: SqlLike,
  landId: string,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await replaceOwnersIn(sql, "land_owners", "land_id", landId, owners);
}

/** 建物（一棟所有）の所有者を全置換する。 */
export async function replaceBuildingOwners(
  sql: SqlLike,
  buildingId: string,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await replaceOwnersIn(sql, "building_owners", "building_id", buildingId, owners);
}

/** 専有部分の区分所有者を全置換する。 */
export async function replaceUnitOwners(
  sql: SqlLike,
  unitId: number,
  owners: Owner[] | undefined | null,
): Promise<void> {
  await replaceOwnersIn(sql, "building_unit_owners", "unit_id", unitId, owners);
}
