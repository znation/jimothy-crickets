#!/usr/bin/env python
"""Generate production art candidates with SDXL-Turbo (plan §8.4).

Generalized from concept-art/_tools/generate_sdxl.py. Prompt sets are data:
art/prompts/<set>.json lists assets, each with a prompt, a seed base, a size, and
optionally a reference image for IP-Adapter (the character anchor).

Workflow: candidates, then picks.
  1. Render: every asset gets N seeds, saved as
     art/raw/<set>/_candidates/<asset>/<seed>-<prompt hash>.png. The hash means an
     edited prompt never mixes with old renders.
  2. Review the contact sheets (--sheets), then record one seed per asset in
     art/raw/<set>/picks.json.
  3. Assemble (--assemble): copies each pick to art/raw/<set>/<asset>.png and writes
     manifest.json with the exact prompt, seed, size and reference settings.
  Then tools/asset_gen/matte.py cuts sprites out into art/curated/<set>/.

Hardware rules (plan §8.4): CPU only, never the display GPU; idle priority; ~25 s
per 512² image. ~/venv's transformers needs the project-only overlay:
    export PYTHONPATH=~/.cache/jimothy-sdxl-pylibs
    chrt --idle 0 ionice -c 3 ~/venv/bin/python -u tools/asset_gen/generate.py area1 --seeds 4
    ~/venv/bin/python tools/asset_gen/generate.py area1 --sheets
    ~/venv/bin/python tools/asset_gen/generate.py area1 --assemble
"""
import argparse
import hashlib
import json
import math
import os
import shutil
import time
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")  # belt and braces: never touch the GPU
os.environ.setdefault("HIP_VISIBLE_DEVICES", "")

ROOT = Path(__file__).resolve().parents[2]
PROMPTS = ROOT / "art" / "prompts"
RAW = ROOT / "art" / "raw"
MAX_TOKENS = 77


def load_set(name):
    data = json.loads((PROMPTS / f"{name}.json").read_text())
    style = data["style"]
    out = []
    for a in data["assets"]:
        kind = a.get("kind", "sprite")
        # Words early in a CLIP prompt carry the most weight: style, then framing, then subject.
        # "framings" are named prefix/suffix versions, so a pick from an earlier pass stays
        # reproducible (and assemblable) after the default framing changes.
        framing = data["framings"][a.get("framing", data["default_framing"])]
        head = framing.get("prefix", {}).get(kind, "")
        tail = framing.get("suffix", {}).get(kind, "")
        prompt = ", ".join(x for x in [style, head, a["prompt"], tail] if x)
        ref = a.get("ref")
        scale = a.get("ref_scale", 0.0) if ref else 0.0
        size = a.get("size", [512, 512])
        # img2img: start from an image (e.g. the game's own procedural scenery) instead of noise.
        init = a.get("init")
        strength = a.get("strength") if init else None
        key = [prompt, ref, scale, size] + ([init, strength] if init else [])
        h = hashlib.sha1(json.dumps(key).encode()).hexdigest()[:8]
        out.append({**a, "kind": kind, "full_prompt": prompt, "ref": ref, "ref_scale": scale,
                    "size": size, "init": init, "strength": strength, "hash": h})
    return data, out


def check_tokens(assets):
    from transformers import CLIPTokenizer
    tok = CLIPTokenizer.from_pretrained("stabilityai/sdxl-turbo", subfolder="tokenizer")
    bad = [(a["name"], n) for a in assets
           if (n := len(tok(a["full_prompt"]).input_ids)) > MAX_TOKENS]
    if bad:
        raise SystemExit(f"prompts over {MAX_TOKENS} CLIP tokens (the rest would be silently dropped): {bad}")


def cand_dir(set_name, a):
    return RAW / set_name / "_candidates" / a["name"]


def cand_path(set_name, a, seed):
    return cand_dir(set_name, a) / f"{seed}-{a['hash']}.png"


def load_pipe(threads, refs):
    import torch
    from diffusers import AutoPipelineForText2Image
    from PIL import Image

    torch.set_num_threads(threads)
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo", torch_dtype=torch.float32, variant="fp16")
    pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models",
                         weight_name="ip-adapter_sdxl.safetensors")
    pipe.set_progress_bar_config(disable=True)
    pipe = pipe.to("cpu")
    # Encode every reference once, then drop the image encoder. The first entry is a blank
    # reference used at scale 0 for assets without an anchor.
    embeds = {}
    with torch.no_grad():
        for ref in [None, *refs]:
            img = Image.new("RGB", (224, 224), "white") if ref is None else Image.open(ROOT / ref).convert("RGB")
            embeds[ref] = pipe.prepare_ip_adapter_image_embeds(
                ip_adapter_image=img, ip_adapter_image_embeds=None, device="cpu",
                num_images_per_prompt=1, do_classifier_free_guidance=False)
    pipe.image_encoder = None
    return pipe, embeds


