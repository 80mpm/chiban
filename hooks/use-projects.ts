"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as api from "@/lib/data-client";
import type { Project, Land, Building, Visit } from "@/lib/types";

export const PROJECTS_KEY = ["projects"] as const;

/** 全案件ツリー。Server Component から initialData を渡してハイドレートする。 */
export function useProjects(initialData?: Project[]) {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: api.fetchProjects,
    initialData,
  });
}

/** キャッシュ上の案件配列を関数で書き換える。 */
function patch(qc: QueryClient, fn: (projects: Project[]) => Project[]) {
  qc.setQueryData<Project[]>(PROJECTS_KEY, (prev) => (prev ? fn(prev) : prev));
}

const replaceProject = (projects: Project[], updated: Project) =>
  projects.map((p) =>
    p.id === updated.id ? { ...p, ...updated, lands: p.lands } : p,
  );

const mapProjectLands = (
  projects: Project[],
  projectId: string,
  fn: (lands: Land[]) => Land[],
) =>
  projects.map((p) =>
    p.id === projectId ? { ...p, lands: fn(p.lands ?? []) } : p,
  );

const mapLandBuildings = (
  projects: Project[],
  projectId: string,
  landId: string,
  fn: (buildings: Building[]) => Building[],
) =>
  mapProjectLands(projects, projectId, (ls) =>
    ls.map((l) => (l.id === landId ? { ...l, buildings: fn(l.buildings ?? []) } : l)),
  );

/**
 * 案件・土地・訪問の CRUD。サーバ応答を正本に TanStack Query のキャッシュへ反映する
 * （旧 data.js DataStore の「ローカル配列へ反映」と同型）。
 */
export function useProjectMutations() {
  const qc = useQueryClient();

  const createProject = useMutation({
    mutationFn: api.createProject,
    onSuccess: (proj) => patch(qc, (ps) => [...ps, proj]),
  });

  const updateProject = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<Project> }) =>
      api.updateProject(id, fields),
    onSuccess: (proj) => patch(qc, (ps) => replaceProject(ps, proj)),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: (_r, id) => patch(qc, (ps) => ps.filter((p) => p.id !== id)),
  });

  const createLand = useMutation({
    mutationFn: ({
      projectId,
      fields,
    }: {
      projectId: string;
      fields: Parameters<typeof api.createLand>[1];
    }) => api.createLand(projectId, fields),
    onSuccess: (land, { projectId }) =>
      patch(qc, (ps) => mapProjectLands(ps, projectId, (ls) => [...ls, land])),
  });

  const updateLand = useMutation({
    mutationFn: ({
      projectId,
      landId,
      fields,
    }: {
      projectId: string;
      landId: string;
      fields: Partial<Land>;
    }) => api.updateLand(projectId, landId, fields),
    onSuccess: (land, { projectId }) =>
      patch(qc, (ps) =>
        mapProjectLands(ps, projectId, (ls) =>
          ls.map((l) =>
            l.id === land.id
              ? { ...l, ...land, visits: l.visits, buildings: l.buildings }
              : l,
          ),
        ),
      ),
  });

  const deleteLand = useMutation({
    mutationFn: ({ projectId, landId }: { projectId: string; landId: string }) =>
      api.deleteLand(projectId, landId),
    onSuccess: (_r, { projectId, landId }) =>
      patch(qc, (ps) =>
        mapProjectLands(ps, projectId, (ls) => ls.filter((l) => l.id !== landId)),
      ),
  });

  const createBuilding = useMutation({
    mutationFn: ({
      projectId,
      landId,
      fields,
    }: {
      projectId: string;
      landId: string;
      fields: api.BuildingInput;
    }) => api.createBuilding(projectId, landId, fields),
    onSuccess: (building, { projectId, landId }) =>
      patch(qc, (ps) =>
        mapLandBuildings(ps, projectId, landId, (bs) => [...bs, building]),
      ),
  });

  const updateBuilding = useMutation({
    mutationFn: ({
      projectId,
      landId,
      buildingId,
      fields,
    }: {
      projectId: string;
      landId: string;
      buildingId: string;
      fields: api.BuildingInput;
    }) => api.updateBuilding(projectId, landId, buildingId, fields),
    onSuccess: (building, { projectId, landId }) =>
      patch(qc, (ps) =>
        mapLandBuildings(ps, projectId, landId, (bs) =>
          bs.map((b) => (b.id === building.id ? building : b)),
        ),
      ),
  });

  const deleteBuilding = useMutation({
    mutationFn: ({
      projectId,
      landId,
      buildingId,
    }: {
      projectId: string;
      landId: string;
      buildingId: string;
    }) => api.deleteBuilding(projectId, landId, buildingId),
    onSuccess: (_r, { projectId, landId, buildingId }) =>
      patch(qc, (ps) =>
        mapLandBuildings(ps, projectId, landId, (bs) =>
          bs.filter((b) => b.id !== buildingId),
        ),
      ),
  });

  const addVisit = useMutation({
    mutationFn: ({
      projectId,
      landId,
      fields,
    }: {
      projectId: string;
      landId: string;
      fields: Partial<Visit>;
    }) => api.addVisit(projectId, landId, fields),
    onSuccess: (visit, { projectId, landId }) =>
      patch(qc, (ps) =>
        mapProjectLands(ps, projectId, (ls) =>
          ls.map((l) =>
            l.id === landId
              ? {
                  ...l,
                  visits: [...(l.visits ?? []), visit],
                  updatedAt: visit.date,
                }
              : l,
          ),
        ),
      ),
  });

  return {
    createProject,
    updateProject,
    deleteProject,
    createLand,
    updateLand,
    deleteLand,
    createBuilding,
    updateBuilding,
    deleteBuilding,
    addVisit,
  };
}
