#!/usr/bin/env python
"""Cut picked sprites out of their white backgrounds (plan §8.4).

SDXL has no alpha channel, so sprites are generated "isolated on plain white background"
and matted here with BiRefNet-lite (ZhengPeng7/BiRefNet_lite, MIT license; checked
2026-10-03). A plain colour threshold was tried in the concept work and kept ground bands
and white boxes; a matting model separates the subject properly.

    export PYTHONPATH=~/.cache/jimothy-sdxl-pylibs
    chrt --idle 0 ionice -c 3 ~/venv/bin/python tools/asset_gen/matte.py area1

Reads art/raw/<set>/<asset>.png (the assembled picks) for every sprite and object asset;
writes RGBA art/curated/<set>/<asset>.png, cropped to the subject with a small margin.
Backgrounds are copied unchanged. Files already in art/curated are kept unless --force,
because they may carry hand touch-ups.
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("HIP_VISIBLE_DEVICES", "")
sys.path.insert(0, str(Path(__file__).parent))
import generate  # noqa: E402

MODEL = "ZhengPeng7/BiRefNet_lite"
SIZE = 1024  # BiRefNet's working resolution
MARGIN = 8
ISLAND = 0.12  # islands smaller than this share of the main shape are removed


def load_model(threads):
    import torch
    from transformers import AutoModelForImageSegmentation

    torch.set_num_threads(threads)
    model = AutoModelForImageSegmentation.from_pretrained(MODEL, trust_remote_code=True)
    return model.float().eval().to("cpu")


def matte(model, img):
    import numpy as np
    import torch
    from PIL import Image

    rgb = img.convert("RGB")
    x = torch.from_numpy(np.asarray(rgb.resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float32) / 255)
    mean = torch.tensor([0.485, 0.456, 0.406])
    std = torch.tensor([0.229, 0.224, 0.225])
    x = ((x - mean) / std).permute(2, 0, 1)[None]
    with torch.no_grad():
        pred = model(x)[-1].sigmoid()[0, 0].numpy()
    alpha = Image.fromarray((pred * 255).astype("uint8")).resize(rgb.size, Image.BILINEAR)
    # Keep the subject: drop islands much smaller than the largest shape (stray grass, specks,
    # props the model judged salient).
    from scipy import ndimage
    a = np.asarray(alpha).copy()
    labels, n = ndimage.label(a > 64)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), labels, range(1, n + 1))
        keep = np.isin(labels, 1 + np.flatnonzero(sizes >= ISLAND * sizes.max()))
        a[~ndimage.binary_dilation(keep, iterations=3)] = 0
        alpha = Image.fromarray(a)
    out = rgb.copy()
    out.putalpha(alpha)
    # Crop to the subject (alpha above a small threshold) plus a margin.
    ys, xs = np.nonzero(a > 16)
    if len(xs):
        box = (max(0, xs.min() - MARGIN), max(0, ys.min() - MARGIN),
               min(rgb.width, xs.max() + 1 + MARGIN), min(rgb.height, ys.max() + 1 + MARGIN))
        out = out.crop(box)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true", help="overwrite curated files (loses touch-ups)")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--src", nargs="*", help="matte these files instead; NAME=PATH sets the output name")
    args = ap.parse_args()

    from PIL import Image

    out_dir = generate.ROOT / "art" / "curated" / args.set
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.src:
        model = load_model(args.threads)
        for spec in args.src:
            name, _, path = spec.rpartition("=")
            dst = out_dir / f"{name or '_test-' + Path(path).stem}.png"
            matte(model, Image.open(path)).save(dst)
            print(dst.relative_to(generate.ROOT))
        return

    raw = generate.RAW / args.set
    manifest = json.loads((raw / "manifest.json").read_text())
    model = None
    for name, info in manifest.items():
        if args.only and name not in args.only:
            continue
        dst = out_dir / f"{name}.png"
        if dst.exists() and not args.force:
            print(f"keep {dst.name} (curated; --force to redo)")
            continue
        if info["kind"] == "background":
            shutil.copy(raw / f"{name}.png", dst)
        else:
            model = model or load_model(args.threads)
            matte(model, Image.open(raw / f"{name}.png")).save(dst)
        print(f"wrote {dst.relative_to(generate.ROOT)}")


if __name__ == "__main__":
    main()
