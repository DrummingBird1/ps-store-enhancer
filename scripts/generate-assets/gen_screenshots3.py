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
# Screenshot 3 — Options page: Library & Wishlist stats
# ═══════════════════════════════════════════════
T3 = {
    "en": {
        "rtl": False,
        "hero": "PS Store Enhancer",
        "sub": "Advanced settings · PSN account · Game management",
        "stat_title": "Library & Wishlist Stats",
        "stats": [("47", "Games Owned"), ("12", "Wishlisted"), ("$286.40", "Wishlist Value"), ("3", "Deals Ready")],
        "wl_title": "Wishlist",
        "wl_rows": [
            ("Baldur's Gate 3", "Last: $34.99", "Target", "$30.00"),
            ("Alan Wake 2", "Last: $29.99", "Target", "$25.00"),
            ("Marvel's Spider-Man 2", "Last: $49.99", "Target", "$45.00"),
        ],
        "check_btn": "Check prices now",
    },
    "he": {
        "rtl": True,
        "hero": "PS Store Enhancer",
        "sub": "הגדרות מתקדמות · חשבון PSN · ניהול משחקים",
        "stat_title": "סטטיסטיקת ספרייה ורשימת משאלות",
        "stats": [("47", "משחקים בבעלות"), ("12", "ברשימת משאלות"), ("₪286.40", "שווי הרשימה"), ("3", "עסקאות מוכנות")],
        "wl_title": "רשימת משאלות",
        "wl_rows": [
            ("Baldur's Gate 3", "אחרון: $34.99", "יעד", "$30.00"),
            ("Alan Wake 2", "אחרון: $29.99", "יעד", "$25.00"),
            ("Marvel's Spider-Man 2", "אחרון: $49.99", "יעד", "$45.00"),
        ],
        "check_btn": "בדוק מחירים עכשיו",
    },
}
for _v in T3.values():
    if _v["rtl"]:
        _v["sub"] = rtl_fix(_v["sub"])
        _v["stat_title"] = rtl_fix(_v["stat_title"])
        _v["stats"] = [(n, rtl_fix(lab)) for n, lab in _v["stats"]]
        _v["wl_title"] = rtl_fix(_v["wl_title"])
        _v["wl_rows"] = [(name, rtl_fix(last), rtl_fix(tgt), val) for name, last, tgt, val in _v["wl_rows"]]
        _v["check_btn"] = rtl_fix(_v["check_btn"])


def options_screenshot(lang, out_name):
    t = T3[lang]
    canvas = new_canvas(W, H, (12, 18, 30))
    d = ImageDraw.Draw(canvas, "RGBA")

    # hero
    paste_gradient_rrect(canvas, (0, 0, W, 92), 0, NAVY, ACCENT_DEEP)
    d = ImageDraw.Draw(canvas, "RGBA")
    align = "r" if t["rtl"] else "l"
    hx = W - 40 if t["rtl"] else 40
    text(d, (hx, 32), t["hero"], font(F_BLACK, 24), WHITE, anchor=f"{align}a")
    text(d, (hx, 62), t["sub"], font(F_REG, 13), (220, 232, 250), anchor=f"{align}a")

    pad = 40
    col_w = W - pad * 2
    cy = 130

    # stats card
    st_h = 150
    box = (pad, cy, pad + col_w, cy + st_h)
    rrect(d, box, 14, fill=CARD, outline=(255, 255, 255, 15), width=1)
    title_x = pad + col_w - 24 if t["rtl"] else pad + 24
    text(d, (title_x, cy + 20), t["stat_title"], font(F_BOLD, 16), TEXT, anchor=f"{align}a")
    n = len(t["stats"])
    gap = 16
    bw = (col_w - 48 - gap * (n - 1)) / n
    for i, (val, lab) in enumerate(t["stats"]):
        bx0 = pad + 24 + i * (bw + gap)
        by0 = cy + 58
        rrect(d, (bx0, by0, bx0 + bw, by0 + st_h - 58 - 24), 10, fill=(255, 255, 255, 7))
        color = GOOD if i == n - 1 else ACCENT
        text(d, (bx0 + bw / 2, by0 + 26), val, font(F_BLACK, 24), color, anchor="mm")
        text(d, (bx0 + bw / 2, by0 + 54), lab, font(F_REG, 11), TEXT_DIM, anchor="mm")

    # wishlist card
    wy = cy + st_h + 20
    row_h = 62
    wl_h = 56 + len(t["wl_rows"]) * row_h + 60
    box = (pad, wy, pad + col_w, wy + wl_h)
    rrect(d, box, 14, fill=CARD, outline=(255, 255, 255, 15), width=1)
    icon_star(d, pad + 34 if not t["rtl"] else pad + col_w - 34, wy + 30, 11, WARN)
    text(d, (pad + 54 if not t["rtl"] else pad + col_w - 54, wy + 22), t["wl_title"], font(F_BOLD, 17), TEXT, anchor=f"{align}a")

    ry = wy + 56
    for name, last, tgt_lab, tgt_val in t["wl_rows"]:
        rowbox = (pad + 20, ry, pad + col_w - 20, ry + row_h - 10)
        rrect(d, rowbox, 9, fill=(255, 255, 255, 6))
        if t["rtl"]:
            text(d, (pad + col_w - 40, ry + 15), name, font(F_BOLD, 14), TEXT, anchor="ra")
            text(d, (pad + col_w - 40, ry + 36), last, font(F_REG, 11), TEXT_FAINT, anchor="ra")
            text(d, (pad + 40, ry + 15), tgt_lab, font(F_REG, 10), TEXT_DIM, anchor="la")
            rrect(d, (pad + 40, ry + 30, pad + 140, ry + 54), 6, fill=CARD2, outline=(255, 255, 255, 25), width=1)
            text(d, (pad + 90, ry + 42), tgt_val, font(F_BOLD, 12), TEXT, anchor="mm")
        else:
            text(d, (pad + 40, ry + 15), name, font(F_BOLD, 14), TEXT, anchor="la")
            text(d, (pad + 40, ry + 36), last, font(F_REG, 11), TEXT_FAINT, anchor="la")
            text(d, (pad + col_w - 140, ry + 15), tgt_lab, font(F_REG, 10), TEXT_DIM, anchor="la")
            rrect(d, (pad + col_w - 140, ry + 30, pad + col_w - 40, ry + 54), 6, fill=CARD2, outline=(255, 255, 255, 25), width=1)
            text(d, (pad + col_w - 90, ry + 42), tgt_val, font(F_BOLD, 12), TEXT, anchor="mm")
        ry += row_h

    btn_y = ry + 6
    btn_w = 220
    btn_x0 = pad + 20
    rrect(d, (btn_x0, btn_y, btn_x0 + btn_w, btn_y + 40), 9, fill=(255, 255, 255, 8), outline=(255, 255, 255, 30), width=1)
    text(d, (btn_x0 + btn_w / 2, btn_y + 20), t["check_btn"], font(F_BOLD, 13), TEXT, anchor="mm")

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/{out_name}")
    print(out_name, canvas.size)


if __name__ == "__main__":
    options_screenshot("en", "screenshot-3-options-en-1280x800.png")
    options_screenshot("he", "screenshot-3-options-he-1280x800.png")
