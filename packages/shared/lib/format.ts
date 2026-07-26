// ============================================================
// 表示・整形ヘルパー（旧 data.js / common.js のクライアント側ロジック）
// クライアント・サーバ双方から使える純関数。
// ============================================================

import type { Owner, LandStatus, Building, Mortgage } from "./types";

/** ステータス定義（label / color）。 */
export const STATUS_DEFS: Record<LandStatus, { label: string; color: string }> = {
  target: { label: "対象", color: "#94a3b8" },
  acquired: { label: "取得済", color: "#10b981" },
};

export const STATUS_KEYS: LandStatus[] = ["target", "acquired"];

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

/** 空の地権者（行編集 UI の新規行テンプレート）。 */
export function emptyOwner(): Owner {
  return { name: "", share: "", address: "", regDate: "", regCause: "", description: "" };
}

/**
 * 登記日 + 登記原因を 1 行に整形する（例「平成14年10月14日 相続」→ '2002-10-14 相続'
 * は fmtDateOnly で '2002/10/14 相続'）。両方空なら ''。
 */
export function formatRegistration(o: Owner): string {
  return [fmtDateOnly(o.regDate), o.regCause].filter(Boolean).join(" ");
}

/**
 * 抵当権を「設定日 金額 抵当権者」で1行に整形する（空項目は省く）。
 * 例: 2018/3/19 3906万円 中国銀行股份有限公司
 */
export function formatMortgage(m: Mortgage): string {
  return [
    fmtDateOnly(m.date),
    m.amount != null ? `${m.amount}万円` : "",
    m.holder,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 建物の属性を「種類／構造／床面積」で1行に整形する（空項目は省く）。
 * 例: 居宅／木造瓦葺2階建／96.52㎡
 */
export function formatBuilding(b: Building): string {
  const parts: string[] = [];
  if (b.usage) parts.push(b.usage);
  if (b.structure) parts.push(b.structure);
  if (b.floorArea !== null && b.floorArea !== undefined) parts.push(`${b.floorArea}㎡`);
  return parts.join("／");
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
