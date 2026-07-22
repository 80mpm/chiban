import type { NextConfig } from "next";

// タイル中継は app/tile/[z]/[x]/[y]/route.ts が旧来の URL をそのまま
// 動的ルートで受けるため、rewrites は不要。
const nextConfig: NextConfig = {
  // ensureDbReady() のシード投入がリポジトリ直下の CSV / JS を実行時に
  // fs.readFileSync で読むため、Vercel のサーバーレス関数バンドルへ明示的に同梱する
  // （ファイルトレースの自動検出に任せると漏れて ENOENT になりうる）。
  // kouzu_parcels_seed.json.gz は git 管理外のため Vercel には存在せず、
  // kouzu_xml_data.js（5図面・595筆）フォールバックで投入される。
  outputFileTracingIncludes: {
    "/api/**": ["./13106_2025.csv", "./kouzu_xml_data.js"],
    "/": ["./13106_2025.csv", "./kouzu_xml_data.js"],
    "/projects/**": ["./13106_2025.csv", "./kouzu_xml_data.js"],
    "/report": ["./13106_2025.csv", "./kouzu_xml_data.js"],
  },
};

export default nextConfig;
