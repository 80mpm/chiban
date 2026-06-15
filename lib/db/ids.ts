import { randomBytes } from "node:crypto";

/**
 * 旧 data.js の uuid() と同じ「id_ + 8文字」形式。
 * lands / visits の text 主キーに使う（既存 URL・DOM 周りの想定を変えない）。
 */
export function uuid(): string {
  return "id_" + randomBytes(4).toString("hex");
}
