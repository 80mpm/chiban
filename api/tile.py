"""
ZENRIN Maps API タイルプロキシ（Vercel Python Serverless Function）

- ローカル開発では proxy.py を使い、本番デプロイではこのファイルが Vercel
  Functions として実行される
- リクエスト URL: /tile/{z}/{x}/{y}.png（vercel.json で /api/tile?z=&x=&y= へ rewrite）
- 環境変数は Vercel ダッシュボードで設定（ZENRIN_CLIENT_ID 等）
- トークンはモジュールスコープでキャッシュ（warm container 内では再利用、
  cold start では再取得。expires_in が長いので実害は小さい）
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
from http.server import BaseHTTPRequestHandler


ZENRIN_AUTH_TYPE = os.environ.get("ZENRIN_AUTH_TYPE", "oauth")
ZENRIN_DOMAIN = os.environ.get("ZENRIN_DOMAIN", "test-web.zmaps-api.com")
ZENRIN_LAYER = os.environ.get("ZENRIN_LAYER", "hWeH6ZPY")
ZENRIN_STYLE = os.environ.get("ZENRIN_STYLE", "default")

ZENRIN_CLIENT_ID = os.environ.get("ZENRIN_CLIENT_ID", "")
ZENRIN_CLIENT_SECRET = os.environ.get("ZENRIN_CLIENT_SECRET", "")
ZENRIN_TOKEN_URL = os.environ.get(
    "ZENRIN_TOKEN_URL", "https://test-auth.zmaps-api.com/oauth2/token"
)
ZENRIN_API_KEY = os.environ.get("ZENRIN_API_KEY", "")
ZENRIN_REFERER = os.environ.get("ZENRIN_REFERER", "")


class TokenCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._token = None
        self._expires_at = 0

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


def _add_auth_headers(req):
    if ZENRIN_AUTH_TYPE == "oauth":
        req.add_header("Authorization", _token_cache.get())
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
        if ZENRIN_REFERER:
            req.add_header("Referer", ZENRIN_REFERER)
    else:
        raise RuntimeError(f"Unknown ZENRIN_AUTH_TYPE: {ZENRIN_AUTH_TYPE}")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # /api/tile?z=...&x=...&y=...
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        z = (qs.get("z") or [""])[0]
        x = (qs.get("x") or [""])[0]
        y = (qs.get("y") or [""])[0]
        if not z.isdigit() or not x.isdigit() or not y.isdigit():
            self.send_error(400, "z/x/y must be integers")
            return

        # ZENRIN REST は z/row(=y)/col(=x) の順
        upstream = (
            f"https://{ZENRIN_DOMAIN}/map/wmts_tile/"
            f"{ZENRIN_LAYER}/{ZENRIN_STYLE}/Z3857_3_21/{z}/{y}/{x}.png"
        )

        req = urllib.request.Request(upstream)
        try:
            _add_auth_headers(req)
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
