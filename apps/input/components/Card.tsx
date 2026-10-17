"use client";

import Link from "next/link";

/** 詳細ページのカード外枠（見出し + 右上アクション）。土地・建物・登記簿で共用する。 */
export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--app-text-dark)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** カード右上・行内に置く小さめのリンクボタン。 */
export function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-white px-2.5 py-1 text-xs hover:bg-secondary"
    >
      {label}
    </Link>
  );
}

/** EditLink と同じ見た目のボタン（遷移しない操作に使う）。 */
export function SmallButton({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#fca5a5] text-[#dc2626] hover:bg-[#fef2f2]"
      : "border-border hover:bg-secondary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border bg-white px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {label}
    </button>
  );
}
