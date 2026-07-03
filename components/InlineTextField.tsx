"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldType = "input" | "textarea" | "number" | "date";

/**
 * 鉛筆 → 入力 → 確定(✓)/取消(✕) のインライン編集（旧 common.js setupInlineTextField）。
 * onConfirm が false を返すとバリデーション失敗として編集モードを継続する。
 * onConfirm は async 可（API 保存の完了を待つ）。
 */
export function InlineTextField({
  type = "input",
  value,
  placeholder,
  formatDisplay,
  onConfirm,
  className,
}: {
  type?: FieldType;
  value: string | number | null;
  placeholder?: string;
  formatDisplay?: (v: string | number) => string;
  onConfirm: (newValue: string) => Promise<boolean | void> | boolean | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const isEmpty = value === "" || value == null;
  const display = isEmpty
    ? "未設定"
    : formatDisplay
      ? formatDisplay(value)
      : String(value);

  function startEdit() {
    setDraft(value == null ? "" : String(value));
    setInvalid(false);
    setEditing(true);
    // 次のレンダ後にフォーカス
    setTimeout(() => {
      ref.current?.focus();
      ref.current?.select?.();
    }, 0);
  }

  async function tryConfirm() {
    setBusy(true);
    const ok = await onConfirm(draft);
    setBusy(false);
    if (ok === false) {
      setInvalid(true);
      setTimeout(() => ref.current?.focus(), 0);
      return;
    }
    setEditing(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && type !== "textarea") {
      e.preventDefault();
      tryConfirm();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && type === "textarea") {
      e.preventDefault();
      tryConfirm();
    }
  }

  if (!editing) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <div
          className={cn(
            "min-w-0 flex-1 whitespace-pre-wrap break-words text-sm",
            isEmpty && "text-[color:var(--app-text-light)] italic",
          )}
        >
          {display}
        </div>
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

  const inputClass = cn(
    "w-full rounded-md border bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]",
    invalid ? "border-destructive" : "border-input",
  );

  return (
    <div className={cn("flex items-start gap-1.5", className)}>
      {type === "textarea" ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          placeholder={placeholder}
          value={draft}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          className={inputClass}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
          min={type === "number" ? 0 : undefined}
          step={type === "number" ? 0.1 : undefined}
          placeholder={placeholder}
          value={draft}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          className={inputClass}
        />
      )}
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
