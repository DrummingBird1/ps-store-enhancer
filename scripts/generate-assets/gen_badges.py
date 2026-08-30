import os
import sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mockkit import *
from PIL import ImageDraw, ImageFilter

OUT = os.path.join(ROOT, "dist", "asset-drafts", "badges")
os.makedirs(OUT, exist_ok=True)

# (version, label, top_color, bottom_color, accent_text_color)
VERSIONS = [
    ("2.2.1", "FIXES",      (71, 85, 105),   (30, 41, 59),   (148, 163, 184)),
    ("2.2.2", "COMPLIANCE", (194, 120, 3),   (120, 70, 3),   (253, 186, 116)),
    ("2.2.3", "COMPLIANCE", (194, 120, 3),   (120, 70, 3),   (253, 186, 116)),
    ("2.3.0", "MAJOR",      (0, 112, 209),   (0, 48, 135),   (125, 211, 252)),
    ("2.3.1", "POLISH",     (13, 148, 136),  (6, 78, 71),    (94, 234, 212)),
    ("2.3.2", "SECURITY",   (220, 38, 38),   (127, 29, 29),  (252, 165, 165)),
    ("2.4.0", "FEATURE",    (22, 163, 74),   (20, 83, 45),   (134, 239, 172)),
    ("2.5.0", "RENAMED",    (147, 51, 234),  (76, 29, 149),  (216, 180, 254)),
    ("2.6.0", "RENAMED",    (147, 51, 234),  (76, 29, 149),  (216, 180, 254)),
]

W = H = 160


def badge(version, label, top, bottom, accent):
    canvas = new_canvas(W, H, INK)
    d = ImageDraw.Draw(canvas, "RGBA")
    paste_gradient_rrect(canvas, (0, 0, W, H), 30, top, bottom)
    d = ImageDraw.Draw(canvas, "RGBA")

    # subtle top-left glow
    glow = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-W * SS * 0.2, -H * SS * 0.3, W * SS * 0.65, H * SS * 0.45], fill=(255, 255, 255, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(W * SS * 0.08))
    mask = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W * SS - 1, H * SS - 1], radius=30 * SS, fill=255)
    canvas_rgba = canvas.convert("RGBA")
    glow.putalpha(Image.composite(glow.split()[3], Image.new("L", (W * SS, H * SS), 0), mask))
    canvas = Image.alpha_composite(canvas_rgba, glow)
    d = ImageDraw.Draw(canvas, "RGBA")

    # category pill top
    lab_w = text_w(d, label, font(F_BOLD, 11)) + 20
    rrect(d, ((W - lab_w) / 2, 16, (W + lab_w) / 2, 34), 9, fill=(0, 0, 0, 90))
    text(d, (W / 2, 26), label, font(F_BOLD, 11), WHITE, anchor="mm")

    # version number, dominant
    text(d, (W / 2, 82), f"v{version}", font(F_BLACK, 30), WHITE, anchor="mm")

    # thin accent underline
    lw = 46
    d.line([((W - lw) / 2 * SS, 106 * SS), ((W + lw) / 2 * SS, 106 * SS)], fill=accent, width=3 * SS)

    # small dot row decoration (release "type" as three dots, purely decorative rhythm)
    text(d, (W / 2, 132), "PS STORE ENHANCER", font(F_BOLD, 9), (255, 255, 255, 170), anchor="mm")

    canvas = finish(canvas, W, H)
    out_name = f"v{version.replace('.', '-')}.png"
    canvas.save(f"{OUT}/{out_name}")
    print(out_name)


if __name__ == "__main__":
    for v, lab, top, bot, acc in VERSIONS:
        badge(v, lab, top, bot, acc)
