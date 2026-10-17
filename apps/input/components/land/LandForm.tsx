"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FormActions } from "@/components/form/FormActions";
import { useFormSubmit } from "@/components/form/use-form-submit";
import { Input } from "@chiban/shared/components/ui/input";
import { Textarea } from "@chiban/shared/components/ui/textarea";
import { Label } from "@chiban/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chiban/shared/components/ui/select";
import { updateLand } from "@chiban/shared/lib/data-client";
import { STATUS_DEFS, STATUS_KEYS, fmtTsubo } from "@chiban/shared/lib/format";
import { m2ToTsubo } from "@chiban/shared/lib/geo";
import type { Project, Land, LandStatus } from "@chiban/shared/lib/types";

const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/**
 * 土地の基本情報の編集フォーム（ステータス・面積・概要のみ）。
 * 地権者・抵当権・建物はそれぞれの行単位ページで編集する
 * （このフォームは owners / mortgages / buildings キーを送らない）。
 */
export function LandForm({ proj, land }: { proj: Project; land: Land }) {
  const { saving, error, setError, submit } = useFormSubmit();
  const [status, setStatus] = useState<LandStatus>(land.status);
  const [areaM2, setAreaM2] = useState(land.areaM2 != null ? String(land.areaM2) : "");
  const [description, setDescription] = useState(land.description ?? "");

  const backHref = `/projects/${proj.id}/lands/${land.id}`;
  const areaNum = Number(areaM2);
  const tsuboHint =
    areaM2.trim() !== "" && Number.isFinite(areaNum) && areaNum > 0
      ? `＝ ${fmtTsubo(m2ToTsubo(areaNum))} 坪`
      : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = areaM2.trim();
    const area = t === "" ? 0 : Number(t);
    if (!Number.isFinite(area) || area < 0) {
      setError("面積は 0 以上の数値（㎡）で入力してください");
      return;
    }
    await submit(
      () =>
        updateLand(proj.id, land.id, {
          status,
          areaM2: area,
          description: description.trim(),
        }),
      { successMessage: "土地を保存しました", redirectTo: backHref },
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <PageHeader
        crumbs={[
          { label: "案件一覧", href: "/" },
          { label: proj.name, href: `/projects/${proj.id}` },
          { label: landTitle(land), href: backHref },
          { label: "編集" },
        ]}
        title={`${landTitle(land)} の編集`}
      />

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className="grid grid-cols-[112px_1fr] items-center gap-x-3">
            <Label className="text-xs">ステータス</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LandStatus)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_DEFS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[112px_1fr] items-center gap-x-3">
            <Label htmlFor="areaM2" className="text-xs">面積（㎡）</Label>
            <div className="flex items-center gap-2">
              <Input
                id="areaM2"
                type="number"
                min={0}
                step="0.01"
                value={areaM2}
                onChange={(e) => setAreaM2(e.target.value)}
                placeholder="例：267.86（登記簿の地積）"
                className="max-w-56"
              />
              <span className="text-xs text-muted-foreground">{tsuboHint}</span>
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] items-start gap-x-3">
            <Label htmlFor="description" className="pt-2 text-xs">概要</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：家族構成・隣地との関係・接道状況など"
              rows={3}
            />
          </div>
        </div>

        <FormActions saving={saving} error={error} cancelHref={backHref} />
      </form>
    </main>
  );
}
