# Store listing descriptions

The detailed store description of PS Store Enhancer in all 16 languages the extension supports.
Each file is plain text and is meant to be pasted **as is** into the description field of that
language in the store dashboard. The files are named like the folders in `extension/_locales/`.

| File | Store language | Characters |
|------|----------------|-----------:|
| `en.txt` | English | 5,454 |
| `he.txt` | Hebrew | 4,786 |
| `ar.txt` | Arabic | 5,069 |
| `de.txt` | German | 6,381 |
| `es.txt` | Spanish | 6,447 |
| `fr.txt` | French | 6,737 |
| `it.txt` | Italian | 6,474 |
| `ja.txt` | Japanese | 3,116 |
| `ko.txt` | Korean | 3,211 |
| `nl.txt` | Dutch | 6,208 |
| `pl.txt` | Polish | 6,329 |
| `pt_BR.txt` | Portuguese (Brazil) | 6,378 |
| `ru.txt` | Russian | 6,339 |
| `tr.txt` | Turkish | 6,022 |
| `zh_CN.txt` | Chinese (Simplified) | 2,420 |
| `zh_TW.txt` | Chinese (Traditional) | 2,445 |

Characters are counted the way the dashboards count them (an emoji is two). Chrome Web Store allows
up to 16,000 characters and Microsoft Edge Add-ons up to 10,000; the longest file here is
6,737. Check the dashboards if those limits change.

## Where the other listing fields come from

- **Name and short description (132 characters):** `extName` / `extDesc` in
  `extension/_locales/<lang>/messages.json` — the stores read them from the extension, so they are
  translated already and validated by the tests.
- **Category, permission justifications, single purpose:** `../STORE-LISTING.txt` (English only; those
  fields are not localized in the dashboards).

## Updating a description

1. Change `en.txt` first and keep `../STORE-LISTING.txt` in sync (its detailed description is a copy
   of `en.txt`).
2. Apply the same change to every other file. All files share one structure: an intro paragraph,
   13 emoji-headed sections and 54 bullets, in the same order — keep it that way so a diff between
   two languages stays readable.
3. Reuse the wording of the extension's own UI (button, theme and setting names) from
   `extension/_locales/<lang>/messages.json`.
4. Recount the characters and update the table above.

Only claim what the extension does; if a feature depends on something that has not been verified
(for example a live PSN connection), say so in the pull request, not in the store text.

## Status

The 15 translations were drafted by Claude and have **not** been reviewed by native speakers. A
quick read by a speaker of each language before publishing is recommended, most of all for Arabic,
Japanese, Korean and Chinese.
