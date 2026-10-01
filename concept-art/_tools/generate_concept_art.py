#!/usr/bin/env python
"""Generate concept art for Jimothy Crickets with a local diffusion model.

This is *concept art* - mood and artistic inspiration for the project - not
in-game assets. So it favours painterly, evocative renderings over clean vector
shapes, and it sweeps a matrix of subjects x art directions.

Hardware: runs on CPU (i9-9900K, 16 threads) BY DEFAULT.

The machine has an AMD Radeon Pro Vega 48 and the ROCm 6.3 PyTorch build in
~/venv does drive it - gfx900 kernels execute despite ROCm 6.x having dropped
official support. It is roughly 15x faster. It is also the DISPLAY adapter, and
running SDXL on it corrupted the desktop graphics badly enough to require a hard
reboot (and had already thrown a "HW Exception ... GPU Hang" abort). So the GPU
is opt-in behind --gpu and should be considered unsafe on this box.

Usage:
    python generate_concept_art.py --benchmark          # time one image
    python generate_concept_art.py --limit 4            # smoke test
    python generate_concept_art.py                      # full 100-image sweep
"""
import argparse
import json
import os
import time

os.environ.setdefault("PYTORCH_HIP_ALLOC_CONF", "expandable_segments:True")
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "generated"

# --------------------------------------------------------------- the character
# Short spine syndrome gives Jimothy a spherical body, no neck, a short stub of
# a tail and short stubby legs. SDXL has never heard of him.
#
# The hard problem is the tail. In SDXL "raccoon" is a bundle: bandit mask AND
# long ringed tail, and text cannot separate them. Things that did NOT work
# (~40 probe images):
#   - "tiny stubby bobtail" / "completely tailless" / "no tail visible at all"
#     -> naming the tail at all summons a full ringed one
#   - omitting any mention of a tail -> still a ringed tail
#   - negative prompts at guidance 1.5 / 2.5 -> no effect on the tail
#   - guidance 4.0-6.0 -> tail survives AND the turbo distillation breaks down
#     into colour artefacts
#   - front-on / sitting framings to hide it -> tail curls around into view
#   - swapping the body noun to guinea pig / wombat / bear -> tail goes, but so
#     does the bandit mask, and he stops reading as a raccoon at all
#
# Two changes together fix it:
#
# 1. TANUKI (Japanese raccoon dog) instead of raccoon. Canonically round,
#    canonically masked, canonically short-tailed - the silhouette we want is
#    already inside the concept instead of being fought for.
# 2. "tailless" INSIDE THE NOUN PHRASE, plus a positive description of the rear
#    ("smooth rounded rear end"). Trailing modifiers like "..., short stubby
#    tail" were being read as an extra appendage to add - that is what produced
#    the two-tailed images. Attach the property to the noun, and describe what
#    IS there rather than what is not.
#
# Also avoid concrete object nouns as shape metaphors: "beach-ball body" made
# SDXL draw literal beach balls next to him.
JIMOTHY = ("a very round chubby tanuki, tiny stump tail, dark grey and black fur, hunched arched back, black bandit mask, tiny short legs, cute")

# Subjects that get the reference photo. Crickets and empty-alley plates must
# NOT - the reference is a raccoon and contaminates them.
REF_SUBJECTS = {"hero-portrait", "hero-alley", "guarding-trash", "tower-build",
                "defender", "key-art"}

# Crickets must read happy, round and kid-friendly. Iterations:
#   1. "cute cartoon green cricket insect, chunky and rounded" -> spiky legs,
#      bulging eyes, gaping mouths. Scary.
#   2. "plump ball-shaped, kawaii mascot" -> overcorrected into generic green
#      blobs with manic open mouths; lost the insect entirely.
#   3. "large kind eyes, small smile" -> better, but big shiny eyes still read
#      as bug-eyed and some mouths came out open and manic.
#   4. below. The levers that actually make them safe are LITTLE BLACK DOT EYES
#      (big glossy eyes are what tip into uncanny), an explicitly CLOSED mouth,
#      and stubby rounded legs. "harmless" pulls its weight too.
# Deliberately no material words ("plush", "fabric", "stitched") even though
# they test well - they would fight the per-image art direction.
CRICKET = ("a sweet round cartoon cricket, soft rounded green body, little black "
           "dot eyes, small gentle closed-mouth smile, floppy curved antennae, "
           "short stubby rounded legs, harmless and cuddly")

