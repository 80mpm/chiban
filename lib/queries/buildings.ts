// ============================================================
// 建物 CRUD。建物は土地（lands）に 1:N でぶら下がる棟単位のレコード。
// 所有形態（ownershipType）で地権者の持ち方が変わる不変条件を守る:
//   - sole  （一棟所有）: 所有者は building_owners。専有部分は持たない
//   - kubun （区分所有）: 所有者は専有部分（building_units）ごと。棟直下には持たない
// owners / units は土地の owners と同様に「渡されたら全置換」。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { uuid } from "../db/ids";
import { ApiError, isUniqueViolation } from "../api-error";
import { parseProjectId } from "./helpers";
import { replaceBuildingOwners, replaceUnitOwners, parseShare } from "./owners";
import { buildingJson, type BuildingRow } from "./serialize";
import type { Building, BuildingOwnershipType, Owner } from "../types";

type SqlLike = Sql | TransactionSql;

/**
 * buildings に owners（building_owners）と units（building_units ×
 * building_unit_owners）を jsonb 集約した SELECT 句。
 * 持分・敷地権割合は land_owners と同じ「分子/分母」文字列に組み立てる。
 * パラメータを持たないので sql.unsafe で使う。
 */
export const BUILDING_SELECT = `
    SELECT b.*,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'name', o.name,
                      'share', CASE WHEN o.share_num IS NOT NULL
                                    THEN o.share_num || '/' || o.share_den ELSE '' END
                    ) ORDER BY o.id)
               FROM building_owners o WHERE o.building_id = b.id
           ), '[]'::jsonb) AS owners,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', u.id,
                      'unitNumber', u.unit_number,
                      'siteShare', CASE WHEN u.site_share_num IS NOT NULL
                                        THEN u.site_share_num || '/' || u.site_share_den ELSE '' END,
                      'description', u.description,
                      'owners', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                                 'name', uo.name,
                                 'share', CASE WHEN uo.share_num IS NOT NULL
                                               THEN uo.share_num || '/' || uo.share_den ELSE '' END
                               ) ORDER BY uo.id)
                          FROM building_unit_owners uo WHERE uo.unit_id = u.id
                      ), '[]'::jsonb)
                    ) ORDER BY u.id)
               FROM building_units u WHERE u.building_id = b.id
           ), '[]'::jsonb) AS units
      FROM buildings b
`;

/** POST / PATCH で受け付ける専有部分の形（id はサーバ採番なので受け取らない）。 */
export interface UnitInput {
  unitNumber?: string;
  owners?: Owner[];
  siteShare?: string;
  description?: string;
}

interface BuildingFields {
  name?: string;
  houseNumber?: string;
  structure?: string;
  floorAreaTsubo?: number | null;
  ownershipType?: string;
  owners?: Owner[];
  units?: UnitInput[];
  description?: string;
}

function parseOwnershipType(value: unknown): BuildingOwnershipType {
  if (value !== "sole" && value !== "kubun") {
    throw new ApiError(400, "不正な所有形態です");
  }
  return value;
}

/** 延床面積: null はクリア、数値は 0 以上のみ受け付ける。 */
function parseFloorArea(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, "延床面積は 0 以上の数値で入力してください");
  }
  return n;
}

/** 専有部分を全置換する（DELETE 旧 + INSERT 新。区分所有者も入れ替え）。 */
async function replaceUnits(
  db: SqlLike,
  buildingId: string,
  units: UnitInput[] | undefined | null,
): Promise<void> {
  await db`DELETE FROM building_units WHERE building_id = ${buildingId}`;
  for (const u of units ?? []) {
    const unitNumber = (u?.unitNumber ?? "").trim();
    if (!unitNumber) throw new ApiError(400, "専有部分の部屋番号は必須です");
    const [num, den] = parseShare(u?.siteShare);
    let inserted: { id: number }[];
    try {
      inserted = await db<{ id: number }[]>`
        INSERT INTO building_units (building_id, unit_number, site_share_num, site_share_den, description)
        VALUES (${buildingId}, ${unitNumber}, ${num}, ${den}, ${u?.description ?? ""})
        RETURNING id
      `;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ApiError(409, `部屋番号「${unitNumber}」が重複しています`);
      }
      throw e;
    }
    await replaceUnitOwners(db, inserted[0].id, u?.owners);
  }
}

/** 案件 × 土地の存在を確認する。なければ 404。 */
async function assertLand(
  db: SqlLike,
  projectId: number,
  landId: string,
): Promise<void> {
  const rows = await db`
    SELECT 1 FROM lands WHERE id = ${landId} AND project_id = ${projectId}
  `;
  if (rows.length === 0) throw new ApiError(404, "土地が見つかりません");
}

