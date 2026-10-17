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
  User,
  UserRole,
  RegistryDocument,
  DocumentKind,
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

// ----- ユーザー管理（入力システムのみ） -----
export const fetchUsers = () => api<User[]>("GET", "/api/users");

export const createUser = (fields: {
  loginId: string;
  name: string;
  role: UserRole;
  password: string;
}) => api<User>("POST", "/api/users", fields);

export const updateUser = (
  userId: string,
  fields: {
    loginId?: string;
    name?: string;
    role?: UserRole;
    isActive?: boolean;
    password?: string;
  },
) => api<User>("PATCH", `/api/users/${encodeURIComponent(userId)}`, fields);

// ----- リセット -----
export const resetSamples = () => api<{ ok: true }>("POST", "/api/reset");

// ----- 登記簿等の添付ファイル（入力システムのみ） -----

/** multipart/form-data で 1 ファイルを送る（JSON 用の api() とは別経路）。 */
async function upload<T>(method: string, path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(path, { method, body });
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

/**
 * 添付ファイルのベースパス。buildingId を渡すと建物の登記簿になる。
 * ダウンロードリンクの href もこれを使う。
 */
export function documentsPath(
  projectId: string,
  landId: string,
  buildingId?: string,
): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}`;
  return buildingId
    ? `${base}/buildings/${encodeURIComponent(buildingId)}/documents`
    : `${base}/documents`;
}

export const uploadDocument = (
  projectId: string,
  landId: string,
  file: File,
  buildingId?: string,
  kind: DocumentKind = "registry",
) =>
  upload<RegistryDocument>(
    "POST",
    // 公図は建物にのみ添付でき、種別をクエリで渡す（既定の登記簿は付けない）
    documentsPath(projectId, landId, buildingId) + (kind === "registry" ? "" : `?kind=${kind}`),
    file,
  );

export const replaceDocument = (
  projectId: string,
  landId: string,
  documentId: string,
  file: File,
  buildingId?: string,
) =>
  upload<RegistryDocument>(
    "PUT",
    `${documentsPath(projectId, landId, buildingId)}/${encodeURIComponent(documentId)}`,
    file,
  );

export const deleteDocument = (
  projectId: string,
  landId: string,
  documentId: string,
  buildingId?: string,
) =>
  api<null>(
    "DELETE",
    `${documentsPath(projectId, landId, buildingId)}/${encodeURIComponent(documentId)}`,
  );
