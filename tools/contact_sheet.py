"""Contact sheets: one picture per screenshot test, every language side by side.

Usage: python3 tools/contact_sheet.py <screenshots dir> <out dir> <test> [<test> ...]
  <screenshots dir> is a checkout of a ui-screenshots branch (one folder per language:
  en, en-rUS, de, ar, ...), <test> a test name without .png (homeMain, homeWhole).
Writes <out dir>/<test>.png, labelled by language, as a 256-colour PNG kept under 1.5 MB
(it shrinks the cells until it fits). Needs Pillow (pip install pillow).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ORDER = ["en", "en-rUS", "de", "fr", "es", "es-rES", "pt-rBR", "it", "nl", "sv", "pl", "tr",
         "in", "vi", "th", "hi", "ar", "ja", "ko", "zh-rCN", "zh-rTW"]
LIMIT = 1_500_000


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(root, test, cell_w, cols):
    shots = []
    langs = [l for l in ORDER if os.path.isdir(os.path.join(root, l))]
    langs += sorted(l for l in os.listdir(root) if os.path.isdir(os.path.join(root, l)) and l not in langs and not l.startswith("."))
    for lang in langs:
        p = os.path.join(root, lang, test + ".png")
        if os.path.exists(p):
            shots.append((lang, Image.open(p).convert("RGB")))
    if not shots:
        return None
    label_h = 26
    gap = 10
    scaled = []
    for lang, im in shots:
        h = round(im.height * cell_w / im.width)
        scaled.append((lang, im.resize((cell_w, h), Image.LANCZOS)))
    cell_h = max(im.height for _, im in scaled)
    rows = (len(scaled) + cols - 1) // cols
    out = Image.new("RGB", (cols * (cell_w + gap) + gap, rows * (cell_h + label_h + gap) + gap), (24, 20, 36))
    d = ImageDraw.Draw(out)
    f = font(16)
    for i, (lang, im) in enumerate(scaled):
        x = gap + (i % cols) * (cell_w + gap)
        y = gap + (i // cols) * (cell_h + label_h + gap)
        d.text((x + 2, y + 3), lang, fill=(182, 255, 59), font=f)
        out.paste(im, (x, y + label_h))
    return out


def main():
    root, out_dir, tests = sys.argv[1], sys.argv[2], sys.argv[3:]
    os.makedirs(out_dir, exist_ok=True)
    for test in tests:
        tall = test == "homeWhole"
        cols = 11 if tall else 7
        cell_w = 200 if tall else 300
        while True:
            im = sheet(root, test, cell_w, cols)
            if im is None:
                print("no screenshots for", test)
                break
            path = os.path.join(out_dir, test + ".png")
            im.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(path, optimize=True)
            size = os.path.getsize(path)
            if size <= LIMIT or cell_w <= 120:
                print(f"{path}: {im.width}x{im.height}, {size // 1024} KB")
                break
            cell_w = int(cell_w * 0.85)


if __name__ == "__main__":
    main()
