import type { NextConfig } from "next";

// タイル中継は app/tile/[z]/[x]/[y]/route.ts が旧来の URL をそのまま
// 動的ルートで受けるため、rewrites は不要。
const nextConfig: NextConfig = {};

export default nextConfig;
