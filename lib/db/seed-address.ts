// ============================================================
// 住所マスタ投入（db.py の seed_address_master_if_empty の移植）
// 位置参照情報 CSV（13106_2025.csv・Shift-JIS）から
// prefectures / shikuchoson / chibankuiki を投入する。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import type { Sql } from "postgres";

const ADDRESS_CSV_PATH = path.join(process.cwd(), "13106_2025.csv");

interface AddressRow {
  都道府県コード: string;
  都道府県名: string;
  市区町村コード: string;
  市区町村名: string;
  大字町丁目コード: string;
  大字町丁目名: string;
  緯度: string;
  経度: string;
}

/** 住所マスタが空のときだけ CSV から投入する。投入したら true。 */
export async function seedAddressMasterIfEmpty(sql: Sql): Promise<boolean> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM chibankuiki
  `;
  if (n > 0) return false;

  const buf = fs.readFileSync(ADDRESS_CSV_PATH);
  const text = iconv.decode(buf, "Shift_JIS");
  const rows = parse(text, { columns: true, skip_empty_lines: true }) as AddressRow[];

  const prefIds = new Map<string, number>(); // 都道府県 jis_code → id
  const muniIds = new Map<string, number>(); // 市区町村 jis_code → id

  await sql.begin(async (tx) => {
    for (const r of rows) {
      const pcode = r["都道府県コード"];
      if (!prefIds.has(pcode)) {
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO prefectures (jis_code, name)
          VALUES (${pcode}, ${r["都道府県名"]}) RETURNING id
        `;
        prefIds.set(pcode, row.id);
      }
      const mcode = r["市区町村コード"];
      if (!muniIds.has(mcode)) {
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO shikuchoson (prefecture_id, jis_code, name)
          VALUES (${prefIds.get(pcode)!}, ${mcode}, ${r["市区町村名"]}) RETURNING id
        `;
        muniIds.set(mcode, row.id);
      }
      await tx`
        INSERT INTO chibankuiki (shikuchoson_id, choaza_code, name, lat, lng)
        VALUES (
          ${muniIds.get(mcode)!},
          ${r["大字町丁目コード"].slice(-6)},
          ${r["大字町丁目名"]},
          ${parseFloat(r["緯度"])},
          ${parseFloat(r["経度"])}
        )
      `;
    }
  });

  console.log(
    `住所マスタを投入しました: ${prefIds.size} 都道府県・${muniIds.size} 市区町村・` +
      `${rows.length} 地番区域（${path.basename(ADDRESS_CSV_PATH)}）`,
  );
  return true;
}
