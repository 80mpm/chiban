"use client";

import { toast } from "sonner";
import { InlineTextField } from "@/components/InlineTextField";
import { OwnersEditor } from "@/components/project/OwnersEditor";
import { MortgagesEditor } from "@/components/project/MortgagesEditor";
import { fmtDateOnly } from "@/lib/format";
import type { Building } from "@/lib/types";

/** 新規建物の空テンプレート（id はサーバが採番するため空）。 */
function emptyBuilding(): Building {
  return {
    id: "",
    kaokuNumber: "",
    structure: "",
    usage: "",
    floorArea: null,
    builtDate: "",
    description: "",
    owners: [],
    mortgages: [],
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * 土地の建物を編集する（家屋番号・構造・種類・床面積・建物の地権者）。
 * どの変更も建物配列全体を再構築して onChange に渡し、土地 PATCH で全置換する。
 */
export function BuildingsEditor({
  buildings,
  onChange,
}: {
  buildings: Building[];
  onChange: (buildings: Building[]) => Promise<boolean>;
}) {
  const list = buildings ?? [];

  /** index の建物に patch を当てた新配列で保存する。 */
  function patchBuilding(index: number, patch: Partial<Building>): Promise<boolean> {
    return onChange(list.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  const labelCls = "text-[11px] text-muted-foreground";

  return (
    <div>
      <div className="mb-1.5 mt-3.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#475569]">
          建物 ({list.length})
        </h4>
        <button
          type="button"
          onClick={() => onChange([...list, emptyBuilding()])}
          className="rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-secondary"
        >
          ＋ 建物を追加
        </button>
      </div>

      {list.length === 0 ? (
        <div className="py-1.5 text-xs text-muted-foreground">建物なし（更地）</div>
      ) : (
        <div className="space-y-2.5">
          {list.map((b, i) => (
            <div
              key={b.id || `new-${i}`}
              className="rounded-md border border-border bg-[#f8fafc] px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <strong className="text-[12px] text-[color:var(--app-text-dark)]">
                  建物 {i + 1}
                </strong>
                <button
                  type="button"
                  onClick={() => onChange(list.filter((_, j) => j !== i))}
                  className="rounded-md border border-[#fca5a5] bg-white px-2 py-0.5 text-[11px] text-[#dc2626] hover:bg-[#fef2f2]"
                >
                  削除
                </button>
              </div>

              <div className="grid grid-cols-[76px_1fr] items-center gap-x-2.5 gap-y-1.5 text-sm">
                <label className={labelCls}>家屋番号</label>
                <InlineTextField
                  type="input"
                  placeholder="例：西浅草二丁目24番3"
                  value={b.kaokuNumber}
                  onConfirm={(next) => patchBuilding(i, { kaokuNumber: next.trim() })}
                />

                <label className={labelCls}>構造</label>
                <InlineTextField
                  type="input"
                  placeholder="例：木造瓦葺2階建"
                  value={b.structure}
                  onConfirm={(next) => patchBuilding(i, { structure: next.trim() })}
                />

                <label className={labelCls}>種類・用途</label>
                <InlineTextField
                  type="input"
                  placeholder="例：居宅／共同住宅"
                  value={b.usage}
                  onConfirm={(next) => patchBuilding(i, { usage: next.trim() })}
                />

                <label className={labelCls}>床面積</label>
                <InlineTextField
                  type="number"
                  placeholder="例：96.52"
                  value={b.floorArea}
                  formatDisplay={(v) => `${v} ㎡`}
                  onConfirm={(next) => {
                    const t = next.trim();
                    if (t === "") return patchBuilding(i, { floorArea: null });
                    const n = Number(t);
                    if (!Number.isFinite(n) || n < 0) {
                      toast.error("床面積は 0 以上の数値で入力してください");
                      return false;
                    }
                    return patchBuilding(i, { floorArea: n });
                  }}
                />

                <label className={labelCls}>新築年月日</label>
                <InlineTextField
                  type="date"
                  value={b.builtDate}
                  formatDisplay={(v) => fmtDateOnly(String(v))}
                  onConfirm={(next) => patchBuilding(i, { builtDate: next.trim() })}
                />

                <label className={labelCls}>備考</label>
                <InlineTextField
                  type="textarea"
                  placeholder="例：老朽化が進み建替え前提／借地上建物 など"
                  value={b.description}
                  onConfirm={(next) => patchBuilding(i, { description: next.trim() })}
                />
              </div>

              <OwnersEditor
                title="建物の地権者"
                owners={b.owners}
                onChange={(owners) => patchBuilding(i, { owners })}
              />
              <MortgagesEditor
                mortgages={b.mortgages}
                onChange={(mortgages) => patchBuilding(i, { mortgages })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
