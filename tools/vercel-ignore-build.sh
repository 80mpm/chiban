#!/usr/bin/env bash
# Vercel の Ignored Build Step（apps/*/vercel.json の ignoreCommand から呼ぶ）。
# 終了コード 0 = ビルドしない / 1 = ビルドする。引数は対象アプリのディレクトリ
# （apps/viewer または apps/input）。Vercel 上の cwd に依存しないよう、パスは
# すべてリポジトリ直下からの相対で扱う。
#
# - プレビュー（main 以外のブランチ・PR）はビルドしない。Preview 環境も本番と
#   同じ DB を指しており、未マージのコードが本番 DB にスキーマ変更やデータ削除を
#   走らせてしまうため
# - 本番は、前回成功した本番デプロイから自アプリ・共有パッケージ・ルートの
#   依存定義のいずれも変わっていなければビルドしない（モノレポの片側だけの変更）
set -u
app="${1:?対象アプリのディレクトリ（例: apps/viewer）を指定してください}"
cd "$(git rev-parse --show-toplevel)" || exit 1

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "プレビューのためビルドしません（VERCEL_ENV=${VERCEL_ENV:-未設定}）"
  exit 0
fi

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "比較元のコミットが不明なためビルドします"
  exit 1
fi

if git diff --quiet "$base" HEAD -- "$app" packages package.json package-lock.json tsconfig.base.json; then
  echo "${base:0:7}..HEAD でこのアプリに影響する変更が無いためビルドしません"
  exit 0
fi

echo "${base:0:7}..HEAD に変更があるためビルドします"
exit 1
