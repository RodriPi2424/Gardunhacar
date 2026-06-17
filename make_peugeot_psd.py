from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import subprocess


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "peugeot_2008_psd_template"
OUT.mkdir(exist_ok=True)
LAYERS = OUT / "layers"
LAYERS.mkdir(exist_ok=True)
SVG_DIR = OUT / "svg_icons"
SVG_DIR.mkdir(exist_ok=True)

SRC = Path(r"C:\Users\rodri\AppData\Local\Temp\codex-clipboard-53e6ba8f-07d0-4fb4-99ca-3c9abc17f28f.png")
W, H = 717, 716

BLACK = (9, 9, 9, 255)
DARK = (31, 31, 30, 255)
MID = (82, 82, 78, 255)
LINE = (118, 118, 112, 170)
BG = (232, 228, 220, 255)


def font(path, size):
    return ImageFont.truetype(str(path), size)


FONTS = {
    "black": font(Path(r"C:\Windows\Fonts\ariblk.ttf"), 172),
    "bold_20": font(Path(r"C:\Windows\Fonts\ArialNova-Bold.ttf"), 20),
    "bold_18": font(Path(r"C:\Windows\Fonts\ArialNova-Bold.ttf"), 18),
    "medium_21": font(Path(r"C:\Windows\Fonts\bahnschrift.ttf"), 21),
    "medium_13": font(Path(r"C:\Windows\Fonts\bahnschrift.ttf"), 13),
    "medium_11": font(Path(r"C:\Windows\Fonts\bahnschrift.ttf"), 11),
    "medium_9": font(Path(r"C:\Windows\Fonts\bahnschrift.ttf"), 9),
    "regular_9": font(Path(r"C:\Windows\Fonts\ArialNova.ttf"), 9),
    "regular_8": font(Path(r"C:\Windows\Fonts\ArialNova.ttf"), 8),
}


def blank():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def save_layer(name, im):
    path = LAYERS / f"{len(layer_paths):02d}_{name}.png"
    im.save(path)
    layer_paths.append(path)


def draw_text_layer(name, xy, text, font_obj, fill=BLACK, spacing=0, leading=None, align="left"):
    im = blank()
    d = ImageDraw.Draw(im)
    x, y = xy
    if leading is None:
        leading = font_obj.size + 4
    lines = text.split("\n")
    for line in lines:
        draw_x = x
        if align != "left":
            box = d.textbbox((0, 0), line, font=font_obj)
            width = box[2] - box[0]
            draw_x = x - width / 2 if align == "center" else x - width
        if spacing:
            cx = draw_x
            for ch in line:
                d.text((cx, y), ch, font=font_obj, fill=fill)
                box = d.textbbox((0, 0), ch, font=font_obj)
                cx += (box[2] - box[0]) + spacing
        else:
            d.text((draw_x, y), line, font=font_obj, fill=fill)
        y += leading
    save_layer(name, im)


def draw_rect_layer(name, box, fill):
    im = blank()
    ImageDraw.Draw(im).rectangle(box, fill=fill)
    save_layer(name, im)


def write_svg(name, markup):
    path = SVG_DIR / f"{name}.svg"
    path.write_text(markup, encoding="utf-8")
    return path


def engine_icon(size=(37, 37)):
    scale = size[0] / 64
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = cy = size[0] / 2
    for angle in range(0, 360, 45):
        import math
        a = math.radians(angle)
        x = cx + math.cos(a) * 13 * scale
        y = cy + math.sin(a) * 13 * scale
        d.rounded_rectangle((x - 5 * scale, y - 5 * scale, x + 5 * scale, y + 5 * scale), radius=2, fill=BLACK)
    d.ellipse((9 * scale, 9 * scale, 55 * scale, 55 * scale), fill=BLACK)
    d.ellipse((20 * scale, 20 * scale, 44 * scale, 44 * scale), fill=BG)
    d.ellipse((26 * scale, 26 * scale, 38 * scale, 38 * scale), fill=BLACK)
    return im


def gauge_icon(size=(37, 37)):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.arc((4, 7, size[0] - 4, size[1] + 24), 200, 340, fill=BLACK, width=3)
    d.line((size[0] / 2, size[1] - 8, size[0] - 9, 11), fill=BLACK, width=2)
    d.ellipse((size[0] / 2 - 3, size[1] - 11, size[0] / 2 + 3, size[1] - 5), fill=BLACK)
    d.line((7, size[1] - 8, 12, size[1] - 8), fill=BLACK, width=2)
    d.line((size[0] - 12, size[1] - 8, size[0] - 7, size[1] - 8), fill=BLACK, width=2)
    d.line((size[0] / 2, 8, size[0] / 2, 13), fill=BLACK, width=2)
    return im


