// GET /api/parcel-towns — 町名（地番区域）一覧と筆数

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { getParcelTowns } from "@chiban/shared/lib/queries/parcels";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireAppApiUser();
    return jsonOk(await getParcelTowns());
  });
}
