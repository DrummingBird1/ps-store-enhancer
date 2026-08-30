"""Shared drawing toolkit for PS Store Enhancer store-listing mockups.
Renders at 2x supersampling then downsamples for crisp edges/text.
All icons are hand-drawn vectors (no emoji glyphs -> no missing-glyph boxes).
"""
import re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

_HEB_RUN = re.compile(r'[\u0590-\u05FF]+|[^\u0590-\u05FF]+')


def rtl_fix(s):
    """Lightweight bidi approximation for Pillow, which does not reorder RTL text.
    Hebrew has no letter-joining, so reversing a Hebrew run's characters is visually
    correct; Latin/digit/symbol runs keep their internal order but the overall run
    sequence is reversed to read right-to-left."""
    if not s or not _HEB_RUN.search(s) or not re.search(r'[\u0590-\u05FF]', s):
        return s
    tokens = _HEB_RUN.findall(s)
    fixed = [t[::-1] if re.match(r'^[\u0590-\u05FF]+$', t) else t for t in tokens]
    return "".join(reversed(fixed))


FONT_DIR = "C:/Windows/Fonts/"
F_REG = FONT_DIR + "segoeui.ttf"
F_BOLD = FONT_DIR + "segoeuib.ttf"
F_BLACK = FONT_DIR + "arialbd.ttf"
F_MONO = FONT_DIR + "consola.ttf"

# Palette — matches extension/styles.css + assets/docs/index.html exactly
INK = (10, 15, 26)          # #0a0f1a page bg
CARD = (19, 27, 46)         # #131b2e
CARD2 = (27, 40, 56)        # #1b2838
LINE = (255, 255, 255, 20)  # ~8% white
TEXT = (226, 232, 240)      # #e2e8f0
TEXT_DIM = (160, 174, 192)  # #a0aec0
TEXT_FAINT = (113, 128, 150)  # #718096
ACCENT = (77, 166, 255)     # #4da6ff
ACCENT_DEEP = (0, 112, 209)  # #0070d1
NAVY = (0, 48, 135)         # #003087
GOOD = (109, 200, 73)       # #6dc849
WARN = (245, 197, 24)       # #f5c518
BAD = (255, 64, 64)         # #ff4040
WHITE = (255, 255, 255)

SS = 2  # supersample factor


def font(path, size):
    return ImageFont.truetype(path, size * SS)


def new_canvas(w, h, bg=INK):
    return Image.new("RGB", (w * SS, h * SS), bg)


def finish(canvas, out_w, out_h):
    return canvas.resize((out_w, out_h), Image.LANCZOS)


def rrect(draw, box, radius, **kw):
    scaled = [v * SS for v in box]
    if "width" in kw:
        kw["width"] = kw["width"] * SS
    draw.rounded_rectangle(scaled, radius=radius * SS, **kw)


def text(draw, xy, s, f, fill, anchor=None):
    draw.text((xy[0] * SS, xy[1] * SS), s, font=f, fill=fill, anchor=anchor)


def text_w(draw, s, f):
    b = draw.textbbox((0, 0), s, font=f)
    return (b[2] - b[0]) / SS


