"""Store-ready images for the Play listing, in docs/store/play/ (docs/RELEASE_CHECKLIST.md, step 8).

Play takes phone screenshots of at most twice as tall as wide, with no transparency (24-bit PNG or
JPEG); the screenshot tests' PNGs (docs/screenshots, 461 x 1000) have an alpha channel and are a
little taller than that. Each one listed below is padded at the sides to exactly 2:1 with its own
edge colour, and saved without alpha. The icon is saved as a 32-bit PNG (512 x 512) and the
feature graphic as a 24-bit PNG (1024 x 500), the formats Play asks for.

The screenshots tell the story in order and show only made-up names: no real band, festival or
venue (crewChat and offlineChat show "Iron Maiden", finderGroup "Foo Fighters night"), no map
(the tests draw a placeholder where the map goes) and nothing about Moshpoint+ (free for now).

Usage: python3 tools/store_images.py   (needs Pillow: pip install pillow). Run it again after the
screenshots change, and commit docs/store/play/.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
STORE = os.path.join(ROOT, "docs", "store")
OUT = os.path.join(STORE, "play")

SCREENSHOTS = [
    "welcome",          # Find your mates in any crowd
    "finderOneFriend",  # the arrow to Sam, 10 m
    "homeMain",         # the crew tonight
    "finderFarAway",    # Sam 140 m away, by GPS
    "privateThread",    # messages with no signal
    "hypeGroup",        # a gig planned ahead with the crew ("Ivory Tide")
    "venueCard",        # the crew card: venue map saved for offline
    "upNext",           # several crews, the next one wakes on the day
]


def two_to_one(im: Image.Image) -> Image.Image:
    """Opaque, and widened at the sides (each side's own edge, stretched) to at most 2:1."""
    rgb = Image.new("RGB", im.size, (0, 0, 0))
    rgb.paste(im, mask=im.getchannel("A") if im.mode == "RGBA" else None)
    w, h = rgb.size
    width = max(w, (h + 1) // 2)
    if width == w:
        return rgb
    left = (width - w) // 2
    right = width - w - left
    out = Image.new("RGB", (width, h))
    out.paste(rgb, (left, 0))
    if left:
        out.paste(rgb.crop((0, 0, 1, h)).resize((left, h)), (0, 0))
    if right:
        out.paste(rgb.crop((w - 1, 0, w, h)).resize((right, h)), (left + w, 0))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for i, name in enumerate(SCREENSHOTS, 1):
        shot = two_to_one(Image.open(os.path.join(SHOTS, name + ".png")).convert("RGBA"))
        assert shot.height <= 2 * shot.width and shot.mode == "RGB"
        shot.save(os.path.join(OUT, f"screenshot-{i}.png"), optimize=True)
        print(f"screenshot-{i}.png  {shot.width} x {shot.height}  ({name})")
    icon = Image.open(os.path.join(STORE, "icon-512.png")).convert("RGBA")
    assert icon.size == (512, 512)
    icon.save(os.path.join(OUT, "icon-512.png"), optimize=True)
    feature = Image.open(os.path.join(STORE, "feature-1024x500.png")).convert("RGB")
    assert feature.size == (1024, 500)
    feature.save(os.path.join(OUT, "feature-1024x500.png"), optimize=True)
    print("icon-512.png  512 x 512 (32-bit), feature-1024x500.png  1024 x 500 (24-bit)")


if __name__ == "__main__":
    main()
