import { ApiError } from "./api-error";

/**
 * リクエストボディを JSON として読む。空ボディは {} を返す。
 * JSON として壊れている場合は 400（proxy.py の _read_json_body 相当）。
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "リクエストボディが JSON として解釈できません");
  }
}

/** multipart/form-data から取り出した 1 ファイル。 */
export interface UploadedFile {
  /** 元のファイル名（未指定のブラウザ向けに空文字を許容）。 */
  fileName: string;
  /** ブラウザが申告した MIME タイプ。 */
  contentType: string;
  bytes: Buffer;
}

/**
 * multipart/form-data のリクエストから指定フィールドのファイルを読む。
 * multipart でない・ファイルが無い場合は 400（サイズ・種別の検証は業務層で行う）。
 */
export async function readUploadFile(
  req: Request,
  field = "file",
): Promise<UploadedFile> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "ファイルの送信形式が不正です");
  }
  const value = form.get(field);
  if (!value || typeof value === "string") {
    throw new ApiError(400, "ファイルが選択されていません");
  }
  return {
    fileName: value.name ?? "",
    contentType: value.type ?? "",
    bytes: Buffer.from(await value.arrayBuffer()),
  };
}
