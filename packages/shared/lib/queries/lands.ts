// ============================================================
// 土地 CRUD（db.py の create_land / update_land / delete_land の移植）
// 土地は筆マスタ参照 parcelId でのみ作成・変更できる（不変条件）。
// データに無い筆は、案件の公図を下地に描いた領域を筆マスタへ「手動の筆」として
// 登録してから参照する（manualParcel。Issue #44）。
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
import { fetchDocumentsByLand } from "./documents";
import { LAND_SELECT } from "./projects";
import { landJson, type LandRow } from "./serialize";
import type {
  Building,
  Land,
  LandStatus,
  LatLng,
  ManualParcelInput,
  Mortgage,
  Owner,
} from "../types";

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

/** 描いた領域を検証して GeoJSON Polygon（[lng,lat]・閉じた環）にする。不正は 400。 */
function manualGeometry(polygon: unknown): GeoJsonPolygon {
  const pts = Array.isArray(polygon) ? (polygon as unknown[]) : [];
  const ring: LatLng[] = [];
  for (const p of pts) {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1]) ||
      Math.abs(p[0]) > 90 ||
      Math.abs(p[1]) > 180
    ) {
      throw new ApiError(400, "筆の領域が不正です");
    }
    ring.push([p[0], p[1]]);
  }
  // 描画ツールによっては始点を末尾に繰り返すので取り除いてから数える
  const f = ring[0];
  const l = ring[ring.length - 1];
  if (ring.length > 1 && f[0] === l[0] && f[1] === l[1]) ring.pop();
  if (ring.length < 3) throw new ApiError(400, "筆の領域は 3 点以上で描いてください");
  if (!(polygonAreaM2(ring) > 0)) throw new ApiError(400, "筆の領域の面積が 0 です");
  const coords = ring.map(([lat, lng]) => [lng, lat]);
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

/**
 * 公図から描いた筆を筆マスタへ手動の筆として登録する（土地追加と同じトランザクション内）。
 * 町名＋地番はマスタの筆と同じく一意で、既にあれば 409（筆選択から追加してもらう）。
 */
async function createManualParcel(db: SqlLike, input: ManualParcelInput): Promise<ParcelRow> {
  const town = typeof input?.town === "string" ? input.town.trim() : "";
  const chiban = typeof input?.chiban === "string" ? input.chiban.trim() : "";
  if (!town) throw new ApiError(400, "町名を選択してください");
  if (!chiban) throw new ApiError(400, "地番を入力してください");
  if (chiban.length > 50) throw new ApiError(400, "地番が長すぎます");
  const geometry = manualGeometry(input.polygon);

  const towns = await db<{ id: number }[]>`SELECT id FROM chibankuiki WHERE name = ${town}`;
  if (towns.length === 0) throw new ApiError(400, "町名が住所マスタにありません");
  if (towns.length > 1) throw new ApiError(400, "同じ名前の町名が複数あり特定できません");

  const [dup] = await db<{ id: number }[]>`
    SELECT id FROM parcels WHERE chibankuiki_id = ${towns[0].id} AND chiban = ${chiban}
  `;
  if (dup) {
    throw new ApiError(
      409,
      `${town} ${chiban} の筆はすでに筆マスタにあります。「筆を選択」から追加してください`,
    );
  }
  const [row] = await db<ParcelRow[]>`
    INSERT INTO parcels (chibankuiki_id, chiban, geometry, source)
    VALUES (${towns[0].id}, ${chiban}, ${db.json(geometry as never)}, 'manual')
    RETURNING id, geometry
  `;
  return row;
}

interface CreateLandFields {
  parcelId?: unknown;
  /** parcelId の代わりに渡すと、公図から描いた筆を筆マスタに登録してから参照する。 */
  manualParcel?: ManualParcelInput;
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

    const parcel = fields.manualParcel
      ? await createManualParcel(tx, fields.manualParcel)
      : await fetchParcel(tx, fields.parcelId);
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
    return landJson(row, [], buildings, []);
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
    const documents = (await fetchDocumentsByLand(tx, [landId])).get(landId) ?? [];
    return landJson(row, undefined, buildings, documents); // visits はクライアント側で保持
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
