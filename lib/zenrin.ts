// ============================================================
// ZENRIN Maps API タイルプロキシ（zip-site.com 系・ログイン認証）
//
// ユーザーID/パスワードで認証サーバにログインして認証情報（aid/kid/lmtinf）を取得し、
// WMTS GetTile(REST 方式) にクエリパラメータ（zis_*）として付与してタイルを取得する。
// セッションはプロセス内（globalThis）にキャッシュし、期限切れ・認証エラー時に再ログインする。
// 認証情報は仕様上ファイル/DB へ永続化しない。
// ============================================================

const ZENRIN_LAYER = process.env.ZENRIN_LAYER ?? "default"; // ラスター配信用マップタイプ
const ZENRIN_STYLE = process.env.ZENRIN_STYLE ?? "default"; // default | highres

const ZENRIN_USER_ID = process.env.ZENRIN_USER_ID ?? "";
const ZENRIN_PASSWORD = process.env.ZENRIN_PASSWORD ?? "";
const ZENRIN_SERVICE_ID = process.env.ZENRIN_SERVICE_ID ?? "";
// device_flag はログインAPIの必須パラメータで固定値 "1"（リファレンスより）。
const ZENRIN_DEVICE_FLAG = process.env.ZENRIN_DEVICE_FLAG ?? "1";
// 認証サーバ（login / logout）のドメイン。検証環境は test-api.zip-site.com
const ZENRIN_LOGIN_DOMAIN = process.env.ZENRIN_LOGIN_DOMAIN ?? "test-api.zip-site.com";
// WMTS タイル配信ドメイン。検証環境は test-wmts.zip-site.com
const ZENRIN_WMTS_DOMAIN = process.env.ZENRIN_WMTS_DOMAIN ?? "test-wmts.zip-site.com";
// セッション再ログイン間隔（秒）。同時ログイン数=1・自動タイムアウト30分/強制60分のため、
// 強制タイムアウトより手前で能動的に張り直す（既定 25 分）。
const ZENRIN_SESSION_TTL_SEC = Number(process.env.ZENRIN_SESSION_TTL_SEC ?? "1500");

// wmts_tile［画像出力(WMTS)GetTile(REST方式)］の機能コード（機能コード一覧より）。
const WMTS_TILE_FUNC_ID = "0007";
const WMTS_TILE_FUNC_SUBID = "0008";

const LOGIN_OK = "10100000";

interface SessionState {
  aid: string; // 認証承認ID
  kid: string; // 基盤認証ID
  lmtinf: string; // wmts_tile の "areaCode,funcInfo"
  expiresAt: number; // epoch ms（この時刻を過ぎたら再ログイン）
}

const globalForZenrin = globalThis as unknown as {
  __zenrinSession?: SessionState;
  __zenrinLoginInflight?: Promise<SessionState>;
};

interface LoginFunc {
  id: string;
  subid: string;
  areaCode: string;
  funcInfo: string;
}

