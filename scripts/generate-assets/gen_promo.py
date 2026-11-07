"""Promo tiles and the website's og-image in the "Midnight Glass" look.

The two pictures on the right are real captures of the extension (assets/promo/src/card-en.png: the Price
Insight card on a store page; popup-en.png: the toolbar popup), so retake those two when the UI changes.
Run from the repo root:  python scripts/generate-assets/gen_promo.py
"""
import sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw, ImageFilter

OUT = os.path.join(ROOT, "dist", "asset-drafts", "promo")
os.makedirs(OUT, exist_ok=True)
ICON_PATH = os.path.join(ROOT, "extension", "icons", "icon128.png")
SRC = os.path.join(ROOT, "assets", "promo", "src")

NAVY_BG = (7, 11, 22)       # the popup's deep navy
GLOW = (36, 78, 168)


def backdrop(w, h):
    """Deep navy with one soft blue glow behind the pictures (top right), like the popup and settings page."""
    base = Image.new("RGB", (w * SS, h * SS), NAVY_BG)
    glow = Image.new("RGB", (w * SS, h * SS), NAVY_BG)
    d = ImageDraw.Draw(glow)
    d.ellipse([w * SS * 0.52, -h * SS * 0.7, w * SS * 1.25, h * SS * 0.75], fill=GLOW)
    glow = glow.filter(ImageFilter.GaussianBlur(w * SS * 0.07))
    return Image.blend(base, glow, 0.9)


def shot(name, height, radius=22):
    """A real capture, scaled to `height` css px, rounded, with its own soft shadow. Returns (rgba image at SS, w, h)."""
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    h = height * SS
    w = round(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius * SS, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def place(canvas, pic, x, y):
    """Paste `pic` at css (x, y) with a drop shadow."""
    w, h = pic.size
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x * SS, (y + 12) * SS, x * SS + w, (y + 12) * SS + h], radius=22 * SS, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22 * SS))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(pic, (int(x * SS), int(y * SS)))
    return canvas.convert("RGB")


def icon_tile(canvas, x, y, size):
    ic = Image.open(ICON_PATH).convert("RGBA").resize((size * SS, size * SS), Image.LANCZOS)
    canvas = canvas.convert("RGBA")
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([x * SS, (y + 8) * SS, (x + size) * SS, (y + size + 8) * SS], radius=size * SS * 0.24, fill=(23, 105, 224, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(14 * SS))
    canvas = Image.alpha_composite(canvas, glow)
    canvas.alpha_composite(ic, (int(x * SS), int(y * SS)))
    return canvas.convert("RGB")


def chips(canvas, items, x0, y0, max_x, size=13, pad=14, gap=10, h=32):
    d = ImageDraw.Draw(canvas, "RGBA")
    x, y = x0, y0
    f = font(F_BOLD, size)
    for c in items:
        cw = text_w(d, c, f) + pad * 2
        if x + cw > max_x:
            x, y = x0, y + h + gap
        rrect(d, (x, y, x + cw, y + h), h / 2, fill=(90, 163, 255, 30), outline=(90, 163, 255, 80), width=1)
        text(d, (x + cw / 2, y + h / 2), c, f, (143, 196, 255), anchor="mm")
        x += cw + gap
    return y + h


def small_tile():
    W, H = 440, 280
    canvas = backdrop(W, H)
    canvas = icon_tile(canvas, 26, 26, 64)
    pop = shot("popup-en.png", 300, radius=18)
    pop = pop.crop((0, 0, pop.width, 214 * SS))          # only the top of the popup peeks in from the right
    canvas = place(canvas, pop, W - pop.width / SS + 12 - 20, 56)
    d = ImageDraw.Draw(canvas, "RGBA")
    text(d, (26, 104), "PS Store", font(F_BOLD, 30), WHITE)
    text(d, (26, 138), "Enhancer", font(F_BOLD, 30), (90, 163, 255))
    text(d, (26, 184), "Real lowest prices,", font(F_REG, 14), TEXT_DIM)
    text(d, (26, 204), "deals and trophies", font(F_REG, 14), TEXT_DIM)
    chips(canvas, ["16 languages", "Free"], 26, 238, 250, size=11, pad=11, gap=8, h=26)
    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/promo-small-440x280.png")
    print("promo-small-440x280.png", canvas.size)


def marquee_tile():
    W, H = 1400, 560
    canvas = backdrop(W, H)
    # the two real pictures, the card behind the popup
    card = shot("card-en.png", 480)
    pop = shot("popup-en.png", 480)
    canvas = place(canvas, card, 800, 40)
    canvas = place(canvas, pop, 800 + card.width / SS + 24, 40)
    canvas = icon_tile(canvas, 84, 120, 96)
    d = ImageDraw.Draw(canvas, "RGBA")
    tx = 84
    text(d, (tx, 236), "PS Store Enhancer", font(F_BOLD, 56), WHITE)
    text(d, (tx, 306), "Smarter shopping for the PlayStation Store.", font(F_BOLD, 23), (200, 212, 232))
    text(d, (tx, 342), "Real lowest-ever prices, cross-platform comparison, scores,", font(F_REG, 17), TEXT_DIM)
    text(d, (tx, 368), "trophy info and wishlist alerts, right on the store page.", font(F_REG, 17), TEXT_DIM)
    chips(canvas, ["Price history", "Cross-platform", "Review scores", "Trophies", "Wishlist alerts", "16 languages"], tx, 416, 760)
    d = ImageDraw.Draw(canvas, "RGBA")
    text(d, (tx, H - 44), "Free and open source · No tracking · Dark, light and high contrast", font(F_REG, 14), TEXT_FAINT)
    canvas = finish(canvas, W, H)
    canvas.save(f"{OUT}/promo-marquee-1400x560.png")
    print("promo-marquee-1400x560.png", canvas.size)


if __name__ == "__main__":
    small_tile()
    marquee_tile()
