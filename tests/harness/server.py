"""Local server for the browser harness: serves extension/ with a mocked `chrome.*` API injected.

    python tests/harness/server.py [port]        # default 8765
    open http://127.0.0.1:8765/options.html      # or popup.html, welcome.html, changelog.html
    open http://127.0.0.1:8765/en-us/concept/10000000   # product-page fixture with content.js
    open http://127.0.0.1:8765/en-us/search/test        # search-grid fixture

See tests/harness/README.md. Binds to 127.0.0.1 only.
"""
import http.server
import os
import re
import sys

HARNESS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HARNESS))
EXT = os.path.join(ROOT, "extension")
FIXTURES = os.path.join(ROOT, "tests", "fixtures")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

# Everything background.js importScripts(), then background.js itself — in the same order.
INJECT = "".join(
    f'<script src="{s}"></script>'
    for s in [
        "/__h/chrome-mock.js",
        "/__h/fake-net.js",
        "/match.js",
        "/helpers.js",
        "/cache.js",
        "/diag.js",
        "/cheapshark.js",
        "/psn.js",
        "/__h/pre-bg.js",
        "/background.js",
    ]
)

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
}


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def resolve(self):
        p = self.path.split("?", 1)[0]
        if p == "/":
            p = "/options.html"
        if p.startswith("/en-us/concept/"):
            return os.path.join(HARNESS, "fixture-product.html")
        if p.startswith("/en-us/search/"):
            return os.path.join(HARNESS, "fixture-search.html")
        if p.startswith("/__h/"):
            base, rel = HARNESS, p[len("/__h/"):]
        elif p.startswith("/__f/"):
            base, rel = FIXTURES, p[len("/__f/"):]
        else:
            base, rel = EXT, p.lstrip("/")
        fp = os.path.normpath(os.path.join(base, rel))
        if not fp.startswith(os.path.normpath(base)) or not os.path.isfile(fp):
            return None
        return fp

    def _send(self, code, body=b"", ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        fp = self.resolve()
        if not fp:
            return self._send(404)
        ext = os.path.splitext(fp)[1].lower()
        data = open(fp, "rb").read()
        if ext == ".html":
            html = data.decode("utf-8")
            html = re.sub(r"(<head[^>]*>)", lambda m: m.group(1) + INJECT, html, count=1, flags=re.I)
            data = html.encode("utf-8")
        self._send(200, b"" if head else data, TYPES.get(ext, "application/octet-stream"))


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
