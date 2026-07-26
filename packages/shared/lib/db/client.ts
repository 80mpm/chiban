// ============================================================
// DB クライアント（postgres.js）。
// アプリ全体は postgres.js を使う。筆マスタの COPY 投入だけ
// seed-parcels.ts が pg + pg-copy-streams を別途使う。
//
// dev のホットリロードで接続が増殖しないよう globalThis にキャッシュする。
// ============================================================

import postgres from "postgres";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  // Vercel Marketplace のデータベース連携（Supabase / Neon 等）は DATABASE_URL ではなく
  // POSTGRES_URL という名前で接続文字列を注入するため、こちらもフォールバックで読む
  process.env.POSTGRES_URL ??
  "postgresql://chiban:chiban@localhost:5432/chiban";

// Supabase 等の接続プーラー（transaction モード・port 6543）は prepared statement 非対応
const isPooledConnection = /pooler|:6543\//.test(DATABASE_URL);

// ローカル Docker の Postgres は SSL なし。クラウド DB（Supabase 等）は SSL 必須だが、
// 証明書が独自 CA 署名のため検証を無効にして接続する（デモ用途の割り切り）。
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
export const DB_SSL: false | { rejectUnauthorized: false } = isLocalDb
  ? false
  : { rejectUnauthorized: false };

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
    prepare: !isPooledConnection,
    ssl: DB_SSL,
    onnotice: () => {}, // NOTICE（CREATE TABLE IF NOT EXISTS 等）を握りつぶす
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__chibanSql = sql;
}
