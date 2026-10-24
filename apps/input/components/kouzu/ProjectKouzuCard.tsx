"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, EditLink, SmallButton } from "@/components/Card";
import { AttachmentSlot } from "@/components/document/AttachmentSlot";
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
 * 案件に添付し、地図への位置合わせ・差し替え・削除を行う。公図は 1 案件につき 1 つまでなので
 * 1 ファイル分の枠（AttachmentSlot）として見せる。位置合わせは 1 回、同じ公図の上で何筆でも描ける。
 * 保存後は router.refresh() でサーバコンポーネントを読み直す。
 */
export function ProjectKouzuCard({
  projectId,
  kouzu,
}: {
  projectId: string;
  kouzu: RegistryDocument[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const doc = kouzu[0];

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

  return (
    <Card
      title="公図"
      action={
        doc?.overlay && (
          <EditLink href={`/projects/${projectId}/lands/new/draw`} label="公図から筆を描く" />
        )
      }
    >
      {/* 未添付なら添付、添付済みなら差し替えに使う（ファイル選択は 1 つの input で足りる） */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          input.value = ""; // 同じファイルを再選択できるようにする
          if (!file) return;
          if (doc) {
            void run(
              () => replaceProjectKouzu(projectId, doc.id, file),
              "公図を差し替えました（位置合わせをやり直してください）",
            );
          } else {
            void run(
              () => uploadProjectKouzu(projectId, file),
              "公図を添付しました（次に位置合わせをしてください）",
            );
          }
        }}
      />

      <p className="mb-2 text-xs text-muted-foreground">
        筆マスタに無い筆は、ここに添付した公図を地図に位置合わせしてから、その上に描いて追加できます。
      </p>
      <AttachmentSlot
        doc={doc}
        href={doc && `${projectKouzuPath(projectId)}/${encodeURIComponent(doc.id)}`}
        emptyText="公図は未添付です"
        hint="JPEG・PNG／10MB まで（PDF は画像に変換してください）"
        busy={busy}
        onPick={() => inputRef.current?.click()}
        meta={
          doc && (
            <>
              <span className={doc.overlay ? "text-status-acquired" : "text-[#b45309]"}>
                {doc.overlay ? "位置合わせ済み" : "位置合わせ未設定"}
              </span>
              {`・${fmtBytes(doc.byteSize)}`}
              {doc.uploadedBy && `・${doc.uploadedBy}`}
              {`・${fmtDateTime(doc.updatedAt ?? doc.createdAt)}`}
            </>
          )
        }
        actions={
          doc && (
            <>
              <EditLink
                href={`/projects/${projectId}/kouzu/${encodeURIComponent(doc.id)}/align`}
                label="位置合わせ"
              />
              <SmallButton label="差し替え" disabled={busy} onClick={() => inputRef.current?.click()} />
              <SmallButton
                label="削除"
                tone="danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`公図「${doc.fileName}」を削除します。よろしいですか？\n（この公図から描いた筆・土地は消えません）`)) return;
                  void run(() => deleteProjectKouzu(projectId, doc.id), "公図を削除しました");
                }}
              />
            </>
          )
        }
      />
    </Card>
  );
}
