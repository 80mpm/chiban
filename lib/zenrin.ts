// ============================================================
// ZENRIN Maps API タイルプロキシ（zip-site.com 系・ログイン認証）
//
// ユーザーID/パスワードで認証サーバにログインして認証情報（aid/kid/lmtinf）を取得し、
// WMTS GetTile(REST 方式) にクエリパラメータ（zis_*）として付与してタイルを取得する。
// セッションはプロセス内（globalThis）にキャッシュし、期限切れ・認証エラー時に再ログインする。
//
// ZENRIN の同時ログイン数は 1。Vercel 等のサーバーレスでは関数インスタンスが並行起動し、
// インスタンスごとにログインすると 10120004（同時ログイン数エラー）で衝突するため、
// セッション（aid/kid/機能情報）は PostgreSQL の zenrin_session テーブルで全インスタンス共有し、
// ログインは advisory lock で全体 1 回に直列化する。DB 不通時はプロセス内ログインへ
// フォールバックする（ローカル単一プロセスでは従来どおり動く）。
// ============================================================

import { sql } from "./db/client";

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

// 機能コード（機能コード一覧より）。
const WMTS_TILE_FUNC_ID = "0007"; // 画像出力(WMTS)GetTile(REST方式)
const WMTS_TILE_FUNC_SUBID = "0008";
const YOUTO_FUNC_ID = "0003"; // データ重畳[用途地域] wms/youto
const YOUTO_FUNC_SUBID = "0002";

const LOGIN_OK = "10100000";

interface LoginFunc {
  id: string;
  subid: string;
  areaCode: string;
  funcInfo: string;
}

interface SessionState {
  aid: string; // 認証承認ID
  kid: string; // 基盤認証ID
  funcs: LoginFunc[]; // 機能ごとの areaCode/funcInfo（lmtinf の素）
  expiresAt: number; // epoch ms（この時刻を過ぎたら再ログイン）
}

const globalForZenrin = globalThis as unknown as {
  __zenrinSession?: SessionState;
  __zenrinLoginInflight?: Promise<SessionState>;
  __zenrinTablePromise?: Promise<void>;
};

// セッション共有テーブル。タイル中継は ensureDbReady() を通らないため、
// スキーマはここで自前に用意する（冪等）。
const SESSION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS zenrin_session (
    id         integer PRIMARY KEY,
    aid        text NOT NULL,
    kid        text NOT NULL,
    funcs      jsonb NOT NULL,
    expires_at timestamptz NOT NULL
  )
`;

// pg_advisory_xact_lock のキー（アプリ内で一意ならよい任意の整数）
const SESSION_LOCK_KEY = 782344001;

function ensureSessionTable(): Promise<void> {
  if (!globalForZenrin.__zenrinTablePromise) {
    globalForZenrin.__zenrinTablePromise = sql.unsafe(SESSION_TABLE_SQL).simple().then(
      () => undefined,
      (e) => {
        globalForZenrin.__zenrinTablePromise = undefined;
        throw e;
      },
    );
  }
  return globalForZenrin.__zenrinTablePromise;
}

/** 指定機能の zis_lmtinf（"areaCode,funcInfo"）を組み立てる。未契約なら null。 */
function lmtinfFor(session: SessionState, id: string, subid: string): string | null {
  const f = session.funcs.find((x) => x.id === id && x.subid === subid);
  return f ? `${f.areaCode},${f.funcInfo}` : null;
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
  const funcs = json.result?.items?.func ?? [];
  if (!aid || !kid) {
    throw new Error("ZENRIN ログイン応答に aid / kid が含まれていません");
  }
  if (!funcs.some((f) => f.id === WMTS_TILE_FUNC_ID && f.subid === WMTS_TILE_FUNC_SUBID)) {
    throw new Error(
      "ZENRIN ログイン応答に wmts_tile（機能コード 0007/0008）の機能情報が含まれていません。契約内容をご確認ください",
    );
  }
  return {
    aid,
    kid,
    funcs,
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

/**
 * DB のセッション共有テーブル経由でセッションを取得する。
 * advisory lock（トランザクションスコープ）でログインを全インスタンス 1 回に直列化し、
 * ロック取得後に再チェックして、他インスタンスが張った有効セッションがあればそれを使う。
 * staleAid は 401/403 を返した無効セッション（これと同じ aid は再利用しない）。
 */
async function acquireSessionViaDb(staleAid?: string): Promise<SessionState> {
  await ensureSessionTable();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${SESSION_LOCK_KEY})`;
    const rows = await tx<
      { aid: string; kid: string; funcs: LoginFunc[]; expires_at: Date }[]
    >`SELECT aid, kid, funcs, expires_at FROM zenrin_session WHERE id = 1`;
    if (rows.length > 0) {
      const r = rows[0];
      const expiresAt = new Date(r.expires_at).getTime();
      if (Date.now() < expiresAt && Array.isArray(r.funcs) && r.aid !== staleAid) {
        return { aid: r.aid, kid: r.kid, funcs: r.funcs, expiresAt };
      }
      // 期限切れ・無効化対象の旧セッションは「同時ログイン数エラー」回避のためログアウトする
      await logout(r.aid);
      await tx`DELETE FROM zenrin_session WHERE id = 1`;
    }
    const session = await login();
    await tx`
      INSERT INTO zenrin_session (id, aid, kid, funcs, expires_at)
      VALUES (1, ${session.aid}, ${session.kid}, ${tx.json(session.funcs as never)},
              ${new Date(session.expiresAt)})
    `;
    return session;
  });
}

