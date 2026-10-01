#!/usr/bin/env python
"""Refine the hand-picked plates so Jimothy matches the reference photo.

Only the plates that actually show him. Each pick keeps its original subject
framing, art style and seed family, so the composition that got picked survives;
what changes is the anatomy wording and how hard the reference photo is pushed.

Targets, straight off the photo:
  - charcoal GREY and black, no warm brown anywhere
  - short spine syndrome proportions: compressed body, strongly arched back,
    no neck, head carried low
  - a NUB of a tail - not a full ringed tail, not bald either

Run:  ~/venv/bin/python refine_picks.py            # all picks
      ~/venv/bin/python refine_picks.py --pick 082 # just one
"""
import argparse
import json
import os
import time

os.environ.setdefault("PYTORCH_HIP_ALLOC_CONF", "expandable_segments:True")
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "refined"
REF = ROOT / "reference" / "jimothy-rear.jpg"

# Anatomy wording pushed harder than the main sweep. Kept short on purpose:
# CLIP truncates at 77 tokens and the style string is appended after this.
JIM = ("a very round chubby tanuki, charcoal grey and black fur, silver grey "
       "guard hairs, strongly arched hunched back, no neck, head held low, "
       "tiny stump tail, short legs")

STYLES = {
    "watercolour": "children's book watercolour illustration, soft colours, "
                   "gentle linework",
    "flat-vector": "bold flat vector illustration, limited palette, geometric "
                   "shapes, clean poster design",
    "gouache": "gouache painting, flat matte shapes, visible brush texture, "
               "mid-century illustration",
    "cel-shaded": "cel shaded cartoon, thick confident outlines, bright "
                  "saturated colours",
}

# name -> (subject framing, style key, original seed from the main sweep)
PICKS = {
    "001-hero-portrait-watercolour": (
        "standing proudly in profile side view, character concept art",
        "watercolour", 1000),
    "004-hero-portrait-flat-vector": (
        "standing proudly in profile side view, character concept art",
        "flat-vector", 1003),
    "082-defender-gouache": (
        "standing heroically on top of a mountain of garbage bags and trash "
        "cans, defending his hoard, evening", "gouache", 1801),
    "089-defender-cel-shaded": (
        "standing heroically on top of a mountain of garbage bags and trash "
        "cans, defending his hoard, evening", "cel-shaded", 1808),
}

# Reference pressure. Higher = closer to the photo's anatomy and palette, but
# the art direction starts collapsing toward the photo's realism past ~0.5.
SCALES = (0.35, 0.50, 0.65)
SEED_OFFSETS = (0, 1, 2)


def build(pipe, ref_embeds_for, device, only=None):
    import torch
    records = []
    for name, (framing, style_key, seed) in PICKS.items():
        if only and not name.startswith(only):
            continue
        d = OUT / name
        d.mkdir(parents=True, exist_ok=True)
        prompt = f"{JIM}, {framing}, {STYLES[style_key]}"
        for scale in SCALES:
            embeds = ref_embeds_for(scale)
            for off in SEED_OFFSETS:
                tag = f"s{scale:.2f}_seed{seed+off}"
                path = d / f"{tag}.png"
                if path.exists():
                    records.append({"pick": name, "file": str(path.relative_to(OUT)),
                                    "scale": scale, "seed": seed + off})
                    continue
                t = time.time()
                img = pipe(prompt=prompt, num_inference_steps=4, guidance_scale=0.0,
                           height=512, width=512,
                           ip_adapter_image_embeds=embeds,
                           generator=torch.Generator(device=device).manual_seed(seed + off)
                           ).images[0]
                img.save(path)
                records.append({"pick": name, "file": str(path.relative_to(OUT)),
                                "scale": scale, "seed": seed + off})
                print(f"  {name} {tag}  {time.time()-t:.1f}s", flush=True)
    return records


