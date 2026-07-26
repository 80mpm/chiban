// ============================================================
// 建物クエリ（owners.ts / visits.ts に倣う）。
// 建物は土地の子。地権者は building_owners に正規化し、土地の PATCH に
// buildings を畳み込む形で全置換する（独立 API は持たない）。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "../db/client";
import { uuid } from "../db/ids";
import { replaceOwnersInto, ownersSelect, dateOrNull } from "./owners";
import { replaceMortgagesInto, mortgagesSelect } from "./mortgages";
import { buildingJson, type BuildingRow } from "./serialize";
import type { Building, Owner } from "../types";

type SqlLike = Sql | TransactionSql;

/**
 * buildings に building_owners / building_mortgages を jsonb_agg で集約する SELECT 句
 * （LAND_SELECT と同型・追加順）。パラメータを持たないので sql.unsafe で使う。
 */
export const BUILDING_SELECT = `
    SELECT b.*,
           ${ownersSelect("building_owners", "building_id", "b")},
           ${mortgagesSelect("building_mortgages", "building_id", "b")}
      FROM buildings b
`;

/** 建物を land_id ごとにまとめて返す。landIds 指定時はその土地に絞る。 */
export async function fetchBuildingsByLand(
  db: SqlLike,
  landIds?: string[],
): Promise<Map<string, Building[]>> {
  const rows = landIds
    ? await db.unsafe<BuildingRow[]>(
        BUILDING_SELECT +
          " WHERE b.land_id = ANY($1) ORDER BY b.land_id, b.created_at, b.id",
        [landIds] as never[],
      )
    : await db.unsafe<BuildingRow[]>(
        BUILDING_SELECT + " ORDER BY b.land_id, b.created_at, b.id",
      );
  const byLand = new Map<string, Building[]>();
  for (const row of rows) {
    if (!byLand.has(row.land_id)) byLand.set(row.land_id, []);
    byLand.get(row.land_id)!.push(buildingJson(row));
  }
  return byLand;
}

/**
 * 土地の建物を全置換する（DELETE 旧 + INSERT 新）。
 * 送信された既存 id は再利用して編集時の id を安定させ、無ければ uuid() で採番。
 * 各建物ごとに建物地権者（building_owners）も全置換する。
 */
export async function replaceBuildings(
  sql: SqlLike,
  landId: string,
  buildings: Building[] | undefined | null,
): Promise<void> {
  await sql`DELETE FROM buildings WHERE land_id = ${landId}`;
  for (const b of buildings ?? []) {
    const bid = typeof b?.id === "string" && b.id ? b.id : uuid();
    const floorArea =
      b?.floorArea === null || b?.floorArea === undefined || !Number.isFinite(Number(b.floorArea))
        ? null
        : Number(b.floorArea);
    await sql`
      INSERT INTO buildings (id, land_id, kaoku_number, structure, usage, floor_area,
                             built_date, description)
      VALUES (${bid}, ${landId}, ${(b?.kaokuNumber ?? "").trim()},
              ${(b?.structure ?? "").trim()}, ${(b?.usage ?? "").trim()}, ${floorArea},
              ${dateOrNull(b?.builtDate)}, ${(b?.description ?? "").trim()})
    `;
    await replaceOwnersInto(sql, "building_owners", "building_id", bid, b?.owners as Owner[]);
    await replaceMortgagesInto(sql, "building_mortgages", "building_id", bid, b?.mortgages);
  }
}
