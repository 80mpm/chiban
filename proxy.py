#!/usr/bin/env python3
"""
ZENRIN Maps API タイルプロキシ + 静的ファイルサーバ

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

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from base64 import b64encode
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn


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


# ----- HTTP ハンドラ -----
class TileProxyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/tile/"):
            self._handle_tile()
            return
        super().do_GET()

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
    server = ThreadingHTTPServer(("0.0.0.0", port), TileProxyHandler)
    print(f"Serving on http://localhost:{port}/")
    print(f"  Static files: ./")
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
