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
| `http://127.0.0.1:8765/en-us/concept/10000000` | Product-page fixture with `content.js` injecting its cards |
| `http://127.0.0.1:8765/en-us/search/test` | Search-grid fixture (filters, live search suggestions) |

Useful console helpers: `__h.install("install")` simulates a fresh install, `__h.install("update", "2.6.0")`
an update, `__h.setLang("he")` + reload switches the mock UI language, `__h.resetAll()` wipes state.
`__log` records tabs opened, notifications and badge text.

## What is real and what is faked

* **Faked:** `chrome.*` (`chrome-mock.js`, state in `localStorage`), Sony's PSN hosts (`fake-net.js`
  accepts only tokens that start with `HARNESSTEST` — a locally generated test value, never a real
  credential), Frankfurter, and — by default — CheapShark, which is answered from the real responses
  captured in `tests/fixtures/`. Set `localStorage.__net = "real"` to hit the live CheapShark API.
* **Not covered:** the real store.playstation.com DOM (the fixture pages only contain the handful
  of selectors `content.js` looks for), Chrome's real service-worker lifecycle and host-permission
  behaviour, and Sony's real sign-in. Those need a manual pass in a real Chrome with the unpacked
  extension (see `.github/TESTING.md`).
