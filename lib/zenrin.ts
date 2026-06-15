// ============================================================
// ZENRIN Maps API タイルプロキシ（proxy.py / api/tile.py の移植）
// OAuth2.0 client_credentials のアクセストークンを期限内キャッシュし、
// タイル取得時に Authorization / x-api-key ヘッダを付与する。
// トークンはプロセス内（globalThis）に保持する。
// ============================================================

const ZENRIN_AUTH_TYPE = process.env.ZENRIN_AUTH_TYPE ?? "oauth"; // oauth | referer | ip
const ZENRIN_DOMAIN = process.env.ZENRIN_DOMAIN ?? "test-web.zmaps-api.com";
const ZENRIN_LAYER = process.env.ZENRIN_LAYER ?? "lp1";
const ZENRIN_STYLE = process.env.ZENRIN_STYLE ?? "default";

const ZENRIN_CLIENT_ID = process.env.ZENRIN_CLIENT_ID ?? "";
const ZENRIN_CLIENT_SECRET = process.env.ZENRIN_CLIENT_SECRET ?? "";
const ZENRIN_TOKEN_URL =
  process.env.ZENRIN_TOKEN_URL ?? "https://test-web.zmaps-api.com/oauth2/token";

const ZENRIN_API_KEY = process.env.ZENRIN_API_KEY ?? "";
const ZENRIN_REFERER = process.env.ZENRIN_REFERER ?? "http://localhost:3000/";

interface TokenState {
  token: string;
  expiresAt: number; // epoch ms
}

const globalForZenrin = globalThis as unknown as {
  __zenrinToken?: TokenState;
};

/** client_credentials でアクセストークンを取得し、期限内キャッシュする。 */
async function getToken(): Promise<string> {
  const now = Date.now();
  const cached = globalForZenrin.__zenrinToken;
  if (cached && now < cached.expiresAt) return cached.token;

  if (!ZENRIN_CLIENT_ID || !ZENRIN_CLIENT_SECRET) {
    throw new Error("ZENRIN_CLIENT_ID / ZENRIN_CLIENT_SECRET が設定されていません");
  }
  const basic = Buffer.from(`${ZENRIN_CLIENT_ID}:${ZENRIN_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(ZENRIN_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`OAuth トークン取得に失敗しました: HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
  };
  const expiresIn = payload.expires_in ?? 3600;
  const tokenType = payload.token_type ?? "Bearer";
  const value = `${tokenType} ${payload.access_token}`;
  globalForZenrin.__zenrinToken = {
    token: value,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return value;
}

/** 認証方式に応じたタイル取得用ヘッダを組み立てる。 */
async function authHeaders(): Promise<Record<string, string>> {
  if (ZENRIN_AUTH_TYPE === "oauth") {
    const headers: Record<string, string> = { Authorization: await getToken() };
    if (ZENRIN_API_KEY) headers["x-api-key"] = ZENRIN_API_KEY;
    return headers;
  }
  if (ZENRIN_AUTH_TYPE === "ip") {
    if (!ZENRIN_API_KEY) throw new Error("ZENRIN_API_KEY is not set");
    return { "x-api-key": ZENRIN_API_KEY, Authorization: "ip" };
  }
  if (ZENRIN_AUTH_TYPE === "referer") {
    if (!ZENRIN_API_KEY) throw new Error("ZENRIN_API_KEY is not set");
    return {
      "x-api-key": ZENRIN_API_KEY,
      Authorization: "referer",
      Referer: ZENRIN_REFERER,
    };
  }
  throw new Error(`Unknown ZENRIN_AUTH_TYPE: ${ZENRIN_AUTH_TYPE}`);
}

/**
 * タイルを取得して PNG レスポンスを返す。
 * ZENRIN REST は z/row(=y)/col(=x) の順。
 */
export async function fetchTile(z: string, x: string, y: string): Promise<Response> {
  const upstream =
    `https://${ZENRIN_DOMAIN}/map/wmts_tile/` +
    `${ZENRIN_LAYER}/${ZENRIN_STYLE}/Z3857_3_21/${z}/${y}/${x}.png`;
  const res = await fetch(upstream, { headers: await authHeaders() });
  if (!res.ok) {
    return new Response(`Upstream ${res.status}`, { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
