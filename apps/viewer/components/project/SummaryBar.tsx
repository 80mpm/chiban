import Link from "next/link";
import { fmtTsubo } from "@/lib/format";
import type { Project } from "@/lib/types";

function SumItem({
  label,
  value,
  className = "",
  flex = "1 1 0",
}: {
  label: string;
  value: string | null;
  className?: string;
  flex?: string;
}) {
  const empty = value == null || value === "";
  return (
    <div
      className={`flex min-w-0 flex-col justify-center gap-0.5 border-r border-[#eef2f7] px-4 py-2 ${className}`}
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

/** 案件サマリー横帯（旧 detail.html summary-bar）。末尾に案件編集への導線。 */
export function SummaryBar({ project }: { project: Project }) {
  const totalTsubo = (project.lands ?? []).reduce(
    (s, l) => s + (Number(l.areaTsubo) || 0),
    0,
  );
  return (
    <div className="flex flex-none flex-col border-b border-[#d4dde6] bg-white">
      <div className="flex items-stretch">
        <SumItem label="住所" value={project.address} flex="2 1 0" />
        <SumItem label="総坪数" value={totalTsubo > 0 ? `${fmtTsubo(totalTsubo)} 坪` : null} />
        <SumItem label="用途地域" value={project.zoning} />
        <SumItem label="建蔽率" value={project.currentBcr != null ? `${project.currentBcr}%` : null} />
        <SumItem label="容積率" value={project.currentFar != null ? `${project.currentFar}%` : null} />
        <SumItem label="想定容積率" value={project.targetFar != null ? `${project.targetFar}%` : null} />
        <SumItem label="担当" value={project.staff} />
        <Link
          href={`/projects/${encodeURIComponent(project.id)}/edit`}
          className="my-0 mx-4 flex-none self-center whitespace-nowrap rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white no-underline hover:bg-[#0a78ad]"
        >
          案件編集
        </Link>
      </div>
      <div className="flex items-stretch border-t border-[#eef2f7]">
        <SumItem label="アクセス" value={project.access} />
        <SumItem label="概要" value={project.description} />
      </div>
    </div>
  );
}
