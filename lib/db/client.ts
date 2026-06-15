// ============================================================
// DB クライアント（postgres.js）。
// アプリ全体は postgres.js を使う。筆マスタの COPY 投入だけ
// seed-parcels.ts が pg + pg-copy-streams を別途使う。
//
// dev のホットリロードで接続が増殖しないよう globalThis にキャッシュする。
// ============================================================

import postgres from "postgres";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://chiban:chiban@localhost:5432/chiban";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __chibanSql?: Sql;
};

export const sql: Sql =
  globalForDb.__chibanSql ??
  postgres(DATABASE_URL, {
    // jsonb はオブジェクトのまま読み書きしたい（postgres.js は既定で JSON をパースする）。
    // numeric は精度保持のため文字列で返るので、シリアライズ側で数値化する。
    max: 10,
    idle_timeout: 20,
    onnotice: () => {}, // NOTICE（CREATE TABLE IF NOT EXISTS 等）を握りつぶす
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__chibanSql = sql;
}
