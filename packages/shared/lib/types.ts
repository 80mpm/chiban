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
  /** 所有者住所（例「東京都台東区竜泉三丁目23番9号」）。 */
  address: string;
  /** 登記日（'YYYY-MM-DD'。未設定は空文字）。 */
  regDate: string;
  /** 登記原因（例「相続」「売買」「遺贈」「所有権保存」）。 */
  regCause: string;
  /** 備考。 */
  description: string;
}

/** 抵当権（土地・建物とも複数持ちうる。登記の乙区相当）。 */
export interface Mortgage {
  /** 設定日（'YYYY-MM-DD'。未設定は空文字）。 */
  date: string;
  /** 債権額（万円）。未設定は null。 */
  amount: number | null;
  /** 抵当権者（例「◯◯銀行」）。 */
  holder: string;
}

/** 建物。土地とは別に登記され、地権者も土地と異なりうる（借地上建物など）。 */
export interface Building {
  id: string;
  /** 家屋番号。 */
  kaokuNumber: string;
  /** 構造（例「木造2階建」）。 */
  structure: string;
  /** 種類・用途（例「居宅」「共同住宅」）。 */
  usage: string;
  /** 床面積（㎡）。未設定は null。 */
  floorArea: number | null;
  /** 新築年月日（'YYYY-MM-DD'。未設定は空文字）。 */
  builtDate: string;
  /** 備考。 */
  description: string;
  /** 建物の地権者。 */
  owners: Owner[];
  /** 抵当権。 */
  mortgages: Mortgage[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** 前面道路（案件領域ポリゴンの辺インデックスと幅員）。 */
export interface FrontRoad {
  edgeIndex: number;
  width: number;
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

/** 土地。aza/chiban/polygon は筆マスタからの導出値。 */
export interface Land {
  id: string;
  parcelId: number;
  /** 地番区域名（chibankuiki.name。例「西浅草二丁目」）。 */
  aza: string;
  chiban: string;
  owners: Owner[];
  description: string;
  /** 面積（㎡・保存値の正本。登記の地積単位）。 */
  areaM2: number | null;
  /** 坪数（areaM2 からのサーバ導出値。表示用）。 */
  areaTsubo: number | null;
  status: LandStatus;
  /** 抵当権。 */
  mortgages: Mortgage[];
  createdAt: string | null;
  updatedAt: string | null;
  polygon: LatLng[];
  visits?: Visit[];
  /** 土地上の建物（更地は空配列）。読み出し時に付与。 */
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
  /** 担当者名。 */
  staff: string | null;
  /** 現況建蔽率（%）。 */
  currentBcr: number | null;
  currentFar: number | null;
  targetFar: number | null;
  /** 用途地域（例「商業」）。 */
  zoning: string | null;
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