/** DB 不通時のフォールバック（従来のプロセス内ログイン）。 */
async function acquireSessionInProcess(prevAid?: string): Promise<SessionState> {
  if (prevAid) await logout(prevAid);
  return login();
}

/**
 * セッションを取得する。プロセス内キャッシュ → DB 共有テーブル → ログインの順。
 * 同時リクエストでは 1 回の取得に集約する。staleAid を渡すと、その aid のセッションを
 * 無効扱いにして張り直す（タイル取得が 401/403 を返したときに使う）。
 */
async function getSession(staleAid?: string): Promise<SessionState> {
  const cached = globalForZenrin.__zenrinSession;
  // 期限内かつ機能情報を持つ（＝新しい形の）セッションのみ再利用する。
  // 旧デプロイ/ホットリロード由来の古い形は無効扱いにして張り直す。
  if (
    cached &&
    Date.now() < cached.expiresAt &&
    Array.isArray(cached.funcs) &&
    cached.aid !== staleAid
  ) {
    return cached;
  }
  if (staleAid && cached?.aid === staleAid) globalForZenrin.__zenrinSession = undefined;

  if (!globalForZenrin.__zenrinLoginInflight) {
    const prevAid = staleAid ?? cached?.aid;
    globalForZenrin.__zenrinLoginInflight = (async () => {
      let session: SessionState;
      try {
        session = await acquireSessionViaDb(staleAid);
      } catch (e) {
        // DB 不通（ローカルで docker 未起動等）や advisory lock 失敗時は従来動作へ
        console.warn(
          `ZENRIN セッション共有ストアが使えないためプロセス内ログインにフォールバックします: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        session = await acquireSessionInProcess(prevAid);
      }
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
  url.searchParams.set("zis_lmtinf", lmtinfFor(session, WMTS_TILE_FUNC_ID, WMTS_TILE_FUNC_SUBID) ?? "");
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
    session = await getSession(session.aid);
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
      // s-maxage で Vercel CDN にもキャッシュさせ、関数（＝ZENRIN への往復）を減らす
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}

// WMS プロキシで引き継ぐパラメータ（Leaflet の L.tileLayer.wms が生成する WMS 標準パラメータ）。
const WMS_PASSTHROUGH = [
  "SERVICE",
  "REQUEST",
  "VERSION",
  "LAYERS",
  "LAYER", // GetLegendGraphic は単数 LAYER
  "STYLES",
  "STYLE",
  "SLD_VERSION",
  "SCALE",
  "FORMAT",
  "TRANSPARENT",
  "WIDTH",
  "HEIGHT",
  "CRS",
  "SRS",
  "BBOX",
  // GetFeatureInfo 用
  "QUERY_LAYERS",
  "INFO_FORMAT",
  "FEATURE_COUNT",
  "I",
  "J",
  "X",
  "Y",
];

/**
 * ZENRIN データ重畳［用途地域］(wms/youto) の WMS GetMap をプロキシする。
 * クライアント（Leaflet）が送る WMS パラメータを引き継ぎ、ログイン認証の zis_* を付与して中継する。
 * 認証エラー（401/403）時はセッションを破棄して 1 度だけ再ログインし、リトライする。
 */
export async function fetchYoutoWms(params: URLSearchParams): Promise<Response> {
  const build = (session: SessionState): URL | null => {
    const lmtinf = lmtinfFor(session, YOUTO_FUNC_ID, YOUTO_FUNC_SUBID);
    if (lmtinf == null) return null;
    const url = new URL(`https://${ZENRIN_LOGIN_DOMAIN}/api/zips/general/wms/youto`);
    // WMS 標準パラメータを大文字キーで引き継ぐ（キーの大小差異を吸収）。
    const upper = new Map<string, string>();
    params.forEach((v, k) => upper.set(k.toUpperCase(), v));
    for (const key of WMS_PASSTHROUGH) {
      const v = upper.get(key);
      if (v != null) url.searchParams.set(key, v);
    }
    url.searchParams.set("zis_zips_authkey", session.kid);
    url.searchParams.set("zis_authtype", "aid");
    url.searchParams.set("zis_aid", session.aid);
    url.searchParams.set("zis_lmtinf", lmtinf);
    return url;
  };

  let session = await getSession();
  let url = build(session);
  if (!url) {
    throw new Error(
      "用途地域（機能コード 0003/0002）が契約に含まれていません。営業担当にご確認ください",
    );
  }
  let res = await fetch(url, { method: "GET" });
  if (res.status === 401 || res.status === 403) {
    session = await getSession(session.aid);
    url = build(session);
    if (url) res = await fetch(url, { method: "GET" });
  }
  if (!res.ok) {
    return new Response(`Upstream ${res.status}`, { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
