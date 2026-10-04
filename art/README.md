# Production art

The pipeline from plan §8.4. Everything here is data or model output; the game only ever loads
the atlases in `public/atlas/`.

```
art/prompts/<set>.json ─► tools/asset_gen/generate.py ─► art/raw/<set>/_candidates/   (seeds × prompts)
                                                          art/raw/<set>/_sheets/       (contact sheets)
          pick one seed per asset ─► art/raw/<set>/picks.json ─► generate.py --assemble ─► art/raw/<set>/<asset>.png
art/raw ─► tools/asset_gen/matte.py (BiRefNet-lite) ─► art/curated/<set>/<asset>.png  ◄── touch-ups in Krita
art/curated + art/sprites.json ─► tools/build_atlas.ts ─► public/atlas/<set>.webp + .json
```

| Path | What | In git? |
|---|---|---|
| `prompts/<set>.json` | style lead, per-kind suffixes, and each asset's prompt, seed base, size and optional IP-Adapter anchor | yes |
| `raw/<set>/_candidates/`, `_sheets/` | every render, and one contact sheet per asset | no (regenerable) |
| `raw/<set>/picks.json`, `manifest.json`, `<asset>.png` | the chosen seed per asset, its exact settings, and the picked render | yes (LFS) |
| `curated/<set>/<asset>.png` | the cut-out sprite: the **source of truth** for shipped art; may carry hand touch-ups | yes (LFS) |
| `curated/<set>/sources.json` | optional: which curated file each sprite name uses (e.g. `"jimothy": "jimothy-photo"`) | yes |
| `curated/<set>/backgrounds.json` | which curated files are backgrounds | yes |
| `sprites.json` | each sprite's in-game height in world units; the outline weight and colour | yes |

## Running it

CPU only, at idle priority (plan §8.4's hardware rules; never the display GPU). `~/venv`'s
`transformers` needs the project-only overlay on `PYTHONPATH`.

```bash
export PYTHONPATH=~/.cache/jimothy-sdxl-pylibs
chrt --idle 0 ionice -c 3 ~/venv/bin/python -u tools/asset_gen/generate.py area1 --seeds 4
~/venv/bin/python tools/asset_gen/generate.py area1 --sheets      # review art/raw/area1/_sheets/
# record picks in art/raw/area1/picks.json, then:
~/venv/bin/python tools/asset_gen/generate.py area1 --assemble
chrt --idle 0 ionice -c 3 ~/venv/bin/python tools/asset_gen/matte.py area1
node tools/build_atlas.ts area1
```

Sets: `area1` holds the shared characters and defenses; `areas` holds each area's pile
(`pile-<area>`), the fence, the sprinkler and the painted backgrounds. The game merges both.

**Touch-ups** repaint part of a pick: `tools/asset_gen/inpaint.py <recipe>` (recipes in
`art/prompts/touchups/`) places the pick on a canvas, optionally paints over regions in flat
colour, and inpaints masked regions. Pick a result by its candidate file name in `picks.json`
(e.g. `"jimothy-notail": "24-f59944ee"`); `--assemble` copies it and records the recipe.

**Backgrounds and the staging mat** are img2img, not text-to-image: `node tools/render_scenery.ts` paints each area's
procedural scenery into `art/raw/areas/init/` (and the mat into `art/raw/props/init/`), and assets with `"init"` and `"strength"` (0.75)
repaint it. `art/curated/<set>/backgrounds.json` maps each area to its picked background.

About 22 s per 512² render and 3–5 s per matte on this iMac.

## Licenses

- SDXL-Turbo (Stability AI Non-Commercial Research Community License): non-commercial use; we own
  the outputs. See plan §8.5.
- IP-Adapter (h94): Apache 2.0.
- BiRefNet-lite (ZhengPeng7/BiRefNet_lite): MIT, checked 2026-10-03.