_img2img = None


def render(pipe, embeds, a, seed):
    import torch
    pipe.set_ip_adapter_scale(a["ref_scale"])
    w, h = a["size"]
    gen = torch.Generator("cpu").manual_seed(seed)
    if a["init"]:
        global _img2img
        from diffusers import AutoPipelineForImage2Image
        from PIL import Image
        _img2img = _img2img or AutoPipelineForImage2Image.from_pipe(pipe)
        init = Image.open(ROOT / a["init"]).convert("RGB").resize((w, h))
        # Turbo runs int(steps × strength) denoising steps: aim for four whatever the strength
        # (with a fixed 4 steps, 0.5 and 0.65 both ran two and barely changed the image).
        steps = math.ceil(4 / a["strength"])
        return _img2img(prompt=a["full_prompt"], image=init, strength=a["strength"],
                        num_inference_steps=steps, guidance_scale=0.0,
                        ip_adapter_image_embeds=embeds[a["ref"]], generator=gen).images[0]
    return pipe(prompt=a["full_prompt"], num_inference_steps=4, guidance_scale=0.0,
                width=w, height=h, ip_adapter_image_embeds=embeds[a["ref"]], generator=gen).images[0]


def seeds_for(a, k):
    return [a["seed"] + 1000 * i for i in range(k)]


def sheets(set_name, assets):
    """One contact sheet per asset: every current candidate, labelled with its seed."""
    from PIL import Image, ImageDraw
    out = RAW / set_name / "_sheets"
    out.mkdir(parents=True, exist_ok=True)
    for a in assets:
        files = sorted(cand_dir(set_name, a).glob(f"*-{a['hash']}.png"), key=lambda p: int(p.name.split("-")[0]))
        if not files:
            continue
        thumbs = [Image.open(f).convert("RGB") for f in files]
        tw = 256
        th = round(tw * thumbs[0].height / thumbs[0].width)
        cols = min(4, len(thumbs))
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * (th + 18)), "white")
        d = ImageDraw.Draw(sheet)
        for i, (f, t) in enumerate(zip(files, thumbs)):
            x, y = (i % cols) * tw, (i // cols) * (th + 18)
            sheet.paste(t.resize((tw, th)), (x, y + 18))
            d.text((x + 4, y + 3), f.name.split("-")[0], fill="black")
        sheet.save(out / f"{a['name']}.png")
    print(f"sheets in {out}")


def assemble(set_name, assets):
    picks = json.loads((RAW / set_name / "picks.json").read_text())
    manifest = {}
    for a in assets:
        seed = picks.get(a["name"])
        if seed is None:
            print(f"no pick yet: {a['name']}")
            continue
        src = cand_path(set_name, a, seed)
        if not src.exists():
            raise SystemExit(f"{a['name']}: picked seed {seed} has no render for the current prompt")
        shutil.copy(src, RAW / set_name / f"{a['name']}.png")
        manifest[a["name"]] = {k: a[k] for k in ("kind", "full_prompt", "ref", "ref_scale", "size", "init", "strength")} | {
            "seed": seed, "model": "stabilityai/sdxl-turbo", "steps": 4, "guidance": 0.0}
    (RAW / set_name / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"assembled {len(manifest)} assets")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set")
    ap.add_argument("--seeds", type=int, default=4)
    ap.add_argument("--only", nargs="*", help="asset names")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--sheets", action="store_true")
    ap.add_argument("--assemble", action="store_true")
    args = ap.parse_args()

    _, assets = load_set(args.set)
    if args.only:
        assets = [a for a in assets if a["name"] in args.only]
    if args.sheets:
        return sheets(args.set, assets)
    if args.assemble:
        return assemble(args.set, assets)

    check_tokens(assets)
    todo = [(a, s) for a in assets for s in seeds_for(a, a.get("seeds", args.seeds))
            if not cand_path(args.set, a, s).exists()]
    print(f"{len(todo)} renders to do", flush=True)
    if not todo:
        return
    pipe, embeds = load_pipe(args.threads, sorted({a["ref"] for a, _ in todo if a["ref"]}))
    for a, seed in todo:
        t = time.time()
        path = cand_path(args.set, a, seed)
        path.parent.mkdir(parents=True, exist_ok=True)
        render(pipe, embeds, a, seed).save(path)
        # Record exactly what made this render, next to it.
        path.with_suffix(".json").write_text(json.dumps(
            {k: a[k] for k in ("full_prompt", "ref", "ref_scale", "size", "init", "strength")} | {"seed": seed}) + "\n")
        print(f"{a['name']} {seed} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main()
