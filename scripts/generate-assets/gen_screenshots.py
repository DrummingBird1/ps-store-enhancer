import os
import sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw

OUT = os.path.join(ROOT, "dist", "asset-drafts", "screenshots")
os.makedirs(OUT, exist_ok=True)

W, H = 1280, 800

L = {
    "en": {
        "rtl": False,
        "brand": "PS Store Enhancer",
        "active": "Active",
        "url": "store.playstation.com",
        "title": "Horizon Forbidden West: Burning Shores",
        "price": "$69.99",
        "cart": "Add to Cart",
        "ph_title": "Price History",
        "ph_cache": "estimated",
        "ph_low": "Lowest ever:",
        "ph_link": "View full history on PSPrices →",
        "xp_title": "Cross-Platform Prices",
        "xp_note": "Prices from CheapShark · PC platforms",
        "tr_title": "Completionist Info",
        "tr_psn": "PSN",
        "tr_plat": "PLATINUM",
        "tr_plat_v": "Yes",
        "tr_diff": "DIFFICULTY",
        "tr_diff_v": "3 / 10",
        "tr_time": "EST. TIME",
        "tr_time_v": "40–50h",
        "tr_run": "PLAYTHROUGHS",
        "tr_run_v": "1",
        "tr_progress": "38 / 51 (75%)",
        "wl_btn": "On Wishlist",
        "own_btn": "I own this game",
        "footer": "PS Store Enhancer — not affiliated with Sony Interactive Entertainment",
    },
    "he": {
        "rtl": True,
        "brand": "PS Store Enhancer",
        "active": "פעיל",
        "url": "store.playstation.com",
        "title": "הוריזון פורבידן ווסט: החופים הבוערים",
        "price": "₪289.90",
        "cart": "הוסף לעגלה",
        "ph_title": "היסטוריית מחירים",
        "ph_cache": "משוער",
        "ph_low": "המחיר הזול ביותר:",
        "ph_link": "צפו בהיסטוריה המלאה ב-PSPrices ←",
        "xp_title": "מחירים חוצי-פלטפורמות",
        "xp_note": "מחירים מ-CheapShark · פלטפורמות PC",
        "tr_title": "מידע לחובבי השלמות",
        "tr_psn": "PSN",
        "tr_plat": "פלטינום",
        "tr_plat_v": "כן",
        "tr_diff": "קושי",
        "tr_diff_v": "3 / 10",
        "tr_time": "זמן משוער",
        "tr_time_v": "40–50 שע'",
        "tr_run": "מעברים",
        "tr_run_v": "1",
        "tr_progress": "38 / 51 (75%)",
        "wl_btn": "ברשימת המשאלות",
        "own_btn": "המשחק ברשותי",
        "footer": "PS Store Enhancer — אינו קשור ל-Sony Interactive Entertainment",
    },
}

for _k, _v in L["he"].items():
    if isinstance(_v, str):
        L["he"][_k] = rtl_fix(_v)

STORES = [
    ("Steam", -38, "$43.19", (0, 128, 255)),
    ("Epic Games Store", -30, "$48.99", (168, 96, 255)),
    ("GOG", -25, "$52.49", (128, 90, 213)),
]


def draw_card(d, box, title, icon_fn=None, tag=None, tag_color=ACCENT):
    x0, y0, x1, y1 = box
    rrect(d, box, 14, fill=CARD, outline=(255, 255, 255, 15), width=1)
    hx = x0 + 22
    if icon_fn:
        icon_fn(d, x0 + 34, y0 + 34, 13, ACCENT)
        hx = x0 + 58
    text(d, (hx, y0 + 22), title, font(F_BOLD, 16), TEXT)
    if tag:
        tw = text_w(d, tag, font(F_BOLD, 10))
        tx1 = x1 - 16
        tx0 = tx1 - tw - 16
        fillc = tuple(list(tag_color) + [30])
        rrect(d, (tx0, y0 + 20, tx1, y0 + 40), 9, fill=fillc, outline=tag_color, width=1)
        text(d, ((tx0 + tx1) / 2, y0 + 30), tag, font(F_BOLD, 10), tag_color, anchor="mm")


