// ============================================================
// JSON シリアライズ（db.py の _num/_iso/_*_json の移植）
// DB 行（snake_case・Date・numeric は文字列）→ フロントの camelCase JSON。
// ============================================================

import { parcelRing, m2ToTsubo, type GeoJsonPolygon } from "../geo";
import type { Land, Project, Visit, Building, FrontRoad, Mortgage, Owner, LatLng } from "../types";

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

/** date 型の列（Date または 'YYYY-MM-DD' 文字列）→ 'YYYY-MM-DD'。未設定は ''。 */
export function dateOnly(v: Date | string | null): string {
  if (!v) return "";
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
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

/** BUILDING_SELECT が返す行（buildings + building_owners / building_mortgages 集約）。 */
export interface BuildingRow {
  id: string;
  land_id: string;
  kaoku_number: string;
  structure: string;
  usage: string;
  floor_area: string | number | null;
  built_date: Date | string | null;
  description: string;
  owners: Owner[];
  mortgages: MortgageRow[];
  created_at: Date | null;
  updated_at: Date | null;
}

/** 集約サブクエリが返す抵当権（date は to_char 済み・amount は numeric 由来）。 */
export interface MortgageRow {
  date: string;
  amount: string | number | null;
  holder: string;
}

/** jsonb 集約の抵当権行 → API 形（amount を数値化）。 */
export function mortgagesJson(rows: MortgageRow[]): Mortgage[] {
  return rows.map((m) => ({ date: m.date, amount: num(m.amount), holder: m.holder }));
}

export function buildingJson(row: BuildingRow): Building {
  return {
    id: row.id,
    kaokuNumber: row.kaoku_number,
    structure: row.structure,
    usage: row.usage,
    floorArea: num(row.floor_area),
    builtDate: dateOnly(row.built_date),
    description: row.description,
    owners: row.owners,
    mortgages: mortgagesJson(row.mortgages),
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
  mortgages: MortgageRow[];
  description: string;
  area_m2: string | number | null;
  status: Land["status"];
  created_at: Date | null;
  updated_at: Date | null;
  geometry: GeoJsonPolygon;
}

export function landJson(row: LandRow, visits?: Visit[], buildings?: Building[]): Land {
  const areaM2 = num(row.area_m2);
  const land: Land = {
    id: row.id,
    parcelId: row.parcel_id,
    aza: row.aza,
    chiban: row.chiban,
    owners: row.owners,
    mortgages: mortgagesJson(row.mortgages),
    description: row.description,
    areaM2,
    areaTsubo: m2ToTsubo(areaM2),
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
  staff: string | null;
  current_bcr: string | number | null;
  current_far: string | number | null;
  target_far: string | number | null;
  zoning: string | null;
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
    staff: row.staff,
    currentBcr: num(row.current_bcr),
    currentFar: num(row.current_far),
    targetFar: num(row.target_far),
    zoning: row.zoning,
    frontRoads: row.front_roads,
  };
  if (lands !== undefined) proj.lands = lands;
  return proj;
}
