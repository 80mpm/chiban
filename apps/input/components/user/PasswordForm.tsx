"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Input } from "@chiban/shared/components/ui/input";
import { Label } from "@chiban/shared/components/ui/label";
import { updateUser } from "@chiban/shared/lib/data-client";
import type { User } from "@chiban/shared/lib/types";

const PASSWORD_MIN = 8;

/**
 * パスワード再設定フォーム（管理者が新しいパスワードを直接設定するデモ方式。
 * メール送信等のリセットフローは持たない）。
 */
export function PasswordForm({ user }: { user: User }) {
  const { saving, error, setError, submit } = useFormSubmit();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const backHref = "/users";
  const title = `パスワード再設定（${user.loginId}）`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setError(`パスワードは ${PASSWORD_MIN} 文字以上で入力してください`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("新しいパスワードと確認が一致しません");
      return;
    }
    await submit(() => updateUser(user.id, { password }), {
      successMessage: `${user.name} のパスワードを再設定しました`,
      redirectTo: backHref,
    });
  }

  const fieldCls = "grid grid-cols-[168px_1fr] items-center gap-x-3";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: "ユーザー管理", href: backHref },
          { label: `${user.loginId} の編集`, href: `/users/${encodeURIComponent(user.id)}/edit` },
          { label: "パスワード再設定" },
        ]}
        title={title}
      />

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm text-muted-foreground">
          {user.name}（{user.loginId}）の新しいパスワードを設定します。
        </p>
        <div className="space-y-3">
          <div className={fieldCls}>
            <Label htmlFor="password" className="text-xs">
              新しいパスワード <span className="text-destructive">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${PASSWORD_MIN} 文字以上`}
              autoFocus
              className="max-w-72"
              autoComplete="new-password"
            />
          </div>
          <div className={fieldCls}>
            <Label htmlFor="passwordConfirm" className="text-xs">
              新しいパスワード（確認） <span className="text-destructive">*</span>
            </Label>
            <Input
              id="passwordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="max-w-72"
              autoComplete="new-password"
            />
          </div>
        </div>

        <FormActions saving={saving} error={error} cancelHref={backHref} saveLabel="再設定" />
      </form>
    </main>
  );
}