def vgrad(w, h, top, bottom):
    img = Image.new("RGB", (1, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize((w, h))


def paste_gradient_rrect(canvas, box, radius, top, bottom):
    x0, y0, x1, y1 = [v * SS for v in box]
    w, h = int(x1 - x0), int(y1 - y0)
    grad = vgrad(w, h, top, bottom)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius * SS, fill=255)
    canvas.paste(grad, (int(x0), int(y0)), mask)


# ── vector icon glyphs (drawn, not emoji) ──────────────────────────
def icon_chart(draw, cx, cy, size, color, width=None):
    """small rising sparkline with dot at end"""
    w = width or max(2, size // 8)
    pts = [(cx - size, cy + size * 0.5), (cx - size * 0.2, cy - size * 0.1), (cx + size, cy - size * 0.7)]
    draw.line([(p[0] * SS, p[1] * SS) for p in pts], fill=color, width=w * SS, joint="curve")
    for p in pts:
        r = w * 0.9
        draw.ellipse([(p[0] - r) * SS, (p[1] - r) * SS, (p[0] + r) * SS, (p[1] + r) * SS], fill=color)


def icon_trophy(draw, cx, cy, size, color):
    d = draw
    x0, y0 = cx - size, cy - size
    x1, y1 = cx + size, cy + size * 0.3
    d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=size * 0.25 * SS, outline=color, width=max(2, size // 9) * SS)
    # handles
    hr = size * 0.5
    d.arc([(x0 - hr) * SS, y0 * SS, x0 * SS, (y0 + hr * 1.4) * SS], start=90, end=270, fill=color, width=max(2, size // 10) * SS)
    d.arc([x1 * SS, y0 * SS, (x1 + hr) * SS, (y0 + hr * 1.4) * SS], start=270, end=90, fill=color, width=max(2, size // 10) * SS)
    # stem + base
    d.rectangle([(cx - size * 0.15) * SS, y1 * SS, (cx + size * 0.15) * SS, (y1 + size * 0.35) * SS], fill=color)
    d.rectangle([(cx - size * 0.4) * SS, (y1 + size * 0.35) * SS, (cx + size * 0.4) * SS, (y1 + size * 0.48) * SS], fill=color)


def icon_star(draw, cx, cy, r, color, filled=True, width=2):
    import math
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(ang), cy - rad * math.sin(ang)))
    pts_s = [(p[0] * SS, p[1] * SS) for p in pts]
    if filled:
        draw.polygon(pts_s, fill=color)
    else:
        draw.polygon(pts_s, outline=color, width=width * SS)


def icon_bell(draw, cx, cy, size, color):
    d = draw
    d.pieslice([(cx - size) * SS, (cx - size) * SS * 0 + (cy - size) * SS, (cx + size) * SS, (cy + size * 0.5) * SS],
               180, 360, fill=color)
    d.rectangle([(cx - size) * SS, cy * SS, (cx + size) * SS, (cy + size * 0.55) * SS], fill=color)
    d.ellipse([(cx - size * 0.22) * SS, (cy + size * 0.5) * SS, (cx + size * 0.22) * SS, (cy + size * 0.95) * SS], fill=color)


def icon_search(draw, cx, cy, size, color, width=None):
    w = width or max(2, size // 6)
    r = size * 0.62
    draw.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], outline=color, width=w * SS)
    import math
    hx = cx + r * math.cos(math.radians(45))
    hy = cy + r * math.sin(math.radians(45))
    ex = cx + (r + size * 0.7) * math.cos(math.radians(45))
    ey = cy + (r + size * 0.7) * math.sin(math.radians(45))
    draw.line([(hx * SS, hy * SS), (ex * SS, ey * SS)], fill=color, width=int(w * 1.3) * SS)


def icon_layers(draw, cx, cy, size, color):
    import math
    def diamond(y_off, fill=None, outline=None, width=2):
        pts = [(cx, cy + y_off - size * 0.35), (cx + size, cy + y_off), (cx, cy + y_off + size * 0.35), (cx - size, cy + y_off)]
        pts_s = [(p[0] * SS, p[1] * SS) for p in pts]
        if fill:
            draw.polygon(pts_s, fill=fill)
        else:
            draw.polygon(pts_s, outline=outline, width=width * SS)
    diamond(-size * 0.3, fill=color)
    diamond(size * 0.15, outline=color, width=max(2, size // 8))
    diamond(size * 0.6, outline=color, width=max(2, size // 8))


def icon_gift(draw, cx, cy, size, color):
    d = draw
    box_top = cy - size * 0.15
    d.rectangle([(cx - size) * SS, box_top * SS, (cx + size) * SS, (cy + size) * SS], outline=color, width=max(2, size // 8) * SS)
    d.rectangle([(cx - size) * SS, (box_top - size * 0.28) * SS, (cx + size) * SS, box_top * SS], fill=color)
    d.rectangle([(cx - size * 0.14) * SS, (box_top - size * 0.28) * SS, (cx + size * 0.14) * SS, (cy + size) * SS], fill=color)
    r = size * 0.32
    d.ellipse([(cx - r * 1.6) * SS, (box_top - size * 0.28 - r * 1.3) * SS, (cx - r * 0.2) * SS, (box_top - size * 0.28 + r * 0.3) * SS], outline=color, width=max(2, size // 10) * SS)
    d.ellipse([(cx + r * 0.2) * SS, (box_top - size * 0.28 - r * 1.3) * SS, (cx + r * 1.6) * SS, (box_top - size * 0.28 + r * 0.3) * SS], outline=color, width=max(2, size // 10) * SS)


def icon_check(draw, cx, cy, size, color, width=None):
    w = width or max(2, size // 6)
    pts = [(cx - size, cy), (cx - size * 0.25, cy + size * 0.75), (cx + size, cy - size * 0.7)]
    draw.line([(p[0] * SS, p[1] * SS) for p in pts], fill=color, width=w * SS, joint="curve")
