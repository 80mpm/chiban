"use client";

import { useState } from "react";
import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { BuildingSection } from "@/components/project/BuildingSection";
import { ParcelPickerDialog } from "@/components/project/ParcelPickerDialog";
import { useProjectMutations } from "@/hooks/use-projects";
import { STATUS_DEFS, STATUS_KEYS, formatOwners, parseOwners, fmtDateTime, fmtDateOnly, fmtTsubo } from "@/lib/format";
import type { Project, Land } from "@/lib/types";

const dash = (s: string) => s || "—";
const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/** 選択中の土地の詳細パネル（旧 edit.js setupLandDetailPanel）。 */
export function LandDetailPanel({
  proj,
  land,
  onDeleteLand,
}: {
  proj: Project;
  land: Land | null;
  onDeleteLand: (landId: string) => void;
}) {
  const { updateLand } = useProjectMutations();
  const [changeOpen, setChangeOpen] = useState(false);

  if (!land) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        公図ビュー上の筆をクリックして土地を選択してください
      </div>
    );
  }

  const def = STATUS_DEFS[land.status] ?? STATUS_DEFS.target;
  const visits = [...(land.visits ?? [])].sort(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
  );

  async function save(fields: Partial<Land>): Promise<boolean> {
    if (!land) return false;
    try {
      await updateLand.mutateAsync({ projectId: proj.id, landId: land.id, fields });
      return true;
    } catch (e) {
      toast.error(`保存に失敗しました: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  const labelCls = "text-[11px] text-muted-foreground";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
        <strong className="text-[13px] text-[color:var(--app-text-dark)]">{landTitle(land)}</strong>
        <select
          value={land.status}
          onChange={(e) => save({ status: e.target.value as Land["status"] })}
          className="rounded-lg px-2 py-0.5 text-xs font-medium text-white outline-none"
          style={{ background: def.color }}
          title="ステータスを変更"
        >
          {STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {STATUS_DEFS[k].label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[88px_1fr] items-center gap-x-2.5 gap-y-2 text-sm">
        <label className={labelCls}>筆（地番）</label>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[color:var(--app-status-acquired)]/10 px-2 py-0.5 text-xs font-medium text-status-acquired">
            {landTitle(land)}
          </span>
          <button
            type="button"
            onClick={() => setChangeOpen(true)}
            className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
          >
            筆を変更
          </button>
        </div>

        <label className={labelCls}>地権者</label>
        <InlineTextField
          type="input"
          placeholder="例：田中一郎、または 中嶋幸子（持分1/2）・中嶋直美（持分1/2）"
          value={formatOwners(land.owners)}
          onConfirm={(next) => save({ owners: parseOwners(next) })}
        />

        <label className={labelCls}>坪数</label>
        <InlineTextField
          type="number"
          placeholder="例：45"
          value={land.areaTsubo}
          formatDisplay={(v) => `${fmtTsubo(v)} 坪`}
          onConfirm={(next) => {
            const t = next.trim();
            if (t === "") return save({ areaTsubo: 0 });
            const num = Number(t);
            if (!Number.isFinite(num) || num < 0) {
              toast.error("坪数は 0 以上の数値で入力してください");
              return false;
            }
            return save({ areaTsubo: num });
          }}
        />

        <label className={labelCls}>概要</label>
        <InlineTextField
          type="textarea"
          placeholder="例：家族構成・隣地との関係・接道状況など"
          value={land.description || ""}
          onConfirm={(next) => save({ description: next.trim() })}
        />

        <label className={labelCls}>登録日</label>
        <div className="text-sm">{dash(fmtDateOnly(land.createdAt))}</div>

        <label className={labelCls}>更新日</label>
        <div className="text-sm">{dash(fmtDateTime(land.updatedAt ?? land.createdAt))}</div>
      </div>

      <BuildingSection proj={proj} land={land} />

      <h4 className="mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
        訪問記録 ({visits.length})
      </h4>
      <div className="space-y-1.5">
        {visits.length === 0 ? (
          <div className="py-1.5 text-xs text-muted-foreground">まだ訪問記録がありません</div>
        ) : (
          visits.map((v) => (
            <div key={v.id} className="rounded-md border border-[#fde68a] bg-[#fef9e7] px-2.5 py-2">
              {v.user && <div className="text-[11px] font-semibold text-[#b45309]">{v.user}</div>}
              <div className="mt-0.5 whitespace-pre-wrap break-words text-xs">{v.comment}</div>
              <div className="mt-1 text-[10px] text-[#94a3b8]">{dash(fmtDateTime(v.date))}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => onDeleteLand(land.id)}
          className="rounded-md border border-[#fca5a5] bg-white px-3 py-1.5 text-xs text-[#dc2626] hover:bg-[#fef2f2]"
        >
          この土地を削除
        </button>
      </div>

      {/* 筆を変更: 土地追加と同じ公図ピッカー（対象土地をハイライト・選んで閉じる） */}
      <ParcelPickerDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        proj={proj}
        title="筆を変更"
        defaultTownName={land.aza}
        selectedLandId={land.id}
        hintVerb="変更"
        keepOpenAfterPick={false}
        onPick={async (cand) => {
          await save({ parcelId: cand.parcelId });
        }}
      />
    </div>
  );
}
