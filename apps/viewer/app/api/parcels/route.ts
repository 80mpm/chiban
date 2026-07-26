// GET /api/parcels             — 筆マスタ全件（GeoJSON・デバッグ用）
// GET /api/parcels?town=X       — 指定町名の筆一覧（属性のみ）
// GET /api/parcels?town=X&geometry=1 — 領域 [[lat,lng]] 付き

import { withApi, jsonOk } from "@/lib/api-error";
import { getParcels, getParcelsByTown } from "@/lib/queries/parcels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApi(async () => {
    const url = new URL(req.url);
    const town = url.searchParams.get("town");
    if (town) {
      const geometry = ["1", "true"].includes(url.searchParams.get("geometry") ?? "0");
      return jsonOk(await getParcelsByTown(town, geometry));
    }
    return jsonOk(await getParcels());
  });
}