SUBJECTS = [
    ("hero-portrait",
     f"{JIMOTHY}, standing proudly in profile side view, character concept art"),
    ("hero-alley",
     f"{JIMOTHY}, standing in a rainy Seattle back alley at dusk, puddles, warm light"),
    ("guarding-trash",
     f"{JIMOTHY}, sitting on top of a big pile of black garbage bags, guarding it"),
    ("cricket-march",
     f"a marching line of {CRICKET}, advancing along an alley path toward the viewer"),
    # "boss monster towering over" produced gaping mouths and menacing hunches.
    # Scale it up as a gentle giant instead of a monster.
    ("cricket-boss",
     f"a giant gentle {CRICKET}, big and soft and smiling warmly, sitting "
     f"peacefully next to tiny trash cans that show how large it is"),
    ("alley-empty",
     "a cozy rainy Seattle back alley, dumpsters, fire escapes, string lights, "
     "puddles reflecting neon, no characters, environment concept art"),
    ("tower-build",
     f"{JIMOTHY} wearing a tiny yellow hard hat, building a defense tower out of "
     f"stacked trash cans and cardboard"),
    ("trash-fortress",
     "a whimsical fortress built out of garbage cans, cardboard boxes and pizza "
     "boxes in an alley, cute game environment concept art"),
    # This slot was originally a Jimothy-vs-crickets standoff. SDXL-Turbo at 4
    # steps cannot compose two different character types in one frame - three
    # attempts all failed:
    #   1. "{JIMOTHY} facing a swarm of {CRICKET}" -> the shared "green, chunky
    #      and rounded" wording fused them into green raccoon-cricket hybrids
    #   2. "wide shot, far left / far right" -> no fusion, but both subjects
    #      shrank to distant specks and it duplicated the alley-empty plates
    #   3. "...while three big green grasshoppers hop toward him" -> the word
    #      "green" bled onto the raccoon again, worse than (2)
    # Each subject renders cleanly on its own, so this is now a single-subject
    # heroic plate; pair it with the cricket-march plates by hand instead.
    ("defender",
     f"{JIMOTHY} standing heroically on top of a mountain of garbage bags and "
     f"trash cans, chest out, defending his hoard, dramatic low angle, evening"),
    ("key-art",
     f"video game key art poster, {JIMOTHY} as the hero in the centre, cheerful "
     f"round smiling crickets around him, a glowing pile of treasure-like "
     f"garbage behind him, dynamic and joyful"),
]

STYLES = [
    ("watercolour", "children's book watercolour illustration, soft pastel colours, "
                    "gentle linework, warm and inviting"),
    ("gouache", "gouache painting, flat matte shapes, rich warm palette, "
                "visible brush texture, mid-century illustration"),
    ("painterly", "soft painterly animated film concept art, lush backgrounds, "
                  "atmospheric lighting, hand painted"),
    ("flat-vector", "bold flat vector illustration, limited palette, geometric "
                    "shapes, clean poster design"),
    ("claymation", "claymation stop motion diorama, plasticine models, tilt shift "
                   "photography, handmade texture"),
    ("felt-plush", "handmade felt and plush toy diorama, soft textiles, visible "
                   "stitching, cosy craft photography"),
    ("papercut", "layered paper cutout collage, construction paper, soft drop "
                 "shadows, tactile craft illustration"),
    ("pixel-art", "detailed 16-bit pixel art, rich dithering, retro game art"),
    ("cel-shaded", "cel shaded cartoon, thick confident outlines, bright saturated "
                   "colours, Saturday morning cartoon"),
    ("risograph", "risograph print, two spot colours, grainy paper texture, "
                  "slight misregistration, indie zine art"),
]

MODELS = {
    # (repo, needs_fp16_variant, native_size)
    "sd-turbo": ("stabilityai/sd-turbo", False, 512),
    "sdxl-turbo": ("stabilityai/sdxl-turbo", True, 512),
}


def build_jobs(limit=None):
    jobs = []
    for si, (skey, subject) in enumerate(SUBJECTS):
        for ti, (tkey, style) in enumerate(STYLES):
            jobs.append({
                "n": len(jobs) + 1,
                "name": f"{len(jobs)+1:03d}-{skey}-{tkey}",
                "subject": skey,
                "style": tkey,
                "prompt": f"{subject}, {style}",
                "seed": 1000 + si * 100 + ti,
            })
    return jobs[:limit] if limit else jobs


def pick_device(use_gpu=False):
    """CPU by default. GPU is opt-in via --gpu, deliberately.

    The Vega 48 in this machine is also the DISPLAY adapter. Running SDXL on it
    corrupted the desktop graphics badly enough to require a hard reboot, and
    had already produced a "HW Exception ... GPU Hang" abort on an earlier run.
    gfx900 is not a supported ROCm target, so this is not going to get better.
    CPU is ~15x slower but does not take the desktop down with it.
    """
    import torch
    if use_gpu and torch.cuda.is_available():
        return "cuda", torch.float16      # gfx900 has native fp16
    return "cpu", torch.float32           # CPU fp16 is emulated and slower


