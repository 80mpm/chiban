// ============================================================
// ユーザークエリ（ユーザー管理画面 + 後続のログイン機能で使う）。
// password_hash はこのモジュールの外に出さない（User 型に含めない）。
// ============================================================

import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { uuid } from "../db/ids";
import { ApiError, isUniqueViolation } from "../api-error";
import { hashPassword } from "../auth/password";
import type { User, UserRole } from "../types";

interface UserRow {
  id: string;
  login_id: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date | null;
  updated_at: Date | null;
}

/** SELECT する列（password_hash を含めないことをここで固定する）。 */
const USER_COLUMNS = "id, login_id, name, role, is_active, created_at, updated_at";

function userJson(row: UserRow): User {
  return {
    id: row.id,
    loginId: row.login_id,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

const LOGIN_ID_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const PASSWORD_MIN = 8;

function validateLoginId(loginId: string): void {
  if (!LOGIN_ID_RE.test(loginId)) {
    throw new ApiError(
      400,
      "ログインIDは 3〜32 文字の半角英数字・ハイフン・アンダースコアで入力してください",
    );
  }
}

function validatePassword(password: string): void {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new ApiError(400, `パスワードは ${PASSWORD_MIN} 文字以上で入力してください`);
  }
}

function validateRole(role: unknown): asserts role is UserRole {
  if (role !== "sales" && role !== "office") {
    throw new ApiError(400, "種別は「営業」か「事務」を指定してください");
  }
}

/** 全ユーザー（ログインID順）。 */
export async function listUsers(): Promise<User[]> {
  await ensureDbReady();
  const rows = await sql.unsafe<UserRow[]>(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY login_id`,
  );
  return rows.map(userJson);
}

/** ユーザー登録。ログインID 重複は 409。 */
export async function createUser(fields: {
  loginId?: string;
  name?: string;
  role?: string;
  password?: string;
}): Promise<User> {
  await ensureDbReady();
  const loginId = (fields.loginId ?? "").trim();
  const name = (fields.name ?? "").trim();
  validateLoginId(loginId);
  if (!name) throw new ApiError(400, "氏名は必須です");
  validateRole(fields.role);
  validatePassword(fields.password ?? "");

  try {
    const rows = await sql.unsafe<UserRow[]>(
      `INSERT INTO users (id, login_id, name, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [uuid(), loginId, name, fields.role, hashPassword(fields.password!)] as never[],
    );
    return userJson(rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ApiError(409, "このログインIDは既に使われています");
    }
    throw e;
  }
}

/**
 * ユーザーの部分更新（JSON に含まれたキーのみ反映）。
 * - name / role / isActive の変更
 * - password キーがあればパスワード再設定（再ハッシュ）
 * ログインID は変更不可（アカウントの同一性を保つ）。
 */
export async function updateUser(
  userId: string,
  fields: { name?: string; role?: string; isActive?: boolean; password?: string },
): Promise<User> {
  await ensureDbReady();

  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(`${fragment}$${params.length}`);
  };

  if ("name" in fields) {
    const name = (fields.name ?? "").trim();
    if (!name) throw new ApiError(400, "氏名は必須です");
    add("name = ", name);
  }
  if ("role" in fields) {
    validateRole(fields.role);
    add("role = ", fields.role);
  }
  if ("isActive" in fields) {
    if (typeof fields.isActive !== "boolean") {
      throw new ApiError(400, "isActive は true / false で指定してください");
    }
    add("is_active = ", fields.isActive);
  }
  if ("password" in fields) {
    validatePassword(fields.password ?? "");
    add("password_hash = ", hashPassword(fields.password!));
  }
  if (sets.length === 0) throw new ApiError(400, "更新する項目がありません");

  params.push(userId);
  const rows = await sql.unsafe<UserRow[]>(
    `UPDATE users SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length}
      RETURNING ${USER_COLUMNS}`,
    params as never[],
  );
  if (rows.length === 0) throw new ApiError(404, "ユーザーが見つかりません");
  return userJson(rows[0]);
}
