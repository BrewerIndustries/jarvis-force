#!/usr/bin/env python3
"""Generate the surface textures painted onto the procedural terrain props (OpenRouter image model).

The props keep their procedural shapes, lean and altitudes; the game clips each top face / facet and lays
one of these tileable surfaces over it in 'overlay' mode, so the procedural lighting still reads through.

Usage: python3 tools/gen_props.py [kind ...]      (kinds: jungle rock ice roof)
Writes art-src/surf_<kind>.webp (raw) and sprites/surf_<kind>.jpg (seamless, 512px).
Reads OPENROUTER_API_KEY from ~/.config/openrouter.env at run time (never stored in the repo).
"""
import base64, json, os, re, ssl, sys, urllib.request
from io import BytesIO
from PIL import Image, ImageEnhance
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = re.search(r"^OPENROUTER_API_KEY=(.+)$", open(os.path.expanduser("~/.config/openrouter.env")).read(), re.M).group(1).strip()
TILE = 512

COMMON = ("Seamless tileable surface texture, viewed from DIRECTLY ABOVE (orthographic top-down, no perspective, no horizon, "
          "no sky). Painterly-realistic rendered style for a high-end top-down shoot-em-up. Even, flat, soft lighting with NO "
          "directional shading, NO vignette and NO cast shadows (the game adds its own lighting). Fill the frame edge to edge. "
          "Mid-grey overall value with rich fine detail at small scale and no single dominant feature. NO text, NO border. Subject: ")
PROMPTS = {
    "jungle": "dense tropical island jungle canopy seen from above: overlapping palm crowns, broad leaves and small clearings of "
              "grass, rich greens with a few yellow-green highlights.",
    "rock":   "weathered volcanic mountain rock face seen from above: fractured grey-brown basalt slabs, scree, small ledges "
              "and crevices, a few thin streaks of old snow in the cracks.",
    "ice":    "the flat top of a sea iceberg seen from above: compacted snow and blue-white glacial ice, wind-carved sastrugi "
              "ridges, fine pressure cracks with pale cyan depth, scattered crystals.",
    "roof":   "flat urban rooftops seen from above, tiled: tar-patched concrete and gravel roofing, small air-conditioning units, "
              "vents, skylights, pipes, puddles and moss creeping in from the edges, grey with faint green.",
}
TONE = {"jungle": (1.0, 1.0, 1.0), "rock": (1.0, 1.05, .9), "ice": (1.0, 1.0, 1.0), "roof": (1.0, 1.0, .9)}


def seamless(im, vertical, band=.18):
    w, h = im.size; n = h if vertical else w; b = int(n * band)
    if vertical:
        out = im.crop((0, 0, w, n - b)); head = im.crop((0, 0, w, b)); tail = im.crop((0, n - b, w, n))
        mask = Image.linear_gradient("L").resize((w, b))
    else:
        out = im.crop((0, 0, n - b, h)); head = im.crop((0, 0, b, h)); tail = im.crop((n - b, 0, n, h))
        mask = Image.linear_gradient("L").rotate(90, expand=True).transpose(Image.FLIP_LEFT_RIGHT).resize((b, h))
    out.paste(Image.composite(head, tail, mask), (0, 0))
    return out


def gen(k):
    raw = os.path.join(ROOT, "art-src", "surf_%s.webp" % k)
    if not os.path.exists(raw):
        body = {"model": "google/gemini-nano-banana-2.1", "modalities": ["image", "text"],
                "image_config": {"aspect_ratio": "1:1", "image_size": "1K"},
                "messages": [{"role": "user", "content": COMMON + PROMPTS[k]}]}
        req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(req, timeout=300, context=CTX))
        url = d["choices"][0]["message"]["images"][0]["image_url"]["url"]
        Image.open(BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB").save(raw, quality=92)
        print(raw, "cost", d.get("usage", {}).get("cost"))
    br, co, sa = TONE[k]
    im = seamless(seamless(Image.open(raw).convert("RGB"), True), False).resize((TILE, TILE), Image.LANCZOS)
    im = ImageEnhance.Color(ImageEnhance.Contrast(ImageEnhance.Brightness(im).enhance(br)).enhance(co)).enhance(sa)
    out = os.path.join(ROOT, "sprites", "surf_%s.jpg" % k)
    im.save(out, quality=82, optimize=True, progressive=True)
    print(out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as ex: list(ex.map(gen, sys.argv[1:] or list(PROMPTS)))
