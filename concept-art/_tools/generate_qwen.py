#!/usr/bin/env python3
"""Regenerate the Jimothy Crickets concept art matrix with Qwen-Image-2.1.

Same 10 subjects x 10 art directions as the SDXL sweep in ../generated/ (plus an
11th, "standoff", that SDXL could not render), same
names and seed scheme, so the two sets compare one-to-one. Output goes to
../qwen/; the SDXL work and final/ selections are left untouched.

GPU SAFETY: this machine's only GPU (Vega 48, 8 GiB) also drives the display.
All GPU handling lives in qwen_image.py, vendored byte-identical from the vale
project (tools/asset_gen/qwen_image.py). It enforces a 6 GiB whole-card VRAM
ceiling, display included, with a watchdog that hard-exits on any breach, plus a
single-GPU-job lock. Do not add attention slicing, pinned memory or a second
GPU process on top of it.

Why Qwen-Image instead of SDXL: its text encoder is an 8B vision-language model
rather than CLIP, so prompts are read as language (no 77-token truncation), and
"a short nub of a tail" can mean that instead of summoning a ringed tail.

Run at idle CPU/IO priority so it doesn't slow the desktop (about 2 min per
image at 512x512 / 20 steps / fp16; ~3.75 h for all 110):
    chrt --idle 0 ionice -c 3 ~/venv-qwenimage/bin/python -u generate_qwen.py  # resumable
    ~/venv-qwenimage/bin/python -u generate_qwen.py --limit 2  # smoke test
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qwen_image  # noqa: E402  (vendored from vale; see docstring)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "qwen"

# Described straight from the reference photo (reference/jimothy-photo.jpg) and
# the reporting on short spine syndrome.
JIMOTHY = (
    "Jimothy, a raccoon with short spine syndrome. His spine is compressed, so his "
    "body is almost a ball: very round and compact, with a strongly arched, hunched back "
    "and no visible neck, his head sitting right against his round body and carried low. "
    "His fur is charcoal grey and black with silver-grey guard hairs, with no brown in it. "
    "He has a black raccoon bandit mask across his eyes and a pale grey muzzle. His legs "
    "are short and stubby. His tail is just a short stubby nub, a few inches long. "
    "He looks cute and friendly"
)

CRICKET = (
    "a cute round cartoon cricket with a plump, soft green body, little black dot eyes, a "
    "small gentle closed-mouth smile, two floppy curved antennae and short stubby rounded "
    "legs; harmless, cuddly and kid-friendly"
)

SUBJECTS = [
    ("hero-portrait",
     f"A character portrait of {JIMOTHY}. He stands proudly, seen in profile from the side "
     f"so his round hunched body and short nub of a tail are clearly visible"),
    ("hero-alley",
     f"{JIMOTHY}. He stands in a rainy Seattle back alley at dusk, with puddles on the "
     f"ground and warm light spilling from windows"),
    ("guarding-trash",
     f"{JIMOTHY}. He sits on top of a big pile of black garbage bags, guarding it"),
    ("cricket-march",
     f"A marching line of crickets advancing along an alley path toward the viewer. Each "
     f"one is {CRICKET}"),
    ("cricket-boss",
     f"A giant, gentle boss cricket sitting peacefully beside tiny trash cans that show how "
     f"big it is, smiling warmly. It is {CRICKET}"),
    ("alley-empty",
     "A cozy rainy Seattle back alley with dumpsters, fire escapes and string lights, "
     "puddles reflecting neon signs. No characters. Environment concept art"),
    ("tower-build",
     f"{JIMOTHY}. He wears a tiny yellow hard hat and is building a defense tower out of "
     f"stacked trash cans and cardboard"),
    ("trash-fortress",
     "A whimsical little fortress built out of garbage cans, cardboard boxes and pizza boxes "
     "in an alley. Cute video game environment concept art"),
    ("defender",
     f"{JIMOTHY}. He stands heroically on top of a mountain of garbage bags and trash cans, "
     f"chest out, defending his hoard. Dramatic low angle, evening light"),
    ("key-art",
     f"Video game key art poster for a game called Jimothy Crickets. In the centre is the "
     f"hero, {JIMOTHY}. Around him are cheerful round smiling cartoon crickets, and behind "
     f"him glows a pile of treasure-like garbage. Dynamic and joyful"),
    # Appended last so 001-100 keep their names and seeds (this one is 101-110).
    # SDXL could not do this scene: the crickets' "green, chunky, rounded" bled onto
    # the raccoon and fused them into green hybrids, which is why "defender" exists.
    # Qwen-Image's language-model encoder binds attributes to the right subject far
    # better, so the two sides are kept spatially explicit and described separately.
    ("standoff",
     f"A playful face-off in a Seattle back alley. On the left side of the picture stands "
     f"{JIMOTHY}. He is planted firmly in front of his pile of black garbage bags, looking "
     f"determined. On the right side, facing him across a stretch of open ground, a small "
     f"group of crickets approaches; each cricket is {CRICKET}. The raccoon and the "
     f"crickets are clearly separate characters. A friendly showdown, not scary"),
]

# Each style is a LEAD that opens the prompt. Tacked on at the end of a 100-word
# raccoon description (the first version), every style collapsed into the same
# polished illustration: the pixel art wasn't pixel art, the felt and papercut were
# drawings, the risograph was an ink sketch. Leading with the medium and restating
# that it applies to everything fixed it in an A/B on the same seeds (2026-09-30).
STYLES = [
    ("watercolour", "Children's book watercolour illustration with soft pastel washes, "
                    "gentle linework and visible paper texture"),
    ("gouache", "Gouache painting with flat matte opaque shapes, visible brush strokes, "
                "mid-century illustration"),
    ("painterly", "Soft painterly animated-film concept art, hand painted, with atmospheric "
                  "lighting and lush backgrounds"),
    ("flat-vector", "Bold flat vector illustration with solid flat colours, no gradients, no "
                    "texture, clean geometric shapes"),
    ("claymation", "Claymation stop-motion film still; every character and object is sculpted "
                   "from plasticine, tilt-shift photography"),
    ("felt-plush", "Photograph of a handmade felt and plush toy diorama; every character and "
                   "object is a stitched felt toy"),
    ("papercut", "Layered paper cutout collage; every character and object is cut from "
                 "coloured construction paper, with soft drop shadows"),
    ("pixel-art", "16-bit pixel art video game illustration with clearly visible square "
                  "pixels and a limited palette"),
    ("cel-shaded", "Cel-shaded cartoon with thick black outlines, flat colour fills and "
                   "hard-edged shadows"),
    # Black is one of the two inks on purpose: blue + pink (tested first) turned Jimothy
    # blue, and he has to stay grey and black.
    ("risograph", "Two-colour risograph print in black and fluorescent pink ink, grainy "
                  "paper, slight misregistration"),
]


# Papercut only, and only when Jimothy is in the shot (a style-wide clause would put
# a raccoon into the cricket and alley plates). "Cut from construction paper" pulls in
# a stock raccoon silhouette with a long ringed tail and an upright body, overriding
# his anatomy in close framings. Anchoring the tail to a concrete size ("no bigger
# than one of his ears") held where "a tiny stub of a tail" alone did not
# (A/B on 007, 017 and 067, same seeds, 2026-10-01).
PAPERCUT_JIMOTHY = ("Jimothy is cut from charcoal-grey and black paper as one round, "
                    "ball-shaped piece. His tail is a tiny round paper stub, no bigger than "
                    "one of his ears")

def all_jobs(size):
    jobs = []
    for si, (skey, subject) in enumerate(SUBJECTS):
        for ti, (tkey, style) in enumerate(STYLES):
            n = len(jobs) + 1
            jobs.append({
                "n": n,
                "name": f"{n:03d}-{skey}-{tkey}",
                "subject": skey,
                "style": tkey,
                "prompt": (f"{style}. "
                           + (f"{PAPERCUT_JIMOTHY}. " if tkey == "papercut" and JIMOTHY in subject
                              else "")
                           + f"{subject}. Everything in the picture is rendered as "
                             f"{style.lower()}."),
                "seed": 1000 + si * 100 + ti,     # same scheme as the SDXL sweep
                "size": size,
            })
    return jobs


def flatten(path):
    """Composite onto white and save as RGB.

    Qwen-Image-2.1 emits RGBA even for opaque prompts; alpha comes back 240-255,
    so a few edge pixels would show a checkerboard in some viewers.
    """
    from PIL import Image

    img = Image.open(path)
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        bg.save(path)


def write_index(jobs):
    """Manifest and contact sheet from every image on disk, not just this run's.

    (A filtered run once truncated the SDXL sheet to its own subset.) Image paths
    are plain filenames in the same folder, so the page works however it's served.
    """
    done = [j for j in jobs if (OUT / f"{j['name']}.png").exists()]
    (OUT / "manifest.json").write_text(json.dumps(
        [{**j, "file": f"{j['name']}.png", "model": qwen_image.MODEL_ID} for j in done],
        indent=2))
    cards = "".join(
        f'<figure><img src="{j["name"]}.png" loading="lazy" alt="{j["name"]}">'
        f'<figcaption><b>{j["subject"]}</b> &middot; {j["style"]}<br>'
        f'<span>{j["name"]}</span></figcaption></figure>' for j in done)
    css = """body{margin:0;background:#15141a;color:#e8e6ef;font-family:-apple-system,
BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
header{padding:34px 40px 10px}h1{margin:0;font-size:28px}
header p{color:#9b98a8;max-width:760px;line-height:1.55}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;
padding:24px 40px 60px}figure{margin:0;background:#211e2a;border:1px solid #322e3c;
border-radius:10px;padding:8px}figure img{width:100%;display:block;border-radius:6px}
figcaption{font-size:11.5px;color:#b9b6c4;margin-top:7px;line-height:1.45}
figcaption span{font-family:ui-monospace,Menlo,monospace;color:#6e6b7b}"""
    (OUT / "index.html").write_text(
        f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>Jimothy Crickets - "
        f"Qwen-Image-2.1 concept art</title><style>{css}</style></head><body><header>"
        f"<h1>Jimothy Crickets &mdash; Qwen-Image-2.1</h1><p>{len(done)} of {len(jobs)} "
        f"images: {len(SUBJECTS)} subjects &times; {len(STYLES)} art directions, same "
        f"matrix and seeds as the SDXL sweep. Prompts are in <code>manifest.json</code>."
        f"</p></header><div class='grid'>{cards}</div></body></html>")
    return len(done)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated subject keys")
    ap.add_argument("--limit", type=int, help="generate at most this many pending images")
    ap.add_argument("--chunk", type=int, default=20,
                    help="images per encode/generate cycle; smaller = less lost on a crash")
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--size", type=int, default=512, help="square side, multiple of 32")
    ap.add_argument("--precision", choices=["fp16", "bf16"], default="fp16",
                    help="fp16 is 1.6-2.7x faster on gfx900 (no bf16 hardware)")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    jobs = all_jobs(args.size)
    for existing in OUT.glob("*.png"):      # e.g. from a run that died mid-chunk
        flatten(existing)
    pending = [j for j in jobs if not (OUT / f"{j['name']}.png").exists()]
    if args.only:
        keep = {k.strip() for k in args.only.split(",")}
        pending = [j for j in pending if j["subject"] in keep]
    if args.limit:
        pending = pending[: args.limit]
    print(f"{len(jobs) - len([j for j in jobs if not (OUT / (j['name'] + '.png')).exists()])}"
          f"/{len(jobs)} already done; generating {len(pending)} "
          f"({args.steps} steps, {args.size}px, {args.precision})", flush=True)

    for start in range(0, len(pending), args.chunk):
        batch = pending[start : start + args.chunk]
        print(f"\n=== chunk {start // args.chunk + 1}: {batch[0]['name']} .. "
              f"{batch[-1]['name']} ===", flush=True)
        qwen_image.run_jobs(
            [qwen_image.Job(prompt=j["prompt"], output=OUT / f"{j['name']}.png",
                            width=j["size"], height=j["size"], seed=j["seed"],
                            transparent=False)
             for j in batch],
            steps=args.steps, precision=args.precision)
        for j in batch:
            flatten(OUT / f"{j['name']}.png")
        n = write_index(jobs)
        print(f"=== {n}/{len(jobs)} on disk ===", flush=True)

    write_index(jobs)


if __name__ == "__main__":
    qwen_image.run_then_exit(main)
