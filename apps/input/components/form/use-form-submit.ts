"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * フォーム保存の共通フロー。
 * submit(action, options) で保存処理を実行し、
 * - 成功: トースト表示 → redirectTo へ遷移 → router.refresh()（RSC の再取得）
 *   redirectTo には固定パスのほか、action の戻り値から遷移先を組む関数も渡せる
 *   （例: 作成 API の応答 id で詳細ページへ）
 * - 失敗: error にサーバの日本語メッセージを保持（フォーム上部バナーで表示する）
 */
export function useFormSubmit() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit<T>(
    action: () => Promise<T>,
    options: {
      successMessage: string;
      redirectTo: string | ((result: T) => string);
    },
  ): Promise<void> {
    setError("");
    setSaving(true);
    try {
      const result = await action();
      toast.success(options.successMessage);
      const to =
        typeof options.redirectTo === "function"
          ? options.redirectTo(result)
          : options.redirectTo;
      router.push(to);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return { saving, error, setError, submit };
}
