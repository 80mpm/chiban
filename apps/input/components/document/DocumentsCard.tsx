"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, SmallButton } from "@/components/Card";
import { AttachmentSlot } from "@/components/document/AttachmentSlot";
import {
  uploadDocument,
  replaceDocument,
  deleteDocument,
  documentsPath,
} from "@chiban/shared/lib/data-client";
import { fmtBytes, fmtDateTime } from "@chiban/shared/lib/format";
import type { DocumentKind, RegistryDocument } from "@chiban/shared/lib/types";

/** 受け付けるファイル種別（サーバ側の ALLOWED_DOCUMENT_TYPES と対応）。 */
const ACCEPT = "application/pdf,image/jpeg,image/png";

/** 種別の表示名（空き枠の文言に使う）。 */
const KIND_LABEL: Record<DocumentKind, string> = { registry: "登記簿", kouzu: "公図" };

/**
 * 登記簿等の添付ファイルのカード（土地・建物共用）。
 * buildingId を渡すと建物の添付になる。kind（既定 registry=登記簿）で種別を選ぶ。
 * 添付は紐づけ先ごと・種類ごとに 1 つまで（サーバで 409）なので、カードは 1 ファイル分の枠として
 * 「未添付なら空き枠 + 添付ボタン／添付済みならそのファイル + 差し替え・削除」だけを出す。
 * 保存後は router.refresh() でサーバコンポーネントを読み直す（入力システムはキャッシュを持たない方針）。
 */
export function DocumentsCard({
  title,
  projectId,
  landId,
  buildingId,
  kind = "registry",
  documents,
}: {
  title: string;
  projectId: string;
  landId: string;
  buildingId?: string;
  kind?: DocumentKind;
  documents: RegistryDocument[] | undefined;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const doc = (documents ?? []).find((d) => d.kind === kind);
  const basePath = documentsPath(projectId, landId, buildingId);

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
    <Card title={title}>
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
              () => replaceDocument(projectId, landId, doc.id, file, buildingId),
              "ファイルを差し替えました",
            );
          } else {
            void run(
              () => uploadDocument(projectId, landId, file, buildingId, kind),
              "ファイルを添付しました",
            );
          }
        }}
      />

      <AttachmentSlot
        doc={doc}
        href={doc && `${basePath}/${encodeURIComponent(doc.id)}`}
        emptyText={`${KIND_LABEL[kind]}は未添付です`}
        hint="PDF・JPEG・PNG／10MB まで"
        busy={busy}
        onPick={() => inputRef.current?.click()}
        meta={
          doc && (
            <>
              {fmtBytes(doc.byteSize)}
              {doc.uploadedBy && `・${doc.uploadedBy}`}
              {`・${fmtDateTime(doc.updatedAt ?? doc.createdAt)}`}
            </>
          )
        }
        actions={
          doc && (
            <>
              <SmallButton label="差し替え" disabled={busy} onClick={() => inputRef.current?.click()} />
              <SmallButton
              label="削除"
              tone="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`「${doc.fileName}」を削除します。よろしいですか？`)) return;
                void run(
                  () => deleteDocument(projectId, landId, doc.id, buildingId),
                    "添付を削除しました",
                  );
                }}
              />
            </>
          )
        }
      />
    </Card>
  );
}
