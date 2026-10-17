// ============================================================
// シードデータファイル（packages/shared/data/）のパス解決。
//
// モノレポ化により cwd が実行形態で変わる:
//   - ローカル workspace 実行:  apps/viewer / apps/input
//   - リポジトリルートから直接: リポジトリルート
//   - Vercel（Root Directory 指定）: /var/task/apps/<app>
//     （関数バンドル内はリポジトリ相対のディレクトリ構造が保たれ、
//       outputFileTracingIncludes で /var/task/packages/shared/data に同梱される）
// いずれでも解決できるよう、cwd から上方探索する。
// ============================================================

import fs from "node:fs";
import path from "node:path";

/** packages/shared/data/ 配下のシードファイルの絶対パスを返す。 */
export function seedDataPath(file: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const p = path.join(dir, "packages", "shared", "data", file);
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`シードデータファイルが見つかりません: ${file}`);
}

/** シードファイルの存在確認（任意ファイル用。gz が無い環境のフォールバック判定に使う）。 */
export function seedDataPathIfExists(file: string): string | null {
  try {
    return seedDataPath(file);
  } catch {
    return null;
  }
}
