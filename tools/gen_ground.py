#!/usr/bin/env python3
"""Generate the per-sector ground textures with the image model (OpenRouter).

Usage: python3 tools/gen_ground.py [biome ...]
Writes art-src/ground_<biome>.webp. Then run tools/tile_ground.py to make them seamless.
Reads OPENROUTER_API_KEY from ~/.config/openrouter.env at run time (never stored in the repo).
"""
import base64, json, os, re, ssl, sys, urllib.request
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = re.search(r"^OPENROUTER_API_KEY=(.+)$", open(os.path.expanduser("~/.config/openrouter.env")).read(), re.M).group(1).strip()

COMMON = ("Seamless tileable game ground texture, viewed from DIRECTLY ABOVE (orthographic top-down, no perspective, no horizon, "
          "no sky). Painterly-realistic rendered style like a high-end top-down shoot-em-up background. Even soft lighting from the "
          "top-left, no strong cast shadows. Fill the whole frame edge to edge with ground only. Medium-dark and low contrast so "
          "aircraft sprites stay readable on top of it. Fine detail at small scale, no single dominant feature. "
          "NO buildings, NO towers, NO vehicles, NO people, NO text, NO labels, NO border, NO vignette. Subject: ")
PROMPTS = {
    "isles": "the shallow flooded ruins of a drowned coastline seen through clear teal-blue sea water: deep teal water "
             "(#0d5f7d to #083a52) with gentle surface ripples, pale submerged sandbars, faint outlines of drowned road grids and "
             "broken concrete foundations far beneath the water, scattered seaweed patches. Mostly open water.",
    "peaks": "a volcanic ash plain: dark brown-black cracked basalt and grey ash drifts (#4a2c1c to #24140d), scattered small "
             "rocks and pumice, a few thin faintly glowing orange lava fissures, old scorched earth.",
    "seas": "a cold, dark northern sea surface: slate blue-grey water (#2f6f8c to #0f2c40), drifting slush ice, small brash "
            "ice fragments and thin pale foam streaks, subtle wind ripples.",
    "sprawl": "the ground floor of a megacity swallowed by jungle: broken cracked asphalt and concrete slabs, moss, grass, "
              "creeping vines, small shrubs, puddles and scattered rubble, faded road paint fragments, dark green and grey "
              "(#2f4a2a, #1e3320, #3b3f3a).",
    "storm": "rain-soaked moorland: patchwork of dark heather and grass fields divided by dark hedgerows and low dry-stone "
             "walls, peat bog pools and puddles reflecting grey sky, muted dark greens and browns (#3a4a3c to #1b231d).",
    "core": "the dark metal deck of a machine city: dark gunmetal armour plating panels (#262a35 to #101218) with recessed "
            "seams, bolts, vents, grilles, faint thin glowing cyan and violet circuit traces, a few hatch outlines.",
}

def gen(b):
    body = {"model": "google/gemini-nano-banana-2.1", "modalities": ["image", "text"],
            "image_config": {"aspect_ratio": "1:1", "image_size": "2K"},
            "messages": [{"role": "user", "content": COMMON + PROMPTS[b]}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=300, context=CTX))
    url = d["choices"][0]["message"]["images"][0]["image_url"]["url"]
    out = os.path.join(ROOT, "art-src", "ground_%s.webp" % b)
    from io import BytesIO
    from PIL import Image
    Image.open(BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB").save(out, quality=90)
    print(out, "cost", d.get("usage", {}).get("cost"))

if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as ex: list(ex.map(gen, sys.argv[1:] or list(PROMPTS)))
