// ============================================================
// 訪問記録（db.py の add_visit の移植）。追加のみ。
// ============================================================

import { sql } from "../db/client";
import { ensureDbReady } from "../db/init";
import { uuid } from "../db/ids";
import { ApiError } from "../api-error";
import { parseProjectId, parseDt } from "./helpers";
import { visitJson, type VisitRow } from "./serialize";
import type { Visit } from "../types";

interface VisitFields {
  user?: string;
  comment?: string;
  date?: string;
  directOrTel?: string;
  meetingType?: string;
  nextDate?: string;
  progress?: string;
  principal?: string;
}

export async function addVisit(
  projectId: string,
  landId: string,
  fields: VisitFields,
): Promise<Visit> {
  await ensureDbReady();
  const pid = parseProjectId(projectId);

  const land = await sql`
    SELECT 1 FROM lands WHERE project_id = ${pid} AND id = ${landId}
  `;
  if (land.length === 0) throw new ApiError(404, "土地が見つかりません");

  const [row] = await sql<VisitRow[]>`
    INSERT INTO visits (id, land_id, user_name, comment, date,
                        direct_or_tel, meeting_type, next_date, progress, principal)
    VALUES (
      ${uuid()}, ${landId}, ${fields.user ?? ""}, ${fields.comment ?? ""},
      ${parseDt(fields.date, new Date())},
      ${fields.directOrTel ?? ""}, ${fields.meetingType ?? ""},
      ${parseDt(fields.nextDate)},
      ${fields.progress ?? ""}, ${fields.principal ?? "principal"}
    ) RETURNING *
  `;
  // 訪問追加も土地の活動なので、土地の更新日を進める
  await sql`UPDATE lands SET updated_at = now() WHERE id = ${landId}`;
  return visitJson(row);
}
