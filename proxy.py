#!/usr/bin/env python3
"""
ZENRIN Maps API タイルプロキシ + 静的ファイルサーバ + データ API

データ API（/api/*）は db.py（PostgreSQL）に委譲する JSON API。
案件・土地・訪問記録・筆マスタを全画面で共有するためのバックエンド。
事前に `docker compose up -d` で PostgreSQL を起動しておくこと。

Leaflet の L.tileLayer は <img> 経由でタイルを取得するためカスタム HTTP ヘッダを
付けられない。一方 ZENRIN Web API はタイル取得にカスタムヘッダ
（x-api-key, Authorization）が必須なので、ブラウザから直接叩けない。
本スクリプトはローカルで両者の橋渡しを行う軽量プロキシ。
静的ファイル配信も兼ねるので、これ 1 本でデモが起動する。

サポートする認証方式:
    - oauth   : client_credentials で /oauth2/token からアクセストークンを取得し
                Authorization: Bearer <token> でタイルを取得（推奨）
    - referer : x-api-key + Authorization: referer + Referer ヘッダ
    - ip      : x-api-key + Authorization: ip ヘッダ

使い方:
    set -a; source .env; set +a
    python3 proxy.py 8000

Leaflet 側 URL:
    http://localhost:8000/tile/{z}/{x}/{y}.png

転送先 (ZENRIN WMTS REST):
    https://{ZENRIN_DOMAIN}/map/wmts_tile/{layer}/default/Z3857_3_21/{z}/{y}/{x}.png
    （ZENRIN は z/row/col = z/y/x の順）
"""

import gzip
import json
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from base64 import b64encode
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

import db as appdb


# ----- 設定（環境変数）-----
ZENRIN_AUTH_TYPE = os.environ.get("ZENRIN_AUTH_TYPE", "oauth")  # oauth | referer | ip
ZENRIN_DOMAIN = os.environ.get("ZENRIN_DOMAIN", "test-web.zmaps-api.com")
ZENRIN_LAYER = os.environ.get("ZENRIN_LAYER", "lp1")
ZENRIN_STYLE = os.environ.get("ZENRIN_STYLE", "default")

# OAuth2.0 用
ZENRIN_CLIENT_ID = os.environ.get("ZENRIN_CLIENT_ID", "")
ZENRIN_CLIENT_SECRET = os.environ.get("ZENRIN_CLIENT_SECRET", "")
ZENRIN_TOKEN_URL = os.environ.get(
    "ZENRIN_TOKEN_URL", "https://test-web.zmaps-api.com/oauth2/token"
)

# ip / referer 用
ZENRIN_API_KEY = os.environ.get("ZENRIN_API_KEY", "")
ZENRIN_REFERER = os.environ.get("ZENRIN_REFERER", "http://localhost:8000/")


