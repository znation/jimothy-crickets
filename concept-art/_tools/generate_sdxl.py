#!/usr/bin/env python
"""Regenerate the concept-art matrix (11 subjects x 10 styles) with SDXL-Turbo.

This replaces the Qwen-Image-2.1 set in ../qwen/. Qwen-Image-2.1 is under the
Qwen Research License, whose "Non-Commercial" grant means "for research or
evaluation purposes only", which does not cover art shipped in a released game,
even a free one. SDXL-Turbo's license (sai-nc-community) explicitly allows
non-commercial hobbyist use and gives us ownership of the outputs.

Same subjects, plate names and base seeds as the Qwen set, so the two compare
one-to-one. The prompts are the Qwen ones compressed for CLIP: both SDXL text
encoders truncate at 77 tokens, so the long language-model descriptions had to
become keyword phrases. What carries over from the earlier SDXL work
(generate_concept_art.py, refine_picks.py, ../README.md) is the set of tricks
that actually move SDXL: "tanuki" instead of "raccoon", the stump tail inside
the noun phrase, IP-Adapter on the rear-view photo, dot-eyed closed-mouth
crickets.

Workflow: candidates, then picks.
  1. Render candidates: every plate gets K seeds, saved under
     ../sdxl/_candidates/<plate>/<seed>-<prompt hash>.png. The hash means that
     editing a prompt never mixes old and new renders.
  2. Review, then record the chosen seed per plate in ../sdxl/picks.json.
  3. Assemble: the picked candidate is copied to ../sdxl/<plate>.png and
     manifest.json records its exact prompt, seed and reference scale.

Runs on CPU (the Vega 48 is the display adapter; SDXL on it has hung the GPU
and corrupted the desktop; see ../README.md), about 25 s per image, 2 min per
composite plate. Launch at idle priority. ~/venv's transformers needs
huggingface_hub<2, which ~/venv no longer has, so a project-only copy is put
first on the path (pip install --target ~/.cache/jimothy-sdxl-pylibs
'huggingface_hub>=1.5,<2'):
    export PYTHONPATH=~/.cache/jimothy-sdxl-pylibs
    chrt --idle 0 ionice -c 3 ~/venv/bin/python -u generate_sdxl.py --seeds 4
    ~/venv/bin/python generate_sdxl.py --assemble
"""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sdxl"
CAND = OUT / "_candidates"
PICKS = OUT / "picks.json"
REF = ROOT / "reference" / "jimothy-rear.jpg"

# Short spine syndrome, compressed for CLIP. "tanuki" carries the round, masked,
# short-tailed silhouette; the colour words keep tanuki brown out of it.
# Pass 1 ("a very round chubby tanuki, ..., tiny stump tail, ...") still drew a
# long ringed tail on ~40% of plates, plus extra baby raccoons on some. A/B on 9
# of those plates at the same seeds: rewording the tail barely moves a fixed
# seed; raising the reference from 0.35 to 0.5 removed the tail on 4 of 9 but
# started washing out the styles (cel-shaded lost its outlines). So: this
# wording ("single" stops the duplicates), the reference at 0.42, and several
# seeds per plate to pick from.
JIMOTHY = ("a single very round chubby tailless tanuki, charcoal grey and black fur, "
           "bandit mask, hunched round back, no neck, smooth round rump with a tiny "
           "stump, short stubby legs, cute")
JIM_REF = 0.42

# Pass 1 used a trimmed version and got spiky, blocky and toothy crickets (031,
# 037, 038, 040, 047, 048, 050). "soft rounded bodies" and "harmless and cuddly"
# are load-bearing; keep them. Pass 2 still drifted to orange striped bees and
# ants on some seeds, hence "bright green".
CRICKET = ("sweet round cartoon crickets, soft rounded bright green bodies, little black dot "
           "eyes, small gentle closed-mouth smiles, floppy curved antennae, short "
           "stubby rounded legs, harmless and cuddly")

