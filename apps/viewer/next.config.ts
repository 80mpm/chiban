import path from "node:path";
import type { NextConfig } from "next";

// タイル中継は app/tile/[z]/[x]/[y]/route.ts が旧来の URL をそのまま
// 動的ルートで受けるため、rewrites は不要。
const nextConfig: NextConfig = {
  // モノレポのファイルトレース基点をリポジトリルートに固定する
  // （lockfile の自動検出に頼らず、packages/shared を確実にトレース対象へ入れる）。
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // ensureDbReady() のシード投入が packages/shared/data/ のファイルを実行時に
  // fs.readFileSync で読むため、サーバーレス関数バンドルへ明示的に同梱する
  // （ファイルトレースの自動検出に任せると漏れて ENOENT になりうる）。
  // kouzu_parcels_seed.json.gz は git 管理外だが、CLI（vercel deploy）デプロイでは
  // アップロードされるため同梱対象に含める（git 連携デプロイ時は無視される）。
  outputFileTracingIncludes: {
    "/api/**": ["../../packages/shared/data/*"],
    "/": ["../../packages/shared/data/*"],
    "/projects/**": ["../../packages/shared/data/*"],
  },
};

export default nextConfig;