# ----- OAuth2.0 トークンキャッシュ -----
class TokenCache:
    """client_credentials で取得したアクセストークンを期限内キャッシュする。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._token = None
        self._expires_at = 0  # epoch sec; 60 秒前に再取得

    def get(self):
        with self._lock:
            now = time.time()
            if self._token and now < self._expires_at:
                return self._token
            self._token = self._fetch()
            return self._token

    def _fetch(self):
        if not ZENRIN_CLIENT_ID or not ZENRIN_CLIENT_SECRET:
            raise RuntimeError(
                "ZENRIN_CLIENT_ID / ZENRIN_CLIENT_SECRET が設定されていません"
            )
        creds = f"{ZENRIN_CLIENT_ID}:{ZENRIN_CLIENT_SECRET}".encode()
        basic = b64encode(creds).decode()
        body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
        req = urllib.request.Request(ZENRIN_TOKEN_URL, data=body, method="POST")
        req.add_header("Authorization", f"Basic {basic}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode())
        token = payload["access_token"]
        expires_in = int(payload.get("expires_in", 3600))
        self._expires_at = time.time() + max(60, expires_in - 60)
        token_type = payload.get("token_type", "Bearer")
        sys.stderr.write(
            f"[oauth] new token: {token_type} ***{token[-6:]} "
            f"(expires_in={expires_in}s)\n"
        )
        return f"{token_type} {token}"


_token_cache = TokenCache()


# ----- データ API ルーティング -----
# (メソッド, パス正規表現) → ハンドラ。ハンドラは (conn, match, body, query) を受けて
# (ステータス, レスポンス JSON) を返す。body は JSON デコード済み dict、
# query は urllib.parse.parse_qs の結果（値はリスト）。
def _parcels_handler(conn, m, b, q):
    town = (q.get("town") or [None])[0]
    if town:
        # 町名単位の遅延取得（プルダウン用・属性のみ）
        return 200, appdb.get_parcels_by_town(conn, town)
    return 200, appdb.get_parcels(conn)


API_ROUTES = [
    ("GET", re.compile(r"^/api/parcel-towns$"),
     lambda conn, m, b, q: (200, appdb.get_parcel_towns(conn))),
    ("GET", re.compile(r"^/api/parcels$"), _parcels_handler),
    ("GET", re.compile(r"^/api/projects$"),
     lambda conn, m, b, q: (200, appdb.get_projects_tree(conn))),
    ("POST", re.compile(r"^/api/projects$"),
     lambda conn, m, b, q: (201, appdb.create_project(conn, b))),
    ("PATCH", re.compile(r"^/api/projects/([^/]+)$"),
     lambda conn, m, b, q: (200, appdb.update_project(conn, m.group(1), b))),
    ("DELETE", re.compile(r"^/api/projects/([^/]+)$"),
     lambda conn, m, b, q: (204, appdb.delete_project(conn, m.group(1)))),
    ("POST", re.compile(r"^/api/projects/([^/]+)/lands$"),
     lambda conn, m, b, q: (201, appdb.create_land(conn, m.group(1), b))),
    ("PATCH", re.compile(r"^/api/projects/([^/]+)/lands/([^/]+)$"),
     lambda conn, m, b, q: (200, appdb.update_land(conn, m.group(1), m.group(2), b))),
    ("DELETE", re.compile(r"^/api/projects/([^/]+)/lands/([^/]+)$"),
     lambda conn, m, b, q: (204, appdb.delete_land(conn, m.group(1), m.group(2)))),
    ("POST", re.compile(r"^/api/projects/([^/]+)/lands/([^/]+)/visits$"),
     lambda conn, m, b, q: (201, appdb.add_visit(conn, m.group(1), m.group(2), b))),
    ("POST", re.compile(r"^/api/reset$"),
     lambda conn, m, b, q: (200, appdb.reset_samples(conn))),
]


# ----- HTTP ハンドラ -----
class TileProxyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/tile/"):
            self._handle_tile()
            return
        if self.path.startswith("/api/"):
            self._handle_api("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._handle_api("POST")
            return
        self.send_error(405, "Method Not Allowed")

    def do_PATCH(self):
        if self.path.startswith("/api/"):
            self._handle_api("PATCH")
            return
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._handle_api("DELETE")
            return
        self.send_error(405, "Method Not Allowed")

    # ---- データ API ----
    def _handle_api(self, method):
        path, _, query_str = self.path.partition("?")
        query = urllib.parse.parse_qs(query_str)
        for route_method, pattern, handler in API_ROUTES:
            if route_method != method:
                continue
            m = pattern.match(path)
            if not m:
                continue
            try:
                body = self._read_json_body()
                # with ブロック終了時に自動 commit（例外時は rollback）
                with appdb.connect() as conn:
                    status, payload = handler(conn, m, body, query)
                self._send_json(status, payload)
            except appdb.ApiError as e:
                self._send_json(e.status, {"error": e.message})
            except appdb.psycopg.OperationalError as e:
                self._send_json(503, {
                    "error": "データベースに接続できません。`docker compose up -d` で PostgreSQL を起動してください。"
                })
                sys.stderr.write(f"[api] DB connection error: {e}\n")
            except Exception as e:
                traceback.print_exc()
                self._send_json(500, {"error": f"サーバエラー: {e}"})
            return
        self._send_json(404, {"error": "Not Found"})

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise appdb.ApiError(400, "リクエストボディが JSON として解釈できません")

    def _send_json(self, status, payload):
        body = b"" if status == 204 else json.dumps(
            payload, ensure_ascii=False, default=str
        ).encode("utf-8")
        self.send_response(status)
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        # 筆マスタ全件（/api/parcels）が 20MB 超になるため、大きな応答は gzip で返す
        accept_gzip = "gzip" in (self.headers.get("Accept-Encoding") or "")
        if body and accept_gzip and len(body) > 16 * 1024:
            body = gzip.compress(body, compresslevel=6)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _handle_tile(self):
        # /tile/{z}/{x}/{y}.png  (Leaflet 規約)
        parts = self.path[len("/tile/"):].split("?", 1)[0].split("/")
        if len(parts) != 3 or not parts[2].endswith(".png"):
            self.send_error(404, "Bad tile path")
            return
        z, x, y_png = parts
        y = y_png[:-4]

        # ZENRIN REST は z/row(=y)/col(=x) の順
        upstream = (
            f"https://{ZENRIN_DOMAIN}/map/wmts_tile/"
            f"{ZENRIN_LAYER}/{ZENRIN_STYLE}/Z3857_3_21/{z}/{y}/{x}.png"
        )

        req = urllib.request.Request(upstream)

        try:
            self._add_auth_headers(req)
        except Exception as e:
            self.send_error(500, f"Auth error: {e}")
            return

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read()
                self.send_response(200)
                self.send_header(
                    "Content-Type", resp.headers.get("Content-Type", "image/png")
                )
                self.send_header("Cache-Control", "public, max-age=86400")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, f"Upstream {e.code}: {e.reason}")
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")

    def _add_auth_headers(self, req):
        if ZENRIN_AUTH_TYPE == "oauth":
            req.add_header("Authorization", _token_cache.get())
            # x-api-key も併用が必要な契約があるので、設定されていれば付与
            if ZENRIN_API_KEY:
                req.add_header("x-api-key", ZENRIN_API_KEY)
        elif ZENRIN_AUTH_TYPE == "ip":
            if not ZENRIN_API_KEY:
                raise RuntimeError("ZENRIN_API_KEY is not set")
            req.add_header("x-api-key", ZENRIN_API_KEY)
            req.add_header("Authorization", "ip")
        elif ZENRIN_AUTH_TYPE == "referer":
            if not ZENRIN_API_KEY:
                raise RuntimeError("ZENRIN_API_KEY is not set")
            req.add_header("x-api-key", ZENRIN_API_KEY)
            req.add_header("Authorization", "referer")
            req.add_header("Referer", ZENRIN_REFERER)
        else:
            raise RuntimeError(f"Unknown ZENRIN_AUTH_TYPE: {ZENRIN_AUTH_TYPE}")

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    # データベース初期化（スキーマ作成・筆マスタ投入・初回サンプル投入）
    try:
        appdb.init_db()
        print(f"  Database:     {appdb.DATABASE_URL}")
    except appdb.psycopg.OperationalError as e:
        print("エラー: PostgreSQL に接続できません。", file=sys.stderr)
        print("  docker compose up -d  で起動してから再実行してください。", file=sys.stderr)
        print(f"  接続先: {appdb.DATABASE_URL}", file=sys.stderr)
        print(f"  詳細: {e}", file=sys.stderr)
        sys.exit(1)

    server = ThreadingHTTPServer(("0.0.0.0", port), TileProxyHandler)
    print(f"Serving on http://localhost:{port}/")
    print(f"  Static files: ./")
    print(f"  Data API:     /api/projects /api/parcels ほか（PostgreSQL）")
    print(
        f"  Tile proxy:   /tile/{{z}}/{{x}}/{{y}}.png  →  "
        f"https://{ZENRIN_DOMAIN}/map/wmts_tile/{ZENRIN_LAYER}/{ZENRIN_STYLE}/Z3857_3_21/..."
    )
    if ZENRIN_AUTH_TYPE == "oauth":
        print(
            f"  Auth:         oauth  (token endpoint: {ZENRIN_TOKEN_URL}, "
            f"client_id set: {bool(ZENRIN_CLIENT_ID)})"
        )
    else:
        print(
            f"  Auth:         {ZENRIN_AUTH_TYPE}  (api_key set: {bool(ZENRIN_API_KEY)})"
        )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")


if __name__ == "__main__":
    main()
