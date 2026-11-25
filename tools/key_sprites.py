#!/usr/bin/env python3
"""Key generated sprite art off its magenta backdrop and normalise it for the game.

The image models are asked for a flat #FF00FF background. Keying on distance-to-magenta (rather
than an exact colour match) keeps anti-aliased edges smooth, and a despill pass stops purple
fringing on light hull panels.

Usage: python3 tools/key_sprites.py
Reads art-src/<id>.(png|jpg|webp), writes sprites/<id>.png at 2x the in-game size.
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-src")
OUT = os.path.join(ROOT, "sprites")

# id -> height in device pixels (2x the CSS size the game draws)
TARGETS = {
    "jet": 152,
    "fighter": 92,
    "scout": 72,
    "gunship": 156,
    "heli": 104,
    "diver": 76,
    "turret": 76,
    "tank": 92,
    "bomber": 116,
    "sniper": 80,
    "splitter": 96,
    "carrier": 208,
    "hive": 224,
    "lifter": 132,
    "mine": 60,
    "boss_manta": 380,
    "boss_colossus": 380,
    "boss_maw": 380,
    "boss_thorn": 380,
    "boss_cell": 380,
    "boss_eye": 380,
    "ship_kestrel": 152,
    "ship_lifeline": 152,
    "ship_bulwark": 152,
    "ship_tempest": 152,
    "ship_aegis": 152,
    "ship_stormcrow": 152,
    "ship_phantom": 152,
    "ship_sovereign": 152,
    "survivor": 80,
    "cache": 84,
    "salvage": 100,
    "part": 96,
}


def find_src(name):
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        p = os.path.join(SRC, name + ext)
        if os.path.exists(p):
            return p
    return None


def border_color(im):
    """The model's backdrop is rarely the exact magenta asked for: sample the border and key that."""
    px = im.load()
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (w // 2, h - 3)]
    cols = [px[x, y][:3] for x, y in pts]
    return tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))


def key(im, lo=14, hi=70):
    """Key on magenta-ness (how far red and blue both sit above green), not distance to a colour.

    The backdrop is saturated magenta, so any pixel where r and b beat g is the backdrop spilling
    into an edge or a translucent part. Pixels between the two thresholds get partial alpha and are
    despilled toward neutral grey, which keeps dark hulls and the heli's blurred rotor from turning
    purple.
    """
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            m = min(r, b) - g
            if m <= lo:
                continue
            if m >= hi:
                px[x, y] = (0, 0, 0, 0)
                continue
            k = (hi - m) / (hi - lo)
            # despill: collapse the magenta excess toward the green channel
            avg = (r + b) * .5
            r2 = int(g + (r - g) * .30)
            b2 = int(g + (b - g) * .30)
            px[x, y] = (r2, g, b2, int(a * k))
    return im


def trim(im, pad=6):
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(im.width, r + pad), min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit(im, target_h):
    w, h = im.size
    scale = target_h / h
    return im.resize((max(1, round(w * scale)), target_h), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for name, target_h in TARGETS.items():
        src = find_src(name)
        if not src:
            print(f"  {name}: no source yet")
            continue
        im = key(Image.open(src))
        im = trim(im)
        im = fit(im, target_h)
        dst = os.path.join(OUT, name + ".png")
        im.save(dst)
        made.append(name)
        print(f"  {name}: {os.path.basename(src)} -> sprites/{name}.png ({im.width}x{im.height})")
    print("wrote", ", ".join(made) if made else "nothing")


if __name__ == "__main__":
    sys.exit(main())
