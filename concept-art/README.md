# Jimothy Crickets — Concept Art

## `final/` — the six selected pieces

**Start here.** Open `final/index.html`.

| File | |
|---|---|
| `001-hero-portrait-watercolour` | hero portrait; the one plate where the stump tail rendered |
| `004-hero-portrait-flat-vector` | cleanest short-spine silhouette |
| `039-cricket-march-cel-shaded` | crickets, unmodified |
| `072-trash-fortress-gouache` | alley environment, unmodified |
| `082-defender-gouache` | defender pose, recoloured brown → charcoal |
| `089-defender-cel-shaded` | defender pose, now properly round and hunched |

The four showing Jimothy were re-rendered with the reference photo conditioning
his colouring and proportions (IP-Adapter, scale 0.42). The two without a raccoon
are straight from the main sweep. `final/manifest.json` records the exact prompt,
seed and source path for each, so any of them can be reproduced.

Rebuild with `python3 _tools/assemble_final.py`.

### Supporting folders

- `generated/` — the full 100-image sweep these were chosen from
- `refined/` — all 60 variants of the four Jimothy plates, each row showing the
  original beside them (`refined/index.html`)
- `reference/` — the source photo and the crops used for conditioning

Contact sheets are self-contained: they reference only files at or below their
own directory, so they render correctly however they are served.

## Who Jimothy actually is

Worth getting right, because it drives everything. Jimothy is a real Seattle
raccoon who went viral in July 2026. He has **short spine syndrome**: a
congenital condition that leaves the vertebrae shortened, compressed and partly
fused, so everything from head to tail is truncated.

- an **almost spherical body**, and a short curved back
- **no visible neck** — the head sits straight on the ball
- a **short corkscrew tail** — a thick stub with a hook, not a long ringed
  raccoon tail and not a bare nub
- **short, stubby legs** — thick where they meet the body, tapering to a small
  foot. They read as longer than a normal raccoon's only because the body above
  them is so compressed, and because his gait is unbalanced. Drawing them as
  long thin spindles is the easiest way to get him wrong.

His profile shows this best — the round back, missing neck and stub tail all
flatten out in a front view.

## Subjects × styles

| Subjects | Art directions |
|---|---|
| `hero-portrait`, `hero-alley`, `guarding-trash`, `defender`, `tower-build`, `trash-fortress`, `alley-empty`, `cricket-march`, `cricket-boss`, `key-art` | `watercolour`, `gouache`, `painterly`, `flat-vector`, `claymation`, `felt-plush`, `papercut`, `pixel-art`, `cel-shaded`, `risograph` |

Filenames are `NNN-subject-style.png`; `manifest.json` has the exact prompt and
seed for every image, so any one of them can be reproduced or re-rolled.

## Hardware and model choice

| | |
|---|---|
| Compute | **CPU** — i9-9900K, 16 threads, fp32 |
| Stack | `~/venv` — PyTorch 2.9.1+rocm6.3, diffusers 0.38 |
| Model | `stabilityai/sdxl-turbo` (fp16 weights, run in fp32) + IP-Adapter (SDXL/bigG) |
| Speed | ~21 s/image at 512×512, 4 steps → 100 images in ~35 min |
| Reference | `reference/jimothy-rear.jpg`, IP-Adapter scale 0.35 (0.45 for key-art) |

### Do not use the GPU on this machine

The box has an AMD Radeon Pro Vega 48, and the ROCm 6.3 PyTorch wheels *do*
drive it — gfx900 kernels execute even though ROCm 6.x dropped official support
for that target. It is about 5x faster (4.5 s/image vs 21 s).

**It is also the display adapter, and running SDXL on it corrupted the desktop
graphics badly enough to require a hard reboot.** An earlier run had already
died with `HW Exception ... GPU Hang`. Treat that first hang as the warning it
was, rather than a memory-pressure bug to tune around.

So the GPU is opt-in behind `--gpu` and should be considered unsafe here. CPU is
the default and needs no flag.

Note CPU runs fp32 where the GPU ran fp16, so the same seed does not reproduce
the GPU output pixel-for-pixel — close, but not identical.

Rejected models: FLUX.2-klein-4B and Z-Image-Turbo — both carry multi-shard LLM
text encoders that blow past the free disk on this machine. SD-Turbo works and
is faster, but its compositions and style adherence were clearly weaker in a
side-by-side.

## Prompting notes

### The reference photo (IP-Adapter)

`reference/jimothy-photo.jpg` is a real photo of Jimothy. Text alone could never
produce his **stump tail** — every phrasing gives a full ringed tail or none at
all, never the nub. IP-Adapter conditions on the photo alongside the prompt and
is what finally got it.

```bash
--ref ../reference/jimothy-rear.jpg --ref-scale 0.35
```

Things worth knowing:

- **Use the rear crop, not the full animal.** `jimothy-rear.jpg` is cropped to
  the hindquarters. In the full-body crop his fluffy *rump* reads as a bushy
  tail, so the reference was reinforcing exactly what we were trying to remove.
- **Scale is a hard tradeoff.** ≤0.35 keeps all ten art directions intact;
  0.5+ collapses everything toward the photo's realism, and the reference is a
  low-res video still so its blur transfers too. `key-art` is the exception at
  0.45 — its busy composition dilutes the reference, so it needs more.
- **Only Jimothy subjects get the reference** (`REF_SUBJECTS`). Applying a
  raccoon photo to cricket or empty-alley plates contaminates them.
- Side effect: the photo's muted palette bleeds into whole scenes, so the
  reference-conditioned alleys are greyer and less warm than the prompt asks.

