// ============================================================
// 建物クエリ（owners.ts / visits.ts に倣う）。
// 建物は土地の子。所有者は building_owners に正規化し、土地の PATCH に
// buildings を畳み込む形で全置換する（独立 API は持たない）。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "../db/client";
import { uuid } from "../db/ids";
import { replaceOwnersInto, ownersSelect, dateOrNull } from "./owners";
import { replaceMortgagesInto, mortgagesSelect } from "./mortgages";
import { fetchDocumentsByBuilding } from "./documents";
import { buildingJson, type BuildingRow } from "./serialize";
import type { Building, Owner, RegistryDocument, ResidentOwnerMatch } from "../types";
import { RESIDENT_OWNER_MATCH_KEYS } from "../format";

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
  // 建物の登記簿（添付ファイル）をまとめて引き、建物ごとに添える
  const docsByBuilding = await fetchDocumentsByBuilding(
    db,
    rows.map((r) => r.id),
  );
  const emptyDocs: RegistryDocument[] = [];

  const byLand = new Map<string, Building[]>();
  for (const row of rows) {
    if (!byLand.has(row.land_id)) byLand.set(row.land_id, []);
    byLand
      .get(row.land_id)!
      .push(buildingJson(row, docsByBuilding.get(row.id) ?? emptyDocs));
  }
  return byLand;
}

/**
 * 土地の建物を送信された配列の内容に合わせる（追加・更新・削除）。
 * 送信された既存 id は UPDATE で残し、配列に無い建物だけを削除する。
 *
 * かつては DELETE + INSERT の全置換だったが、それでは
 * ①建物に紐づく登記簿（registry_documents）が ON DELETE CASCADE で消え、
 * ②created_at が編集のたびに現在時刻へ戻ってしまうため、UPSERT に変更した。
 * 各建物ごとに建物所有者（building_owners）・抵当権は従来どおり全置換する。
 */
export async function replaceBuildings(
  sql: SqlLike,
  landId: string,
  buildings: Building[] | undefined | null,
): Promise<void> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM buildings WHERE land_id = ${landId}
  `;
  const existingIds = new Set(existing.map((r) => r.id));
  const keptIds: string[] = [];

  for (const b of buildings ?? []) {
    // 送信された id がこの土地の既存建物なら再利用し、それ以外は新規採番する
    const sentId = typeof b?.id === "string" ? b.id : "";
    const bid = existingIds.has(sentId) ? sentId : uuid();
    const floorArea =
      b?.floorArea === null || b?.floorArea === undefined || !Number.isFinite(Number(b.floorArea))
        ? null
        : Number(b.floorArea);
    const location = (b?.location ?? "").trim();
    const kaokuNumber = (b?.kaokuNumber ?? "").trim();
    const structure = (b?.structure ?? "").trim();
    const usage = (b?.usage ?? "").trim();
    const builtDate = dateOrNull(b?.builtDate);
    const description = (b?.description ?? "").trim();
    // 3 値以外（未送信を含む）は「未確認」に倒す（CHECK 制約違反で 500 にしない）
    const residentOwnerMatch: ResidentOwnerMatch = RESIDENT_OWNER_MATCH_KEYS.find(
      (k) => k === b?.residentOwnerMatch,
    ) ?? "unknown";

    if (existingIds.has(bid)) {
      await sql`
        UPDATE buildings
           SET location = ${location}, kaoku_number = ${kaokuNumber},
               structure = ${structure}, usage = ${usage}, floor_area = ${floorArea},
               built_date = ${builtDate}, description = ${description},
               resident_owner_match = ${residentOwnerMatch}, updated_at = now()
         WHERE id = ${bid} AND land_id = ${landId}
      `;
    } else {
      await sql`
        INSERT INTO buildings (id, land_id, location, kaoku_number, structure, usage, floor_area,
                               built_date, description, resident_owner_match)
        VALUES (${bid}, ${landId}, ${location}, ${kaokuNumber}, ${structure}, ${usage},
                ${floorArea}, ${builtDate}, ${description}, ${residentOwnerMatch})
      `;
    }
    keptIds.push(bid);
    await replaceOwnersInto(sql, "building_owners", "building_id", bid, b?.owners as Owner[]);
    await replaceMortgagesInto(sql, "building_mortgages", "building_id", bid, b?.mortgages);
  }

  // 送信されなかった建物を削除する（その建物の登記簿もカスケードで削除される）
  if (keptIds.length === 0) {
    await sql`DELETE FROM buildings WHERE land_id = ${landId}`;
  } else {
    await sql`
      DELETE FROM buildings
       WHERE land_id = ${landId} AND NOT (id = ANY(${keptIds}))
    `;
  }
}