/** ユーザーID/パスワードで認証サーバにログインし、aid/kid/lmtinf を得る。 */
async function login(): Promise<SessionState> {
  if (!ZENRIN_USER_ID || !ZENRIN_PASSWORD || !ZENRIN_SERVICE_ID) {
    throw new Error(
      "ログイン認証には ZENRIN_USER_ID / ZENRIN_PASSWORD / ZENRIN_SERVICE_ID が必要です",
    );
  }
  const url = new URL(`https://${ZENRIN_LOGIN_DOMAIN}/api/auth/login`);
  url.searchParams.set("user_id", ZENRIN_USER_ID);
  url.searchParams.set("password", ZENRIN_PASSWORD);
  url.searchParams.set("service_id", ZENRIN_SERVICE_ID);
  if (ZENRIN_DEVICE_FLAG) url.searchParams.set("device_flag", ZENRIN_DEVICE_FLAG);

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`ZENRIN ログインAPI 呼び出しに失敗しました: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    status?: { code?: string; text?: string };
    result?: { aid?: string; kid?: string; items?: { func?: LoginFunc[] } };
  };
  const code = json.status?.code;
  if (code !== LOGIN_OK) {
    // 10120004/05: 同時ログイン数エラー。前プロセスのセッションが残ったまま（ログアウト前に
    // 強制終了等）だと、自動/強制タイムアウト（30/60分）まで再ログインできないことがある。
    const hint =
      code === "10120004" || code === "10120005"
        ? "（同時ログイン数の上限です。前回のセッションが残っている場合は自動タイムアウトをお待ちください）"
        : "";
    throw new Error(
      `ZENRIN ログイン認証に失敗しました (code=${code ?? "不明"}): ${json.status?.text ?? ""}${hint}`,
    );
  }
  const aid = json.result?.aid;
  const kid = json.result?.kid;
  const func = json.result?.items?.func?.find(
    (f) => f.id === WMTS_TILE_FUNC_ID && f.subid === WMTS_TILE_FUNC_SUBID,
  );
  if (!aid || !kid) {
    throw new Error("ZENRIN ログイン応答に aid / kid が含まれていません");
  }
  if (!func) {
    throw new Error(
      "ZENRIN ログイン応答に wmts_tile（機能コード 0007/0008）の機能情報が含まれていません。契約内容をご確認ください",
    );
  }
  return {
    aid,
    kid,
    lmtinf: `${func.areaCode},${func.funcInfo}`,
    expiresAt: Date.now() + Math.max(60, ZENRIN_SESSION_TTL_SEC) * 1000,
  };
}

/** サーバ側セッションをログアウトする（ベストエフォート）。 */
async function logout(aid: string): Promise<void> {
  try {
    const url = new URL(`https://${ZENRIN_LOGIN_DOMAIN}/api/auth/logout`);
    url.searchParams.set("aid", aid);
    await fetch(url, { method: "GET" });
  } catch {
    // 失敗してもセッションは自動タイムアウトするので無視する。
  }
}

/** セッションを期限内キャッシュする。同時リクエストでは 1 回のログインに集約する。 */
async function getSession(): Promise<SessionState> {
  const cached = globalForZenrin.__zenrinSession;
  if (cached && Date.now() < cached.expiresAt) return cached;

  if (!globalForZenrin.__zenrinLoginInflight) {
    const prevAid = cached?.aid;
    globalForZenrin.__zenrinLoginInflight = (async () => {
      // 期限切れの旧セッションは「同時ログイン数エラー」回避のためログアウトしておく。
      if (prevAid) await logout(prevAid);
      const session = await login();
      globalForZenrin.__zenrinSession = session;
      return session;
    })().finally(() => {
      globalForZenrin.__zenrinLoginInflight = undefined;
    });
  }
  return globalForZenrin.__zenrinLoginInflight;
}

/** 認証情報パラメータ（zis_*）を付与した WMTS GetTile を 1 回叩く。 */
async function requestTile(
  session: SessionState,
  z: string,
  x: string,
  y: string,
): Promise<Response> {
  // REST 方式: .../Z3857_3_21/{tileMatrix=z}/{tileRow=y}/{tileCol=x}.png
  const url = new URL(
    `https://${ZENRIN_WMTS_DOMAIN}/api/zips/general/wmts_tile/` +
      `${ZENRIN_LAYER}/${ZENRIN_STYLE}/Z3857_3_21/${z}/${y}/${x}.png`,
  );
  url.searchParams.set("zis_zips_authkey", session.kid);
  url.searchParams.set("zis_authtype", "aid");
  url.searchParams.set("zis_aid", session.aid);
  url.searchParams.set("zis_lmtinf", session.lmtinf);
  return fetch(url, { method: "GET" });
}

/**
 * タイルを取得して PNG レスポンスを返す。ZENRIN REST は z/row(=y)/col(=x) の順。
 * 認証エラー（401/403）時はセッションを破棄して 1 度だけ再ログインし、リトライする。
 */
export async function fetchTile(z: string, x: string, y: string): Promise<Response> {
  let session = await getSession();
  let res = await requestTile(session, z, x, y);

  if (res.status === 401 || res.status === 403) {
    globalForZenrin.__zenrinSession = undefined;
    session = await getSession();
    res = await requestTile(session, z, x, y);
  }
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
