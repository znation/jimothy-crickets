"""Polish Jimothy's curated sprites: even out the rump seam, shading for volume, shiny eyes, a blush.

Run once on freshly matted files (it is not idempotent):
    python tools/asset_gen/polish_jimothy.py art/curated/area1 art/curated/area1
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC, DST = sys.argv[1], sys.argv[2]
POSES = {  # name: (dx, dy, shiny eyes?)
    "jimothy-nub": (0, 0, True), "jimothy-wave": (1, 0, True), "jimothy-happy": (1, 0, True),
    "jimothy-sleepy": (0, 0, False), "jimothy-think": (0, 0, False),
}
EYES = [(325, 167, 15), (412, 163, 13)]
BLUSH = [(316, 199), (426, 195)]  # on the mask, just under each eye

def gauss(h, w, cx, cy, rx, ry):
    y, x = np.mgrid[0:h, 0:w]
    return np.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2))

def disc(h, w, cx, cy, r):
    y, x = np.mgrid[0:h, 0:w]
    d = np.hypot(x - cx, y - cy)
    return np.clip(r + 0.5 - d, 0, 1)  # antialiased

for name, (dx, dy, shiny) in POSES.items():
    im = Image.open(f"{SRC}/{name}.png").convert("RGBA")
    a = np.asarray(im).astype(float)
    h, w = a.shape[:2]
    rgb, al = a[..., :3], a[..., 3] / 255

    # 1. stray green specks from the source photo's grass -> neutral fur grey
    green = (rgb[..., 1] > rgb[..., 0] + 12) & (rgb[..., 1] > rgb[..., 2] + 12)
    lum = rgb.mean(-1, keepdims=True)
    rgb = np.where(green[..., None], lum, rgb)

    # 1b. the tail-removal touch-up left the rump smoother and brighter than the rest of
    # his back, with a visible seam at x~170: ramp its brightness down to match.
    xx = np.mgrid[0:h, 0:w][1]
    ramp = np.clip((xx - (150 + dx)) / 45, 0, 1)
    rgb = rgb * (0.90 + 0.10 * ramp)[..., None]
    # ...and blend the seam line itself (a hard vertical edge with a cyan cast) sideways
    band = np.exp(-(((xx - (182 + dx)) / 12.0) ** 2)) * (np.mgrid[0:h, 0:w][0] < 330)
    k = np.ones(31) / 31  # horizontal box blur, opaque pixels only
    wgt = (al > 0.95).astype(float)
    num = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, rgb * wgt[..., None])
    den = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, wgt)[..., None]
    blur = np.where(den > 0.3, num / np.maximum(den, 1e-6), rgb)
    rgb = rgb * (1 - band[..., None]) + blur * band[..., None]
    # pale wisps on the matte edge read as a white halo at night: pull them to fur grey
    edge = np.clip((0.85 - al) / 0.85, 0, 1)[..., None]
    rgb = rgb * (1 - 0.45 * edge)
    near = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))) / 255
    bright = np.clip((rgb.mean(-1) - 150) / 40, 0, 1) * np.clip((0.9 - near) / 0.3, 0, 1)
    rgb = rgb * (1 - 0.3 * bright[..., None])

    # 2. volume: darker rim and underside, soft light on the back. Face kept as is.
    inner = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))) / 255
    shade = 1 - 0.30 * np.clip(1 - inner, 0, 1) ** 1.1
    yy = np.mgrid[0:h, 0:w][0]
    shade *= 1 - 0.16 * np.clip((yy - 0.45 * h) / (0.55 * h), 0, 1)
    shade += 0.10 * gauss(h, w, 0.40 * w, 0.22 * h, 0.30 * w, 0.18 * h)
    face = gauss(h, w, 370 + dx, 180 + dy, 115, 85) ** 0.5
    shade = shade * (1 - face) + face
    rgb = rgb * shade[..., None]
    # a touch more contrast, pivoting on mid-grey
    rgb = (rgb - 128) * 1.06 + 128

    # 3. rosy blush on the muzzle
    pink = np.array([255, 150, 178])
    for bx, by in BLUSH:
        g = 0.62 * np.clip(1.6 * gauss(h, w, bx + dx, by + dy, 12, 7) - 0.25, 0, 1)
        rgb = rgb * (1 - g[..., None]) + pink * g[..., None]

    # 4. big shiny eyes: a large catchlight up-left and a small one down-right
    if shiny:
        for ex, ey, r in EYES:
            for ox, oy, rr, op in ((-0.33, -0.36, 0.36, 0.95), (0.36, 0.34, 0.16, 0.85)):
                d = op * disc(h, w, ex + dx + ox * r, ey + dy + oy * r, rr * r)
                rgb = rgb * (1 - d[..., None]) + 255 * d[..., None]

    out = np.dstack([np.clip(rgb, 0, 255), a[..., 3]]).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(f"{DST}/{name}.png")
    print(name)
