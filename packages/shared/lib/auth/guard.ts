// ============================================================
// ページ・API の認可ガード（サーバ専用）。
// 各アプリは自分の許可ロールで包んだ requireAppUser / requireAppApiUser を
// apps/*/lib/auth.ts に持ち、全ページ・全 Route Handler の冒頭で呼ぶ。
// ============================================================

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "../api-error";
import { SESSION_COOKIE, getSessionUser } from "./session";
import type { User, UserRole } from "../types";

/** cookie のセッションから現在のユーザーを返す（未ログインは null）。 */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
}

/**
 * ページ用ガード。未ログイン・権限なしは /login へリダイレクトする
 * （ログイン後に元のページへ戻れるよう ?next= を引き継ぐ）。
 */
export async function requireUser(
  allowedRoles: UserRole[],
  nextPath: string,
): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !allowedRoles.includes(user.role)) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

/** API 用ガード。未ログイン 401・ロール外 403 を投げる（withApi が JSON に変換）。 */
export async function requireApiUser(allowedRoles: UserRole[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "ログインが必要です");
  if (!allowedRoles.includes(user.role)) {
    throw new ApiError(403, "このシステムを利用する権限がありません");
  }
  return user;
}
