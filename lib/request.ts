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
