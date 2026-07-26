// ============================================================
// ブラウザ用 API クライアント（旧 data.js の DataStore の API 部分）
// /api/* を叩き、失敗時はサーバの日本語エラーメッセージを throw する。
// ローカル配列への反映は行わない（TanStack Query のキャッシュが正本）。
// ============================================================

"use client";

import type {
  Project,
  Land,
  Visit,
  Owner,
  ParcelTown,
  ParcelSummary,
  ParcelWithPolygon,
  LatLng,
  LandStatus,
} from "./types";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* JSON でないエラー応答はステータスのまま */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ----- 読み出し -----
export const fetchProjects = () => api<Project[]>("GET", "/api/projects");
export const fetchParcelTowns = () => api<ParcelTown[]>("GET", "/api/parcel-towns");
export const fetchParcelsByTown = (town: string) =>
  api<ParcelSummary[]>("GET", `/api/parcels?town=${encodeURIComponent(town)}`);
export const fetchParcelsByTownWithPolygons = (town: string) =>
  api<ParcelWithPolygon[]>(
    "GET",
    `/api/parcels?town=${encodeURIComponent(town)}&geometry=1`,
  );

// ----- 案件 CRUD -----
export const createProject = (fields: {
  name: string;
  description?: string;
  polygon?: LatLng[] | null;
}) => api<Project>("POST", "/api/projects", fields);

export const updateProject = (projectId: string, fields: Partial<Project>) =>
  api<Project>("PATCH", `/api/projects/${encodeURIComponent(projectId)}`, fields);

export const deleteProject = (projectId: string) =>
  api<null>("DELETE", `/api/projects/${encodeURIComponent(projectId)}`);

// ----- 土地 CRUD -----
export const createLand = (
  projectId: string,
  fields: {
    parcelId: number;
    status?: LandStatus;
    owners?: Owner[];
    description?: string;
  },
) =>
  api<Land>("POST", `/api/projects/${encodeURIComponent(projectId)}/lands`, fields);

export const updateLand = (
  projectId: string,
  landId: string,
  fields: Partial<Land>,
) =>
  api<Land>(
    "PATCH",
    `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}`,
    fields,
  );

export const deleteLand = (projectId: string, landId: string) =>
  api<null>(
    "DELETE",
    `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}`,
  );

// ----- 訪問記録 -----
export const addVisit = (
  projectId: string,
  landId: string,
  fields: Partial<Visit>,
) =>
  api<Visit>(
    "POST",
    `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}/visits`,
    fields,
  );

// ----- リセット -----
export const resetSamples = () => api<{ ok: true }>("POST", "/api/reset");
