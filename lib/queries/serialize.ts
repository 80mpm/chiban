// ============================================================
// JSON シリアライズ（db.py の _num/_iso/_*_json の移植）
// DB 行（snake_case・Date・numeric は文字列）→ フロントの camelCase JSON。
// ============================================================

import { parcelRing, type GeoJsonPolygon } from "../geo";
import type {
  Building,
  BuildingUnit,
  Land,
  Project,
  Visit,
  FrontRoad,
  Owner,
  LatLng,
} from "../types";

/**
 * numeric → JSON 数値。postgres.js は numeric を文字列で返すため数値化する。
 * 整数値は int 相当（JS の Number は 500.0 を 500 とシリアライズするので
 * db.py の「500.0% を避ける」挙動と一致する）。
 */
export function num(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number(v);
}

/** Date | string | null → ISO 文字列 | null。 */
export function iso(dt: Date | string | null): string | null {
  if (dt === null || dt === undefined) return null;
  return dt instanceof Date ? dt.toISOString() : String(dt);
}

export interface VisitRow {
  id: string;
  user_name: string;
  comment: string;
  date: Date | null;
  direct_or_tel: string;
  meeting_type: string;
  next_date: Date | null;
  progress: string;
  principal: string;
}

export function visitJson(row: VisitRow): Visit {
  return {
    id: row.id,
    user: row.user_name,
    comment: row.comment,
    date: iso(row.date),
    directOrTel: row.direct_or_tel,
    meetingType: row.meeting_type,
    nextDate: iso(row.next_date) ?? "",
    progress: row.progress,
    principal: row.principal,
  };
}

/** BUILDING_SELECT が返す行（buildings + owners/units の jsonb 集約）。 */
export interface BuildingRow {
  id: string;
  land_id: string;
  name: string;
  house_number: string;
  structure: string;
  floor_area_tsubo: string | number | null;
  ownership_type: Building["ownershipType"];
  description: string;
  created_at: Date | null;
  updated_at: Date | null;
  owners: Owner[];
  units: BuildingUnit[];
}

export function buildingJson(row: BuildingRow): Building {
  return {
    id: row.id,
    name: row.name,
    houseNumber: row.house_number,
    structure: row.structure,
    floorAreaTsubo: num(row.floor_area_tsubo),
    ownershipType: row.ownership_type,
    owners: row.owners,
    units: row.units,
    description: row.description,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** _LAND_SELECT が返す行（lands × parcels × chibankuiki の JOIN + owners 集約）。 */
export interface LandRow {
  id: string;
  project_id: number;
  parcel_id: number;
  aza: string;
  chiban: string;
  owners: Owner[];
  description: string;
  area_tsubo: string | number | null;
  status: Land["status"];
  created_at: Date | null;
  updated_at: Date | null;
  geometry: GeoJsonPolygon;
}

export function landJson(row: LandRow, visits?: Visit[], buildings?: Building[]): Land {
  const land: Land = {
    id: row.id,
    parcelId: row.parcel_id,
    aza: row.aza,
    chiban: row.chiban,
    owners: row.owners,
    description: row.description,
    areaTsubo: num(row.area_tsubo),
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    polygon: parcelRing(row.geometry),
  };
  if (visits !== undefined) land.visits = visits;
  if (buildings !== undefined) land.buildings = buildings;
  return land;
}

export interface ProjectRow {
  id: number;
  name: string;
  description: string;
  created_at: Date | null;
  updated_at: Date | null;
  polygon: LatLng[] | null;
  address: string | null;
  access: string | null;
  current_far: string | number | null;
  target_far: string | number | null;
  front_roads: FrontRoad[];
}

export function projectJson(row: ProjectRow, lands?: Land[]): Project {
  const proj: Project = {
    id: String(row.id),
    name: row.name,
    description: row.description,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    polygon: row.polygon,
    address: row.address,
    access: row.access,
    currentFar: num(row.current_far),
    targetFar: num(row.target_far),
    frontRoads: row.front_roads,
  };
  if (lands !== undefined) proj.lands = lands;
  return proj;
}
