// ============================================================
// 土地 CRUD（db.py の create_land / update_land / delete_land の移植）
// 土地は筆マスタ参照 parcelId でのみ作成・変更できる（不変条件）。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { uuid } from "../db/ids";
import { ApiError, isUniqueViolation } from "../api-error";
import { parcelRing, polygonAreaM2, type GeoJsonPolygon } from "../geo";
import { parseProjectId, parseParcelId } from "./helpers";
import { replaceOwners } from "./owners";
import { replaceMortgagesInto } from "./mortgages";
import { replaceBuildings, fetchBuildingsByLand } from "./buildings";
import { LAND_SELECT } from "./projects";
import { landJson, type LandRow } from "./serialize";
import type { Building, Land, LandStatus, Mortgage, Owner } from "../types";

type SqlLike = Sql | TransactionSql;

interface ParcelRow {
  id: number;
  geometry: GeoJsonPolygon;
}

/** parcelId で筆マスタを引く。なければ 400。 */
async function fetchParcel(db: SqlLike, parcelId: unknown): Promise<ParcelRow> {
  const [row] = await db<ParcelRow[]>`
    SELECT * FROM parcels WHERE id = ${parseParcelId(parcelId)}
  `;
  if (!row) throw new ApiError(400, "筆マスタに存在しない筆です");
  return row;
}

/** 案件 × 土地で JOIN 済みの土地行を引く。なければ 404。 */
async function fetchLandJoined(
  db: SqlLike,
  projectId: number,
  landId: string,
): Promise<LandRow> {
  const rows = await db.unsafe<LandRow[]>(
    LAND_SELECT + " WHERE l.project_id = $1 AND l.id = $2",
    [projectId, landId] as never[],
  );
  if (rows.length === 0) throw new ApiError(404, "土地が見つかりません");
  return rows[0];
}

interface CreateLandFields {
  parcelId?: unknown;
  status?: string;
  owners?: Owner[];
  description?: string;
  areaM2?: number | null;
  mortgages?: Mortgage[];
  buildings?: Building[];
}

export async function createLand(
  projectId: string,
  fields: CreateLandFields,
): Promise<Land> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);

  return sql.begin(async (tx) => {
    const proj = await tx`SELECT 1 FROM projects WHERE id = ${pid}`;
    if (proj.length === 0) throw new ApiError(404, "案件が見つかりません");

    const parcel = await fetchParcel(tx, fields.parcelId);
    const status = (fields.status ?? "target") as LandStatus;
    if (status !== "target" && status !== "acquired") {
      throw new ApiError(400, "不正なステータスです");
    }
    const area =
      fields.areaM2 ?? polygonAreaM2(parcelRing(parcel.geometry));
    const landId = uuid();

    try {
      await tx`
        INSERT INTO lands (id, project_id, parcel_id, description, area_m2, status)
        VALUES (${landId}, ${pid}, ${parcel.id}, ${fields.description ?? ""}, ${area}, ${status})
      `;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ApiError(409, "この筆はすでにこの案件に追加済みです");
      }
      throw e;
    }
    await replaceOwners(tx, landId, fields.owners);
    await replaceMortgagesInto(tx, "land_mortgages", "land_id", landId, fields.mortgages);
    await replaceBuildings(tx, landId, fields.buildings);
    await tx`UPDATE projects SET updated_at = now() WHERE id = ${pid}`;
    const row = await fetchLandJoined(tx, pid, landId);
    const buildings = (await fetchBuildingsByLand(tx, [landId])).get(landId) ?? [];
    return landJson(row, [], buildings);
  });
}

export async function updateLand(
  projectId: string,
  landId: string,
  fields: Record<string, unknown>,
): Promise<Land> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);

  return sql.begin(async (tx) => {
    const land = await fetchLandJoined(tx, pid, landId);

    const sets: string[] = [];
    const params: unknown[] = [];

    // 筆の付け替え: マスタに存在する parcelId のみ受け付け、坪数を再導出する
    if (
      fields.parcelId !== undefined &&
      fields.parcelId !== null &&
      parseParcelId(fields.parcelId) !== land.parcel_id
    ) {
      const parcel = await fetchParcel(tx, fields.parcelId);
      params.push(parcel.id);
      sets.push(`parcel_id = $${params.length}`);
      params.push(polygonAreaM2(parcelRing(parcel.geometry)));
      sets.push(`area_m2 = $${params.length}`);
    }
    if ("owners" in fields) {
      await replaceOwners(
        tx,
        landId,
        Array.isArray(fields.owners) ? (fields.owners as Owner[]) : [],
      );
    }
    if ("mortgages" in fields) {
      await replaceMortgagesInto(
        tx,
        "land_mortgages",
        "land_id",
        landId,
        Array.isArray(fields.mortgages) ? (fields.mortgages as Mortgage[]) : [],
      );
    }
    if ("buildings" in fields) {
      await replaceBuildings(
        tx,
        landId,
        Array.isArray(fields.buildings) ? (fields.buildings as Building[]) : [],
      );
    }
    if ("description" in fields) {
      params.push(fields.description ?? "");
      sets.push(`description = $${params.length}`);
    }
    if ("areaM2" in fields && fields.areaM2 !== null && fields.areaM2 !== undefined) {
      params.push(fields.areaM2);
      sets.push(`area_m2 = $${params.length}`);
    }
    if ("status" in fields) {
      if (fields.status !== "target" && fields.status !== "acquired") {
        throw new ApiError(400, "不正なステータスです");
      }
      params.push(fields.status);
      sets.push(`status = $${params.length}`);
    }
    sets.push("updated_at = now()");
    params.push(landId);

    try {
      await tx.unsafe(
        `UPDATE lands SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params as never[],
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ApiError(409, "この筆はすでにこの案件に追加済みです");
      }
      throw e;
    }
    const row = await fetchLandJoined(tx, pid, landId);
    const buildings = (await fetchBuildingsByLand(tx, [landId])).get(landId) ?? [];
    return landJson(row, undefined, buildings); // visits はクライアント側で保持
  });
}

export async function deleteLand(
  projectId: string,
  landId: string,
): Promise<void> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);
  const res = await sql`
    DELETE FROM lands WHERE project_id = ${pid} AND id = ${landId}
  `;
  if (res.count === 0) throw new ApiError(404, "土地が見つかりません");
}
