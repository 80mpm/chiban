"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Input } from "@chiban/shared/components/ui/input";
import { Label } from "@chiban/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chiban/shared/components/ui/select";
import { createUser, updateUser } from "@chiban/shared/lib/data-client";
import { USER_ROLE_DEFS, USER_ROLE_KEYS } from "@chiban/shared/lib/format";
import type { User, UserRole } from "@chiban/shared/lib/types";

const LOGIN_ID_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const PASSWORD_MIN = 8;

/**
 * ユーザーの登録/編集共用フォーム。
 * - 登録: ログインID・氏名・種別・初期パスワード（確認付き）
 * - 編集: 氏名・種別のみ（ログインIDは変更不可。パスワードは専用ページで再設定）。
 *   停止/再開ボタンもこのページに置く
 */
export function UserForm({ user }: { user?: User }) {
  const isCreate = !user;
  const router = useRouter();
  const { saving, error, setError, submit } = useFormSubmit();
  const [loginId, setLoginId] = useState(user?.loginId ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "sales");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [toggling, setToggling] = useState(false);

  const backHref = "/users";
  const title = isCreate ? "ユーザーを登録" : `ユーザーの編集（${user.loginId}）`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameT = name.trim();
    if (!nameT) {
      setError("氏名は必須です");
      return;
    }
    if (isCreate) {
      const loginIdT = loginId.trim();
      if (!LOGIN_ID_RE.test(loginIdT)) {
        setError("ログインIDは 3〜32 文字の半角英数字・ハイフン・アンダースコアで入力してください");
        return;
      }
      if (password.length < PASSWORD_MIN) {
        setError(`初期パスワードは ${PASSWORD_MIN} 文字以上で入力してください`);
        return;
      }
      if (password !== passwordConfirm) {
        setError("初期パスワードと確認が一致しません");
        return;
      }
      await submit(() => createUser({ loginId: loginIdT, name: nameT, role, password }), {
        successMessage: "ユーザーを登録しました",
        redirectTo: backHref,
      });
      return;
    }
    await submit(() => updateUser(user.id, { name: nameT, role }), {
      successMessage: "ユーザーを保存しました",
      redirectTo: backHref,
    });
  }

  /** 停止 ⇄ 再開の切り替え（confirm 付き・即時 PATCH）。 */
  async function handleToggleActive() {
    if (!user) return;
    const next = !user.isActive;
    const msg = next
      ? `「${user.name}（${user.loginId}）」を再開します。よろしいですか？`
      : `「${user.name}（${user.loginId}）」を停止します。停止中はログインできなくなります。よろしいですか？`;
    if (!window.confirm(msg)) return;
    setToggling(true);
    try {
      await updateUser(user.id, { isActive: next });
      toast.success(next ? "ユーザーを再開しました" : "ユーザーを停止しました");
      router.push(backHref);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setToggling(false);
    }
  }

  const fieldCls = "grid grid-cols-[132px_1fr] items-center gap-x-3";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: "ユーザー管理", href: backHref },
          { label: title },
        ]}
        title={title}
        actions={
          !isCreate ? (
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                user.isActive
                  ? "bg-[#10b981]/10 text-[#059669]"
                  : "bg-[#94a3b8]/15 text-[#64748b]"
              }`}
            >
              {user.isActive ? "有効" : "停止中"}
            </span>
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className={fieldCls}>
            <Label htmlFor="loginId" className="text-xs">
              ログインID {isCreate && <span className="text-destructive">*</span>}
            </Label>
            {isCreate ? (
              <Input
                id="loginId"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="例：kimura（半角英数と - _）"
                autoFocus
                className="max-w-72 font-mono"
              />
            ) : (
              <div className="font-mono text-sm text-muted-foreground">
                {user.loginId}（変更できません）
              </div>
            )}
          </div>

          <div className={fieldCls}>
            <Label htmlFor="name" className="text-xs">
              氏名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：木村"
              className="max-w-72"
            />
          </div>

          <div className={fieldCls}>
            <Label className="text-xs">種別</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {USER_ROLE_DEFS[r].label}（{USER_ROLE_DEFS[r].system}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCreate && (
            <>
              <div className={fieldCls}>
                <Label htmlFor="password" className="text-xs">
                  初期パスワード <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`${PASSWORD_MIN} 文字以上`}
                  className="max-w-72"
                  autoComplete="new-password"
                />
              </div>
              <div className={fieldCls}>
                <Label htmlFor="passwordConfirm" className="text-xs">
                  初期パスワード（確認） <span className="text-destructive">*</span>
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
            </>
          )}
        </div>

        <FormActions
          saving={saving}
          error={error}
          cancelHref={backHref}
          saveLabel={isCreate ? "登録" : "保存"}
        />
      </form>

      {!isCreate && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm">
          <a
            href={`/users/${encodeURIComponent(user.id)}/password`}
            className="text-sm text-brand hover:underline"
          >
            パスワードを再設定する →
          </a>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={toggling}
            className={`rounded-md border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
              user.isActive
                ? "border-[#fca5a5] bg-white text-[#dc2626] hover:bg-[#fef2f2]"
                : "border-border bg-white text-[#059669] hover:bg-secondary"
            }`}
          >
            {toggling ? "処理中…" : user.isActive ? "このユーザーを停止する" : "このユーザーを再開する"}
          </button>
        </div>
      )}
    </main>
  );
}