# (key, subject text, IP-Adapter reference scale; 0 = no reference)
# The reference is a raccoon, so plates without Jimothy must not get it.
SUBJECTS = [
    ("hero-portrait",
     f"{JIMOTHY}, full body in profile side view, character portrait", JIM_REF),
    ("hero-alley",
     f"{JIMOTHY}, in a rainy Seattle back alley at dusk, puddles, warm light", JIM_REF),
    ("guarding-trash",
     "a round chubby grey tanuki sitting on top of a big heap of black garbage bags, "
     "guarding it", JIM_REF),
    ("cricket-march",
     f"a marching line of {CRICKET}, advancing along an alley path toward the viewer", 0.0),
    ("cricket-boss",
     "one giant gentle sweet round cartoon cricket, soft rounded bright green body, little "
     "black dot eyes, small gentle closed-mouth smile, floppy curved antennae, short "
     "stubby rounded legs, harmless and cuddly, sitting beside tiny trash cans", 0.0),
    ("alley-empty",
     "a cozy rainy Seattle back alley, dumpsters, fire escapes, string lights, puddles "
     "reflecting neon signs, no characters, environment concept art", 0.0),
    ("tower-build",
     f"{JIMOTHY}, wearing a tiny yellow hard hat, stacking trash cans into a tower",
     JIM_REF),
    ("trash-fortress",
     # "toy castle fortress built from stacked garbage cans" gave stone castles
     # (pass 2); "junk fort made of trash cans" gave junk-filled alleys with no
     # fort (pass 3). Name the castle parts AND the material of each.
     "a whimsical fortress with towers of stacked trash cans, walls of cardboard "
     "boxes and a cardboard gate, in an alley, cute video game environment concept art",
     0.0),
    ("defender",
     "a round chubby grey tanuki standing heroically on top of a mountain of black "
     "garbage bags and trash cans, evening", JIM_REF),
    ("key-art",
     "game poster, a round chubby grey tanuki in the centre, cheerful green cartoon "
     "crickets around him, glowing garbage pile behind", JIM_REF),
    ("standoff",
     "a playful face-off in an alley, a round chubby grey tanuki on the left, small "
     "round green cartoon crickets on the right", JIM_REF),
]

# Style LEADS the prompt. In the Qwen work, a style tacked on after a long
# description collapsed every plate into one illustration look; CLIP also weights
# early tokens more, so this matters at least as much here.
STYLES = [
    ("watercolour", "children's book watercolour illustration, soft pastel washes, "
                    "gentle linework, paper texture"),
    ("gouache", "gouache painting, flat matte opaque shapes, visible brush strokes, "
                "mid-century illustration"),
    ("painterly", "soft painterly animated film concept art, hand painted, atmospheric "
                  "lighting"),
    ("flat-vector", "bold flat vector illustration, solid flat colours, no gradients, "
                    "clean geometric shapes"),
    ("claymation", "claymation stop motion still, everything sculpted from plasticine, "
                   "tilt shift photo"),
    ("felt-plush", "photo of a handmade felt plush toy diorama, everything is stitched "
                   "felt"),
    ("papercut", "layered paper cutout collage, cut construction paper, soft drop "
                 "shadows"),
    ("pixel-art", "16-bit pixel art, visible square pixels, limited palette, retro game"),
    ("cel-shaded", "cel shaded cartoon, thick black outlines, flat colour fills, hard "
                   "shadows"),
    # Not blue ink: in the Qwen run, blue + pink turned Jimothy blue.
    ("risograph", "risograph print, black and fluorescent pink ink, grainy paper"),
]

