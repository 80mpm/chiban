# 案件管理システム（デモ）

ファミリーコーポレーション社 本部スタッフ向けの案件管理 Web アプリ（社内デモ）。
**Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui** 製。
データは PostgreSQL に永続化し、地図は ZENRIN Maps API のタイルを使う。

npm workspaces のモノレポで、**2 つのシステム**からなる:

| アプリ | システム | ポート | 役割 |
|---|---|---|---|
| `apps/viewer` | 案件閲覧システム（営業用） | 3000 | 案件・訪問記録の閲覧と訪問記録の入力 |
| `apps/input` | 案件入力システム（事務用） | 3001 | 案件情報の登録・編集 |

共有コード（DB 層・クエリ・型・共有 UI・シードデータ）は `packages/shared`（`@chiban/shared`）にある。

## セットアップ

```bash
# 1. 依存インストール（リポジトリルートで 1 回）
npm install

# 2. PostgreSQL を起動（Docker。両アプリ共用。データは named volume に永続化）
docker compose up -d

# 3. 環境変数を設定（各アプリの .env.example をコピーして .env.local を作成し、ZENRIN 認証情報を記入）
cp apps/viewer/.env.example apps/viewer/.env.local
cp apps/viewer/.env.example apps/input/.env.local   # input には NEXT_PUBLIC_VIEWER_ORIGIN も追記

# 4. 開発サーバ起動（別ターミナルで並行起動できる）
npm run dev:viewer   # http://localhost:3000/（閲覧）
npm run dev:input    # http://localhost:3001/（入力）
```

初回アクセス時にスキーマ作成・住所マスタ・筆マスタ・サンプルデータの投入が自動で走る。

## 画面

**案件閲覧システム（viewer・port 3000）**

| パス | 画面 |
|---|---|
| `/` | 案件一覧（地図 + サイドリスト。閲覧専用） |
| `/projects/[id]` | 案件詳細（公図風ビュー + 地図。訪問記録の追加あり） |
| `/kouzu-map` | 登記所備付地図ビューア（独立画面） |

**案件入力システム（input・port 3001）**

| パス | 画面 |
|---|---|
| `/` | 案件一覧テーブル（＋新規案件） |
| `/projects/[id]/edit` | 案件編集（インライン編集・領域描画・土地 CRUD） |

## 主なコマンド

```bash
npm run dev:viewer     # 閲覧システム開発サーバ（port 3000）
npm run dev:input      # 入力システム開発サーバ（port 3001）
npm run build          # 両アプリの本番ビルド + 型チェック
npm run build:viewer   # 個別ビルド
npm run build:input
```

## 構成

- `apps/viewer` / `apps/input`: 各システムの `app/`（ルート + Route Handlers）と固有コンポーネント
- `packages/shared`: DB レイヤー・クエリ・ZENRIN 連携・共有型・共有 UI・共有 CSS・シードデータ
- データ: PostgreSQL（`docker-compose.yml`）+ シード（`packages/shared/data/`）

詳細な設計・データ構造・デモ用の制約は [`CLAUDE.md`](./CLAUDE.md) を参照。
