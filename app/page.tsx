import { Topbar } from "@/components/Topbar";

/**
 * 案件一覧（トップページ）。
 * PR1 時点では基盤確認用のプレースホルダ。PR5 で Leaflet 地図 +
 * サイドカード + 住所検索 + 新規案件モーダルを実装する。
 */
export default function HomePage() {
  return (
    <div className="grid h-full grid-rows-[56px_1fr]">
      <Topbar screen="案件一覧" />
      <main className="flex items-center justify-center p-6">
        <div className="rounded-lg border border-border bg-card px-8 py-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-[color:var(--app-text-dark)]">
            Next.js 基盤セットアップ完了
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            案件一覧の本実装は PR5 で行います。
          </p>
        </div>
      </main>
    </div>
  );
}
