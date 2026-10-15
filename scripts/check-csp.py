#!/usr/bin/env python3
"""Fail if an extension page or script would be blocked by Manifest V3's default CSP
(`script-src 'self'`), or otherwise breaks the store's "no remote/inline code" rules.

Checks extension/*.html for inline <script> blocks, inline event handlers (onclick=…),
javascript: URLs and remote <script src>; checks extension/*.js for eval()/new Function().
Run:  python scripts/check-csp.py   (also part of CI)
"""
import re
import sys
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent / "extension"
problems = []

for html in sorted(EXT.glob("*.html")):
    text = html.read_text(encoding="utf-8")
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", text, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r"\bsrc\s*=\s*[\"']([^\"']+)[\"']", attrs, re.I)
        if not src:
            problems.append(f"{html.name}: inline <script> block (move it to a .js file)")
        elif re.match(r"(?i)(https?:)?//", src.group(1)):
            problems.append(f"{html.name}: remote script {src.group(1)}")
    for m in re.finditer(r"\son[a-z]+\s*=\s*[\"']", text, re.I):
        problems.append(f"{html.name}: inline event handler near {text[m.start():m.start()+30]!r}")
    if re.search(r"href\s*=\s*[\"']\s*javascript:", text, re.I):
        problems.append(f"{html.name}: javascript: URL")

for js in sorted(EXT.glob("*.js")):
    text = js.read_text(encoding="utf-8")
    code = re.sub(r"//.*|/\*.*?\*/", "", text, flags=re.S)
    if re.search(r"\beval\s*\(", code) or re.search(r"\bnew\s+Function\s*\(", code):
        problems.append(f"{js.name}: eval()/new Function() is not allowed")

if problems:
    print("CSP check failed:")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print(f"CSP check OK ({len(list(EXT.glob('*.html')))} pages, {len(list(EXT.glob('*.js')))} scripts)")
