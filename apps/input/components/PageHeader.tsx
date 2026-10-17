import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * ページ共通のパンくず + タイトル。
 * crumbs の最後の要素が現在ページ（リンクなし）になる想定だが、
 * href の有無だけで描画を切り替えるので順序の制約はない。
 */
export function PageHeader({
  crumbs,
  title,
  actions,
}: {
  crumbs: Crumb[];
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && " › "}
            {c.href ? (
              <Link href={c.href} className="text-brand hover:underline">
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[color:var(--app-text-dark)]">{title}</h2>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
