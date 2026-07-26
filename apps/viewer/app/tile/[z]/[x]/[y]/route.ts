// GET /tile/{z}/{x}/{y}.png — ZENRIN タイル中継
// Leaflet の L.tileLayer が叩く旧来の URL をそのまま動的ルートで受ける
// （[y] は "25800.png" のように拡張子付きで届くので剥がす）。

import { fetchTile } from "@/lib/zenrin";

// トークンキャッシュをプロセス内で保持したいので Node ランタイム。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { z, x, y } = await params;
  const yy = y.replace(/\.png$/, "");
  if (!z || !x || !yy) {
    return new Response("Bad tile path", { status: 404 });
  }
  try {
    return await fetchTile(z, x, yy);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Tile proxy error: ${msg}`, { status: 502 });
  }
}