/** 案件 × 土地に属する建物行（owners/units 集約済み）を引く。なければ 404。 */
async function fetchBuildingJoined(
  db: SqlLike,
  projectId: number,
  landId: string,
  buildingId: string,
): Promise<BuildingRow> {
  const rows = await db.unsafe<BuildingRow[]>(
    BUILDING_SELECT +
      ` JOIN lands l ON l.id = b.land_id
        WHERE b.id = $1 AND b.land_id = $2 AND l.project_id = $3`,
    [buildingId, landId, projectId] as never[],
  );
  if (rows.length === 0) throw new ApiError(404, "建物が見つかりません");
  return rows[0];
}

export async function createBuilding(
  projectId: string,
  landId: string,
  fields: BuildingFields,
): Promise<Building> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);

  return sql.begin(async (tx) => {
    await assertLand(tx, pid, landId);

    const ownershipType = parseOwnershipType(fields.ownershipType ?? "sole");
    if (ownershipType === "sole" && (fields.units?.length ?? 0) > 0) {
      throw new ApiError(400, "一棟所有の建物に専有部分は設定できません");
    }
    if (ownershipType === "kubun" && (fields.owners?.length ?? 0) > 0) {
      throw new ApiError(400, "区分所有の建物の所有者は専有部分ごとに設定してください");
    }
    const buildingId = uuid();
    await tx`
      INSERT INTO buildings (id, land_id, name, house_number, structure,
                             floor_area_tsubo, ownership_type, description)
      VALUES (${buildingId}, ${landId}, ${(fields.name ?? "").trim()},
              ${(fields.houseNumber ?? "").trim()}, ${(fields.structure ?? "").trim()},
              ${parseFloorArea(fields.floorAreaTsubo)}, ${ownershipType},
              ${fields.description ?? ""})
    `;
    if (ownershipType === "sole") {
      await replaceBuildingOwners(tx, buildingId, fields.owners);
    } else {
      await replaceUnits(tx, buildingId, fields.units);
    }
    await tx`UPDATE lands SET updated_at = now() WHERE id = ${landId}`;
    await tx`UPDATE projects SET updated_at = now() WHERE id = ${pid}`;
    const row = await fetchBuildingJoined(tx, pid, landId, buildingId);
    return buildingJson(row);
  });
}

export async function updateBuilding(
  projectId: string,
  landId: string,
  buildingId: string,
  fields: Record<string, unknown>,
): Promise<Building> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);

  return sql.begin(async (tx) => {
    const cur = await fetchBuildingJoined(tx, pid, landId, buildingId);

    // 所有形態の変更を先に確定し、owners / units が最終形態と矛盾しないか検査する
    const finalType =
      "ownershipType" in fields
        ? parseOwnershipType(fields.ownershipType)
        : cur.ownership_type;
    if ("owners" in fields && finalType !== "sole") {
      throw new ApiError(400, "区分所有の建物の所有者は専有部分ごとに設定してください");
    }
    if ("units" in fields && finalType !== "kubun") {
      throw new ApiError(400, "一棟所有の建物に専有部分は設定できません");
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if ("name" in fields) set("name", String(fields.name ?? "").trim());
    if ("houseNumber" in fields) set("house_number", String(fields.houseNumber ?? "").trim());
    if ("structure" in fields) set("structure", String(fields.structure ?? "").trim());
    if ("floorAreaTsubo" in fields) set("floor_area_tsubo", parseFloorArea(fields.floorAreaTsubo));
    if ("description" in fields) set("description", fields.description ?? "");
    if ("ownershipType" in fields) set("ownership_type", finalType);
    sets.push("updated_at = now()");
    params.push(buildingId);
    await tx.unsafe(
      `UPDATE buildings SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params as never[],
    );

    // 所有形態が変わったら、旧形態側の所有者情報を破棄して不変条件を保つ
    if (finalType !== cur.ownership_type) {
      if (finalType === "sole") {
        await tx`DELETE FROM building_units WHERE building_id = ${buildingId}`;
      } else {
        await tx`DELETE FROM building_owners WHERE building_id = ${buildingId}`;
      }
    }
    if ("owners" in fields) {
      await replaceBuildingOwners(
        tx,
        buildingId,
        Array.isArray(fields.owners) ? (fields.owners as Owner[]) : [],
      );
    }
    if ("units" in fields) {
      await replaceUnits(
        tx,
        buildingId,
        Array.isArray(fields.units) ? (fields.units as UnitInput[]) : [],
      );
    }
    const row = await fetchBuildingJoined(tx, pid, landId, buildingId);
    return buildingJson(row);
  });
}

export async function deleteBuilding(
  projectId: string,
  landId: string,
  buildingId: string,
): Promise<void> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);
  const res = await sql`
    DELETE FROM buildings b
     USING lands l
     WHERE b.id = ${buildingId} AND b.land_id = ${landId}
       AND l.id = b.land_id AND l.project_id = ${pid}
  `;
  if (res.count === 0) throw new ApiError(404, "建物が見つかりません");
}
