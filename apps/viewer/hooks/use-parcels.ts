"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/data-client";
import { chibanSortKey } from "@/lib/format";
import type { ParcelSummary, ParcelWithPolygon } from "@/lib/types";

// 筆マスタは静的なのでセッション中ずっとキャッシュを使い回す。
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const;

/** 町名（地番区域）一覧。プルダウンの第一段。 */
export function useParcelTowns(enabled = true) {
  return useQuery({
    queryKey: ["parcel-towns"],
    queryFn: async () => {
      const towns = await api.fetchParcelTowns();
      return [...towns].sort((a, b) => a.name.localeCompare(b.name, "ja"));
    },
    enabled,
    ...STATIC,
  });
}

/** 指定町名の筆一覧（属性のみ・地番の自然順）。筆変更プルダウン用。 */
export function useParcelsByTown(town: string | null) {
  return useQuery({
    queryKey: ["parcels", town, "attrs"],
    queryFn: async (): Promise<ParcelSummary[]> => {
      const parcels = await api.fetchParcelsByTown(town!);
      return [...parcels].sort(
        (a, b) => chibanSortKey(a.chiban) - chibanSortKey(b.chiban),
      );
    },
    enabled: !!town,
    ...STATIC,
  });
}

/** 指定町名の筆一覧（領域付き・地番の自然順）。土地追加モードの候補筆表示用。 */
export function useParcelsByTownWithPolygons(town: string | null) {
  return useQuery({
    queryKey: ["parcels", town, "geometry"],
    queryFn: async (): Promise<ParcelWithPolygon[]> => {
      const parcels = await api.fetchParcelsByTownWithPolygons(town!);
      return [...parcels].sort(
        (a, b) => chibanSortKey(a.chiban) - chibanSortKey(b.chiban),
      );
    },
    enabled: !!town,
    ...STATIC,
  });
}
