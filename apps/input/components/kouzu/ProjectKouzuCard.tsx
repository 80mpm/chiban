"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, EditLink, SmallButton } from "@/components/Card";
import {
  deleteProjectKouzu,
  projectKouzuPath,
  replaceProjectKouzu,
  uploadProjectKouzu,
} from "@chiban/shared/lib/data-client";
import { fmtBytes, fmtDateTime } from "@chiban/shared/lib/format";
import type { RegistryDocument } from "@chiban/shared/lib/types";

/** 受け付けるファイル種別（サーバ側の ALLOWED_PROJECT_KOUZU_TYPES と対応）。 */
const ACCEPT = "image/jpeg,image/png";

/**
 * 案件の公図カード（Issue #44）。筆マスタに無い筆を描くための下地の公図画像を
 * 案件に添付し、地図への位置合わせ・差し替え・削除を行う。位置合わせは 1 枚につき 1 回で、
 * 同じ公図の上で何筆でも描ける。保存後は router.refresh() でサーバコンポーネントを読み直す。
 */
export function ProjectKouzuCard({
  projectId,
  kouzu,
}: {
  projectId: string;
  kouzu: RegistryDocument[];
}) {
  const router = useRouter();
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const basePath = projectKouzuPath(projectId);
  const aligned = kouzu.some((d) => d.overlay);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** input[type=file] から 1 件取り出し、同じファイルを再選択できるよう値を消す。 */
  function takeFile(input: HTMLInputElement | null): File | null {
    const file = input?.files?.[0] ?? null;
    if (input) input.value = "";
    return file;
  }

  return (
    <Card
      title={`公図（${kouzu.length}）`}
      action={
        <div className="flex gap-1.5">
          {aligned && (
            <EditLink href={`/projects/${projectId}/lands/new/draw`} label="公図から筆を描く" />
          )}
          <SmallButton
            label="＋ 公図を添付"
            disabled={busy}
            onClick={() => addInputRef.current?.click()}
          />
        </div>
      }
    >
      <input
        ref={addInputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = takeFile(e.currentTarget);
          if (!file) return;
          void run(() => uploadProjectKouzu(projectId, file), "公図を添付しました（次に位置合わせをしてください）");
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = takeFile(e.currentTarget);
          const docId = replaceTargetId.current;
          replaceTargetId.current = null;
          if (!file || !docId) return;
          void run(
            () => replaceProjectKouzu(projectId, docId, file),
            "公図を差し替えました（位置合わせをやり直してください）",
          );
        }}
      />

      <p className="mb-2 text-xs text-muted-foreground">
        筆マスタに無い筆は、ここに添付した公図を地図に位置合わせしてから、その上に描いて追加できます
        （JPEG・PNG／1 ファイル 10MB まで。PDF は画像に変換してください）。
      </p>
      {kouzu.length === 0 ? (
        <div className="text-xs text-muted-foreground">添付なし</div>
      ) : (
        <ul className="space-y-1.5">
          {kouzu.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-border bg-[#f8fafc] px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={`${basePath}/${encodeURIComponent(d.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 break-all font-medium text-[color:var(--app-brand)] underline-offset-2 hover:underline"
                >
                  {d.fileName}
                </a>
                <div className="flex shrink-0 gap-1.5">
                  <EditLink
                    href={`/projects/${projectId}/kouzu/${encodeURIComponent(d.id)}/align`}
                    label="位置合わせ"
                  />
                  <SmallButton
                    label="差し替え"
                    disabled={busy}
                    onClick={() => {
                      replaceTargetId.current = d.id;
                      replaceInputRef.current?.click();
                    }}
                  />
                  <SmallButton
                    label="削除"
                    tone="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`公図「${d.fileName}」を削除します。よろしいですか？\n（この公図から描いた筆・土地は消えません）`)) return;
                      void run(() => deleteProjectKouzu(projectId, d.id), "公図を削除しました");
                    }}
                  />
                </div>
              </div>
              <div className="mt-0.5 text-muted-foreground">
                <span className={d.overlay ? "text-status-acquired" : "text-[#b45309]"}>
                  {d.overlay ? "位置合わせ済み" : "位置合わせ未設定"}
                </span>
                {`・${fmtBytes(d.byteSize)}`}
                {d.uploadedBy && `・${d.uploadedBy}`}
                {`・${fmtDateTime(d.updatedAt ?? d.createdAt)}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
