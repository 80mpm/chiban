// ============================================================
// 業務エラー（HTTP ステータス付き）と Route Handler 用ラッパ
// db.py の ApiError + proxy.py の例外 → JSON 応答変換の移植。
// ============================================================

/** HTTP ステータス付きの業務エラー。message はそのまま UI に出るので日本語で書く。 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** PostgreSQL の接続不能エラーか判定する（pg / postgres.js 双方のコードを見る）。 */
function isConnectionError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "CONNECTION_ENDED" ||
    code === "CONNECTION_DESTROYED" ||
    code === "57P03" // cannot_connect_now
  );
}

/** UNIQUE 制約違反（SQLSTATE 23505）か判定する。 */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

/**
 * Route Handler 本体を包み、例外を JSON エラー応答に変換する。
 * - ApiError        → その status と日本語メッセージ
 * - DB 接続不能      → 503 + docker 起動の案内
 * - その他          → 500 + サーバエラー
 */
export async function withApi(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof ApiError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (isConnectionError(e)) {
      return Response.json(
        {
          error:
            "データベースに接続できません。`docker compose up -d` で PostgreSQL を起動してください。",
        },
        { status: 503 },
      );
    }
    console.error("[api] サーバエラー:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `サーバエラー: ${msg}` }, { status: 500 });
  }
}

/** 成功 JSON 応答（Cache-Control: no-store は db.py 同様）。 */
export function jsonOk(payload: unknown, status = 200): Response {
  if (status === 204) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
