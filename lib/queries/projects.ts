// ============================================================
// 案件の読み出しクエリ（db.py の get_projects_tree / _LAND_SELECT の移植）
// CRUD（create/update/delete）は PR3 で追加する。
// ============================================================

import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { ApiError } from "../api-error";
import { parseProjectId } from "./helpers";
import { fetchBuildingsByLand } from "./buildings";
import { ownersSelect } from "./owners";
import { mortgagesSelect } from "./mortgages";
import {
  landJson,
  projectJson,
  visitJson,
  type LandRow,
  type ProjectRow,
  type VisitRow,
} from "./serialize";
import type { Project, Visit, Land, Building } from "../types";

/**
 * lands × parcels × chibankuiki を JOIN し、owners / mortgages を子テーブルから
 * jsonb_agg で集約する SELECT 句。aza/chiban/geometry を導出し、
 * owners・mortgages は id 順（追加順）で組み立てる。
 * パラメータを持たないので sql.unsafe で使う。
 */
export const LAND_SELECT = `
    SELECT l.*, c.name AS aza, p.chiban, p.geometry,
           ${ownersSelect("land_owners", "land_id", "l")},
           ${mortgagesSelect("land_mortgages", "land_id", "l")}
      FROM lands l
      JOIN parcels p ON p.id = l.parcel_id
      JOIN chibankuiki c ON c.id = p.chibankuiki_id
`;

/** 全案件を lands・visits 込みのツリーで返す（3 クエリで組み立て）。 */
export async function getProjectsTree(): Promise<Project[]> {
  await ensureDbReady();

  const projRows = await sql<ProjectRow[]>`SELECT * FROM projects ORDER BY id`;
  const landRows = await sql.unsafe<LandRow[]>(
    LAND_SELECT + " ORDER BY l.project_id, l.created_at, l.id",
  );
  const visitRows = await sql<VisitRow[]>`
    SELECT * FROM visits ORDER BY land_id, date, id
  `;

  const visitsByLand = new Map<string, Visit[]>();
  for (const v of visitRows) {
    const landId = (v as VisitRow & { land_id: string }).land_id;
    if (!visitsByLand.has(landId)) visitsByLand.set(landId, []);
    visitsByLand.get(landId)!.push(visitJson(v));
  }

  const buildingsByLand = await fetchBuildingsByLand(sql);
  const emptyBuildings: Building[] = [];

  const landsByProj = new Map<number, Land[]>();
  for (const l of landRows) {
    if (!landsByProj.has(l.project_id)) landsByProj.set(l.project_id, []);
    landsByProj
      .get(l.project_id)!
      .push(landJson(l, visitsByLand.get(l.id) ?? [], buildingsByLand.get(l.id) ?? emptyBuildings));
  }

  return projRows.map((p) => projectJson(p, landsByProj.get(p.id) ?? []));
}

// ============================================================
// 案件 CRUD（db.py の create_project / update_project / delete_project の移植）
// ============================================================

interface ProjectFields {
  name?: string;
  description?: string;
  polygon?: unknown;
  address?: string | null;
  access?: string | null;
  staff?: string | null;
  currentBcr?: number | null;
  currentFar?: number | null;
  targetFar?: number | null;
  zoning?: string | null;
  frontRoads?: unknown;
}

export async function createProject(fields: ProjectFields): Promise<Project> {
  await ensureDbReady();
  const name = (fields.name ?? "").trim();
  if (!name) throw new ApiError(400, "案件名は必須です");
  const [row] = await sql<ProjectRow[]>`
    INSERT INTO projects (name, description, polygon)
    VALUES (
      ${name}, ${fields.description ?? ""},
      ${fields.polygon ? sql.json(fields.polygon as never) : null}
    ) RETURNING *
  `;
  return projectJson(row, []);
}

export async function updateProject(
  projectId: string,
  fields: Record<string, unknown>,
): Promise<Project> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);
  if ("name" in fields && !((fields.name as string) ?? "").trim()) {
    throw new ApiError(400, "案件名は必須です");
  }

  // 現在値を読み、PATCH に含まれたキーだけ上書きして全カラムを書き戻す。
  // jsonb 列は sql.json で渡す（安全テンプレートなので RETURNING で正しく parse される）。
  const [cur] = await sql<ProjectRow[]>`SELECT * FROM projects WHERE id = ${pid}`;
  if (!cur) throw new ApiError(404, "案件が見つかりません");

  const has = (k: string) => k in fields;
  const name = has("name") ? String(fields.name).trim() : cur.name;
  const description = has("description") ? (fields.description ?? "") : cur.description;
  const polygon = has("polygon") ? fields.polygon || null : cur.polygon;
  const address = has("address") ? (fields.address ?? null) : cur.address;
  const access = has("access") ? (fields.access ?? null) : cur.access;
  const staff = has("staff") ? (fields.staff ?? null) : cur.staff;
  const currentBcr = has("currentBcr") ? (fields.currentBcr ?? null) : cur.current_bcr;
  const currentFar = has("currentFar") ? (fields.currentFar ?? null) : cur.current_far;
  const targetFar = has("targetFar") ? (fields.targetFar ?? null) : cur.target_far;
  const zoning = has("zoning") ? (fields.zoning ?? null) : cur.zoning;
  const frontRoads = has("frontRoads")
    ? Array.isArray(fields.frontRoads)
      ? fields.frontRoads
      : []
    : cur.front_roads;

  const [row] = await sql<ProjectRow[]>`
    UPDATE projects SET
      name = ${name},
      description = ${description as never},
      polygon = ${polygon ? sql.json(polygon as never) : null},
      address = ${address as never},
      access = ${access as never},
      staff = ${staff as never},
      current_bcr = ${currentBcr as never},
      current_far = ${currentFar as never},
      target_far = ${targetFar as never},
      zoning = ${zoning as never},
      front_roads = ${sql.json(frontRoads as never)},
      updated_at = now()
    WHERE id = ${pid} RETURNING *
  `;
  return projectJson(row); // lands はクライアント側で保持しているので含めない
}

export async function deleteProject(projectId: string): Promise<void> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);
  const res = await sql`DELETE FROM projects WHERE id = ${pid}`;
  if (res.count === 0) throw new ApiError(404, "案件が見つかりません");
}
