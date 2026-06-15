"use client";

import { STATUS_DEFS } from "@/lib/format";
import type { Land } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 案件のステータス積み上げセグメントバー（旧 common.js renderStatusBar）。
 * 表示順は acquired → target で固定（左から達成済 → 残り）。
 */
export function StatusBar({
  lands,
  compact = false,
}: {
  lands: Land[];
  compact?: boolean;
}) {
  const total = lands.length;
  const counts = { target: 0, acquired: 0 };
  for (const l of lands) counts[l.status] = (counts[l.status] ?? 0) + 1;

  const height = compact ? "h-2.5" : "h-4";

  if (total === 0) {
    return (
      <div className={cn("flex w-full overflow-hidden rounded", height, "bg-[color:var(--app-text-light)]/20")}>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className={cn("flex w-full overflow-hidden rounded", height)}>
      {(["acquired", "target"] as const).map((k) => {
        const n = counts[k];
        if (n === 0) return null;
        return (
          <div
            key={k}
            style={{ flex: n, backgroundColor: STATUS_DEFS[k].color }}
            title={`${STATUS_DEFS[k].label} ${n}件`}
          />
        );
      })}
    </div>
  );
}
