import sys
import os
import re
import json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw

OUT = os.path.join(ROOT, "dist", "asset-drafts", "screenshots")
os.makedirs(OUT, exist_ok=True)
W, H = 640, 400
PAGE_BG = (13, 27, 42)  # #0d1b2a — real popup body bg
VERSION = json.load(open(os.path.join(ROOT, "extension", "manifest.json"), encoding="utf-8"))["version"]


def loc(lang, key):
    """A string straight from the extension's own _locales, so the mockup cannot drift from the real popup.
    Emoji are dropped (Pillow has no colour glyphs); placeholders are filled for a product page where all 3 lookups work."""
    msg = json.load(open(os.path.join(ROOT, "extension", "_locales", lang, "messages.json"), encoding="utf-8"))[key]["message"]
    msg = re.sub(r"[\U0001F000-\U0001FFFF☀-➿]\s*", "", msg)
    return msg.replace("$OK$", "3").replace("$TOTAL$", "3").strip()


T = {
    "en": {
        "rtl": False,
        "title": "PS Store Enhancer", "ver": "v" + VERSION,
        "psn_sec": "PSN ACCOUNT", "psn_name": "Not connected", "psn_sub": "Click to connect your PSN account",
        "filter_sec": "SEARCH RESULT FILTERS",
        "filters": ["Hide Add-ons & Currency", "Hide DLC & Expansions", "Hide games I already own"],
        "tags": ["PSN", "Scores", "Prices", "Compare", "Trophies", "Filter"],
        "status": "Active on store.playstation.com",
        "footer": "What's new", "opts": "Advanced settings",
    },
    "he": {
        "rtl": True,
        "title": "PS Store Enhancer", "ver": "v" + VERSION,
        "psn_sec": "חשבון PSN", "psn_name": "לא מחובר", "psn_sub": "לחץ כדי לחבר את חשבון ה-PSN שלך",
        "filter_sec": "פילטרים לתוצאות חיפוש",
        "filters": ["הסתר תוספות ומטבע", "הסתר DLC והרחבות", "הסתר משחקים שכבר יש לי"],
        "tags": ["PSN", "ציונים", "מחירים", "השוואה", "גביעים", "פילטר"],
        "status": "פעיל ב-store.playstation.com",
        "footer": "מה חדש", "opts": "הגדרות מתקדמות",
    },
}
for _lang, _v in T.items():
    _v["check_btn"] = loc(_lang, "checkPageBtn")
    _v["check_items"] = [f"{loc(_lang, k)} — {loc(_lang, 'checkOk')}" for k in ("chk_title", "chk_price", "chk_anchor")]
    _v["check_sum"] = loc(_lang, "checkPageSummary")
    _v["wipe"] = loc(_lang, "popupWipe")
    if _v["rtl"]:
        for k in ("psn_sec", "psn_name", "psn_sub", "filter_sec", "status", "footer", "opts", "check_btn", "check_sum", "wipe"):
            _v[k] = rtl_visual(_v[k])
        _v["filters"] = [rtl_visual(x) for x in _v["filters"]]
        _v["tags"] = [rtl_visual(x) for x in _v["tags"]]
        _v["check_items"] = [rtl_visual(x) for x in _v["check_items"]]


def toggle(d, x, y, on=False, rtl=False):
    w, h = 32, 18
    rrect(d, (x, y, x + w, y + h), 9, fill=ACCENT_DEEP if on else (255, 255, 255, 30))
    kx = x + w - 15 if on else x + 3
    d.ellipse([(kx) * SS, (y + 3) * SS, (kx + 12) * SS, (y + 15) * SS], fill=WHITE)


def magnifier(d, cx, cy, color):
    """Hand-drawn search glyph (the real button shows a magnifier emoji)."""
    d.ellipse([(cx - 4) * SS, (cy - 5) * SS, (cx + 4) * SS, (cy + 3) * SS], outline=color, width=int(1.4 * SS))
    d.line([((cx + 3) * SS, (cy + 2.5) * SS), ((cx + 7) * SS, (cy + 6.5) * SS)], fill=color, width=int(1.6 * SS))


