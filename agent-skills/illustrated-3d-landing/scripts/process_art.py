#!/usr/bin/env python3
"""Turn raw generator downloads into the files the landing template loads.

Plates  -> JPEG, 2400 px wide.
Cutouts -> flat-magenta background keyed to transparent (with edge-fringe removal),
           trimmed to the artwork, resized, saved as WebP with alpha.

Usage:  python3 process_art.py manifest.json OUT_DIR
Needs:  pip install pillow numpy   (a throwaway venv is fine)

manifest.json
{
  "key": "#FF00FF",                       # optional, default magenta
  "plates":  [ {"src": "~/Downloads/a.png", "name": "plate-hero"} ],
  "cutouts": [ {"src": "~/Downloads/b.png", "name": "cut-grass",
                "keep_w": 0.93, "keep_h": 0.92,   # crop to this fraction from the top-left (drops the corner mark / ghosts)
                "tolerance": 90, "softness": 70,  # colour distance from the key that becomes transparent / feather
                "max_width": 2400,
                "hole": false} ]                   # true: erase the bottom-right 10% instead of cropping
}
Defaults: keep_w=keep_h=1, tolerance=90, softness=70, max_width=1400, hole=false.
"""
import json, os, sys
import numpy as np
from PIL import Image

def hex_to_rgb(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)

def key_out(img, key, tol, soft, hole):
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    dist = np.sqrt(((a - key) ** 2).sum(axis=2))
    al = np.clip((dist - tol) / soft, 0, 1); al = al * al * (3 - 2 * al)       # smoothstep matte
    out = a.copy(); m = (al > 0) & (al < 1)
    out[m] = np.clip((a[m] - (1 - al[m, None]) * key) / al[m, None], 0, 255)   # observed = a*fg + (1-a)*key  ->  fg
    if hole:
        h, w = al.shape; al[int(h * .90):, int(w * .90):] = 0
    return Image.fromarray(np.dstack([out, al * 255]).astype(np.uint8), "RGBA")

def main(manifest_path, out_dir):
    cfg = json.load(open(manifest_path)); os.makedirs(out_dir, exist_ok=True)
    key = hex_to_rgb(cfg.get("key", "#FF00FF"))
    for p in cfg.get("plates", []):
        im = Image.open(os.path.expanduser(p["src"])).convert("RGB")
        im = im.resize((2400, round(2400 * im.height / im.width)), Image.LANCZOS)
        im.save(os.path.join(out_dir, p["name"] + ".jpg"), quality=82, optimize=True, progressive=True)
        print(p["name"], im.size)
    for c in cfg.get("cutouts", []):
        im = Image.open(os.path.expanduser(c["src"])).convert("RGB")
        im = im.crop((0, 0, int(im.width * c.get("keep_w", 1)), int(im.height * c.get("keep_h", 1))))
        rgba = key_out(im, key, c.get("tolerance", 90), c.get("softness", 70), c.get("hole", False))
        bb = rgba.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
        if bb: rgba = rgba.crop(bb)
        mw = c.get("max_width", 1400)
        if rgba.width > mw: rgba = rgba.resize((mw, round(rgba.height * mw / rgba.width)), Image.LANCZOS)
        rgba.save(os.path.join(out_dir, c["name"] + ".webp"), quality=88, method=6)
        print(c["name"], rgba.size)

if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
