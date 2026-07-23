# 案件管理システム（デモ）

ファミリーコーポレーション社 本部スタッフ向けの案件管理 Web アプリ（社内デモ）。
**Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui** 製。
データは PostgreSQL に永続化し、地図は ZENRIN Maps API のタイルを使う。

## セットアップ

```bash
# 1. 依存インストール
npm install

# 2. PostgreSQL を起動（Docker。データは named volume に永続化）
docker compose up -d

# 3. 環境変数を設定（.env.example をコピーして .env を作成し、ZENRIN 認証情報を記入）
cp .env.example .env

# 4. 開発サーバ起動
npm run dev
# http://localhost:3000/
```

初回アクセス時にスキーマ作成・住所マスタ・筆マスタ・サンプルデータの投入が自動で走る。

## 画面

| パス | 画面 |
|---|---|
| `/` | 案件一覧（地図 + サイドリスト） |
| `/projects/[id]` | 案件詳細（公図風ビュー + 地図） |
| `/projects/[id]/edit` | 案件編集（インライン編集・領域描画・土地 CRUD） |
| `/kouzu-map` | 登記所備付地図ビューア（独立画面） |

## 主なコマンド

```bash
npm run dev      # 開発サーバ
npm run build    # 本番ビルド + 型チェック
npm run start    # 本番サーバ
```

## 構成

- フロント: `app/`（ルート）, `components/`, `hooks/`
- バックエンド: `app/api/*`（Route Handlers）, `lib/`（DB レイヤー・クエリ・ZENRIN）
- データ: PostgreSQL（`docker-compose.yml`）+ シード（`13106_2025.csv` / `kouzu_parcels_seed.json.gz`）

詳細な設計・データ構造・デモ用の制約は [`CLAUDE.md`](./CLAUDE.md) を参照。
