// ============================================================
// 起動時初期化（db.py の init_db / _check_schema_version の移植）
// スキーマ作成 → 住所マスタ投入 → 筆マスタ投入 → 初回のみサンプル投入。
//
// Route Handler の冒頭で ensureDbReady() を呼ぶ。初期化は一度だけ走る
// Promise として globalThis にキャッシュし、dev のホットリロードや
// 同時リクエストで多重実行しないようにする。
// ============================================================

import { sql } from "./client";
import { SCHEMA_SQL } from "./schema";
import { seedAddressMasterIfEmpty } from "./seed-address";
import { seedParcelsIfEmpty } from "./seed-parcels";
import { insertSamples } from "./sample";

/** 旧スキーマの DB を検出して初期化を案内する（デモのため ALTER 移行は持たない）。 */
async function checkSchemaVersion(): Promise<void> {
  const parcelsExists = await sql`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'parcels'
  `;
  if (parcelsExists.length === 0) return; // 新規 DB

  const hasChibankuikiId = await sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'parcels' AND column_name = 'chibankuiki_id'
  `;
  if (hasChibankuikiId.length === 0) {
    throw new Error(
      "旧スキーマのデータベースです。`docker compose down -v && docker compose up -d` で初期化してから再起動してください",
    );
  }

  const hasLandsOwners = await sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'lands' AND column_name = 'owners'
  `;
  if (hasLandsOwners.length > 0) {
    throw new Error(
      "旧スキーマ（lands.owners）のデータベースです。`docker compose down -v && docker compose up -d` で初期化してから再起動してください",
    );
  }
}

async function initDb(): Promise<void> {
  await checkSchemaVersion();
  // 複数ステートメントのためシンプルプロトコルで実行する
  await sql.unsafe(SCHEMA_SQL).simple();
  await seedAddressMasterIfEmpty(sql);
  await seedParcelsIfEmpty(sql);

  const seeded = await sql`SELECT 1 FROM app_meta WHERE key = 'seeded'`;
  if (seeded.length === 0) {
    await sql.begin(async (tx) => {
      await insertSamples(tx);
      await tx`INSERT INTO app_meta (key, value) VALUES ('seeded', '1')`;
    });
  }
}

const globalForInit = globalThis as unknown as {
  __chibanInitPromise?: Promise<void>;
};

/** DB 初期化を一度だけ実行する。各 Route Handler の冒頭で await する。 */
export function ensureDbReady(): Promise<void> {
  if (!globalForInit.__chibanInitPromise) {
    globalForInit.__chibanInitPromise = initDb().catch((e) => {
      // 失敗時は次回リクエストで再試行できるようキャッシュを捨てる
      globalForInit.__chibanInitPromise = undefined;
      throw e;
    });
  }
  return globalForInit.__chibanInitPromise;
}
