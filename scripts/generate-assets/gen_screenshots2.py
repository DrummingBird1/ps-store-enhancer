import sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw

OUT = os.path.join(ROOT, "dist", "asset-drafts", "screenshots")
os.makedirs(OUT, exist_ok=True)
W, H = 1280, 800

# ═══════════════════════════════════════════════
# Screenshot 2 — Live search suggestions
# ═══════════════════════════════════════════════
T2 = {
    "en": {
        "rtl": False, "url": "store.playstation.com",
        "brand_active": "PS Store Enhancer Active",
        "search_placeholder": "hades",
        "badge": "PS STORE ENHANCER LIVE RESULTS",
        "from": "PC from",
        "rows": [
            ("Hades II", "$24.99"),
            ("Hades", "$14.99"),
            ("Hades: Battle Out of Hell", "$9.99"),
        ],
        "caption": "Live search suggestions — price preview as you type",
    },
    "he": {
        "rtl": True, "url": "store.playstation.com",
        "brand_active": "PS Store Enhancer פעיל",
        "search_placeholder": "hades",
        "badge": "תוצאות חיות מבית PS Store Enhancer",
        "from": "ב-PC החל מ-",
        "rows": [
            ("Hades II", "$24.99"),
            ("Hades", "$14.99"),
            ("Hades: Battle Out of Hell", "$9.99"),
        ],
        "caption": "הצעות חיפוש חכמות — תצוגה מקדימה של מחיר תוך כדי הקלדה",
    },
}
for _v in T2.values():
    if _v["rtl"]:
        _v["brand_active"] = rtl_fix(_v["brand_active"])
        _v["badge"] = rtl_fix(_v["badge"])
        _v["from"] = rtl_fix(_v["from"])
        _v["caption"] = rtl_fix(_v["caption"])


def search_screenshot(lang, out_name):
    t = T2[lang]
    canvas = new_canvas(W, H, INK)
    d = ImageDraw.Draw(canvas, "RGBA")

    rrect(d, (0, 0, W, 56), 0, fill=CARD)
    d.line([(0, 56 * SS), (W * SS, 56 * SS)], fill=(255, 255, 255, 18), width=1 * SS)
    if t["rtl"]:
        text(d, (W - 24, 28), t["url"], font(F_REG, 14), TEXT_FAINT, anchor="rm")
        icon_check(d, 30, 28, 7, GOOD)
        text(d, (44, 28), t["brand_active"], font(F_BOLD, 13), GOOD, anchor="lm")
    else:
        text(d, (24, 28), t["url"], font(F_REG, 14), TEXT_FAINT, anchor="lm")
        bw = text_w(d, t["brand_active"], font(F_BOLD, 13))
        icon_check(d, W - 24 - bw - 18, 28, 7, GOOD)
        text(d, (W - 24, 28), t["brand_active"], font(F_BOLD, 13), GOOD, anchor="rm")

    # search bar
    sb_w, sb_h = 520, 46
    sb_x0 = (W - sb_w) / 2
    sb_y0 = 130
    rrect(d, (sb_x0, sb_y0, sb_x0 + sb_w, sb_y0 + sb_h), 23, fill=CARD2, outline=ACCENT, width=2)
    icon_search(d, sb_x0 + 34, sb_y0 + sb_h / 2, 9, TEXT_DIM)
    text(d, (sb_x0 + 58, sb_y0 + sb_h / 2), t["search_placeholder"], font(F_REG, 16), TEXT, anchor="lm")
    # blinking cursor
    cx = sb_x0 + 58 + text_w(d, t["search_placeholder"], font(F_REG, 16)) + 4
    d.line([(cx * SS, (sb_y0 + 12) * SS), (cx * SS, (sb_y0 + sb_h - 12) * SS)], fill=ACCENT, width=2 * SS)

    # dropdown
    dd_y0 = sb_y0 + sb_h + 6
    dd_h = 44 + len(t["rows"]) * 74
    rrect(d, (sb_x0, dd_y0, sb_x0 + sb_w, dd_y0 + dd_h), 12, fill=CARD, outline=ACCENT, width=1)
    text(d, (sb_x0 + sb_w / 2, dd_y0 + 22), t["badge"], font(F_BOLD, 10), ACCENT, anchor="mm")
    d.line([(sb_x0 * SS, (dd_y0 + 40) * SS), ((sb_x0 + sb_w) * SS, (dd_y0 + 40) * SS)], fill=(255, 255, 255, 18), width=1 * SS)

    ry = dd_y0 + 40
    for i, (name, price) in enumerate(t["rows"]):
        rh = 74
        if i == 0:
            rrect(d, (sb_x0 + 4, ry + 2, sb_x0 + sb_w - 4, ry + rh - 2), 8, fill=(77, 166, 255, 22))
        # thumb
        thumb_box = (sb_x0 + 16, ry + 13, sb_x0 + 16 + 48, ry + 13 + 48)
        paste_gradient_rrect(canvas, thumb_box, 8, (60, 40, 90), (30, 20, 55))
        d = ImageDraw.Draw(canvas, "RGBA")
        if t["rtl"]:
            text(d, (sb_x0 + sb_w - 78, ry + 26), name, font(F_BOLD, 14), TEXT, anchor="ra")
            text(d, (sb_x0 + sb_w - 78, ry + 50), f'{t["from"]} {price}', font(F_REG, 12), GOOD, anchor="ra")
        else:
            text(d, (sb_x0 + 78, ry + 26), name, font(F_BOLD, 14), TEXT, anchor="la")
            text(d, (sb_x0 + 78, ry + 50), f'{t["from"]} {price}', font(F_REG, 12), GOOD, anchor="la")
        if i < len(t["rows"]) - 1:
            d.line([(sb_x0 * SS, (ry + rh) * SS), ((sb_x0 + sb_w) * SS, (ry + rh) * SS)], fill=(255, 255, 255, 14), width=1 * SS)
        ry += rh

    text(d, (W / 2, dd_y0 + dd_h + 46), t["caption"], font(F_BOLD, 16), TEXT_DIM, anchor="mm")

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/{out_name}")
    print(out_name, canvas.size)


if __name__ == "__main__":
    search_screenshot("en", "screenshot-2-search-en-1280x800.png")
    search_screenshot("he", "screenshot-2-search-he-1280x800.png")
