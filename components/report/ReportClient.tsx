"use client";

import { useMemo, useState } from "react";
import { useProjects } from "@/hooks/use-projects";
import { formatOwners } from "@/lib/format";
import type { Project, Land, Visit } from "@/lib/types";

const PRINCIPAL_LABELS: Record<string, string> = {
  principal: "主権者",
  non_principal: "非主権者",
  other: "その他",
};

const RANK_COLOR: Record<string, string> = {
  A: "#10b981",
  B: "#f59e0b",
  C: "#f97316",
  D: "#ef4444",
};

const pad = (n: number) => String(n).padStart(2, "0");
function fmtDate(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}`;
}
function fmtTime(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

interface Row {
  proj: Project;
  land: Land;
  visit: Visit;
}

function buildRows(projects: Project[]): Row[] {
  const rows: Row[] = [];
  for (const proj of projects) {
    for (const land of proj.lands ?? []) {
      const visits = land.visits ?? [];
      if (visits.length === 0) continue;
      const latest = visits.reduce<Visit | null>(
        (best, v) => (!best || new Date(v.date ?? 0) > new Date(best.date ?? 0) ? v : best),
        null,
      );
      if (latest) rows.push({ proj, land, visit: latest });
    }
  }
  return rows;
}

const Muted = () => <span className="text-[#94a3b8]">—</span>;

const TH_CLS =
  "border-b border-r border-[#e2e8f0] bg-[#f1f5f9] px-2 py-2 text-left text-[11px] font-semibold leading-tight text-[#475569] whitespace-nowrap last:border-r-0";
const TD_CLS =
  "border-b border-r border-[#f1f5f9] px-2 py-2 align-top text-xs leading-relaxed text-[#1e293b] break-words last:border-r-0";

export function ReportClient({
  initialProjects,
  initialProjectId,
}: {
  initialProjects: Project[];
  initialProjectId?: string;
}) {
  const { data: projects = [] } = useProjects(initialProjects);
  const [projFilter, setProjFilter] = useState(initialProjectId ?? "");
  const [userFilter, setUserFilter] = useState("");

  const allRows = useMemo(() => buildRows(projects), [projects]);
  const users = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.visit.user).filter(Boolean))).sort(),
    [allRows],
  );

  const filtered = useMemo(
    () =>
      allRows
        .filter((r) => (!projFilter || r.proj.id === projFilter) && (!userFilter || r.visit.user === userFilter))
        .sort((a, b) => new Date(b.visit.date ?? 0).getTime() - new Date(a.visit.date ?? 0).getTime()),
    [allRows, projFilter, userFilter],
  );

  const selectCls =
    "rounded-md border border-[#cbd5e1] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-[color:var(--ring)]";

  return (
    <main className="overflow-x-auto p-5">
      <div className="mb-3.5 flex items-center gap-3.5 text-xs text-[#475569]">
        <label className="flex items-center gap-1.5">
          案件
          <select className={selectCls} value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
            <option value="">全て</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          担当
          <select className={selectCls} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="">全て</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[#94a3b8]">{filtered.length ? `${filtered.length} 件` : ""}</span>
      </div>

      <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-[#e2e8f0] bg-white">
        <colgroup>
          {[110, 140, 130, 88, 56, 44, 80, 76, 70, 88, 60, undefined, 90].map((w, i) => (
            <col key={i} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["所在地", "案件名", "地権者名", "日付", "時間", "直TEL", "担当", "面談区分", "主権者区分", "次回訪問予定日", "次回訪問時間", "コメント", "進捗状況"].map(
              (h) => (
                <th key={h} className={TH_CLS}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-4 py-10 text-center text-[#94a3b8]">
                該当する訪問記録がありません。本部管理画面で土地・訪問記録を追加してください。
              </td>
            </tr>
          ) : (
            filtered.map(({ proj, land, visit: v }) => (
              <tr key={`${land.id}-${v.id}`} className="hover:bg-[#f8fafc]">
                <td className={TD_CLS}>{proj.address || <Muted />}</td>
                <td className={TD_CLS}>{proj.name}</td>
                <td className={TD_CLS}>{formatOwners(land.owners) || "—"}</td>
                <td className={`${TD_CLS} whitespace-nowrap tabular-nums`}>{fmtDate(v.date) || <Muted />}</td>
                <td className={`${TD_CLS} whitespace-nowrap tabular-nums`}>{fmtTime(v.date) || <Muted />}</td>
                <td className={`${TD_CLS} whitespace-nowrap text-center`}>{v.directOrTel || <Muted />}</td>
                <td className={TD_CLS}>{v.user}</td>
                <td className={TD_CLS}>{v.meetingType || <Muted />}</td>
                <td className={`${TD_CLS} whitespace-nowrap text-center`}>
                  {PRINCIPAL_LABELS[v.principal] ?? PRINCIPAL_LABELS.principal}
                </td>
                <td className={`${TD_CLS} whitespace-nowrap tabular-nums`}>{v.nextDate ? fmtDate(v.nextDate) : <Muted />}</td>
                <td className={`${TD_CLS} whitespace-nowrap tabular-nums`}>{v.nextDate ? fmtTime(v.nextDate) : <Muted />}</td>
                <td className={TD_CLS}>{v.comment || ""}</td>
                <td className={`${TD_CLS} whitespace-nowrap`}>
                  {v.progress ? (
                    <span
                      className="inline-block min-w-[22px] rounded-lg px-1.5 py-px text-center text-[11px] font-bold text-white"
                      style={{ background: RANK_COLOR[v.progress] ?? "#94a3b8" }}
                    >
                      {v.progress}
                    </span>
                  ) : (
                    <Muted />
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
