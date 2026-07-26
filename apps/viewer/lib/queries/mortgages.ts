// ============================================================
// 抵当権ヘルパー（owners.ts と同型）
// land_mortgages / building_mortgages への全置換と SELECT 集約句。
// 土地・建物の双方から使う。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { dateOrNull } from "./owners";
import type { Mortgage } from "../types";

/** postgres.js の sql またはトランザクション sql のどちらでも受ける。 */
type SqlLike = Sql | TransactionSql;

/**
 * 抵当権を [{date, amount, holder}] に集約する相関サブクエリ（id 順 = 追加順）。
 * LAND_SELECT / BUILDING_SELECT に埋め込む。パラメータを持たない文字列断片なので
 * 呼び出し側の sql.unsafe 内でのみ使う。date は 'YYYY-MM-DD'、未設定は ''。
 */
export function mortgagesSelect(table: string, fkCol: string, parentAlias: string): string {
  return `
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'date', COALESCE(to_char(m.date, 'YYYY-MM-DD'), ''),
                      'amount', m.amount,
                      'holder', m.holder
                    ) ORDER BY m.id)
               FROM ${table} m WHERE m.${fkCol} = ${parentAlias}.id
           ), '[]'::jsonb) AS mortgages`;
}

/**
 * 抵当権テーブルを全置換する（DELETE 旧 + INSERT 新。replaceOwnersInto と同型）。
 * 3 項目とも空の行は捨てる。amount は数値化できなければ NULL。
 */
export async function replaceMortgagesInto(
  sql: SqlLike,
  table: string,
  fkCol: string,
  parentId: string,
  mortgages: Mortgage[] | undefined | null,
): Promise<void> {
  await sql`DELETE FROM ${sql(table)} WHERE ${sql(fkCol)} = ${parentId}`;
  for (const m of mortgages ?? []) {
    const date = dateOrNull(m?.date);
    const holder = (m?.holder ?? "").trim();
    const amount =
      m?.amount === null || m?.amount === undefined || !Number.isFinite(Number(m.amount))
        ? null
        : Number(m.amount);
    if (date === null && amount === null && !holder) continue;
    await sql`
      INSERT INTO ${sql(table)} (${sql(fkCol)}, date, amount, holder)
      VALUES (${parentId}, ${date}, ${amount}, ${holder})
    `;
  }
}
