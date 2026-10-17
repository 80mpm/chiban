// POST /api/reset — 案件・土地・訪問記録を破棄してサンプル再投入（筆マスタは残す）

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { ensureDbReady } from "@chiban/shared/lib/db/init";
import { resetSamples } from "@chiban/shared/lib/db/sample";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return withApi(async () => {
    await requireAppApiUser();
    await ensureDbReady();
    await resetSamples();
    return jsonOk({ ok: true });
  });
}
