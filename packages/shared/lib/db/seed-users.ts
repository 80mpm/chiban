// ============================================================
// 初期ユーザーの投入（users が空のときのみ・冪等）。
//
// デモ用の初期アカウント。パスワードは全員 "demo1234"（CLAUDE.md に記載）。
// POST /api/reset はアカウントを触らない（業務データではないため、
// サンプルデータのリセットで消えない）。
// ============================================================

import type { Sql } from "postgres";
import { uuid } from "./ids";
import { hashPassword } from "../auth/password";

const INITIAL_PASSWORD = "demo1234";

const INITIAL_USERS: { loginId: string; name: string; role: "sales" | "office" }[] = [
  { loginId: "kimura", name: "木村", role: "sales" },
  { loginId: "honda", name: "本田", role: "sales" },
  { loginId: "sato", name: "佐藤", role: "office" },
];

/** users が空のときだけ初期アカウントを投入する。投入したら true。 */
export async function seedUsersIfEmpty(sql: Sql): Promise<boolean> {
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
  if (n > 0) return false;

  for (const u of INITIAL_USERS) {
    await sql`
      INSERT INTO users (id, login_id, name, role, password_hash)
      VALUES (${uuid()}, ${u.loginId}, ${u.name}, ${u.role}, ${hashPassword(INITIAL_PASSWORD)})
    `;
  }
  console.log(`初期ユーザーを投入しました: ${INITIAL_USERS.length} 名（初期パスワードは全員 ${INITIAL_PASSWORD}）`);
  return true;
}
