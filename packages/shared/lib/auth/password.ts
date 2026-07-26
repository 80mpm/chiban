// ============================================================
// パスワードのハッシュ化と検証（両システム共用の認証基盤の一部）。
//
// 依存を増やさないため Node 標準の crypto.scrypt を使う。
// 保存形式: "scrypt:<salt(base64)>:<hash(base64)>"
// パラメータは Node 既定（N=16384, r=8, p=1）・鍵長 64 バイト。
// 検証は timingSafeEqual でタイミング攻撃を避ける。
// ============================================================

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

/** 平文パスワードをハッシュ化して保存形式の文字列を返す。 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

/** 平文パスワードが保存済みハッシュと一致するか検証する（ログインで使用）。 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (expected.length !== KEY_LEN) return false;
  const actual = scryptSync(plain, salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}