def crest_icon(size=(31, 32)):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    shield = [(15, 1), (28, 5), (28, 16), (24, 25), (15, 31), (6, 25), (2, 16), (2, 5)]
    d.polygon(shield, fill=BLACK)
    d.line(shield + [shield[0]], fill=BG, width=1)
    d.polygon([(10, 21), (16, 16), (17, 8), (23, 11), (21, 16), (17, 23)], fill=BG)
    d.polygon([(18, 12), (24, 13), (20, 17), (22, 22), (17, 19)], fill=BLACK)
    return im


layer_paths = []

# Background and subtle tonal washes.
bg = Image.new("RGBA", (W, H), BG)
save_layer("background_warm_paper", bg)
wash = blank()
wd = ImageDraw.Draw(wash)
wd.ellipse((70, 170, 670, 580), fill=(255, 255, 250, 55))
wash = wash.filter(ImageFilter.GaussianBlur(30))
save_layer("background_center_light_wash", wash)
shadow = blank()
sd = ImageDraw.Draw(shadow)
sd.ellipse((100, 483, 650, 555), fill=(80, 80, 70, 55))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
save_layer("floor_shadow_under_car", shadow)

# Text layers.
draw_text_layer("brand_wordmark_editable_text", (37, 21), "P E U G E O T", FONTS["medium_21"], spacing=6.5)
draw_text_layer("model_year_2008_editable_text", (24, 35), "2008", FONTS["black"], spacing=-9)
draw_text_layer("title_peugeot_2008_editable_text", (37, 246), "PEUGEOT 2008", FONTS["bold_20"], spacing=3.3)
draw_text_layer("subtitle_editable_text", (37, 276), "ENGINEERED FOR VERSATILITY.\nDRIVEN BY CONFIDENCE.", FONTS["medium_11"], DARK, spacing=1.55, leading=18)
draw_rect_layer("small_accent_rule_shape", (37, 318, 56, 321), BLACK)
draw_rect_layer("right_vertical_rule_shape", (520, 109, 521, 191), LINE)
draw_text_layer("right_claim_editable_text", (544, 118), "BOLD DESIGN.\nSMART TECH.\nMADE TO\nMOVE YOU.", FONTS["medium_11"], BLACK, spacing=1.75, leading=20)

# Replaceable hero photo layer. A feathered manual mask keeps the pale photo
# background from covering the editable headline and model text.
src = Image.open(SRC).convert("RGBA")
car_crop_box = (92, 218, 657, 535)
car_crop = src.crop(car_crop_box)
mask = Image.new("L", car_crop.size, 0)
md = ImageDraw.Draw(mask)
car_outline = [
    (0, 234), (14, 182), (46, 136), (118, 91), (183, 54),
    (310, 36), (424, 34), (500, 58), (548, 103), (565, 170),
    (544, 247), (456, 315), (276, 316), (96, 296), (18, 268),
]
md.polygon(car_outline, fill=255)
md.ellipse((4, 248, 515, 330), fill=210)
mask = mask.filter(ImageFilter.GaussianBlur(2))
car_crop.putalpha(mask)
car_layer = blank()
car_layer.alpha_composite(car_crop, (92, 218))
save_layer("hero_car_replaceable_photo_layer", car_layer)

# Spec area vector-style icon layers and editable text.
draw_rect_layer("spec_divider_left_shape", (260, 543, 261, 622), LINE)
draw_rect_layer("spec_divider_right_shape", (458, 543, 459, 622), LINE)
for icon_name, icon_im, pos in [
    ("engine_icon_svg_style_layer", engine_icon(), (164, 537)),
    ("acceleration_icon_svg_style_layer", gauge_icon(), (337, 537)),
    ("top_speed_icon_svg_style_layer", gauge_icon(), (526, 537)),
]:
    im = blank()
    im.alpha_composite(icon_im, pos)
    save_layer(icon_name, im)