# Two-character scenes. SDXL-Turbo cannot hold Jimothy and the crickets in one
# prompt: attributes bleed between them ("green" made raccoon-cricket hybrids in
# the first SDXL sweep), and the raccoon reference turns crickets into more
# raccoons (pass 1 of this set: every standoff had two raccoons, no crickets).
#
# So these plates are painted in stages: render the background, then inpaint
# each character into its own region with a prompt that describes only that
# character. Each character is drawn into the scene's lighting and style.
# (Tried first: render characters separately, cut them out and blend with one
# img2img pass. The cutouts kept ground bands and white boxes, and at a strength
# that hid the seams the blend pass repainted the crickets into leaves.)
COMPOSITES = {
    # regions: (character, x0, y0, x1, y1) as fractions of the frame
    "standoff": {
        "background": "an empty back alley with a few black garbage bags, no characters",
        "regions": [("jimothy", 0.02, 0.30, 0.56, 0.98),
                    ("crickets", 0.56, 0.52, 0.98, 0.98)],
    },
    # Pass 2 rendered these two as single prompts: the reference photo (dirt and
    # grass) replaced the garbage pile with rocks and literal mountains, and added
    # baby raccoons. Painting the pile first with no reference fixes the setting.
    "guarding-trash": {
        "background": "a big heap of black garbage bags in a back alley, no characters",
        "regions": [("jimothy", 0.22, 0.04, 0.78, 0.62)],
        "pose": {"jimothy": "sitting"},
    },
    # Pass 4: "a tall mountain of ... trash cans" painted a row of bins, and a
    # region filling the top half made Jimothy a giant bust peeking over them.
    "defender": {
        "background": "a huge heap of black garbage bags piled high into a hill, "
                      "filling the frame, in an alley at evening, no characters",
        "regions": [("jimothy", 0.31, 0.04, 0.69, 0.46)],
        "pose": {"jimothy": "standing proudly"},
    },
    "key-art": {
        "background": "a glowing pile of treasure-like garbage in an alley at dusk, "
                      "no characters, game poster",
        "regions": [("jimothy", 0.22, 0.24, 0.78, 0.96),
                    ("crickets", 0.00, 0.62, 0.30, 1.00),
                    ("crickets", 0.70, 0.62, 1.00, 1.00)],
    },
}
INPAINT = {"strength": 1.0, "crop": 24, "blur": 16, "shape": "ellipse", "jim_ref": 0.2}
CHARACTERS = {
    "jimothy": f"{JIMOTHY}, full body, side view, cute face",
    "crickets": f"three {CRICKET}",
}

# Per-plate fixes found in review passes: plate name -> dict that may set
# "subject" (replacement subject text), "extra" (appended), "ref" (scale).
TUNING = {
    # Passes 3 and 6: every papercut march seed came out as orange striped bees,
    # even with "bright green paper crickets". The papercut boss (047), a single
    # big cricket, came out fine, so: fewer, bigger crickets.
    "037-cricket-march-papercut": {"subject":
        "three big round green cartoon crickets walking in a row along an alley path, "
        "each a soft green ball with little dot eyes, a small smile and floppy antennae"},
    # Pass 3: pink ink turned them into spiky pink bugs.
    "040-cricket-march-risograph": {"subject":
        "a marching line of chubby round smiling cartoon crickets, soft ball-shaped "
        "bodies, little dot eyes, floppy antennae, stubby legs, along an alley path"},
    # Pass 3: every seed was a square robot. Make the roundness the subject.
    "048-cricket-boss-pixel-art": {"subject":
        "one giant gentle cartoon cricket with a big round ball-shaped bright green body, "
        "little dot eyes, small smile, floppy antennae, sitting beside tiny trash cans"},
}


def base_seed(si, ti):
    return 1000 + si * 100 + ti


def plates():
    out = []
    for si, (skey, subject, ref) in enumerate(SUBJECTS):
        for ti, (tkey, style) in enumerate(STYLES):
            n = si * len(STYLES) + ti + 1
            name = f"{n:03d}-{skey}-{tkey}"
            t = TUNING.get(name, {})
            text = t.get("subject", subject)
            prompt = f"{style}, {text}" + (f", {t['extra']}" if t.get("extra") else "")
            ref_scale = t.get("ref", ref)
            comp = None
            if skey in COMPOSITES:
                c = COMPOSITES[skey]
                comp = {"background": f"{style}, {c['background']}",
                        "characters": {k: f"{style}, {v}" + (f", {c['pose'][k]}" if k in c.get("pose", {}) else "")
                                       for k, v in CHARACTERS.items()},
                        "regions": c["regions"], "inpaint": INPAINT}
            sig = json.dumps([prompt, ref_scale, comp], sort_keys=True)
            key = hashlib.sha1(sig.encode()).hexdigest()[:8]
            out.append({"n": n, "name": name, "subject": skey, "style": tkey,
                        "prompt": prompt, "ref_scale": ref_scale, "composite": comp,
                        "seed": base_seed(si, ti), "hash": key})
    return out


