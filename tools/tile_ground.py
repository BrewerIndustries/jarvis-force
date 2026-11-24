#!/usr/bin/env python3
"""Make the generated ground textures tile seamlessly and size them for the game.

The image model's "seamless" is never exact, so each edge is cross-faded with the band just past the
opposite edge: the first B rows blend into rows N-B..N, then the image is cropped to N-B. Row N-B-1
is then followed by row 0, which starts as row N-B, so the seam disappears. Same for columns (the
ground only repeats vertically in play, but horizontal tiling keeps it safe on any width).

Usage: python3 tools/tile_ground.py
Reads art-src/ground_<biome>.(png|webp|jpg), writes sprites/ground_<biome>.jpg at TILE x TILE device
pixels (2x the 672px logical tile the game draws, which covers the panned world WW = 668).
"""
import os
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE = 1344
BAND = .18
# per-biome tone: (brightness, contrast, saturation), so the ground sits under the sprites
TONE = {
    "isles": (.82, .85, 1.0), "peaks": (1.0, .95, 1.0), "seas": (.92, .85, 1.0),
    "sprawl": (.95, .9, 1.0), "storm": (.95, .9, .95), "core": (1.05, 1.0, 1.0),
}


def seamless(im, vertical):
    w, h = im.size; n = h if vertical else w; b = int(n * BAND)
    if vertical:
        out = im.crop((0, 0, w, n - b)); head = im.crop((0, 0, w, b)); tail = im.crop((0, n - b, w, n))
        mask = Image.linear_gradient("L").resize((w, b))  # 0 at the top -> 255 at the bottom
    else:
        out = im.crop((0, 0, n - b, h)); head = im.crop((0, 0, b, h)); tail = im.crop((n - b, 0, n, h))
        mask = Image.linear_gradient("L").rotate(90, expand=True).resize((b, h))
    out.paste(Image.composite(head, tail, mask), (0, 0))  # mask 255 -> head, 0 -> tail
    return out


for b, (br, co, sa) in TONE.items():
    src = next((os.path.join(ROOT, "art-src", "ground_%s%s" % (b, e)) for e in (".png", ".webp", ".jpg")
                if os.path.exists(os.path.join(ROOT, "art-src", "ground_%s%s" % (b, e)))), None)
    if not src: print("missing", b); continue
    im = seamless(seamless(Image.open(src).convert("RGB"), True), False).resize((TILE, TILE), Image.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(br)
    im = ImageEnhance.Contrast(im).enhance(co)
    im = ImageEnhance.Color(im).enhance(sa)
    out = os.path.join(ROOT, "sprites", "ground_%s.jpg" % b)
    im.save(out, quality=80, optimize=True, progressive=True)
    print(out, os.path.getsize(out) // 1024, "KB")