draw_text_layer("power_value_editable_text", (181, 574), "100 PS", FONTS["bold_18"], BLACK, align="center")
draw_text_layer("power_detail_editable_text", (181, 599), "1.2 PURETECH\nPETROL ENGINE", FONTS["medium_9"], DARK, spacing=0.6, leading=13, align="center")
draw_text_layer("acceleration_value_editable_text", (356, 574), "0-100 km/h", FONTS["bold_18"], BLACK, align="center")
draw_text_layer("acceleration_detail_editable_text", (356, 603), "IN 10.3 SECONDS", FONTS["regular_8"], DARK, spacing=0.4, align="center")
draw_text_layer("speed_value_editable_text", (549, 574), "183 km/h", FONTS["bold_18"], BLACK, align="center")
draw_text_layer("speed_detail_editable_text", (549, 603), "TOP SPEED", FONTS["regular_8"], DARK, spacing=0.4, align="center")

# Bottom info table.
draw_rect_layer("info_table_top_rule_shape", (54, 636, 662, 637), LINE)
draw_rect_layer("info_table_bottom_rule_shape", (54, 674, 662, 675), LINE)
draw_rect_layer("info_table_separator_1_shape", (264, 647, 265, 662), LINE)
draw_rect_layer("info_table_separator_2_shape", (464, 647, 465, 662), LINE)
draw_text_layer("kilometers_label_editable_text", (77, 647), "Quilómetros", FONTS["regular_9"], MID)
draw_text_layer("kilometers_value_editable_text", (187, 647), "78 622 km", FONTS["regular_9"], BLACK)
draw_text_layer("registration_label_editable_text", (293, 647), "Ano de Registo", FONTS["regular_9"], MID)
draw_text_layer("registration_value_editable_text", (405, 647), "2022", FONTS["regular_9"], BLACK)
draw_text_layer("gearbox_label_editable_text", (498, 647), "Caixa", FONTS["regular_9"], MID)
draw_text_layer("gearbox_value_editable_text", (580, 647), "MANUAL", FONTS["regular_9"], BLACK)

crest_layer = blank()
crest_layer.alpha_composite(crest_icon(), (343, 678))
save_layer("peugeot_crest_svg_style_layer", crest_layer)
draw_text_layer("bottom_brand_wordmark_editable_text", (360, 702), "PEUGEOT", FONTS["medium_13"], BLACK, spacing=2.8, align="center")

# Companion SVG sources for the icon layers.
write_svg(
    "engine_icon",
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#090909" d="M28 5h8l2 9 6 2 8-5 6 6-5 8 2 6 9 2v8l-9 2-2 6 5 8-6 6-8-5-6 2-2 9h-8l-2-9-6-2-8 5-6-6 5-8-2-6-9-2v-8l9-2 2-6-5-8 6-6 8 5 6-2 2-9Z"/><circle cx="32" cy="37" r="13" fill="#e8e4dc"/><circle cx="32" cy="37" r="7" fill="#090909"/></svg>',
)
write_svg(
    "gauge_icon",
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M12 42a20 20 0 1 1 40 0" stroke="#090909" stroke-width="5" stroke-linecap="round"/><path d="M32 42 45 24" stroke="#090909" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="42" r="4" fill="#090909"/><path d="M16 42h6M42 42h6M20 29l4 4M44 29l-4 4M32 18v6" stroke="#090909" stroke-width="3" stroke-linecap="round"/></svg>',
)
write_svg(
    "peugeot_crest_simplified",
    '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="78" viewBox="0 0 70 78"><path d="M35 4 62 12v24c0 17-10 30-27 38C18 66 8 53 8 36V12L35 4Z" fill="#090909"/><path d="M35 9 56 16v20c0 13-7 24-21 31-14-7-21-18-21-31V16l21-7Z" fill="none" stroke="#e8e4dc" stroke-width="2"/><path d="M23 46c8-3 12-7 13-15l-6-4 5-8 11 6c-1 17-8 27-23 33V46Z" fill="#e8e4dc"/></svg>',
)

# Build layered PSD. Each full-canvas PNG becomes one named layer in Photoshop-compatible apps.
psd_path = OUT / "peugeot_2008_editable_template.psd"
cmd = ["magick", *map(str, layer_paths), "-set", "colorspace", "sRGB", str(psd_path)]
subprocess.run(cmd, check=True)

# Also export a flattened preview for quick visual QA.
preview = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for path in layer_paths:
    preview.alpha_composite(Image.open(path).convert("RGBA"))
preview_path = OUT / "peugeot_2008_editable_template_preview.png"
preview.save(preview_path)

print(psd_path)
print(preview_path)
print(f"layers={len(layer_paths)}")
