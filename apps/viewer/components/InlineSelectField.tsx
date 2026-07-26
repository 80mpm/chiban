"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InlineSelectOption {
  value: string;
  label: string;
  /** 読み取り表示用の要素（ステータスのピル等）。省略時は label。 */
  display?: ReactNode;
}

/** セレクトのインライン編集（旧 common.js setupInlineSelectField）。 */
export function InlineSelectField({
  options,
  value,
  onConfirm,
  className,
}: {
  options: InlineSelectOption[];
  value: string;
  onConfirm: (newValue: string) => Promise<boolean | void> | boolean | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  const opt = options.find((o) => o.value === value);
  const display = opt ? (opt.display ?? opt.label) : <span className="text-[color:var(--app-text-light)] italic">未設定</span>;

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }

  async function tryConfirm() {
    setBusy(true);
    const ok = await onConfirm(draft);
    setBusy(false);
    if (ok === false) {
      setTimeout(() => ref.current?.focus(), 0);
      return;
    }
    setEditing(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      tryConfirm();
    }
  }

  if (!editing) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <div className="min-w-0 flex-1 text-sm">{display}</div>
        <button
          type="button"
          aria-label="編集"
          title="編集"
          onClick={startEdit}
          className="flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <select
        ref={ref}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-input bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex flex-none gap-1">
        <button
          type="button"
          aria-label="保存"
          title="保存"
          disabled={busy}
          onClick={tryConfirm}
          className="flex size-7 items-center justify-center rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          aria-label="取消"
          title="取消"
          disabled={busy}
          onClick={() => setEditing(false)}
          className="flex size-7 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
