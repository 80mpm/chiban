// ============================================================
// 表示・整形ヘルパー（旧 data.js / common.js のクライアント側ロジック）
// クライアント・サーバ双方から使える純関数。
// ============================================================

import type { Owner, LandStatus, BuildingOwnershipType } from "./types";

/** ステータス定義（label / color）。 */
export const STATUS_DEFS: Record<LandStatus, { label: string; color: string }> = {
  target: { label: "対象", color: "#94a3b8" },
  acquired: { label: "取得済", color: "#10b981" },
};

export const STATUS_KEYS: LandStatus[] = ["target", "acquired"];

/** 建物の所有形態定義（label / color）。 */
export const OWNERSHIP_TYPE_DEFS: Record<BuildingOwnershipType, { label: string; color: string }> = {
  sole: { label: "一棟所有", color: "#64748b" },
  kubun: { label: "区分所有", color: "#8b5cf6" },
};

export const OWNERSHIP_TYPE_KEYS: BuildingOwnershipType[] = ["sole", "kubun"];

/**
 * owners 配列を表示用文字列に整形する。
 * 例: [{name:'中嶋幸子',share:'1/2'},{name:'中嶋直美',share:'1/2'}]
 *     → '中嶋幸子（持分1/2）・中嶋直美（持分1/2）'
 */
export function formatOwners(owners: Owner[] | undefined | null): string {
  if (!Array.isArray(owners) || owners.length === 0) return "";
  return owners
    .map((o) => (o.share ? `${o.name}（持分${o.share}）` : o.name))
    .join("・");
}

/** 表示用文字列を owners 配列にパースする（formatOwners の逆）。 */
export function parseOwners(text: string): Owner[] {
  const src = (text || "").trim();
  if (!src) return [];
  return src
    .split(/[・、,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*[（(](?:持分)?\s*(.+?)\s*[）)]\s*$/);
      return m
        ? { name: m[1].trim(), share: m[2].trim() }
        : { name: part, share: "" };
    });
}

/** 坪数を小数点以下2桁までで整形する（合計値の浮動小数誤差も丸める。末尾0は省く）。 */
export function fmtTsubo(v: number | string | null | undefined): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

/** 地番の自然順ソートキー（例: 2-10 は 2-9 の後）。 */
export function chibanSortKey(chiban: string): number {
  const [main, branch] = String(chiban).split("-");
  return (Number(main) || 0) * 100000 + (Number(branch) || 0);
}

/** 日時を「YYYY/MM/DD HH:MM」で整形する。 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 日付を「YYYY/M/D」で整形する。 */
export function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
