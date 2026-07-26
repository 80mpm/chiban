// ============================================================
// 筆マスタの読み出し（db.py の get_parcel_towns / get_parcels_by_town /
// get_parcels の移植）。
// ============================================================

import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { parcelRing, type GeoJsonPolygon } from "../geo";
import type { ParcelTown, ParcelSummary, ParcelWithPolygon } from "../types";

/** 町名（地番区域）の一覧と筆数。プルダウン用。 */
export async function getParcelTowns(): Promise<ParcelTown[]> {
  await ensureDbReady();
  const rows = await sql<{ name: string; n: number }[]>`
    SELECT c.name, count(*)::int AS n
      FROM parcels p JOIN chibankuiki c ON c.id = p.chibankuiki_id
     GROUP BY c.id, c.name ORDER BY c.name
  `;
  return rows.map((r) => ({ name: r.name, count: r.n }));
}

/**
 * 指定町名の筆一覧。属性のみ（parcelId と地番）。
 * withGeometry=true で領域 [[lat,lng]] 付き（土地の追加モードの候補筆表示用）。
 */
export async function getParcelsByTown(
  town: string,
  withGeometry = false,
): Promise<ParcelSummary[] | ParcelWithPolygon[]> {
  await ensureDbReady();
  if (withGeometry) {
    const rows = await sql<{ id: number; chiban: string; geometry: GeoJsonPolygon }[]>`
      SELECT p.id, p.chiban, p.geometry
        FROM parcels p JOIN chibankuiki c ON c.id = p.chibankuiki_id
       WHERE c.name = ${town} ORDER BY p.id
    `;
    return rows.map((r) => ({
      parcelId: r.id,
      chiban: r.chiban,
      polygon: parcelRing(r.geometry),
    }));
  }
  const rows = await sql<{ id: number; chiban: string }[]>`
    SELECT p.id, p.chiban
      FROM parcels p JOIN chibankuiki c ON c.id = p.chibankuiki_id
     WHERE c.name = ${town} ORDER BY p.id
  `;
  return rows.map((r) => ({ parcelId: r.id, chiban: r.chiban }));
}

/** 筆マスタ全件を GeoJSON FeatureCollection で返す（デバッグ用）。 */
export async function getParcels(): Promise<{ features: unknown[] }> {
  await ensureDbReady();
  const rows = await sql<
    {
      id: number;
      chibankuiki_id: number;
      town_name: string;
      chiban: string;
      geometry: GeoJsonPolygon;
    }[]
  >`
    SELECT p.*, c.name AS town_name
      FROM parcels p JOIN chibankuiki c ON c.id = p.chibankuiki_id
     ORDER BY p.id
  `;
  const features = rows.map((r) => ({
    type: "Feature",
    properties: {
      parcelId: r.id,
      chibankuikiId: r.chibankuiki_id,
      chibankuikiName: r.town_name,
      chiban: r.chiban,
    },
    geometry: r.geometry,
  }));
  return { features };
}
