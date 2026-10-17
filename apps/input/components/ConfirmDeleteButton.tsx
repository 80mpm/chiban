"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * 削除ボタンの共通実装。window.confirm → 削除 API → トースト → 遷移。
 * ページ遷移を伴う削除（案件・土地・建物）で使う。
 */
export function ConfirmDeleteButton({
  label,
  confirmMessage,
  successMessage,
  redirectTo,
  onDelete,
}: {
  label: string;
  confirmMessage: string;
  successMessage: string;
  redirectTo: string;
  onDelete: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setDeleting(true);
    try {
      await onDelete();
      toast.success(successMessage);
      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={deleting}
      className="rounded-md border border-[#fca5a5] bg-white px-3 py-1.5 text-xs text-[#dc2626] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {deleting ? "削除中…" : label}
    </button>
  );
}
