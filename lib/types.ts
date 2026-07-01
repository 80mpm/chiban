// ============================================================
// 共有データモデルの型定義（API・フロント共通の正本）
// 旧 data.js / db.py が扱っていた camelCase の JSON 形をそのまま型にする。
// ============================================================

/** [lat, lng] の頂点列で表すポリゴン。 */
export type LatLng = [number, number];

/** ステータス（target=対象 / acquired=取得済）。 */
export type LandStatus = "target" | "acquired";

/** 地権者。share は「分子/分母」文字列、持分なしは空文字。 */
export interface Owner {
  name: string;
  share: string;
}

/** 前面道路（案件領域ポリゴンの辺インデックスと幅員）。 */
export interface FrontRoad {
  edgeIndex: number;
  width: number;
}

/**
 * 建物の所有形態。
 * - sole  = 一棟所有（単独・共有）: 所有者は Building.owners
 * - kubun = 区分所有（分譲マンション等）: 所有者は専有部分 Building.units ごと
 */
export type BuildingOwnershipType = "sole" | "kubun";

/** 専有部分（区分所有建物の一室）。siteShare は敷地権割合の「分子/分母」文字列、未把握は空文字。 */
export interface BuildingUnit {
  id: number;
  unitNumber: string;
  owners: Owner[];
  siteShare: string;
  description: string;
}

/** 建物（棟単位）。土地に 1:N でぶら下がる。 */
export interface Building {
  id: string;
  name: string;
  houseNumber: string;
  structure: string;
  floorAreaTsubo: number | null;
  ownershipType: BuildingOwnershipType;
  /** 一棟所有（sole）の所有者。区分所有（kubun）では常に空配列。 */
  owners: Owner[];
  /** 区分所有（kubun）の専有部分。一棟所有（sole）では常に空配列。 */
  units: BuildingUnit[];
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** 訪問記録（追加のみ）。 */
export interface Visit {
  id: string;
  user: string;
  comment: string;
  date: string | null;
  directOrTel: string;
  meetingType: string;
  /** 未設定は空文字（DB の NULL ↔ ""）。 */
  nextDate: string;
  progress: string;
  principal: string;
}

/** 土地。aza/chiban/polygon/areaTsubo は筆マスタからの導出値。 */
export interface Land {
  id: string;
  parcelId: number;
  /** 地番区域名（chibankuiki.name。例「西浅草二丁目」）。 */
  aza: string;
  chiban: string;
  owners: Owner[];
  description: string;
  areaTsubo: number | null;
  status: LandStatus;
  createdAt: string | null;
  updatedAt: string | null;
  polygon: LatLng[];
  visits?: Visit[];
  buildings?: Building[];
}

/** 案件。 */
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
  polygon: LatLng[] | null;
  address: string | null;
  access: string | null;
  currentFar: number | null;
  targetFar: number | null;
  frontRoads: FrontRoad[];
  lands?: Land[];
}

/** 筆マスタの町名（地番区域）一覧の 1 行。 */
export interface ParcelTown {
  name: string;
  count: number;
}

/** 町名単位の筆一覧の 1 行（geometry なし）。 */
export interface ParcelSummary {
  parcelId: number;
  chiban: string;
}

/** 町名単位の筆一覧の 1 行（領域付き）。 */
export interface ParcelWithPolygon extends ParcelSummary {
  polygon: LatLng[];
}
