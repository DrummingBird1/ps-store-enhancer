# Archive

Superseded assets and documents kept for reference instead of deleted outright: old logos, old
screenshots, retired docs — anything that no longer belongs in `assets/` or the repo root, but
that's still worth being able to look back at (e.g. "what did the icon look like in v2.5").

**Not for release zips.** Every past release's zip is already permanently downloadable from its
[GitHub Release](https://github.com/DrummingBird1/ps-store-enhancer/releases) — archiving them
here too would just duplicate that (and bloat the repo with binaries git can't diff). If you need
an old build, grab it from Releases.

## Convention

When something in `assets/` or elsewhere gets replaced (a redesigned icon, a rewritten doc), move
the old version here instead of deleting it, under a dated or version-labeled subfolder, e.g.:

```
archive/
├── icons/v2.4-and-earlier/     the "PS+" icon used before the v2.6.0 redesign
└── screenshots/v2.3.0/         the original mockup batch (different visual style)
```

Nothing has been moved here yet as of v2.6.0 — this file exists so the folder does, and so the
convention above is written down before the first thing needs archiving.
