"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Input } from "@chiban/shared/components/ui/input";
import { Textarea } from "@chiban/shared/components/ui/textarea";
import { Label } from "@chiban/shared/components/ui/label";
import { createProject, updateProject } from "@chiban/shared/lib/data-client";
import type { Project } from "@chiban/shared/lib/types";

/** フォームの値（数値項目は入力中の文字列のまま保持し、保存時に変換する）。 */
interface FormValues {
  name: string;
  description: string;
  address: string;
  access: string;
  staff: string;
  zoning: string;
  currentBcr: string;
  currentFar: string;
  targetFar: string;
}

/** 「0 以上の数値 or 空」を検証して number | null に変換する。不正は undefined。 */
function numOrNull(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * 案件の作成/編集共用フォーム。
 * 作成は案件名・概要のみ（詳細は作成後に編集ページで入力する）。
 */
export function ProjectForm({ proj }: { proj?: Project }) {
  const isCreate = !proj;
  const { saving, error, setError, submit } = useFormSubmit();
  const [values, setValues] = useState<FormValues>({
    name: proj?.name ?? "",
    description: proj?.description ?? "",
    address: proj?.address ?? "",
    access: proj?.access ?? "",
    staff: proj?.staff ?? "",
    zoning: proj?.zoning ?? "",
    currentBcr: proj?.currentBcr != null ? String(proj.currentBcr) : "",
    currentFar: proj?.currentFar != null ? String(proj.currentFar) : "",
    targetFar: proj?.targetFar != null ? String(proj.targetFar) : "",
  });

  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));
  const cancelHref = isCreate ? "/" : `/projects/${proj.id}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setError("案件名は必須です");
      return;
    }
    if (isCreate) {
      await submit(
        () => createProject({ name, description: values.description.trim() }),
        {
          successMessage: "案件を作成しました",
          redirectTo: (created) => `/projects/${created.id}`,
        },
      );
      return;
    }
    const currentBcr = numOrNull(values.currentBcr);
    const currentFar = numOrNull(values.currentFar);
    const targetFar = numOrNull(values.targetFar);
    if (currentBcr === undefined || currentFar === undefined || targetFar === undefined) {
      setError("建蔽率・容積率は 0 以上の数値（%）で入力してください");
      return;
    }
    await submit(
      () =>
        updateProject(proj.id, {
          name,
          description: values.description.trim(),
          address: values.address.trim() || null,
          access: values.access.trim() || null,
          staff: values.staff.trim() || null,
          zoning: values.zoning.trim() || null,
          currentBcr,
          currentFar,
          targetFar,
        }),
      { successMessage: "案件情報を保存しました", redirectTo: `/projects/${proj.id}` },
    );
  }

  const fieldCls = "grid grid-cols-[112px_1fr] items-center gap-x-3";

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        crumbs={
          isCreate
            ? [{ label: "案件一覧", href: "/" }, { label: "新規案件" }]
            : [
                { label: "案件一覧", href: "/" },
                { label: proj.name, href: `/projects/${proj.id}` },
                { label: "案件情報の編集" },
              ]
        }
        title={isCreate ? "新規案件" : "案件情報の編集"}
      />

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className={fieldCls}>
          <Label htmlFor="name" className="text-xs">
            案件名 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="例：西浅草二丁目プロジェクト"
            autoFocus={isCreate}
          />
        </div>

        <div className={`${fieldCls} items-start`}>
          <Label htmlFor="description" className="pt-2 text-xs">概要</Label>
          <Textarea
            id="description"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="例：駅東口・商業地のオフィスビル建設用地として隣接筆をまとめて取得"
            rows={3}
          />
        </div>

        {!isCreate && (
          <>
            <div className={fieldCls}>
              <Label htmlFor="address" className="text-xs">所在地</Label>
              <Input
                id="address"
                value={values.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="例：東京都台東区西浅草二丁目24"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="access" className="text-xs">アクセス</Label>
              <Input
                id="access"
                value={values.access}
                onChange={(e) => set({ access: e.target.value })}
                placeholder="例：つくばエクスプレス 浅草駅 徒歩3分"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="staff" className="text-xs">担当</Label>
              <Input
                id="staff"
                value={values.staff}
                onChange={(e) => set({ staff: e.target.value })}
                placeholder="例：木村"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="zoning" className="text-xs">用途地域</Label>
              <Input
                id="zoning"
                value={values.zoning}
                onChange={(e) => set({ zoning: e.target.value })}
                placeholder="例：商業地域"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="currentBcr" className="text-xs">建蔽率（%）</Label>
              <Input
                id="currentBcr"
                type="number"
                min={0}
                value={values.currentBcr}
                onChange={(e) => set({ currentBcr: e.target.value })}
                placeholder="例：80"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="currentFar" className="text-xs">現況容積率（%）</Label>
              <Input
                id="currentFar"
                type="number"
                min={0}
                value={values.currentFar}
                onChange={(e) => set({ currentFar: e.target.value })}
                placeholder="例：600"
              />
            </div>
            <div className={fieldCls}>
              <Label htmlFor="targetFar" className="text-xs">想定容積率（%）</Label>
              <Input
                id="targetFar"
                type="number"
                min={0}
                value={values.targetFar}
                onChange={(e) => set({ targetFar: e.target.value })}
                placeholder="例：800"
              />
            </div>
          </>
        )}

        <FormActions
          saving={saving}
          error={error}
          cancelHref={cancelHref}
          saveLabel={isCreate ? "作成" : "保存"}
        />
      </form>
    </main>
  );
}
