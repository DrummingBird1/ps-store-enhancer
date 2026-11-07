# Browser harness

Runs the **real** extension pages (`options.html`, `popup.html`, `welcome.html`, `changelog.html`),
the **real** service-worker code (`background.js` and everything it imports) and the **real**
`content.js` in a normal browser tab — no extension install needed — against a tiny mock of the
`chrome.*` API. Useful for looking at UI changes and for manual end-to-end checks; the logic
itself is covered by the Jest suites in `tests/`.

```bash
python tests/harness/server.py 8765
```

| URL | What you get |
|-----|--------------|
| `http://127.0.0.1:8765/options.html` | Settings page |
| `http://127.0.0.1:8765/popup.html` | Toolbar popup |
| `http://127.0.0.1:8765/welcome.html`, `/changelog.html` | Other extension pages |
| `http://127.0.0.1:8765/en-us/concept/1` | Real saved product page (GTA VI, with an edition upsell) with `content.js` injecting its cards |
| `http://127.0.0.1:8765/en-us/product/1` / `/en-il/product/1` | Real saved Valheim page, US and Israeli store |
| `http://127.0.0.1:8765/en-us/search/test` | Real saved search grid (24 tiles: filters, live search suggestions) |

Useful console helpers: `__h.install("install")` simulates a fresh install, `__h.install("update", "2.6.0")`
an update, `__h.setLang("he")` + reload switches the mock UI language, `__h.resetAll()` wipes state.
`__log` records tabs opened, notifications and badge text.

## What is real and what is faked

* **Faked:** `chrome.*` (`chrome-mock.js`, state in `localStorage`), Sony's PSN hosts (`fake-net.js`
  accepts only tokens that start with `HARNESSTEST` — a locally generated test value, never a real
  credential), Frankfurter, and — by default — CheapShark, which is answered from the real responses
  captured in `tests/fixtures/`. Set `localStorage.__net = "real"` to hit the live CheapShark API.
* **Real pages, trimmed:** the fixture pages are minimized captures of real store pages taken on
  2026-11-07 (`tests/fixtures/ps-store/`); Jest runs the same pages against the content script
  (`tests/content.test.js`).
* **Not covered:** the store's live scripts and styles (so layout), Chrome's real service-worker lifecycle and host-permission
  behaviour, and Sony's real sign-in. Those need a manual pass in a real Chrome with the unpacked
  extension (see `.github/TESTING.md`).
