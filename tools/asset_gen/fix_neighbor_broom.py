"""Straighten the broom neighbor's broom. The render (neighbor-cardigan 42000) drew two sticks
from one fist: the long handle, and a bristle stick bent down-left. This lifts the bristles,
erases their stick (re-inking the fist where it was tucked under), and puts them on the top end
of the handle, so he holds one straight broom bristles-up, ready to swat at crows.

Run once on the curated file, after matte.py and the bristle trim (it is not idempotent):
    python tools/asset_gen/fix_neighbor_broom.py art/curated/area1/neighbor-cardigan.png \
        art/curated/area1/neighbor-cardigan.png
"""
import sys, math
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
W, H = im.size
px = im.load()
# 1. lift the bristle piece (fan + ferrule) and erase it and its stick
piece = Image.new("RGBA", im.size, (0, 0, 0, 0))
pp = piece.load()
for y in range(H):
    for x in range(W):
        if px[x, y][3] == 0:
            continue
        if x < 150 and y > 340:
            pp[x, y] = px[x, y]
        if (x < 186 and y > 332) or (x < 202 and y > 352):
            px[x, y] = (0, 0, 0, 0)
# the stub of the bristle stick tucked under the fist, then re-ink the fist's edge there
nub = set()
for y in range(333, 357):
    edge = 194 if y <= 338 else 198 if y <= 343 else 203
    for x in range(186, edge):
        if px[x, y][3]:
            px[x, y] = (0, 0, 0, 0)
            nub.add((x, y))
ink = (52, 36, 20, 255)
for (x, y) in list(nub):
    for dx in (1, 2):
        q = (x + dx, y)
        if q not in nub and px[q][3] > 200 and px[q][0] > 200:
            px[q] = ink if dx == 1 else (150, 110, 80, 255)
# axes
old_f = (132.5, 392.5)
old_a = (-0.756, 0.655)
hc, ha = (123.0, 229.0), (0.657, 0.754)  # handle centre line
P = lambda s: (hc[0] + s * ha[0], hc[1] + s * ha[1])
def place(new_f, new_a, scale=1.0):
    # affine: output point q -> source point  old_f + R^-1 (q - new_f) / scale
    ang = math.atan2(new_a[1], new_a[0]) - math.atan2(old_a[1], old_a[0])
    c, s_ = math.cos(-ang) / scale, math.sin(-ang) / scale
    # src = old_f + [c -s; s c] (q - new_f)
    a, b = c, -s_
    d, e = s_, c
    cx = old_f[0] - a * new_f[0] - b * new_f[1]
    cy = old_f[1] - d * new_f[0] - e * new_f[1]
    return piece.transform(im.size, Image.AFFINE, (a, b, cx, d, e, cy), resample=Image.BICUBIC)
def stick(s0, s1):
    # paint a handle segment in the art's colours: dark outline, wood fill, light edge
    lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(lay)
    for w, col in ((15, (72, 38, 16, 255)), (10, (165, 106, 55, 255))):
        dr.line([P(s0), P(s1)], fill=col, width=w)
    off = (-ha[1] * 2, ha[0] * 2)
    a0, a1 = P(s0 + 3), P(s1 - 3)
    dr.line([(a0[0] + off[0], a0[1] + off[1]), (a1[0] + off[0], a1[1] + off[1])], fill=(196, 138, 80, 255), width=3)
    return lay
fs = -36
# erase the old knob end of the handle, above where the bristles start
for y in range(H):
    for x in range(W):
        if px[x, y][3] == 0:
            continue
        dx, dy = x - hc[0], y - hc[1]
        s = dx * ha[0] + dy * ha[1]
        n = -dx * ha[1] + dy * ha[0]
        if s < fs + 6 and abs(n) < 14:
            px[x, y] = (0, 0, 0, 0)
im.alpha_composite(stick(fs - 2, fs + 14))
im.alpha_composite(place(P(fs), (-ha[0], -ha[1]), 0.85))
im.save(out)
