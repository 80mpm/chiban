// GET /api/youto-wms — ZENRIN データ重畳［用途地域］(wms/youto) の WMS GetMap 中継。
// Leaflet の L.tileLayer.wms が付ける WMS 標準パラメータ（bbox/width/height/crs 等）を
// そのまま引き継ぎ、ログイン認証の zis_* をサーバ側で付与して PNG を返す。

import { fetchYoutoWms } from "@chiban/shared/lib/zenrin";
import { getCurrentUser } from "@/lib/auth";

// セッションキャッシュをプロセス内で保持したいので Node ランタイム。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 未ログインには ZENRIN 中継を使わせない（画像応答のため withApi は通さず直接 401）
  if (!(await getCurrentUser())) {
    return new Response("ログインが必要です", { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  try {
    return await fetchYoutoWms(searchParams);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`用途地域 WMS プロキシエラー: ${msg}`, { status: 502 });
  }
}
