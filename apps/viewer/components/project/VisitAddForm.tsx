"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useProjectMutations } from "@/hooks/use-projects";

const SELECT_CLS =
  "w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[color:var(--ring)]";
const LABEL_CLS = "mb-1 block text-[10px] font-semibold text-muted-foreground";

/**
 * 訪問記録の追加フォーム（旧 detail.js renderVisitForm）。
 * CLAUDE.md ポリシーにより追加のみ（編集・削除はしない）。担当者名は廃止。
 */
export function VisitAddForm({
  projectId,
  landId,
}: {
  projectId: string;
  landId: string;
}) {
  const { addVisit } = useProjectMutations();
  const [comment, setComment] = useState("");
  const [directOrTel, setDirectOrTel] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [progress, setProgress] = useState("");
  const [principal, setPrincipal] = useState("principal");
  const [nextDate, setNextDate] = useState("");

  async function handleSubmit() {
    if (!comment.trim()) {
      toast.error("コメントは必須です");
      return;
    }
    try {
      await addVisit.mutateAsync({
        projectId,
        landId,
        fields: {
          comment: comment.trim(),
          directOrTel,
          meetingType,
          progress,
          nextDate: nextDate ? new Date(nextDate).toISOString() : "",
          principal,
        },
      });
      // 入力をリセット
      setComment("");
      setDirectOrTel("");
      setMeetingType("");
      setProgress("");
      setPrincipal("principal");
      setNextDate("");
      toast.success("訪問記録を追加しました");
    } catch (e) {
      toast.error(`訪問記録の追加に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <h5 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        訪問記録を追加
      </h5>
      <div className="mb-2">
        <label className={LABEL_CLS}>
          コメント <span className="text-destructive">*</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="コメントを入力"
          className={`${SELECT_CLS} min-h-14 resize-y`}
        />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>直TEL</label>
          <select value={directOrTel} onChange={(e) => setDirectOrTel(e.target.value)} className={SELECT_CLS}>
            <option value="">—</option>
            <option value="直">直</option>
            <option value="TEL">TEL</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>面談区分</label>
          <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className={SELECT_CLS}>
            <option value="">—</option>
            <option value="面談(対面)">面談(対面)</option>
            <option value="面談(ITP)">面談(ITP)</option>
          </select>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>進捗</label>
          <select value={progress} onChange={(e) => setProgress(e.target.value)} className={SELECT_CLS}>
            <option value="">—</option>
            <option value="初期見込み">初期見込み</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>主権者区分</label>
          <select value={principal} onChange={(e) => setPrincipal(e.target.value)} className={SELECT_CLS}>
            <option value="principal">主権者</option>
            <option value="non_principal">非主権者</option>
            <option value="other">その他</option>
          </select>
        </div>
      </div>
      <div className="mb-2">
        <label className={LABEL_CLS}>次回予定日時</label>
        <input
          type="datetime-local"
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
          className={SELECT_CLS}
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={addVisit.isPending}
        className="mt-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        ＋ 訪問記録を追加
      </button>
    </div>
  );
}
