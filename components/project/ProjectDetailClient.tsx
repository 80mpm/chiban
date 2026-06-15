"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { KouzuView } from "@/components/kouzu/KouzuView";
import { VisitAddForm } from "@/components/project/VisitAddForm";
import { useProjects } from "@/hooks/use-projects";
import { STATUS_DEFS, formatOwners, fmtDateTime, fmtDateOnly, fmtTsubo } from "@/lib/format";
import type { Project, Visit } from "@/lib/types";

const ProjectAreaMap = dynamic(() => import("@/components/map/ProjectAreaMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#eef2f7]" />,
});

const PRINCIPAL_LABELS: Record<string, string> = {
  principal: "主権者",
  non_principal: "非主権者",
  other: "その他",
};
const dash = (s: string) => s || "—";

function VisitItem({ v }: { v: Visit }) {
  const item = (k: string, val: string) =>
    val ? (
      <span className="rounded border border-[#fde68a] bg-white px-1.5 py-px">
        <span className="mr-1 text-[#92400e]">{k}</span>
        {val}
      </span>
    ) : null;
  return (
    <div className="mb-1.5 rounded-md border border-[#fde68a] bg-[#fef9e7] px-2.5 py-2">
      {v.user && <div className="text-[11px] font-semibold text-[#b45309]">{v.user}</div>}
      <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#1e293b]">
        {v.comment}
      </div>
      <div className="mt-1 text-[10px] text-[#94a3b8]">{dash(fmtDateTime(v.date))}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[#475569]">
        {item("直TEL", v.directOrTel)}
        {item("面談", v.meetingType)}
        {item("進捗", v.progress)}
        {item("区分", PRINCIPAL_LABELS[v.principal] ?? PRINCIPAL_LABELS.principal)}
        {v.nextDate ? item("次回", fmtDateTime(v.nextDate)) : null}
      </div>
    </div>
  );
}

export function ProjectDetailClient({
  initialProjects,
  projectId,
}: {
  initialProjects: Project[];
  projectId: string;
}) {
  const { data: projects = [] } = useProjects(initialProjects);
  const proj = projects.find((p) => p.id === projectId);
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);

  if (!proj) {
    return (
      <div className="m-8 rounded-lg border border-[#fca5a5] bg-white p-6 text-[#991b1b]">
        案件が見つかりません。
      </div>
    );
  }

  const lands = proj.lands ?? [];
  const selectedLand = lands.find((l) => l.id === selectedLandId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      {/* 左: 公図風ビュー */}
      <div className="relative min-w-0 flex-1 border-r-2 border-[#d4dde6] bg-[#f1f5f9]">
        <div className="kouzu-host absolute inset-0 border-0">
          <KouzuView
            lands={lands}
            selectedLandId={selectedLandId}
            onSelectLand={setSelectedLandId}
          />
        </div>
      </div>

      {/* 右: 地図 + 土地詳細オーバーレイ */}
      <div className="relative min-w-0 flex-1 bg-[#eef2f7]">
        <ProjectAreaMap project={proj} />

        {selectedLand && (
          <div className="absolute inset-0 z-[1001] overflow-y-auto bg-white p-4 text-xs text-[#1e293b] shadow-[-2px_0_10px_rgba(0,0,0,.1)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="flex-1 text-[15px] font-bold text-[#21295c]">
                地番 {[selectedLand.aza, selectedLand.chiban].filter(Boolean).join(" ") || "—"}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedLandId(null)}
                className="whitespace-nowrap rounded-md border border-[#cbd5e1] px-2.5 py-1 text-xs text-[#475569] hover:border-[#94a3b8] hover:bg-[#f1f5f9]"
              >
                ✕ 地図に戻る
              </button>
            </div>

            <div className="mb-3 grid grid-cols-[80px_1fr] gap-x-2.5 gap-y-1.5">
              <div className="text-[11px] text-[#64748b]">ステータス</div>
              <div>
                <span
                  className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: (STATUS_DEFS[selectedLand.status] ?? STATUS_DEFS.target).color }}
                >
                  {(STATUS_DEFS[selectedLand.status] ?? STATUS_DEFS.target).label}
                </span>
              </div>
              <div className="text-[11px] text-[#64748b]">地権者</div>
              <div>{formatOwners(selectedLand.owners) || "—"}</div>
              <div className="text-[11px] text-[#64748b]">坪数</div>
              <div>{fmtTsubo(selectedLand.areaTsubo)} 坪</div>
              <div className="text-[11px] text-[#64748b]">概要</div>
              <div>{selectedLand.description || "—"}</div>
              <div className="text-[11px] text-[#64748b]">登録日</div>
              <div>{dash(fmtDateOnly(selectedLand.createdAt))}</div>
              <div className="text-[11px] text-[#64748b]">更新日</div>
              <div>{dash(fmtDateTime(selectedLand.updatedAt ?? selectedLand.createdAt))}</div>
            </div>

            <h5 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
              訪問記録（{(selectedLand.visits ?? []).length}件）
            </h5>
            {(selectedLand.visits ?? []).length === 0 ? (
              <div className="p-2 text-center text-xs text-[#94a3b8]">訪問記録はまだありません</div>
            ) : (
              [...(selectedLand.visits ?? [])]
                .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime())
                .map((v) => <VisitItem key={v.id} v={v} />)
            )}

            <VisitAddForm projectId={proj.id} landId={selectedLand.id} />
          </div>
        )}
      </div>
    </div>
  );
}
