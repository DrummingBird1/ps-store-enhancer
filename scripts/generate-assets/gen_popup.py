import sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw

OUT = os.path.join(ROOT, "dist", "asset-drafts", "screenshots")
os.makedirs(OUT, exist_ok=True)
W, H = 640, 400
PAGE_BG = (13, 27, 42)  # #0d1b2a — real popup body bg

T = {
    "en": {
        "rtl": False,
        "title": "PS Store Enhancer", "ver": "v2.6.0",
        "psn_sec": "PSN ACCOUNT", "psn_name": "Not connected", "psn_sub": "Click to connect your PSN account",
        "filter_sec": "SEARCH RESULT FILTERS",
        "filters": ["Hide Add-ons & Currency", "Hide DLC & Expansions", "Hide games I already own"],
        "tags": ["PSN", "Metacritic", "Prices", "Compare", "Trophies", "Filter"],
        "status": "Active on store.playstation.com",
        "support": "Support development",
        "footer": "What's new", "opts": "Advanced settings",
    },
    "he": {
        "rtl": True,
        "title": "PS Store Enhancer", "ver": "v2.6.0",
        "psn_sec": "חשבון PSN", "psn_name": "לא מחובר", "psn_sub": "לחץ כדי לחבר את חשבון ה-PSN שלך",
        "filter_sec": "פילטרים לתוצאות חיפוש",
        "filters": ["הסתר תוספות ומטבע", "הסתר DLC והרחבות", "הסתר משחקים שכבר יש לי"],
        "tags": ["PSN", "Metacritic", "מחירים", "השוואה", "גביעים", "פילטר"],
        "status": "פעיל ב-store.playstation.com",
        "support": "תמכו בפיתוח",
        "footer": "מה חדש", "opts": "הגדרות מתקדמות",
    },
}
for _v in T.values():
    if _v["rtl"]:
        for k in ("psn_sec", "psn_name", "psn_sub", "filter_sec", "status", "support", "footer", "opts"):
            _v[k] = rtl_fix(_v[k])
        _v["filters"] = [rtl_fix(x) for x in _v["filters"]]


def toggle(d, x, y, on=False, rtl=False):
    w, h = 32, 18
    rrect(d, (x, y, x + w, y + h), 9, fill=ACCENT_DEEP if on else (255, 255, 255, 30))
    kx = x + w - 15 if on else x + 3
    d.ellipse([(kx) * SS, (y + 3) * SS, (kx + 12) * SS, (y + 15) * SS], fill=WHITE)


def popup(lang, out_name):
    t = T[lang]
    canvas = new_canvas(W, H, PAGE_BG)
    d = ImageDraw.Draw(canvas, "RGBA")

    paste_gradient_rrect(canvas, (0, 0, W, 54), 0, NAVY, ACCENT_DEEP)
    d = ImageDraw.Draw(canvas, "RGBA")
    # small logo chip
    rrect(d, (16, 12, 46, 42), 8, fill=(255, 255, 255, 35))
    icon_check(d, 31, 27, 7, WHITE)
    align = "r" if t["rtl"] else "l"
    tx = W - 58 if t["rtl"] else 58
    text(d, (tx, 14), t["title"], font(F_BOLD, 14), WHITE, anchor=f"{align}a")
    text(d, (tx, 31), t["ver"], font(F_REG, 9), (210, 226, 250), anchor=f"{align}a")

    y = 66
    text(d, (24 if not t["rtl"] else W - 24, y), t["psn_sec"], font(F_BOLD, 9), TEXT_FAINT, anchor=f"{align}a")
    y += 15
    rrect(d, (18, y, W - 18, y + 38), 8, fill=CARD2, outline=(255, 255, 255, 12), width=1)
    if t["rtl"]:
        text(d, (W - 32, y + 12), t["psn_name"], font(F_BOLD, 11), TEXT, anchor="ra")
        text(d, (W - 32, y + 27), t["psn_sub"], font(F_REG, 8), TEXT_FAINT, anchor="ra")
        icon_check(d, 34, y + 19, 7, ACCENT)
    else:
        text(d, (32, y + 12), t["psn_name"], font(F_BOLD, 11), TEXT, anchor="la")
        text(d, (32, y + 27), t["psn_sub"], font(F_REG, 8), TEXT_FAINT, anchor="la")
        icon_check(d, W - 34, y + 19, 7, ACCENT)
    y += 50

    text(d, (24 if not t["rtl"] else W - 24, y), t["filter_sec"], font(F_BOLD, 9), TEXT_FAINT, anchor=f"{align}a")
    y += 15
    for i, label in enumerate(t["filters"]):
        rrect(d, (18, y, W - 18, y + 30), 8, fill=CARD2, outline=(255, 255, 255, 10), width=1)
        if t["rtl"]:
            text(d, (W - 32, y + 15), label, font(F_REG, 10), TEXT, anchor="rm")
            toggle(d, 26, y + 6, on=(i != 2), rtl=True)
        else:
            text(d, (32, y + 15), label, font(F_REG, 10), TEXT, anchor="lm")
            toggle(d, W - 58, y + 6, on=(i != 2))
        y += 34

    y += 4
    tagx = 18
    for tag in t["tags"]:
        tw = text_w(d, tag, font(F_BOLD, 9)) + 16
        if t["rtl"]:
            rrect(d, (W - 18 - tagx - tw, y, W - 18 - tagx, y + 19), 10, fill=(77, 166, 255, 18), outline=(77, 166, 255, 40), width=1)
            text(d, (W - 18 - tagx - tw / 2, y + 10), tag, font(F_BOLD, 9), ACCENT, anchor="mm")
        else:
            rrect(d, (tagx, y, tagx + tw, y + 19), 10, fill=(77, 166, 255, 18), outline=(77, 166, 255, 40), width=1)
            text(d, (tagx + tw / 2, y + 10), tag, font(F_BOLD, 9), ACCENT, anchor="mm")
        tagx += tw + 6
    y += 28

    d.ellipse([(20 if not t["rtl"] else W - 26) * SS, (y + 4) * SS, (26 if not t["rtl"] else W - 20) * SS, (y + 10) * SS], fill=GOOD)
    text(d, (32 if not t["rtl"] else W - 32, y + 7), t["status"], font(F_REG, 9), GOOD, anchor=f"{align}m")
    y += 22

    rrect(d, (18, y, W - 18, y + 28), 8, fill=(255, 126, 182, 20), outline=(255, 126, 182, 60), width=1)
    text(d, (W / 2, y + 14), t["support"], font(F_BOLD, 10), (255, 145, 195), anchor="mm")
    y += 38

    d.line([(18 * SS, y * SS), ((W - 18) * SS, y * SS)], fill=(255, 255, 255, 15), width=1 * SS)
    y += 12
    if t["rtl"]:
        text(d, (W - 18, y), t["footer"], font(F_REG, 9), ACCENT, anchor="ra")
        text(d, (18, y), t["opts"], font(F_REG, 9), ACCENT, anchor="la")
    else:
        text(d, (18, y), t["footer"], font(F_REG, 9), ACCENT, anchor="la")
        text(d, (W - 18, y), t["opts"], font(F_REG, 9), ACCENT, anchor="ra")

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/{out_name}")
    print(out_name, canvas.size)


if __name__ == "__main__":
    popup("en", "screenshot-4-popup-en-640x400.png")
    popup("he", "screenshot-4-popup-he-640x400.png")