def popup(lang, out_name):
    t = T[lang]
    rtl = t["rtl"]
    canvas = new_canvas(W, H, PAGE_BG)
    d = ImageDraw.Draw(canvas, "RGBA")

    # edge-relative helpers: "start" is the left edge for LTR and the right edge for RTL
    def sx(off):
        return W - off if rtl else off

    start = "r" if rtl else "l"

    paste_gradient_rrect(canvas, (0, 0, W, 46), 0, NAVY, ACCENT_DEEP)
    d = ImageDraw.Draw(canvas, "RGBA")
    rrect(d, (16, 9, 44, 37), 7, fill=(255, 255, 255, 35))
    icon_check(d, 30, 23, 7, WHITE)
    text(d, (W - 58 if rtl else 58, 10), t["title"], font(F_BOLD, 14), WHITE, anchor=f"{start}a")
    text(d, (W - 58 if rtl else 58, 27), t["ver"], font(F_REG, 9), (210, 226, 250), anchor=f"{start}a")

    # PSN account
    y = 54
    text(d, (sx(24), y), t["psn_sec"], font(F_BOLD, 9), TEXT_FAINT, anchor=f"{start}a")
    y += 14
    rrect(d, (18, y, W - 18, y + 28), 8, fill=CARD2, outline=(255, 255, 255, 12), width=1)
    text(d, (sx(32), y + 4), t["psn_name"], font(F_BOLD, 10), TEXT, anchor=f"{start}a")
    text(d, (sx(32), y + 17), t["psn_sub"], font(F_REG, 8), TEXT_FAINT, anchor=f"{start}a")
    icon_check(d, 34 if rtl else W - 34, y + 14, 6, ACCENT)
    y += 36

    # filters
    text(d, (sx(24), y), t["filter_sec"], font(F_BOLD, 9), TEXT_FAINT, anchor=f"{start}a")
    y += 13
    for i, label in enumerate(t["filters"]):
        rrect(d, (18, y, W - 18, y + 24), 8, fill=CARD2, outline=(255, 255, 255, 10), width=1)
        text(d, (sx(32), y + 12), label, font(F_REG, 10), TEXT, anchor=f"{start}m")
        toggle(d, 26 if rtl else W - 58, y + 3, on=(i != 2), rtl=rtl)
        y += 27

    # "Check this page" (new in 3.0): the button and what a product page answers
    y += 8
    rrect(d, (18, y, W - 18, y + 22), 8, fill=(0, 112, 209, 31), outline=(0, 112, 209, 77), width=1)
    bw = text_w(d, t["check_btn"], font(F_BOLD, 10)) + 22
    bx = W / 2 - bw / 2
    magnifier(d, bx + 5, y + 10, ACCENT)
    text(d, (bx + 22, y + 11), t["check_btn"], font(F_BOLD, 10), ACCENT, anchor="lm")
    y += 30
    for item in t["check_items"]:
        d.ellipse([(sx(26) - (8 if rtl else 0)) * SS, (y + 2) * SS, (sx(26) + (0 if rtl else 8)) * SS, (y + 10) * SS], fill=GOOD)
        text(d, (sx(40), y + 6), item, font(F_REG, 9), TEXT, anchor=f"{start}m")
        y += 12
    text(d, (sx(26), y + 5), t["check_sum"], font(F_REG, 9), TEXT_DIM, anchor=f"{start}m")
    y += 15

    # feature chips + status
    y += 4
    tagx = 18
    for tag in t["tags"]:
        tw = text_w(d, tag, font(F_BOLD, 9)) + 16
        if rtl:
            rrect(d, (W - 18 - tagx - tw, y, W - 18 - tagx, y + 17), 9, fill=(77, 166, 255, 18), outline=(77, 166, 255, 40), width=1)
            text(d, (W - 18 - tagx - tw / 2, y + 9), tag, font(F_BOLD, 9), ACCENT, anchor="mm")
        else:
            rrect(d, (tagx, y, tagx + tw, y + 17), 9, fill=(77, 166, 255, 18), outline=(77, 166, 255, 40), width=1)
            text(d, (tagx + tw / 2, y + 9), tag, font(F_BOLD, 9), ACCENT, anchor="mm")
        tagx += tw + 6
    y += 25

    d.ellipse([(W - 26 if rtl else 20) * SS, (y + 2) * SS, (W - 20 if rtl else 26) * SS, (y + 8) * SS], fill=GOOD)
    text(d, (sx(32), y + 5), t["status"], font(F_REG, 9), GOOD, anchor=f"{start}m")
    y += 15

    # support links: the real popup has one (Ko-fi)
    labels = ["Ko-fi"]
    if rtl:
        labels = labels[::-1]
    gap = 6
    bw = (W - 36 - (len(labels) - 1) * gap) / len(labels)
    for i, label in enumerate(labels):
        x0 = 18 + i * (bw + gap)
        rrect(d, (x0, y, x0 + bw, y + 20), 8, fill=(255, 126, 182, 20), outline=(255, 126, 182, 60), width=1)
        text(d, (x0 + bw / 2, y + 10), label, font(F_BOLD, 9), (255, 145, 195), anchor="mm")
    y += 28

    # "Erase all my data" link, then the footer line
    wipe_font = font(F_REG, 8)
    text(d, (sx(18), y + 4), t["wipe"], wipe_font, (255, 107, 107), anchor=f"{start}m")
    ww = text_w(d, t["wipe"], wipe_font)
    ux0, ux1 = (W - 18 - ww, W - 18) if rtl else (18, 18 + ww)
    d.line([(ux0 * SS, (y + 9) * SS), (ux1 * SS, (y + 9) * SS)], fill=(255, 107, 107), width=SS)
    y += 14

    d.line([(18 * SS, y * SS), ((W - 18) * SS, y * SS)], fill=(255, 255, 255, 15), width=1 * SS)
    y += 9
    prefix = f" · PS Store Enhancer {t['ver']}" if rtl else f"PS Store Enhancer {t['ver']} · "
    pf, lf = font(F_REG, 9), font(F_REG, 9)
    pw = text_w(d, prefix, pf)
    lw = text_w(d, t["footer"], lf)
    if rtl:
        text(d, (W - 18, y), prefix, pf, (74, 85, 104), anchor="ra")
        text(d, (W - 18 - pw, y), t["footer"], lf, ACCENT, anchor="ra")
        text(d, (18, y), t["opts"], font(F_REG, 9), ACCENT, anchor="la")
    else:
        text(d, (18, y), prefix, pf, (74, 85, 104), anchor="la")
        text(d, (18 + pw, y), t["footer"], lf, ACCENT, anchor="la")
        text(d, (W - 18, y), t["opts"], font(F_REG, 9), ACCENT, anchor="ra")
    assert y + 12 < H, f"popup content overflows the {H}px canvas (ends at {y + 12})"

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/{out_name}")
    print(out_name, canvas.size, "content ends at", y + 12)


if __name__ == "__main__":
    popup("en", "screenshot-4-popup-en-640x400.png")
    popup("he", "screenshot-4-popup-he-640x400.png")
