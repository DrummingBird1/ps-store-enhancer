"""Generate the new PS Store Enhancer icon set (512 master -> 128/48/16)."""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "dist", "asset-drafts", "icons")
os.makedirs(OUT_DIR, exist_ok=True)
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_BLACK = "C:/Windows/Fonts/arialbd.ttf"

S = 512  # master size, supersampled 4x for crisp downscale
SS = 4
W = S * SS

NAVY = (0, 48, 135)
BLUE_MID = (0, 112, 209)
BLUE_LIGHT = (77, 166, 255)
GREEN = (109, 200, 73)
WHITE = (255, 255, 255)


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def main():
    # Diagonal-ish gradient background (navy -> mid blue), rounded square.
    bg = vertical_gradient(W, NAVY, BLUE_MID)
    bg = bg.filter(ImageFilter.GaussianBlur(0))  # no-op, placeholder for pipeline symmetry

    canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    mask = rounded_mask(W, int(W * 0.225))
    canvas.paste(bg, (0, 0), mask)

    draw = ImageDraw.Draw(canvas)

    # Subtle inner glow top-left for depth
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-W * 0.3, -W * 0.35, W * 0.75, W * 0.55], fill=(77, 166, 255, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.06))
    glow.putalpha(Image.composite(glow.split()[3], Image.new("L", (W, W), 0), mask))
    canvas = Image.alpha_composite(canvas, glow)
    draw = ImageDraw.Draw(canvas)

    # "PS" wordmark, bold, centered-ish
    ps_font = ImageFont.truetype(FONT_BLACK, int(W * 0.40))
    ps_text = "PS"
    bbox = draw.textbbox((0, 0), ps_text, font=ps_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (W - tw) / 2 - bbox[0]
    ty = W * 0.30 - bbox[1]
    # soft shadow
    shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((tx, ty + W * 0.012), ps_text, font=ps_font, fill=(0, 20, 60, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(W * 0.012))
    canvas = Image.alpha_composite(canvas, shadow)
    draw = ImageDraw.Draw(canvas)
    draw.text((tx, ty), ps_text, font=ps_font, fill=WHITE)

    # Upward "enhance" chevron/arrow accent, green, bottom-right area, inside a small pill
    pill_w, pill_h = W * 0.40, W * 0.24
    pill_x0, pill_y0 = W * 0.50, W * 0.62
    pill_x1, pill_y1 = pill_x0 + pill_w, pill_y0 + pill_h
    draw.rounded_rectangle([pill_x0, pill_y0, pill_x1, pill_y1], radius=pill_h / 2,
                            fill=(255, 255, 255, 235))

    # simple upward sparkline inside the pill (three points rising) + arrowhead
    pad = pill_h * 0.28
    lx0, ly0 = pill_x0 + pad, pill_y1 - pad
    lx1, ly1 = pill_x0 + pill_w * 0.45, pill_y0 + pill_h * 0.55
    lx2, ly2 = pill_x1 - pad * 1.3, pill_y0 + pad * 0.9
    line_w = max(3, int(W * 0.018))
    draw.line([(lx0, ly0), (lx1, ly1), (lx2, ly2)], fill=GREEN, width=line_w, joint="curve")
    for cx, cy in [(lx0, ly0), (lx1, ly1), (lx2, ly2)]:
        r = line_w * 0.9
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    # arrowhead at the end
    ah = pill_h * 0.22
    ang = math.atan2(ly2 - ly1, lx2 - lx1)
    p1 = (lx2, ly2)
    p2 = (lx2 - ah * math.cos(ang - 0.5), ly2 - ah * math.sin(ang - 0.5))
    p3 = (lx2 - ah * math.cos(ang + 0.5), ly2 - ah * math.sin(ang + 0.5))
    draw.polygon([p1, p2, p3], fill=GREEN)

    # Export master + downsizes
    master = canvas.resize((S, S), Image.LANCZOS)
    master.save(f"{OUT_DIR}/icon-master-512.png")

    for size in (128, 48, 16):
        im = canvas.resize((size, size), Image.LANCZOS)
        im.save(f"{OUT_DIR}/icon{size}.png")
        print(f"icon{size}.png saved, size={im.size}")


if __name__ == "__main__":
    main()
