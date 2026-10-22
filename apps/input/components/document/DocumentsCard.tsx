"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, SmallButton } from "@/components/Card";
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

/**
 * 登記簿等の添付ファイルのカード（土地・建物共用）。
 * buildingId を渡すと建物の添付になる。kind（既定 registry=登記簿）で種別を選び、
 * documents のうちその種別のものだけを表示・追加する（土地は登記簿と公図の 2 枚、建物は登記簿 1 枚）。保存後は router.refresh() で
 * サーバコンポーネントを読み直す（入力システムはキャッシュを持たない方針）。
 */
export function DocumentsCard({
  title,
  projectId,
  landId,
  buildingId,
  kind = "registry",
  documents,
  maxFiles,
}: {
  title: string;
  projectId: string;
  landId: string;
  buildingId?: string;
  kind?: DocumentKind;
  documents: RegistryDocument[] | undefined;
  /** 添付できる上限（建物の登記簿・土地の公図は 1）。上限に達したら「＋ ファイルを添付」を出さない。 */
  maxFiles?: number;
}) {
  const router = useRouter();
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = (documents ?? []).filter((d) => d.kind === kind);
  const full = maxFiles !== undefined && docs.length >= maxFiles;
  const limitText = maxFiles === 1 ? "1 つまで" : maxFiles !== undefined ? `${maxFiles} ファイルまで` : "";
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

  /** input[type=file] から 1 件取り出し、同じファイルを再選択できるよう値を消す。 */
  function takeFile(input: HTMLInputElement | null): File | null {
    const file = input?.files?.[0] ?? null;
    if (input) input.value = "";
    return file;
  }

  return (
    <Card
      title={`${title}（${docs.length}）`}
      action={
        full ? undefined : (
          <SmallButton
            label="＋ ファイルを添付"
            disabled={busy}
            onClick={() => addInputRef.current?.click()}
          />
        )
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
          void run(
            () => uploadDocument(projectId, landId, file, buildingId, kind),
            "ファイルを添付しました",
          );
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
            () => replaceDocument(projectId, landId, docId, file, buildingId),
            "ファイルを差し替えました",
          );
        }}
      />

      {docs.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          添付なし（PDF・JPEG・PNG／1 ファイル 10MB まで{limitText && `・${limitText}`}）
        </div>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
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
                      if (!window.confirm(`「${d.fileName}」を削除します。よろしいですか？`)) return;
                      void run(
                        () => deleteDocument(projectId, landId, d.id, buildingId),
                        "添付を削除しました",
                      );
                    }}
                  />
                </div>
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {fmtBytes(d.byteSize)}
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