def load_pipe(model_key, device, dtype, threads, offload=False, ref=None,
              ref_scale=0.5):
    import torch
    from diffusers import AutoPipelineForText2Image

    torch.set_num_threads(threads)
    repo, fp16_variant, _ = MODELS[model_key]

    kw = {"torch_dtype": dtype}
    if fp16_variant:
        # only the fp16 weight files are cached for sdxl-turbo
        kw["variant"] = "fp16"
    pipe = AutoPipelineForText2Image.from_pretrained(repo, **kw)

    if ref:
        # IP-Adapter conditions on a reference photo alongside the text prompt.
        # Needed because text alone cannot express Jimothy's stump tail - every
        # phrasing tried produces either a full ringed tail or none at all.
        # ref_scale trades likeness against art-direction freedom: too high and
        # every style collapses toward the photo.
        # Use the plain sdxl adapter, NOT the _vit-h one: diffusers pairs
        # subfolder="sdxl_models" with that folder's ViT-bigG image encoder
        # (1280-dim), and the vit-h adapter expects 1024 -> shape mismatch.
        pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models",
                             weight_name="ip-adapter_sdxl.safetensors")
        pipe.set_ip_adapter_scale(ref_scale)

    if hasattr(pipe, "safety_checker"):
        pipe.safety_checker = None          # concept art, no NSFW filtering stalls
    pipe.set_progress_bar_config(disable=True)

    if device == "cuda":
        # NOTE: enable_attention_slicing() replaces the UNet attention
        # processors and silently clobbers the ones IP-Adapter installs, which
        # then crashes with "'tuple' object has no attribute 'shape'". Skip it
        # whenever a reference image is in play.
        if not ref:
            pipe.enable_attention_slicing()
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()
        if offload:
            # SDXL-Turbo fp16 is ~7 GB and will not fit resident in 8 GB VRAM
            # alongside activations; stream components in as needed instead.
            pipe.enable_model_cpu_offload()
        else:
            pipe = pipe.to(device)
    else:
        pipe = pipe.to(device)
    return pipe


def precompute_ref_embeds(pipe, ref_img, device):
    """Encode the reference once, then drop the image encoder.

    The CLIP ViT-bigG image encoder is ~2.5 GB. Keeping it resident alongside
    SDXL on an 8 GB card hung the GPU outright ("HW Exception ... GPU Hang").
    The embedding is identical for every image, so compute it once and free the
    encoder before the run starts.
    """
    import torch, gc
    with torch.no_grad():
        embeds = pipe.prepare_ip_adapter_image_embeds(
            ip_adapter_image=ref_img, ip_adapter_image_embeds=None,
            device=device, num_images_per_prompt=1,
            do_classifier_free_guidance=False)
    pipe.image_encoder = None
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    return [e.to(device) for e in embeds]


def generate(pipe, job, steps, size, device, seed_offset=0, ref_embeds=None):
    import torch
    g = torch.Generator(device=device).manual_seed(job["seed"] + seed_offset)
    kw = dict(prompt=job["prompt"], num_inference_steps=steps,
              guidance_scale=0.0, height=size, width=size, generator=g)
    if ref_embeds is not None:
        kw["ip_adapter_image_embeds"] = ref_embeds
    # turbo models are distilled for guidance-free sampling
    return pipe(**kw).images[0]


