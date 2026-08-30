import sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw, ImageFilter

OUT = os.path.join(ROOT, "dist", "asset-drafts", "promo")
os.makedirs(OUT, exist_ok=True)
ICON_PATH = os.path.join(ROOT, "extension", "icons", "icon128.png")


def bg_with_glow(w, h):
    canvas = new_canvas(w, h, INK)
    d = ImageDraw.Draw(canvas, "RGBA")
    # radial-ish glow blob top-right
    glow = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * SS * 0.35, -h * SS * 0.6, w * SS * 1.5, h * SS * 0.9], fill=(0, 112, 209, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(w * SS * 0.06))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), glow).convert("RGB")
    return canvas


def small_tile():
    W, H = 440, 280
    canvas = bg_with_glow(W, H)
    d = ImageDraw.Draw(canvas, "RGBA")

    icon = Image.open(ICON_PATH).convert("RGBA").resize((84 * SS, 84 * SS), Image.LANCZOS)
    canvas.paste(icon, (int(28 * SS), int(28 * SS)), icon)
    d = ImageDraw.Draw(canvas, "RGBA")

    text(d, (128, 34), "PS Store", font(F_BLACK, 32), WHITE)
    text(d, (128, 68), "Enhancer", font(F_BLACK, 32), ACCENT)

    text(d, (28, 138), "Price history · deals · trophies", font(F_BOLD, 15), TEXT_DIM)
    text(d, (28, 160), "right on the PlayStation Store", font(F_BOLD, 15), TEXT_DIM)

    # feature chips
    chips = ["Cross-platform prices", "Wishlist alerts", "10 languages"]
    cy = 198
    cx = 28
    for c in chips:
        cw = text_w(d, c, font(F_BOLD, 11)) + 22
        if cx + cw > W - 24:
            cx = 28
            cy += 32
        rrect(d, (cx, cy, cx + cw, cy + 24), 12, fill=(77, 166, 255, 16), outline=(77, 166, 255, 55), width=1)
        text(d, (cx + cw / 2, cy + 12), c, font(F_BOLD, 11), ACCENT, anchor="mm")
        cx += cw + 8

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/promo-small-440x280.png")
    print("promo-small-440x280.png", canvas.size)


def marquee_tile():
    W, H = 1400, 560
    canvas = bg_with_glow(W, H)
    d = ImageDraw.Draw(canvas, "RGBA")

    icon = Image.open(ICON_PATH).convert("RGBA").resize((150 * SS, 150 * SS), Image.LANCZOS)
    canvas.paste(icon, (int(90 * SS), int(150 * SS)), icon)
    d = ImageDraw.Draw(canvas, "RGBA")

    tx = 280
    text(d, (tx, 130), "PS Store Enhancer", font(F_BLACK, 56), WHITE)
    text(d, (tx, 200), "Smarter shopping for the PlayStation Store.", font(F_BOLD, 24), TEXT_DIM)
    text(d, (tx, 234), "Price history, cross-platform comparison, review scores,", font(F_REG, 18), TEXT_FAINT)
    text(d, (tx, 260), "trophy info, wishlist alerts and live search — free.", font(F_REG, 18), TEXT_FAINT)

    chips = ["Price History", "Cross-Platform", "Review Scores", "Trophies", "Wishlist Alerts", "Live Search", "10 Languages"]
    cx = tx
    cy = 320
    for c in chips:
        cw = text_w(d, c, font(F_BOLD, 13)) + 28
        if cx + cw > W - 60:
            cx = tx
            cy += 44
        rrect(d, (cx, cy, cx + cw, cy + 34), 17, fill=(77, 166, 255, 16), outline=(77, 166, 255, 55), width=1)
        text(d, (cx + cw / 2, cy + 17), c, font(F_BOLD, 13), ACCENT, anchor="mm")
        cx += cw + 12

    text(d, (tx, H - 56), "Free & open-source · No tracking · store.playstation.com", font(F_REG, 14), TEXT_FAINT)

    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/promo-marquee-1400x560.png")
    print("promo-marquee-1400x560.png", canvas.size)


if __name__ == "__main__":
    small_tile()
    marquee_tile()
