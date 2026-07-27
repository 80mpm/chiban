// 案件閲覧システムの認可設定。営業・事務の両方がログインできる（事務は上位ロール扱い）。

import { requireUser, requireApiUser, getCurrentUser } from "@chiban/shared/lib/auth/guard";
import type { User, UserRole } from "@chiban/shared/lib/types";

export const APP_ROLES: UserRole[] = ["sales", "office"];

/** ページ用ガード。未ログインは /login?next= へリダイレクト。 */
export const requireAppUser = (nextPath: string): Promise<User> =>
  requireUser(APP_ROLES, nextPath);

/** API 用ガード。未ログイン 401・ロール外 403。 */
export const requireAppApiUser = (): Promise<User> => requireApiUser(APP_ROLES);

export { getCurrentUser };
