# Archive

Superseded assets and old release builds, kept for reference instead of deleted outright.

```
releases/                         Every past GitHub Release's extension zip
  ps-store-v2.3.1-extension.zip     (still live at github.com/.../releases/tag/v2.3.1 too --
  ps-store-v2.3.2-extension.zip      these are local copies for convenience/completeness)
  ps-store-v2.4.0-extension.zip
  ps-store-v2.5.0-extension.zip
assets-pre-v2.6.0/                 What shipped from v2.3.0 through v2.5.0, before the
  icons/                           v2.6.0 icon/screenshot redesign
  screenshots/
  promo/
```

v2.2.1, v2.2.2, v2.2.3, and v2.3.0 aren't archived as zips because they predate this repo's
release automation (the CI/release workflow was added in v2.3.1) — those versions only ever
existed as commits, before this repo had tags or GitHub Releases at all. Their changes are
recorded in [`CHANGELOG.md`](../CHANGELOG.md), just without a downloadable build.

## Convention going forward

When something in `assets/` gets replaced (a redesigned icon, new screenshots), move the old
version here under a `<what>-pre-vX.Y.Z/` folder instead of deleting it. When a release is
superseded, its zip can be pulled from its GitHub Release page into `releases/` the same way
`v2.3.1`–`v2.5.0` were here — see the commands below.

```bash
gh release download vX.Y.Z --repo DrummingBird1/ps-store-enhancer \
  --pattern "ps-store-enhancer-vX.Y.Z.zip" \
  --output "archive/releases/ps-store-vX.Y.Z-extension.zip"
```
