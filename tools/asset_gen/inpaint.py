#!/usr/bin/env python
"""Touch up a picked render by repainting parts of it (plan §8.4: "inpaint just the legs").

Places the source on a fresh 512² white canvas (optionally scaled and shifted, to make room for
a part the original cropped), then inpaints each masked region with SDXL-Turbo in turn. Writes
one candidate per seed plus a JSON sidecar with every setting.

    export PYTHONPATH=~/.cache/jimothy-sdxl-pylibs
    chrt --idle 0 ionice -c 3 ~/venv/bin/python tools/asset_gen/inpaint.py art/prompts/touchups/jimothy-notail.json

The recipe file:
    { "src": "art/raw/area1/jimothy-photo.png", "out": "art/raw/area1/_candidates/jimothy-notail",
      "scale": 0.85, "offset": [77, 60], "seeds": [1, 2, 3],
      "prefill": [ { "fill": "#8a8a8a", "within": [["ellipse", ...]], "clip": [["rect", ...]] } ],
      "passes": [ { "prompt": "...", "mask": [["ellipse", x0, y0, x1, y1], ["rect", ...]],
                    "strength": 1.0, "blur": 12 } ] }
Mask shapes are in canvas pixels. Candidates go to <out>/<seed>-<recipe hash>.png.
"""
import hashlib
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")  # CPU only: never the display GPU
os.environ.setdefault("HIP_VISIBLE_DEVICES", "")
sys.path.insert(0, str(Path(__file__).parent))
import generate  # noqa: E402

SIZE = 512


def canvas(recipe):
    from PIL import Image
    src = Image.open(generate.ROOT / recipe["src"]).convert("RGB")
    k = recipe.get("scale", 1.0)
    src = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    out = Image.new("RGB", (SIZE, SIZE), "white")
    out.paste(src, tuple(recipe.get("offset", [0, 0])))
    # Rough paint-over before inpainting: a flat shape gives the model the silhouette to keep,
    # so a moderate strength only adds texture instead of inventing new parts (like a tail).
    # "clip" limits the fill to where it overlaps those shapes too.
    from PIL import ImageChops
    for pf in recipe.get("prefill", []):
        region = mask(pf["within"], 0)
        if "clip" in pf:
            region = ImageChops.multiply(region, mask(pf["clip"], 0))
        out.paste(Image.new("RGB", (SIZE, SIZE), pf["fill"]), (0, 0), region)
    return out


def mask(shapes, blur):
    from PIL import Image, ImageDraw, ImageFilter
    m = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(m)
    for kind, *box in shapes:
        (d.ellipse if kind == "ellipse" else d.rectangle)(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def main():
    import torch
    from diffusers import AutoPipelineForInpainting

    recipe_path = Path(sys.argv[1])
    recipe = json.loads(recipe_path.read_text())
    style = json.loads((generate.PROMPTS / "area1.json").read_text())["style"]
    h = hashlib.sha1(json.dumps(recipe, sort_keys=True).encode()).hexdigest()[:8]
    out = generate.ROOT / recipe["out"]
    out.mkdir(parents=True, exist_ok=True)
    seeds = [s for s in recipe["seeds"] if not (out / f"{s}-{h}.png").exists()]
    print(f"{len(seeds)} touch-ups to do", flush=True)
    if not seeds:
        return
    pipe, embeds = generate.load_pipe(8, [])
    pipe.set_ip_adapter_scale(0.0)
    inpaint = AutoPipelineForInpainting.from_pipe(pipe)
    base = canvas(recipe)
    base.save(out / f"_base-{h}.png")
    for seed in seeds:
        t = time.time()
        img = base
        for i, p in enumerate(recipe["passes"]):
            strength = p.get("strength", 1.0)
            img = inpaint(prompt=f"{style}, {p['prompt']}", image=img, mask_image=mask(p["mask"], p.get("blur", 12)),
                          strength=strength, num_inference_steps=max(4, round(4 / strength)), guidance_scale=0.0,
                          ip_adapter_image_embeds=embeds[None],
                          generator=torch.Generator("cpu").manual_seed(seed + 1000 * i)).images[0]
        img.save(out / f"{seed}-{h}.png")
        (out / f"{seed}-{h}.json").write_text(json.dumps({"recipe": str(recipe_path), **recipe, "seed": seed}) + "\n")
        print(f"{seed} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main()
