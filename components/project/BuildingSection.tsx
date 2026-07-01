"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineTextField } from "@/components/InlineTextField";
import { InlineSelectField } from "@/components/InlineSelectField";
import { useProjectMutations } from "@/hooks/use-projects";
import type { BuildingInput, BuildingUnitInput } from "@/lib/data-client";
import {
  OWNERSHIP_TYPE_DEFS,
  OWNERSHIP_TYPE_KEYS,
  formatOwners,
  parseOwners,
  fmtTsubo,
} from "@/lib/format";
import type { Project, Land, Building, BuildingUnit } from "@/lib/types";

const labelCls = "text-[11px] text-muted-foreground";

/** 敷地権割合・持分の「分子/分母」形式チェック（空は許容）。 */
function isValidShare(text: string): boolean {
  const s = text.trim();
  return s === "" || /^\d+\s*\/\s*[1-9]\d*$/.test(s);
}

/** BuildingUnit（サーバ形）→ 送信形（id を落とす）。 */
function toUnitInputs(units: BuildingUnit[]): BuildingUnitInput[] {
  return units.map(({ unitNumber, owners, siteShare, description }) => ({
    unitNumber,
    owners,
    siteShare,
    description,
  }));
}

function OwnershipBadge({ type }: { type: Building["ownershipType"] }) {
  const def = OWNERSHIP_TYPE_DEFS[type] ?? OWNERSHIP_TYPE_DEFS.sole;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ background: def.color }}
    >
      {def.label}
    </span>
  );
}