def seeds_for(p, k):
    return [p["seed"] + 50000 * i for i in range(k)]


def cand_path(p, seed):
    return CAND / p["name"] / f"{seed}-{p['hash']}.png"


def load_pipe(threads):
    import torch
    from diffusers import AutoPipelineForText2Image
    from PIL import Image

    torch.set_num_threads(threads)
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo", torch_dtype=torch.float32, variant="fp16")
    # The plain sdxl adapter, not _vit-h (shape mismatch with this encoder).
    pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models",
                         weight_name="ip-adapter_sdxl.safetensors")
    pipe.set_progress_bar_config(disable=True)
    pipe = pipe.to("cpu")
    with torch.no_grad():
        embeds = pipe.prepare_ip_adapter_image_embeds(
            ip_adapter_image=Image.open(REF).convert("RGB"),
            ip_adapter_image_embeds=None, device="cpu",
            num_images_per_prompt=1, do_classifier_free_guidance=False)
    pipe.image_encoder = None   # encode the reference once, then drop the encoder
    return pipe, embeds


def txt2img(pipe, embeds, prompt, ref_scale, seed):
    import torch
    pipe.set_ip_adapter_scale(ref_scale)   # 0.0 disables the reference
    return pipe(prompt=prompt, num_inference_steps=4, guidance_scale=0.0,
                height=512, width=512, ip_adapter_image_embeds=embeds,
                generator=torch.Generator("cpu").manual_seed(seed)).images[0]


def render(pipe, embeds, p, seed):
    if p["composite"]:
        return composite(pipe, embeds, p, seed)
    return txt2img(pipe, embeds, p["prompt"], p["ref_scale"], seed)


_inpaint = None


def composite(pipe, embeds, p, seed):
    import torch
    from diffusers import AutoPipelineForInpainting
    from PIL import Image, ImageDraw, ImageFilter
    global _inpaint

    if _inpaint is None:
        _inpaint = AutoPipelineForInpainting.from_pipe(pipe)
    c, size = p["composite"], 512
    img = txt2img(pipe, embeds, c["background"], 0.0, seed)
    for i, (kind, x0, y0, x1, y1) in enumerate(c["regions"]):
        mask = Image.new("L", (size, size), 0)
        box = [x0 * size, y0 * size, x1 * size, y1 * size]
        if INPAINT["shape"] == "ellipse":
            ImageDraw.Draw(mask).ellipse(box, fill=255)
        else:
            ImageDraw.Draw(mask).rounded_rectangle(box, radius=40, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(INPAINT["blur"]))   # soft seam
        # The reference is a crop of his hindquarters; at the full plate strength
        # it fills a small region with rear end and no head.
        _inpaint.set_ip_adapter_scale(INPAINT["jim_ref"] if kind == "jimothy" else 0.0)
        # strength 1.0: the region starts from pure noise, so only this
        # character's prompt shapes it. padding_mask_crop renders the region at
        # full resolution, then scales it back into place.
        img = _inpaint(prompt=c["characters"][kind], image=img, mask_image=mask,
                       strength=INPAINT["strength"], num_inference_steps=4,
                       guidance_scale=0.0, padding_mask_crop=INPAINT["crop"],
                       ip_adapter_image_embeds=embeds,
                       height=size, width=size,
                       generator=torch.Generator("cpu").manual_seed(seed + i + 1)).images[0]
    return img


def select(all_plates, only):
    if not only:
        return all_plates
    keys = [k.strip() for k in only.split(",")]
    return [p for p in all_plates
            if any(k in (p["subject"], p["style"], p["name"]) or p["name"].startswith(k)
                   for k in keys)]


