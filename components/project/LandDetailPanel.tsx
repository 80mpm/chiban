"use client";

import { useState } from "react";
import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { useProjectMutations } from "@/hooks/use-projects";
import { useParcelTowns, useParcelsByTown } from "@/hooks/use-parcels";
import { STATUS_DEFS, STATUS_KEYS, formatOwners, parseOwners, fmtDateTime, fmtDateOnly } from "@/lib/format";
import type { Project, Land } from "@/lib/types";

const dash = (s: string) => s || "—";
const landTitle = (l: Land) => [l.aza, l.chiban].filter(Boolean).join(" ") || "—";

/** 筆の付け替え行（町名 → 地番のプルダウン）。 */
function ParcelChangeRow({
  proj,
  land,
  onConfirm,
  onEditingChange,
}: {
  proj: Project;
  land: Land;
  onConfirm: (parcelId: number) => Promise<void>;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [town, setTown] = useState(land.aza);
  const [parcelId, setParcelId] = useState<number | null>(land.parcelId);
  const { data: towns } = useParcelTowns(editing);
  const { data: parcels, isLoading } = useParcelsByTown(editing ? town : null);

  const usedIds = new Set(
    (proj.lands ?? []).filter((l) => l.id !== land.id).map((l) => l.parcelId),
  );
  const avail = (parcels ?? []).filter((p) => !usedIds.has(p.parcelId));

  function begin() {
    setTown(land.aza);
    setParcelId(land.parcelId);
    setEditing(true);
    onEditingChange(true);
  }
  function cancel() {
    setEditing(false);
    onEditingChange(false);
  }
  async function confirm() {
    if (parcelId == null) return;
    setEditing(false);
    onEditingChange(false);
    await onConfirm(parcelId);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded bg-[color:var(--app-status-acquired)]/10 px-2 py-0.5 text-xs font-medium text-status-acquired">
          {landTitle(land)}
        </span>
        <button
          type="button"
          onClick={begin}
          className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
        >
          筆を変更
        </button>
      </div>
    );
  }

  const selCls =
    "rounded-md border border-input bg-white px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-[color:var(--ring)]";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={selCls}
        value={town}
        disabled={!towns}
        onChange={(e) => {
          setTown(e.target.value);
          setParcelId(null);
        }}
      >
        {!towns ? (
          <option>読み込み中…</option>
        ) : (
          towns.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))
        )}
      </select>
      <select
        className={selCls}
        value={parcelId ?? ""}
        disabled={isLoading}
        onChange={(e) => setParcelId(e.target.value ? Number(e.target.value) : null)}
      >
        {isLoading ? (
          <option value="">読み込み中…</option>
        ) : avail.length ? (
          avail.map((p) => (
            <option key={p.parcelId} value={p.parcelId}>
              {p.chiban}
            </option>
          ))
        ) : (
          <option value="">（この町名の筆はすべて追加済み）</option>
        )}
      </select>
      <button
        type="button"
        onClick={confirm}
        disabled={parcelId == null}
        className="flex size-6 items-center justify-center rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50"
        title="確定"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={cancel}
        className="flex size-6 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80"
        title="取消"
      >
        ✕
      </button>
    </div>
  );
}

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
  const [editingParcel, setEditingParcel] = useState(false);

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
        <ParcelChangeRow
          proj={proj}
          land={land}
          onEditingChange={setEditingParcel}
          onConfirm={async (parcelId) => {
            await save({ parcelId });
          }}
        />

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
          formatDisplay={(v) => `${v} 坪`}
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
          disabled={editingParcel}
          onClick={() => onDeleteLand(land.id)}
          className="rounded-md border border-[#fca5a5] bg-white px-3 py-1.5 text-xs text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-50"
        >
          この土地を削除
        </button>
      </div>
    </div>
  );
}
