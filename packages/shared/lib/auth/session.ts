// ============================================================
// ログインセッション（両システム共用の認証基盤・サーバ専用）。
//
// PostgreSQL の sessions テーブル + httpOnly cookie による自前セッション。
// 両アプリ（閲覧・入力）が同一 DB を共有する既存構成に乗るため、
// アカウント・セッションの正本は 1 箇所になる。
//
// セッションは無期限（ユーザー指定の運用方針）。失効するのは
// ①ログアウト（行削除）②アカウント停止（is_active=false で即無効）のみ。
// cookie はブラウザ側の上限に合わせて約 400 日で発行し直す。
// ============================================================

import { randomBytes } from "node:crypto";
import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { ApiError } from "../api-error";
import { verifyPassword } from "./password";
import { getAuthRecordByLoginId } from "../queries/users";
import type { User, UserRole } from "../types";

/** セッション cookie 名（両アプリ共通。オリジンが異なるので衝突しない）。 */
export const SESSION_COOKIE = "chiban_session";

/** cookie の寿命（秒）。セッション自体は無期限だが cookie には上限があるため約 400 日。 */
const COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;

interface SessionUserRow {
  user_id: string;
  login_id: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  user_created_at: Date | null;
  user_updated_at: Date | null;
}

function toUser(row: SessionUserRow): User {
  return {
    id: row.user_id,
    loginId: row.login_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.user_created_at ? row.user_created_at.toISOString() : null,
    updatedAt: row.user_updated_at ? row.user_updated_at.toISOString() : null,
  };
}

/**
 * ログインIDとパスワードで認証し、セッションを発行する。
 * - 認証失敗はIDの存在を漏らさない共通文言の 401
 * - 停止中・ロール外はそれぞれ 403
 */
export async function login(
  loginId: string,
  password: string,
  allowedRoles: UserRole[],
): Promise<{ token: string; user: User }> {
  await ensureDbReady();

  const record = await getAuthRecordByLoginId((loginId ?? "").trim());
  if (!record || !verifyPassword(password ?? "", record.password_hash)) {
    throw new ApiError(401, "ログインIDまたはパスワードが違います");
  }
  if (!record.is_active) {
    throw new ApiError(403, "このアカウントは停止されています。管理者にお問い合わせください");
  }
  if (!allowedRoles.includes(record.role)) {
    throw new ApiError(403, "このシステムを利用する権限がありません");
  }

  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${record.id})`;

  const rows = await sql<SessionUserRow[]>`
    SELECT u.id AS user_id, u.login_id, u.name, u.role, u.is_active,
           u.created_at AS user_created_at, u.updated_at AS user_updated_at
      FROM users u WHERE u.id = ${record.id}
  `;
  return { token, user: toUser(rows[0]) };
}

/**
 * セッショントークンからユーザーを引く。
 * 停止中のユーザーは null（＝アカウント停止と同時に既存セッションも使えなくなる）。
 */
export async function getSessionUser(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  await ensureDbReady();
  const rows = await sql<SessionUserRow[]>`
    SELECT u.id AS user_id, u.login_id, u.name, u.role, u.is_active,
           u.created_at AS user_created_at, u.updated_at AS user_updated_at
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ${token}
  `;
  const row = rows[0];
  if (!row || !row.is_active) return null;
  return toUser(row);
}

/** セッションを破棄する（ログアウト）。 */
export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await ensureDbReady();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

/** セッション cookie の属性（next/headers の cookies().set に渡す）。 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}