CSS = """
body{margin:0;background:#15141a;color:#e8e6ef;font-family:-apple-system,
     BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
header{padding:30px 36px 6px}h1{margin:0;font-size:26px}
header p{color:#9b98a8;max-width:760px;line-height:1.55}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));
      gap:16px;padding:20px 36px 60px}
figure{margin:0;background:#211e2a;border:1px solid #322e3c;border-radius:10px;padding:8px}
figure img{width:100%;display:block;border-radius:6px}
figcaption{font-size:11.5px;color:#b9b6c4;margin-top:7px;line-height:1.45}
figcaption span{font-family:ui-monospace,Menlo,monospace;color:#6e6b7b}
"""


def assemble():
    picks = json.loads(PICKS.read_text()) if PICKS.exists() else {}
    records, missing = [], []
    for p in plates():
        seed = picks.get(p["name"], p["seed"])
        src = cand_path(p, seed)
        if not src.exists():
            missing.append(p["name"])
            continue
        shutil.copyfile(src, OUT / f"{p['name']}.png")
        records.append({k: p[k] for k in ("n", "name", "subject", "style", "prompt",
                                          "ref_scale")}
                       | ({"composite": p["composite"]} if p["composite"] else {})
                       | {"seed": seed, "file": f"{p['name']}.png",
                          "model": "stabilityai/sdxl-turbo", "steps": 4, "size": 512})
    (OUT / "manifest.json").write_text(json.dumps(records, indent=2))
    cards = "".join(
        f'<figure><img src="{r["file"]}" alt="{r["name"]}" loading="lazy">'
        f'<figcaption><b>{r["subject"]}</b> &middot; {r["style"]}<br>'
        f'<span>{r["name"]} &middot; seed {r["seed"]}</span></figcaption></figure>'
        for r in records)
    (OUT / "index.html").write_text(
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<title>Jimothy Crickets - SDXL-Turbo Concept Art</title>"
        f"<style>{CSS}</style></head><body><header>"
        "<h1>Jimothy Crickets &mdash; Concept Art (SDXL-Turbo)</h1>"
        f"<p>{len(records)} plates: {len(SUBJECTS)} subjects &times; {len(STYLES)} art "
        "directions, generated locally on CPU with SDXL-Turbo. Each plate is the "
        "picked candidate; manifest.json has the exact prompt and seed.</p></header>"
        f"<div class='grid'>{cards}</div></body></html>")
    print(f"assembled {len(records)} plates" +
          (f"; no candidate yet for {len(missing)}: {missing[:5]}..." if missing else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=1, help="candidates per plate")
    ap.add_argument("--only", default=None,
                    help="comma-separated subjects, styles, plate names or number prefixes")
    ap.add_argument("--threads", type=int, default=10)
    ap.add_argument("--assemble", action="store_true", help="only copy picks + rebuild index")
    args = ap.parse_args()

    OUT.mkdir(exist_ok=True)
    if args.assemble:
        assemble()
        return

    from transformers import CLIPTokenizer
    tok = CLIPTokenizer.from_pretrained("stabilityai/sdxl-turbo", subfolder="tokenizer")
    for p in plates():   # CLIP silently drops everything past 77 tokens
        c = p["composite"] or {}
        for text in [p["prompt"], c.get("background", ""), *c.get("characters", {}).values()]:
            n = len(tok(text).input_ids)
            if n > 77:
                raise SystemExit(f"{p['name']}: a prompt is {n} tokens; CLIP keeps 77")

    todo = [(p, s) for p in select(plates(), args.only) for s in seeds_for(p, args.seeds)
            if not cand_path(p, s).exists()]
    print(f"{len(todo)} candidates to render", flush=True)
    if todo:
        t0 = time.time()
        pipe, embeds = load_pipe(args.threads)
        print(f"pipeline ready in {time.time() - t0:.0f}s", flush=True)
        times = []
        for i, (p, seed) in enumerate(todo, 1):
            t = time.time()
            path = cand_path(p, seed)
            path.parent.mkdir(parents=True, exist_ok=True)
            render(pipe, embeds, p, seed).save(path)
            times.append(time.time() - t)
            eta = sum(times) / len(times) * (len(todo) - i) / 60
            print(f"[{i}/{len(todo)}] {p['name']} seed {seed} {times[-1]:.1f}s "
                  f"eta {eta:.0f}m", flush=True)
    assemble()


if __name__ == "__main__":
    main()
