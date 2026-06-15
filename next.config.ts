import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 旧来のタイル URL（/tile/{z}/{x}/{y}.png）を維持したまま、
  // Route Handler（/api/tile?z=&x=&y=）へ書き換える。
  // Leaflet の L.tileLayer は URL テンプレートを置換するだけなので、
  // 全画面のタイル URL を旧構成と同一に保てる。
  async rewrites() {
    return [
      {
        source: "/tile/:z/:x/:y.png",
        destination: "/api/tile?z=:z&x=:x&y=:y",
      },
    ];
  },
};

export default nextConfig;
