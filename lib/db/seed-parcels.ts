// ============================================================
// 筆マスタ投入（db.py の seed_parcels_if_empty の移植）
// 台東区全図面シード（kouzu_parcels_seed.json.gz・約5.1万筆）を
// COPY で parcels テーブルに一括投入する。シードが無ければ
// kouzu_xml_data.js（5図面・595筆）にフォールバックする。
//
// COPY は pg + pg-copy-streams を使う（postgres.js では扱いづらいため）。
// 単一 COPY ストリームなので IDENTITY の採番順 = シードの出現順になり、
// ORDER BY id で安定する（db.py と同じ）。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import type { Sql } from "postgres";
import { DATABASE_URL, DB_SSL } from "./client";
import type { GeoJsonPolygon } from "../geo";

const PARCEL_SEED_PATH = path.join(process.cwd(), "kouzu_parcels_seed.json.gz");
const KOUZU_JS_PATH = path.join(process.cwd(), "kouzu_xml_data.js");

interface SeedParcel {
  oaza: string;
  chome: string;
  chiban: string;
  geometry: GeoJsonPolygon;
}

/** 1〜99 の整数を漢数字にする（位置参照情報の丁目表記に合わせる）。 */
function kanjiNumber(n: number): string {
  const ones = "一二三四五六七八九";
  if (n < 1 || n > 99) throw new Error(`漢数字に変換できない丁目です: ${n}`);
  if (n < 10) return ones[n - 1];
  const tens = Math.floor(n / 10);
  const rem = n % 10;
  return (tens > 1 ? ones[tens - 1] : "") + "十" + (rem ? ones[rem - 1] : "");
}

/**
 * 筆シードの (大字, 丁目) → 位置参照情報の大字町丁目名。
 * シード側の丁目は算用数字（例 '３丁目'）、住所マスタ側は漢数字（例 '上野三丁目'）
 * のため、突合時にここで表記を合わせる。
 */
function seedTownName(oaza: string, chome: string): string {
  if (!chome) return oaza;
  const m = chome.match(/^([0-9０-９]+)丁目$/);
  if (!m) throw new Error(`丁目の表記を解釈できません: ${oaza}${chome}`);
  const halfWidth = [...m[1]]
    .map((c) => (c >= "０" ? String.fromCharCode(c.charCodeAt(0) - 0xfee0) : c))
    .join("");
  return oaza + kanjiNumber(parseInt(halfWidth, 10)) + "丁目";
}

/** kouzu_xml_data.js から GeoJSON features を取り出す（フォールバック用）。 */
function loadKouzuFeatures(): { properties: Record<string, string>; geometry: GeoJsonPolygon }[] {
  const src = fs.readFileSync(KOUZU_JS_PATH, "utf-8");
  const m = src.match(/window\.KOUZU_XML_DATA\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error("kouzu_xml_data.js から KOUZU_XML_DATA を抽出できません");
  return JSON.parse(m[1]).geojson.features;
}

/** 筆マスタのシード行を返す（gz があればそれを、なければ kouzu_xml_data.js）。 */
function loadSeedParcels(): { parcels: SeedParcel[]; source: string } {
  if (fs.existsSync(PARCEL_SEED_PATH)) {
    const data = JSON.parse(
      zlib.gunzipSync(fs.readFileSync(PARCEL_SEED_PATH)).toString("utf-8"),
    );
    return { parcels: data.parcels, source: path.basename(PARCEL_SEED_PATH) };
  }
  const parcels = loadKouzuFeatures().map((f) => ({
    oaza: f.properties.oaza ?? "",
    chome: f.properties.chome ?? "",
    chiban: f.properties.chiban,
    geometry: f.geometry,
  }));
  return { parcels, source: path.basename(KOUZU_JS_PATH) };
}

/** COPY テキスト形式のフィールドをエスケープする（\\ \t \n \r）。 */
function copyEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** 筆マスタが空のときだけ投入する。投入したら true。 */
export async function seedParcelsIfEmpty(sql: Sql): Promise<boolean> {
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM parcels`;
  if (n > 0) return false;

  const { parcels, source } = loadSeedParcels();

  // 町名（地番区域名）→ id のマップ
  const townRows = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM chibankuiki
  `;
  const townIds = new Map(townRows.map((r) => [r.name, r.id]));

  // COPY 用のテキスト（タブ区切り・改行終端）を組み立てる。
  // geometry の JSON はコンパクト（空白なし）なのでタブ・改行を含まない。
  const lines: string[] = [];
  for (const p of parcels) {
    const name = seedTownName(p.oaza, p.chome);
    const townId = townIds.get(name);
    if (townId === undefined) {
      throw new Error(
        `地番区域マスタに存在しない町名です: ${name}。13106_2025.csv を更新してください`,
      );
    }
    const geomJson = JSON.stringify(p.geometry);
    lines.push(
      `${townId}\t${copyEscape(p.chiban)}\t${copyEscape(geomJson)}`,
    );
  }

  // pg は connectionString 内の sslmode が明示的な ssl オプションより優先される
  // （sslmode=require は verify-full 扱いになり独自 CA の Supabase 等で失敗する）ため、
  // URL から sslmode を除去して ssl オプション側で制御する
  let connectionString = DATABASE_URL;
  if (DB_SSL !== false) {
    const url = new URL(DATABASE_URL);
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
  }
  const client = new Client({
    connectionString,
    ssl: DB_SSL === false ? undefined : DB_SSL,
  });
  await client.connect();
  try {
    const stream = client.query(
      copyFrom("COPY parcels (chibankuiki_id, chiban, geometry) FROM STDIN"),
    );
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.write(lines.join("\n") + "\n");
      stream.end();
    });
  } finally {
    await client.end();
  }

  console.log(
    `筆マスタを投入しました: ${parcels.length.toLocaleString()} 筆（${source}）`,
  );
  return true;
}