def contact_sheet(records):
    cards = "".join(
        f'<figure><img src="{r["file"]}" alt="{r["name"]}" loading="lazy">'
        f'<figcaption><b>{r["subject"]}</b> &middot; {r["style"]}<br>'
        f'<span>{r["name"]}</span></figcaption></figure>' for r in records)
    css = """
    body{margin:0;background:#15141a;color:#e8e6ef;font-family:-apple-system,
         BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    header{padding:34px 40px 10px}h1{margin:0;font-size:28px}
    header p{color:#9b98a8;max-width:720px;line-height:1.55}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));
          gap:16px;padding:24px 40px 60px}
    figure{margin:0;background:#211e2a;border:1px solid #322e3c;border-radius:10px;
           padding:8px}
    figure img{width:100%;display:block;border-radius:6px}
    figcaption{font-size:11.5px;color:#b9b6c4;margin-top:7px;line-height:1.45}
    figcaption span{font-family:ui-monospace,Menlo,monospace;color:#6e6b7b}
    """
    html = (f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
            f"<title>Jimothy Crickets - Generated Concept Art</title>"
            f"<style>{css}</style></head><body><header>"
            f"<h1>Jimothy Crickets &mdash; Generated Concept Art</h1>"
            f"<p>{len(records)} images: {len(SUBJECTS)} subjects &times; "
            f"{len(STYLES)} art directions, generated locally on CPU. "
            f"Mood and inspiration, not final assets.</p></header>"
            f"<div class='grid'>{cards}</div></body></html>")
    (OUT / "index.html").write_text(html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="sdxl-turbo", choices=list(MODELS))
    ap.add_argument("--steps", type=int, default=4)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--threads", type=int, default=16)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--benchmark", action="store_true")
    ap.add_argument("--gpu", action="store_true",
                    help="opt in to the GPU. NOT RECOMMENDED on this machine: "
                         "the Vega 48 is the display adapter and SDXL work on "
                         "it has corrupted the desktop and hung the GPU.")
    ap.add_argument("--offload", action="store_true",
                    help="stream model parts to GPU on demand (needed for SDXL on 8GB)")
    ap.add_argument("--resume", action="store_true",
                    help="skip jobs whose output file already exists")
    ap.add_argument("--only", default=None,
                    help="comma-separated subject keys to generate")
    ap.add_argument("--ref", default=None,
                    help="reference photo for IP-Adapter conditioning")
    ap.add_argument("--ref-scale", type=float, default=0.5,
                    help="0=ignore reference, 1=dominate it (0.4-0.6 is usable)")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    device, dtype = pick_device(args.gpu)
    # SDXL-Turbo fp16 is ~7 GB and OOMs resident on this 8 GB card, so offload
    # unless explicitly told otherwise. Costs ~2s/image, avoids a hard failure.
    offload = args.offload or (device == "cuda" and args.model == "sdxl-turbo")
    print(f"[setup] model={args.model} device={device} dtype={dtype} "
          f"steps={args.steps} size={args.size} offload={offload}", flush=True)

    ref_img = None
    if args.ref:
        from PIL import Image
        ref_img = Image.open(args.ref).convert("RGB")
        print(f"[setup] reference={args.ref} scale={args.ref_scale}", flush=True)

    t0 = time.time()
    pipe = load_pipe(args.model, device, dtype, args.threads, offload,
                     args.ref, args.ref_scale)
    print(f"[setup] pipeline loaded in {time.time()-t0:.1f}s", flush=True)

    ref_embeds = None
    if ref_img is not None:
        ref_embeds = precompute_ref_embeds(pipe, ref_img, device)
        print("[setup] reference encoded; image encoder freed", flush=True)

    jobs = build_jobs(1 if args.benchmark else args.limit)
    if args.only:
        keep = {k.strip() for k in args.only.split(",")}
        jobs = [j for j in jobs if j["subject"] in keep]
        print(f"[setup] filtered to {len(jobs)} jobs: {sorted(keep)}", flush=True)
    records, times = [], []

    for job in jobs:
        path = OUT / f"{job['name']}.png"
        if args.resume and path.exists():
            records.append({**job, "file": path.name, "secs": None})
            continue
        t = time.time()
        img = generate(pipe, job, args.steps, args.size, device,
                       ref_embeds=ref_embeds)
        img.save(path)
        dt = time.time() - t
        times.append(dt)
        records.append({**job, "file": path.name, "secs": round(dt, 1)})
        done, total = len(times), len(jobs)
        eta = (sum(times) / done) * (total - done)
        print(f"[{job['n']:3d}/{len(jobs)}] {job['name']:<34} {dt:6.1f}s "
              f"eta {eta/60:5.1f}m", flush=True)

    if args.benchmark:
        print(f"\nBENCHMARK {args.model}: {times[0]:.1f}s for one "
              f"{args.size}x{args.size} image at {args.steps} steps")
        return

    # Always rebuild the manifest and contact sheet from every job whose image
    # exists on disk - not just the ones this invocation produced. Otherwise a
    # filtered run (--only) silently truncates them to its own subset.
    by_name = {r["name"]: r for r in records}
    full = []
    for job in build_jobs():
        path = OUT / f"{job['name']}.png"
        if not path.exists():
            continue
        prev = by_name.get(job["name"])
        full.append(prev or {**job, "file": path.name, "secs": None})
    (OUT / "manifest.json").write_text(json.dumps(full, indent=2))
    contact_sheet(full)
    if times:
        print(f"\nDone: {len(times)} images in {sum(times)/60:.1f} min "
              f"(avg {sum(times)/len(times):.1f}s)")
    print(f"Contact sheet: {OUT/'index.html'}")


if __name__ == "__main__":
    main()
