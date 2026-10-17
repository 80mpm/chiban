// POST /api/auth/logout — セッションを破棄して cookie を消す。

import { cookies } from "next/headers";
import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { deleteSession, SESSION_COOKIE } from "@chiban/shared/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return withApi(async () => {
    const store = await cookies();
    await deleteSession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    return jsonOk({ ok: true });
  });
}
