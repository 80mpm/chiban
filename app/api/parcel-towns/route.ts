// GET /api/parcel-towns — 町名（地番区域）一覧と筆数

import { withApi, jsonOk } from "@/lib/api-error";
import { getParcelTowns } from "@/lib/queries/parcels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => jsonOk(await getParcelTowns()));
}
