"use client";

import { useState } from "react";
import { fmtTsubo } from "@chiban/shared/lib/format";
import type { Project } from "@chiban/shared/lib/types";

interface SumEntry {
  label: string;
  value: string | null;
  /** PC の横帯での伸縮率。 */
  flex?: string;
  /** モバイルの 2 列グリッドで全幅にする（アクセス・概要などの長文）。 */
  wide?: boolean;
}

function SumItem({ label, value, flex = "1 1 0" }: SumEntry) {
  const empty = value == null || value === "";
  return (
    <div
      className="flex min-w-0 flex-col justify-center gap-0.5 border-r border-[#eef2f7] px-4 py-2"
      style={{ flex }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
        {label}
      </span>
      <span
        className={`truncate text-[13px] leading-snug ${empty ? "text-[#94a3b8]" : "text-[#1e293b]"}`}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}

/**
 * 案件サマリー横帯（旧 detail.html summary-bar）。
 * PC は従来の 2 段横帯、モバイル（md 未満）は「案件情報 ▼」の折りたたみ
 * （初期は閉。展開すると 2 列グリッドで全項目）。
 */
export function SummaryBar({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const totalTsubo = (project.lands ?? []).reduce(
    (s, l) => s + (Number(l.areaTsubo) || 0),
    0,
  );

  const row1: SumEntry[] = [
    { label: "住所", value: project.address, flex: "2 1 0" },
    { label: "総坪数", value: totalTsubo > 0 ? `${fmtTsubo(totalTsubo)} 坪` : null },
    { label: "用途地域", value: project.zoning },
    { label: "建蔽率", value: project.currentBcr != null ? `${project.currentBcr}%` : null },
    { label: "容積率", value: project.currentFar != null ? `${project.currentFar}%` : null },
    { label: "想定容積率", value: project.targetFar != null ? `${project.targetFar}%` : null },
    { label: "担当", value: project.staff },
  ];
  const row2: SumEntry[] = [
    { label: "アクセス", value: project.access, wide: true },
    { label: "概要", value: project.description, wide: true },
  ];

  return (
    <div className="flex-none border-b border-[#d4dde6] bg-white">
      {/* PC: 従来の 2 段横帯 */}
      <div className="hidden md:block">
        <div className="flex items-stretch">
          {row1.map((e) => (
            <SumItem key={e.label} {...e} />
          ))}
        </div>
        <div className="flex items-stretch border-t border-[#eef2f7]">
          {row2.map((e) => (
            <SumItem key={e.label} {...e} />
          ))}
        </div>
      </div>

      {/* モバイル: 折りたたみ（住所の要約 + ▼） */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
        >
          <span className="min-w-0 truncate text-xs text-[#475569]">
            <span className="mr-1.5 font-semibold text-[#94a3b8]">案件情報</span>
            {project.address || "—"}
          </span>
          <span className="flex-none text-[10px] text-[#94a3b8]">{open ? "▲ 閉じる" : "▼ 開く"}</span>
        </button>
        {open && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#eef2f7] px-4 py-3">
            {[...row1, ...row2].map((e) => (
              <div key={e.label} className={`min-w-0 ${e.wide ? "col-span-2" : ""}`}>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                  {e.label}
                </dt>
                <dd
                  className={`whitespace-pre-wrap break-words text-[13px] leading-snug ${
                    e.value ? "text-[#1e293b]" : "text-[#94a3b8]"
                  }`}
                >
                  {e.value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