Three traps that cost real time:

| Symptom | Cause |
|---|---|
| `mat1 and mat2 shapes cannot be multiplied (1x1280 and 1024x8192)` | `subfolder="sdxl_models"` pairs with that folder's ViT-bigG encoder (1280); the `_vit-h` adapter wants 1024. Use `ip-adapter_sdxl.safetensors`. |
| `'tuple' object has no attribute 'shape'` | `enable_attention_slicing()` replaces the UNet attention processors and silently clobbers IP-Adapter's. Don't call it when a reference is loaded. |
| `HW Exception ... GPU Hang`, process aborted | The ~2.5 GB CLIP image encoder resident alongside SDXL on an 8 GB card. Encode the reference once via `prepare_ip_adapter_image_embeds`, then drop the encoder. Also restored speed to 4.6 s/image. |

### Say "tanuki", not "raccoon"

This is the single most important thing in the file. In SDXL, "raccoon" is a
*bundle*: bandit mask **and** long ringed tail, and no amount of text separates
them. Roughly 40 probe images failed to shift it:

| Attempt | Result |
|---|---|
| "tiny stubby bobtail" / "completely tailless" / "no tail visible at all" | naming the tail at all summons a full ringed one |
| omitting any mention of a tail | still a ringed tail |
| negative prompt at guidance 1.5 / 2.5 | no effect on the tail |
| guidance 4.0–6.0 | tail survives *and* the turbo distillation breaks into colour artefacts |
| front-on / sitting framings to hide it | tail curls around into view |
| body noun → guinea pig / wombat / bear | tail goes, but the bandit mask goes too and he stops reading as a raccoon |

Two changes together fix it:

1. **"tanuki"** (Japanese raccoon dog) instead of "raccoon". Canonically round,
   canonically masked, canonically short-tailed — the silhouette we want is
   already inside the concept rather than being fought for.
2. **Put "tailless" inside the noun phrase**, and describe the rear positively:
   `a very round chubby tailless tanuki, … smooth rounded rear end`.

Point 2 is what killed the **two-tailed** images. A trailing modifier like
`…, short stubby tail` reads as *another thing to add* on top of the tanuki's
canonical tail, so the model drew both. Attaching the property to the noun makes
it a description of the animal instead of an extra appendage.

Two general lessons, both of which cost ~60 probe images to learn:

- Pick a base concept whose *canonical* form is close to the target, rather than
  negating features off a concept that's far away.
- Attach properties to the noun, and describe what **is** there rather than what
  isn't. Trailing "with a small X" phrases get added as extra objects.

### Crickets: dot eyes and a closed mouth

- v1 "cute cartoon green cricket **insect**, chunky and rounded" → spiky legs,
  bulging eyes, gaping mouths. Read as scary.
- v2 "plump ball-shaped, kawaii mascot" → overcorrected; lost the insect
  entirely and produced generic green blobs with manic open mouths.
- v3 "large kind eyes, small smile" → better, but big glossy eyes still read as
  bug-eyed and plenty of mouths came out open and manic.
- v4 (current) — the levers that actually make them safe are **little black dot
  eyes** (big shiny eyes are what tip into uncanny), an explicitly **closed**
  mouth, and stubby rounded legs. "harmless" pulls its weight too.

Material words ("plush", "fabric", "stitched") test even better but are
deliberately left out — they would fight the per-image art direction.

Also: "boss monster towering over" produced gaping mouths and menacing hunches,
so the boss is now scaled up as a **gentle giant** sitting next to tiny trash
cans for scale.

### Other limitations

- **No two-character scenes.** A Jimothy-vs-crickets standoff failed three ways:
  fused green raccoon-crickets, then distant specks, then colour bleed again.
  That slot is now the single-subject `defender` plate. Jimothy alone and
  crickets alone both render fine — combine them by hand.
- **No concrete object nouns as shape metaphors.** "beach-ball body" made SDXL
  draw literal beach balls next to him.
- Negative prompts are near-useless here: SDXL-Turbo is distilled for
  guidance-free sampling, so the script stays at `guidance_scale=0.0`.

## Regenerating

```bash
~/venv/bin/python _tools/generate_concept_art.py --benchmark   # time one image
~/venv/bin/python _tools/generate_concept_art.py --limit 4     # smoke test
~/venv/bin/python _tools/generate_concept_art.py               # full 100
~/venv/bin/python _tools/generate_concept_art.py --resume      # fill gaps only
```

Useful flags: `--model sd-turbo` (faster, weaker), `--cpu` (force CPU),
`--steps N`, `--size N`.

Subjects and styles are plain lists at the top of the script — edit those to
change the sweep. Deleting an image and re-running with `--resume` re-rolls just
that one.

## Sources

- [Smithsonian Magazine](https://www.smithsonianmag.com/smart-news/an-unusual-looking-raccoon-nicknamed-jimothy-is-winning-hearts-across-the-internet-for-his-short-round-body-180989157/)
- [ABC News (AU)](https://www.abc.net.au/news/2026-07-18/jimothy-raccoon-short-spine-syndrome-viral-videos/106931556)
- [Popular Science](https://www.popsci.com/science/whats-jimothy-raccoon-condition/)
- [The Conversation](https://theconversation.com/jimothy-the-raccoon-has-short-spine-syndrome-but-this-condition-can-affect-dogs-too-288270)
- [Newsweek](https://www.newsweek.com/jimothy-raccoon-seattle-short-spine-internet-animal-expert-12235607)
