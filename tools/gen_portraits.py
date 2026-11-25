#!/usr/bin/env python3
"""Generate the radio-comms portraits for the story cast (OpenRouter image model).

Usage: python3 tools/gen_portraits.py [who ...]
Writes art-src/pt_<who>.webp (raw, kept so re-runs are free) and sprites/pt_<who>.jpg (256px square).
Reads OPENROUTER_API_KEY from ~/.config/openrouter.env at run time (never stored in the repo).
"""
import base64, json, os, re, ssl, sys, urllib.request
from io import BytesIO
from PIL import Image, ImageOps
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = re.search(r"^OPENROUTER_API_KEY=(.+)$", open(os.path.expanduser("~/.config/openrouter.env")).read(), re.M).group(1).strip()
SIZE = 256

COMMON = ("Character portrait for a video game's radio-comms dialogue box. Head and shoulders, centred, square crop, "
          "painterly realistic digital painting, bold coloured rim light, dark muted background, post-apocalyptic "
          "sci-fi air-force setting. Original character. NO text, NO letters, NO border, NO frame, NO watermark. Subject: ")
PROMPTS = {
    "jarvis":   "a kind artificial intelligence's holographic avatar on a dark console: a glowing cyan circular lens like a "
                "calm eye inside slowly turning concentric rings, faint scanlines and floating data glyphs. No human face. "
                "Cyan and soft blue light.",
    "mags":     "a gruff woman in her fifties, a former airline aircraft mechanic: close-cropped grey hair, dark brown skin, "
                "a grease smudge on her cheek, welding goggles pushed up on her forehead, faded orange overalls, a big "
                "wrench over her shoulder, a lopsided half-smile. Warm orange rim light, dim hangar behind.",
    "pip":      "a cheerful ten-year-old kid with messy red hair under an oversized leather pilot's cap, freckles, a "
                "gap-toothed grin, a too-big bomber jacket covered in hand-sewn patches, clutching a crayon drawing of a "
                "jet. Lime-green rim light, hangar behind.",
    "wren":     "a calm, wry woman in her thirties, radio operator of a frozen northern outpost: dark hair in a long braid, "
                "a headset, a fur-lined parka with frost on the shoulders, a battered glowing radio set behind her. "
                "Pale icy-cyan rim light, snow in the air.",
    "boone":    "a big bearded convoy trucker in his forties with a faded trucker cap and aviator sunglasses, talking into a "
                "CB radio handset, inside the cab of a battered armoured truck. Amber rim light, dusty windscreen.",
    "overseer": "a menacing machine intelligence: one huge red mechanical eye inside a dark iron hexagonal frame, thin red "
                "circuit traces glowing across black metal, cold and vast. Deep red light.",
    "legion":   "the sensor head of a rusted military drone: a cluster of small red camera lenses on a corroded, dented "
                "metal faceplate with a stencilled serial plate (no readable text), radio static. Menacing but a little "
                "comical. Red and rust light.",
}


def gen(k):
    raw = os.path.join(ROOT, "art-src", "pt_%s.webp" % k)
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
    im = ImageOps.fit(Image.open(raw).convert("RGB"), (SIZE, SIZE), Image.LANCZOS)
    out = os.path.join(ROOT, "sprites", "pt_%s.jpg" % k)
    im.save(out, quality=84, optimize=True, progressive=True)
    print(out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(7) as ex: list(ex.map(gen, sys.argv[1:] or list(PROMPTS)))
