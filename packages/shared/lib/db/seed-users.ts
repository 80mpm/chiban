// ============================================================
// 初期ユーザーの投入。
//
// - 説明用の簡易アカウント id / pass は、既存 DB にも毎回冪等に用意する
//   （デモの場で口頭で伝えられる短さを優先。種別は事務なので閲覧・入力の両方に入れる）
// - 氏名入りの初期アカウント（本田）は users が空のときだけ投入する。パスワードは "demo1234"。
//   木村・佐藤はユーザー指示により廃止（訪問記録の user_name は text なので履歴には残る）
// - POST /api/reset はアカウントを触らない（業務データではないため、
//   サンプルデータのリセットで消えない）
// ============================================================

import type { Sql } from "postgres";
import { uuid } from "./ids";
import { hashPassword } from "../auth/password";

const INITIAL_PASSWORD = "demo1234";

/**
 * 説明用の簡易デモアカウント。種別を事務（office）にしてあるため、
 * 閲覧システム・入力システムのどちらにもこの 1 つでログインできる。
 */
const DEMO_USER = {
  loginId: "id",
  password: "pass",
  name: "管理者",
  role: "office" as const,
};

/** かつての表示名。画面に「デモ」と出さないため、既存 DB で未変更ならこの名前から付け替える。 */
const DEMO_USER_OLD_NAME = "デモ";

const INITIAL_USERS: { loginId: string; name: string; role: "sales" | "office" }[] = [
  { loginId: "honda", name: "本田", role: "sales" },
];

/**
 * 初期アカウントを用意する。簡易デモアカウント（id/pass）は毎回冪等に追加し、
 * 氏名入りの初期アカウントは users が空のときだけ投入する（投入したら true）。
 */
export async function seedUsersIfEmpty(sql: Sql): Promise<boolean> {
  // 氏名入りアカウントを入れるかどうかは、簡易アカウントを足す前の件数で判定する
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;

  // 簡易デモアカウント: すでに居れば何もしない（パスワードを変更していても上書きしない）
  const added = await sql`
    INSERT INTO users (id, login_id, name, role, password_hash)
    VALUES (${uuid()}, ${DEMO_USER.loginId}, ${DEMO_USER.name}, ${DEMO_USER.role},
            ${hashPassword(DEMO_USER.password)})
    ON CONFLICT (login_id) DO NOTHING
  `;
  if (added.count > 0) {
    console.log(`デモアカウントを用意しました: ${DEMO_USER.loginId} / ${DEMO_USER.password}`);
  }
  // 既存 DB の表示名を「デモ」→「管理者」へ（ユーザー管理で別名に変えていれば触らない）
  await sql`
    UPDATE users SET name = ${DEMO_USER.name}, updated_at = now()
     WHERE login_id = ${DEMO_USER.loginId} AND name = ${DEMO_USER_OLD_NAME}
  `;

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
