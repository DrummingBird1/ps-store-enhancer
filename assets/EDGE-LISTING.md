# Publishing to Microsoft Edge Add-ons

Edge is Chromium-based, so the **Chrome build is submitted unchanged** — no code or manifest
differences are needed. This is a manual, parallel store submission.

1. Build: `python scripts/build.py` → `dist/ps-store-enhancer-vX.Y.Z.zip` (the same zip as Chrome).
2. Sign in to the [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
   (free developer account) → **Edge Add-ons** → **Create new extension** → upload the zip.
3. **Availability**: all markets, public.
4. **Properties**: category *Shopping*; the privacy policy URL is
   `https://drummingbird1.github.io/ps-store-enhancer/privacy-policy.html`; website
   `https://github.com/DrummingBird1/ps-store-enhancer`; support URL `…/issues`.
5. **Store listings**: reuse `assets/STORE-LISTING.txt` (description, ≤132-char short description,
   permission justifications) and the screenshots in `assets/screenshots/<lang>/` and the tiles in
   `assets/promo/`. One listing per language is optional — the 16 UI languages are built in.
6. **Notes for certification**: paste `assets/REVIEWER-NOTES.md`.
7. Submit. Edge review usually takes a few business days.

Things worth knowing:

* Edge ignores Chrome-only extras gracefully; the optional `webRequest` permission and the
  `_execute_action` shortcut (`Alt+Shift+G`) work the same way.
* Keep the two listings' version numbers in step — publish both on every release.
* Link the Edge listing from the README and the website once it is live.
