// POST /api/reset — 案件・土地・訪問記録を破棄してサンプル再投入（筆マスタは残す）

import { withApi, jsonOk } from "@/lib/api-error";
import { ensureDbReady } from "@/lib/db/init";
import { resetSamples } from "@/lib/db/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return withApi(async () => {
    await ensureDbReady();
    await resetSamples();
    return jsonOk({ ok: true });
  });
}
