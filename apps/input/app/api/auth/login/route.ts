// POST /api/auth/login — ログイン（唯一の非保護 API）。
// 認証成功でセッションを発行し httpOnly cookie を設定する。

import { cookies } from "next/headers";
import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { login, SESSION_COOKIE, sessionCookieOptions } from "@chiban/shared/lib/auth/session";
import { APP_ROLES } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    const { token, user } = await login(
      String(body.loginId ?? ""),
      String(body.password ?? ""),
      APP_ROLES,
    );
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    return jsonOk(user);
  });
}