def sheet(records):
    """One row per pick: the original on the left, then every variant."""
    by_pick = {}
    for r in records:
        by_pick.setdefault(r["pick"], []).append(r)
    blocks = []
    for pick, rs in by_pick.items():
        cards = "".join(
            f'<figure><img src="{r["file"]}"><figcaption>scale {r["scale"]}<br>'
            f'seed {r["seed"]}</figcaption></figure>' for r in rs)
        blocks.append(
            f'<section><h2>{pick}</h2><div class="grid">'
            f'<figure class="orig"><img src="../generated/{pick}.png">'
            f'<figcaption><b>ORIGINAL</b></figcaption></figure>{cards}</div></section>')
    css = """
    body{margin:0;background:#15141a;color:#e8e6ef;font-family:-apple-system,
         BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    header{padding:30px 36px 4px}h1{margin:0;font-size:26px}
    header p{color:#9b98a8;max-width:760px;line-height:1.55}
    section{padding:18px 36px}h2{font-size:16px;margin:0 0 10px;
      font-family:ui-monospace,Menlo,monospace;color:#f2994a}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
    figure{margin:0;background:#211e2a;border:1px solid #322e3c;border-radius:9px;padding:7px}
    figure.orig{border-color:#f2994a}
    figure img{width:100%;display:block;border-radius:5px}
    figcaption{font-size:11px;color:#b9b6c4;margin-top:6px;line-height:1.4}
    """
    html = (f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
            f"<title>Jimothy - refined picks</title><style>{css}</style></head><body>"
            f"<header><h1>Refined picks</h1><p>Each row: the picked original "
            f"(orange border) then variants sweeping IP-Adapter reference scale "
            f"and seed. Higher scale = closer to the photo's grey/black colouring "
            f"and short-spine proportions, but the art style softens toward "
            f"realism.</p></header>{''.join(blocks)}</body></html>")
    (OUT / "index.html").write_text(html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", default=None, help="only picks starting with this")
    ap.add_argument("--gpu", action="store_true", help="unsafe on this box; see README")
    ap.add_argument("--scales", default=None,
                    help="comma-separated reference scales, e.g. 0.42")
    ap.add_argument("--seeds", type=int, default=None,
                    help="how many seed offsets to try per scale")
    args = ap.parse_args()

    global SCALES, SEED_OFFSETS
    if args.scales:
        SCALES = tuple(float(x) for x in args.scales.split(","))
    if args.seeds:
        SEED_OFFSETS = tuple(range(args.seeds))

    import torch
    from diffusers import AutoPipelineForText2Image
    from PIL import Image

    device = "cuda" if (args.gpu and torch.cuda.is_available()) else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    torch.set_num_threads(16)
    print(f"[setup] device={device}", flush=True)

    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo", torch_dtype=dtype, variant="fp16")
    pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models",
                         weight_name="ip-adapter_sdxl.safetensors")
    pipe.set_progress_bar_config(disable=True)
    pipe.vae.enable_slicing()   # NOT attention slicing - it clobbers IP-Adapter
    if device == "cuda":
        pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to(device)

    ref = Image.open(REF).convert("RGB")
    with torch.no_grad():
        base = pipe.prepare_ip_adapter_image_embeds(
            ip_adapter_image=ref, ip_adapter_image_embeds=None, device=device,
            num_images_per_prompt=1, do_classifier_free_guidance=False)
    pipe.image_encoder = None      # 2.5 GB encoder no longer needed
    base = [e.to(device) for e in base]
    print("[setup] reference encoded; image encoder freed", flush=True)

    def ref_embeds_for(scale):
        pipe.set_ip_adapter_scale(scale)
        return base

    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    records = build(pipe, ref_embeds_for, device, args.pick)
    (OUT / "manifest.json").write_text(json.dumps(records, indent=2))
    sheet(records)
    print(f"\nDone: {len(records)} variants in {(time.time()-t0)/60:.1f} min")
    print(f"Sheet: {OUT/'index.html'}")


if __name__ == "__main__":
    main()
