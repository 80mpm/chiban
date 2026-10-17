// 案件入力システムの認可設定。事務のみログインできる（営業は権限なし 403）。

import { requireUser, requireApiUser, getCurrentUser } from "@chiban/shared/lib/auth/guard";
import type { User, UserRole } from "@chiban/shared/lib/types";

export const APP_ROLES: UserRole[] = ["office"];

/** ページ用ガード。未ログインは /login?next= へリダイレクト。 */
export const requireAppUser = (nextPath: string): Promise<User> =>
  requireUser(APP_ROLES, nextPath);

/** API 用ガード。未ログイン 401・ロール外 403。 */
export const requireAppApiUser = (): Promise<User> => requireApiUser(APP_ROLES);

export { getCurrentUser };