/** 専有部分 1 行（部屋番号・区分所有者・敷地権割合・備考のインライン編集）。 */
function UnitRow({
  unit,
  onSave,
  onDelete,
}: {
  unit: BuildingUnit;
  onSave: (fields: Partial<BuildingUnitInput>) => Promise<boolean>;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-[#f8fafc] px-2.5 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded bg-[#e2e8f0] px-2 py-0.5 text-xs font-semibold text-[#334155]">
          {unit.unitNumber} 号室
        </span>
        <button
          type="button"
          aria-label="専有部分を削除"
          title="専有部分を削除"
          onClick={onDelete}
          className="flex size-6 items-center justify-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="grid grid-cols-[88px_1fr] items-center gap-x-2.5 gap-y-1.5">
        <label className={labelCls}>部屋番号</label>
        <InlineTextField
          type="input"
          placeholder="例：301"
          value={unit.unitNumber}
          onConfirm={(next) => {
            if (!next.trim()) {
              toast.error("部屋番号は必須です");
              return false;
            }
            return onSave({ unitNumber: next.trim() });
          }}
        />
        <label className={labelCls}>区分所有者</label>
        <InlineTextField
          type="input"
          placeholder="例：田中一郎、または 斎藤勝（持分1/2）・斎藤朋子（持分1/2）"
          value={formatOwners(unit.owners)}
          onConfirm={(next) => onSave({ owners: parseOwners(next) })}
        />
        <label className={labelCls}>敷地権割合</label>
        <InlineTextField
          type="input"
          placeholder="例：2820/11280"
          value={unit.siteShare}
          onConfirm={(next) => {
            if (!isValidShare(next)) {
              toast.error("敷地権割合は「分子/分母」の形式で入力してください");
              return false;
            }
            return onSave({ siteShare: next.trim() });
          }}
        />
        <label className={labelCls}>備考</label>
        <InlineTextField
          type="input"
          placeholder="例：夫婦共有名義・賃借人あり など"
          value={unit.description}
          onConfirm={(next) => onSave({ description: next.trim() })}
        />
      </div>
    </div>
  );
}

/** 建物 1 棟のカード（インライン編集 + 専有部分 CRUD）。 */
function BuildingCard({
  proj,
  land,
  building,
}: {
  proj: Project;
  land: Land;
  building: Building;
}) {
  const { updateBuilding, deleteBuilding } = useProjectMutations();
  const [unitNumberDraft, setUnitNumberDraft] = useState("");
  const [unitOwnersDraft, setUnitOwnersDraft] = useState("");

  async function save(fields: BuildingInput): Promise<boolean> {
    try {
      await updateBuilding.mutateAsync({
        projectId: proj.id,
        landId: land.id,
        buildingId: building.id,
        fields,
      });
      return true;
    } catch (e) {
      toast.error(`保存に失敗しました: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** 専有部分の全置換保存（1 行の編集・追加・削除を units 配列に反映して送る）。 */
  function saveUnits(nextUnits: BuildingUnitInput[]): Promise<boolean> {
    return save({ units: nextUnits });
  }

  async function handleDeleteBuilding() {
    const title = building.name || `家屋番号 ${building.houseNumber}` || "この建物";
    if (!window.confirm(`「${title}」を削除しますか？（専有部分・所有者情報も削除されます）`)) return;
    try {
      await deleteBuilding.mutateAsync({
        projectId: proj.id,
        landId: land.id,
        buildingId: building.id,
      });
      toast.success("建物を削除しました");
    } catch (e) {
      toast.error(`削除に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function handleAddUnit() {
    const unitNumber = unitNumberDraft.trim();
    if (!unitNumber) {
      toast.error("部屋番号を入力してください");
      return;
    }
    const ok = await saveUnits([
      ...toUnitInputs(building.units),
      {
        unitNumber,
        owners: parseOwners(unitOwnersDraft),
        siteShare: "",
        description: "",
      },
    ]);
    if (ok) {
      setUnitNumberDraft("");
      setUnitOwnersDraft("");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-[13px] text-[color:var(--app-text-dark)]">
            {building.name || (building.houseNumber ? `家屋番号 ${building.houseNumber}` : "名称未設定")}
          </strong>
          <OwnershipBadge type={building.ownershipType} />
        </div>
        <button
          type="button"
          aria-label="建物を削除"
          title="建物を削除"
          onClick={handleDeleteBuilding}
          className="flex size-7 flex-none items-center justify-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-[88px_1fr] items-center gap-x-2.5 gap-y-1.5">
        <label className={labelCls}>建物名称</label>
        <InlineTextField
          type="input"
          placeholder="例：上野パークハイツ"
          value={building.name}
          onConfirm={(next) => save({ name: next.trim() })}
        />
        <label className={labelCls}>家屋番号</label>
        <InlineTextField
          type="input"
          placeholder="例：24番3"
          value={building.houseNumber}
          onConfirm={(next) => save({ houseNumber: next.trim() })}
        />
        <label className={labelCls}>構造</label>
        <InlineTextField
          type="input"
          placeholder="例：木造瓦葺2階建"
          value={building.structure}
          onConfirm={(next) => save({ structure: next.trim() })}
        />
        <label className={labelCls}>延床（坪）</label>
        <InlineTextField
          type="number"
          placeholder="例：28"
          value={building.floorAreaTsubo}
          formatDisplay={(v) => `${fmtTsubo(v)} 坪`}
          onConfirm={(next) => {
            const s = next.trim();
            if (s === "") return save({ floorAreaTsubo: null });
            const n = Number(s);
            if (!Number.isFinite(n) || n < 0) {
              toast.error("延床面積は 0 以上の数値で入力してください");
              return false;
            }
            return save({ floorAreaTsubo: n });
          }}
        />
        <label className={labelCls}>所有形態</label>
        <InlineSelectField
          options={OWNERSHIP_TYPE_KEYS.map((k) => ({
            value: k,
            label: OWNERSHIP_TYPE_DEFS[k].label,
            display: <OwnershipBadge type={k} />,
          }))}
          value={building.ownershipType}
          onConfirm={(next) => {
            if (next === building.ownershipType) return;
            const losing =
              building.ownershipType === "kubun"
                ? building.units.length > 0 && "専有部分の情報はすべて破棄されます"
                : building.owners.length > 0 && "建物の所有者情報は破棄されます";
            if (losing && !window.confirm(`所有形態を変更すると${losing}。よろしいですか？`)) {
              return false;
            }
            return save({ ownershipType: next as Building["ownershipType"] });
          }}
        />
        {building.ownershipType === "sole" && (
          <>
            <label className={labelCls}>所有者</label>
            <InlineTextField
              type="input"
              placeholder="例：田中一郎、または 中嶋幸子（持分1/2）・中嶋直美（持分1/2）"
              value={formatOwners(building.owners)}
              onConfirm={(next) => save({ owners: parseOwners(next) })}
            />
          </>
        )}
        <label className={labelCls}>備考</label>
        <InlineTextField
          type="textarea"
          placeholder="例：築年・管理状況・賃借人の有無など"
          value={building.description}
          onConfirm={(next) => save({ description: next.trim() })}
        />
      </div>

      {building.ownershipType === "kubun" && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-[#475569]">
            専有部分（{building.units.length}戸）
          </div>
          {building.units.length === 0 && (
            <div className="text-xs text-muted-foreground">専有部分がまだ登録されていません</div>
          )}
          {building.units.map((u) => (
            <UnitRow
              key={u.id}
              unit={u}
              onSave={(fields) =>
                saveUnits(
                  building.units.map((x) =>
                    x.id === u.id ? { ...toUnitInputs([x])[0], ...fields } : toUnitInputs([x])[0],
                  ),
                )
              }
              onDelete={() => {
                if (!window.confirm(`専有部分「${u.unitNumber} 号室」を削除しますか？`)) return;
                saveUnits(toUnitInputs(building.units.filter((x) => x.id !== u.id)));
              }}
            />
          ))}
          <div className="flex items-center gap-1.5">
            <input
              value={unitNumberDraft}
              onChange={(e) => setUnitNumberDraft(e.target.value)}
              placeholder="部屋番号"
              className="w-24 rounded-md border border-input bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            />
            <input
              value={unitOwnersDraft}
              onChange={(e) => setUnitOwnersDraft(e.target.value)}
              placeholder="区分所有者（例：田中一郎）"
              className="min-w-0 flex-1 rounded-md border border-input bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            />
            <button
              type="button"
              onClick={handleAddUnit}
              disabled={updateBuilding.isPending}
              className="whitespace-nowrap rounded-md border border-border bg-white px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50"
            >
              ＋ 追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 建物追加モーダル（基本情報のみ。所有者・専有部分は追加後にカードで編集）。 */
function BuildingAddDialog({
  open,
  onOpenChange,
  proj,
  land,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proj: Project;
  land: Land;
}) {
  const { createBuilding } = useProjectMutations();
  const [name, setName] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [structure, setStructure] = useState("");
  const [ownershipType, setOwnershipType] = useState<Building["ownershipType"]>("sole");
  const [ownersText, setOwnersText] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    try {
      await createBuilding.mutateAsync({
        projectId: proj.id,
        landId: land.id,
        fields: {
          name: name.trim(),
          houseNumber: houseNumber.trim(),
          structure: structure.trim(),
          ownershipType,
          owners: ownershipType === "sole" ? parseOwners(ownersText) : undefined,
        },
      });
      toast.success("建物を追加しました");
      setName("");
      setHouseNumber("");
      setStructure("");
      setOwnershipType("sole");
      setOwnersText("");
      onOpenChange(false);
    } catch (e) {
      setError(`追加に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建物を追加</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="b-name">建物名称</Label>
            <Input
              id="b-name"
              autoFocus
              placeholder="例：上野パークハイツ（戸建て等は空欄可）"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-house-number">家屋番号</Label>
            <Input
              id="b-house-number"
              placeholder="例：24番3"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-structure">構造</Label>
            <Input
              id="b-structure"
              placeholder="例：木造瓦葺2階建"
              value={structure}
              onChange={(e) => setStructure(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-ownership-type">所有形態</Label>
            <select
              id="b-ownership-type"
              value={ownershipType}
              onChange={(e) => setOwnershipType(e.target.value as Building["ownershipType"])}
              className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            >
              {OWNERSHIP_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {OWNERSHIP_TYPE_DEFS[k].label}
                  {k === "sole" ? "（単独・共有）" : "（分譲マンション等）"}
                </option>
              ))}
            </select>
          </div>
          {ownershipType === "sole" ? (
            <div className="space-y-1.5">
              <Label htmlFor="b-owners">所有者</Label>
              <Input
                id="b-owners"
                placeholder="例：田中一郎、または 中嶋幸子（持分1/2）・中嶋直美（持分1/2）"
                value={ownersText}
                onChange={(e) => setOwnersText(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              区分所有では所有者を専有部分（部屋）ごとに持ちます。追加後に建物カードから専有部分を登録してください。
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} disabled={createBuilding.isPending}>
            {createBuilding.isPending ? "追加中…" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 土地パネル内の建物セクション（一覧 + 追加）。 */
export function BuildingSection({ proj, land }: { proj: Project; land: Land }) {
  const [addOpen, setAddOpen] = useState(false);
  const buildings = land.buildings ?? [];

  return (
    <div>
      <div className="mb-1.5 mt-3.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
          建物 ({buildings.length})
        </h4>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
        >
          ＋ 建物を追加
        </button>
      </div>
      <div className="space-y-2">
        {buildings.length === 0 ? (
          <div className="py-1.5 text-xs text-muted-foreground">
            建物が登録されていません（更地の場合はそのままで構いません）
          </div>
        ) : (
          buildings.map((b) => (
            <BuildingCard key={b.id} proj={proj} land={land} building={b} />
          ))
        )}
      </div>
      <BuildingAddDialog open={addOpen} onOpenChange={setAddOpen} proj={proj} land={land} />
    </div>
  );
}