def product_page(lang, out_name):
    t = L[lang]
    canvas = new_canvas(W, H, INK)
    d = ImageDraw.Draw(canvas, "RGBA")

    # header bar
    rrect(d, (0, 0, W, 56), 0, fill=CARD)
    d.line([(0, 56 * SS), (W * SS, 56 * SS)], fill=(255, 255, 255, 18), width=1 * SS)
    if t["rtl"]:
        text(d, (W - 24, 28), t["url"], font(F_REG, 14), TEXT_FAINT, anchor="rm")
        icon_check(d, 24 + 6, 28, 7, GOOD)
        text(d, (40, 28), f'{t["brand"]} {t["active"]}', font(F_BOLD, 13), GOOD, anchor="lm")
    else:
        text(d, (24, 28), t["url"], font(F_REG, 14), TEXT_FAINT, anchor="lm")
        badge = f'{t["brand"]} {t["active"]}'
        bw = text_w(d, badge, font(F_BOLD, 13))
        icon_check(d, W - 24 - bw - 18, 28, 7, GOOD)
        text(d, (W - 24, 28), badge, font(F_BOLD, 13), GOOD, anchor="rm")

    pad = 40
    ax0 = pad if not t["rtl"] else pad  # content anchored left visually; mirror text alignment only
    # Game art panel (right for EN, left for HE to feel mirrored)
    art_w = 340
    if t["rtl"]:
        art_box = (pad, 96, pad + art_w, 96 + 300)
        text_x = pad + art_w + 40
        text_align = "right"
        title_anchor = "ra"
        title_x = W - pad
    else:
        art_box = (W - pad - art_w, 96, W - pad, 96 + 300)
        text_x = pad
        text_align = "left"
        title_anchor = "la"
        title_x = pad

    paste_gradient_rrect(canvas, art_box, 16, (26, 38, 58), (14, 20, 34))
    d.rectangle([art_box[0] * SS, art_box[1] * SS, art_box[2] * SS, art_box[3] * SS], outline=(255, 255, 255, 18), width=1 * SS)
    icon_layers(d, (art_box[0] + art_box[2]) / 2, (art_box[1] + art_box[3]) / 2, 46, (70, 90, 120))

    # Title + score + price
    title_font = font(F_BLACK, 30)
    text(d, (title_x, 96), t["title"], title_font, WHITE, anchor=title_anchor)
    score_y = 96
    if t["rtl"]:
        score_x = title_x - text_w(d, t["title"], title_font) - 20
        rrect(d, (score_x - 46, score_y, score_x, score_y + 34), 8, fill=CARD2, outline=(255, 255, 255, 20), width=1)
        text(d, (score_x - 23, score_y + 17), "92", font(F_BOLD, 15), GOOD, anchor="mm")
    else:
        score_x = title_x + text_w(d, t["title"], title_font) + 20
        rrect(d, (score_x, score_y, score_x + 46, score_y + 34), 8, fill=CARD2, outline=(255, 255, 255, 20), width=1)
        text(d, (score_x + 23, score_y + 17), "92", font(F_BOLD, 15), GOOD, anchor="mm")

    py = 148
    if t["rtl"]:
        text(d, (title_x, py), t["price"], font(F_BLACK, 26), WHITE, anchor="ra")
        pw = text_w(d, t["price"], font(F_BLACK, 26))
        cart_x1 = title_x - pw - 20
        cart_w = text_w(d, t["cart"], font(F_BOLD, 14)) + 36
        rrect(d, (cart_x1 - cart_w, py + 2, cart_x1, py + 34), 8, fill=ACCENT_DEEP)
        text(d, (cart_x1 - cart_w / 2, py + 18), t["cart"], font(F_BOLD, 14), WHITE, anchor="mm")
    else:
        text(d, (title_x, py), t["price"], font(F_BLACK, 26), WHITE, anchor="la")
        pw = text_w(d, t["price"], font(F_BLACK, 26))
        cart_x0 = title_x + pw + 20
        cart_w = text_w(d, t["cart"], font(F_BOLD, 14)) + 36
        rrect(d, (cart_x0, py + 2, cart_x0 + cart_w, py + 34), 8, fill=ACCENT_DEEP)
        text(d, (cart_x0 + cart_w / 2, py + 18), t["cart"], font(F_BOLD, 14), WHITE, anchor="mm")

    # ── Cards column ──
    col_x0 = text_x if not t["rtl"] else pad
    col_w = 560
    if t["rtl"]:
        col_x0 = pad
    cy = 210

    # Price history card
    ph_h = 178
    box = (col_x0, cy, col_x0 + col_w, cy + ph_h)
    draw_card(d, box, t["ph_title"], icon_chart, t["ph_cache"], GOOD)
    # sparkline
    sp_x0, sp_x1 = col_x0 + 26, col_x0 + col_w - 26
    sp_y0, sp_y1 = cy + 52, cy + 108
    import math
    pts = [0.75, 0.55, 0.85, 0.62, 0.40, 0.30, 0.50, 0.20]
    n = len(pts)
    poly = [(sp_x0 + (sp_x1 - sp_x0) * i / (n - 1), sp_y1 - (sp_y1 - sp_y0) * v) for i, v in enumerate(pts)]
    fillpoly = poly + [(sp_x1, sp_y1), (sp_x0, sp_y1)]
    d.polygon([(p[0] * SS, p[1] * SS) for p in fillpoly], fill=(77, 166, 255, 40))
    d.line([(p[0] * SS, p[1] * SS) for p in poly], fill=ACCENT, width=3 * SS, joint="curve")
    low_box = (col_x0 + 20, cy + 118, col_x0 + col_w - 20, cy + 148)
    rrect(d, low_box, 8, fill=(109, 200, 73, 22), outline=GOOD, width=1)
    text(d, (col_x0 + 34, cy + 133), t["ph_low"], font(F_REG, 12), TEXT_DIM, anchor="lm")
    text(d, (col_x0 + col_w - 34, cy + 133), "$29.99", font(F_BOLD, 15), GOOD, anchor="rm")
    text(d, (col_x0 + col_w / 2, cy + ph_h - 16), t["ph_link"], font(F_REG, 12), ACCENT, anchor="mm")

    # Cross-platform card
    cy2 = cy + ph_h + 20
    xp_h = 176
    box = (col_x0, cy2, col_x0 + col_w, cy2 + xp_h)
    rrect(d, box, 14, fill=CARD, outline=(255, 255, 255, 15), width=1)
    icon_layers(d, col_x0 + 34, cy2 + 34, 13, ACCENT)
    text(d, (col_x0 + 58, cy2 + 22), t["xp_title"], font(F_BOLD, 16), TEXT)
    ry = cy2 + 58
    for name, pct, price, dotcol in STORES:
        rowbox = (col_x0 + 20, ry, col_x0 + col_w - 20, ry + 30)
        rrect(d, rowbox, 7, fill=(255, 255, 255, 8))
        d.ellipse([(col_x0 + 32) * SS, (ry + 9) * SS, (col_x0 + 44) * SS, (ry + 21) * SS], fill=dotcol)
        text(d, (col_x0 + 52, ry + 15), name, font(F_REG, 13), TEXT_DIM, anchor="lm")
        badge_txt = f"{pct}%"
        bw = text_w(d, badge_txt, font(F_BOLD, 10)) + 14
        px1 = col_x0 + col_w - 20 - 12 - text_w(d, price, font(F_BOLD, 14))
        rrect(d, (px1 - bw - 10, ry + 6, px1 - 10, ry + 24), 6, fill=(109, 200, 73, 25))
        text(d, (px1 - bw / 2 - 10, ry + 15), badge_txt, font(F_BOLD, 10), GOOD, anchor="mm")
        text(d, (col_x0 + col_w - 32, ry + 15), price, font(F_BOLD, 14), TEXT, anchor="rm")
        ry += 36
    text(d, (col_x0 + col_w / 2, cy2 + xp_h - 14), t["xp_note"], font(F_REG, 10), TEXT_FAINT, anchor="mm")

    # ── Right column: trophy + buttons ──
    col2_x0 = col_x0 + col_w + 24
    col2_w = W - pad - col2_x0
    tr_h = 246
    box = (col2_x0, cy, col2_x0 + col2_w, cy + tr_h)
    draw_card(d, box, t["tr_title"], icon_trophy, t["tr_psn"], ACCENT)
    stat_y = cy + 56
    stats = [(t["tr_plat"], t["tr_plat_v"]), (t["tr_diff"], t["tr_diff_v"]), (t["tr_time"], t["tr_time_v"]), (t["tr_run"], t["tr_run_v"])]
    sw = (col2_w - 44) / 2
    for i, (lab, val) in enumerate(stats):
        row, colu = divmod(i, 2)
        sx0 = col2_x0 + 20 + colu * (sw + 16) if not t["rtl"] else col2_x0 + 20 + (1 - colu) * (sw + 16)
        sy0 = stat_y + row * 62
        rrect(d, (sx0, sy0, sx0 + sw, sy0 + 50), 8, fill=(255, 255, 255, 6))
        text(d, (sx0 + 14, sy0 + 14), lab, font(F_REG, 10), TEXT_FAINT)
        text(d, (sx0 + 14, sy0 + 28), val, font(F_BOLD, 15), TEXT)
    pbar_y = stat_y + 132
    rrect(d, (col2_x0 + 20, pbar_y, col2_x0 + col2_w - 20, pbar_y + 22), 11, fill=(255, 255, 255, 8))
    fillw = (col2_w - 40) * 0.75
    fbox = (col2_x0 + 20, pbar_y, col2_x0 + 20 + fillw, pbar_y + 22) if not t["rtl"] else (col2_x0 + col2_w - 20 - fillw, pbar_y, col2_x0 + col2_w - 20, pbar_y + 22)
    rrect(d, fbox, 11, fill=ACCENT_DEEP)
    text(d, (col2_x0 + col2_w / 2, pbar_y + 11), t["tr_progress"], font(F_BOLD, 11), WHITE, anchor="mm")

    # buttons
    by = cy + tr_h + 20
    rrect(d, (col2_x0, by, col2_x0 + col2_w, by + 46), 10, fill=(245, 197, 24, 20), outline=WARN, width=1)
    icon_star(d, col2_x0 + 26, by + 23, 9, WARN)
    text(d, (col2_x0 + 44, by + 23), t["wl_btn"], font(F_BOLD, 13), WARN, anchor="lm")

    by2 = by + 58
    rrect(d, (col2_x0, by2, col2_x0 + col2_w, by2 + 46), 10, fill=(109, 200, 73, 16), outline=(109, 200, 73, 140), width=1)
    icon_check(d, col2_x0 + 26, by2 + 23, 8, GOOD)
    text(d, (col2_x0 + 44, by2 + 23), t["own_btn"], font(F_BOLD, 13), GOOD, anchor="lm")

    # footer
    text(d, (pad, H - 30), t["footer"], font(F_REG, 11), TEXT_FAINT)

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/{out_name}")
    print(out_name, canvas.size)


if __name__ == "__main__":
    product_page("en", "screenshot-1-product-en-1280x800.png")
    product_page("he", "screenshot-1-product-he-1280x800.png")
