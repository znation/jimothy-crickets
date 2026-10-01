#!/usr/bin/env python
"""Assemble the six selected concept art pieces into concept-art/final/.

Four are refined variants (reference-conditioned, scale 0.42); two are straight
from the main sweep because they contain no raccoon and needed no correction.
Everything is copied in so final/ is self-contained - no parent-directory
references, which is what broke the earlier contact sheet when served.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN, REF, FINAL = ROOT / "generated", ROOT / "refined", ROOT / "final"

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
PROFILE = "standing proudly in profile side view, character concept art"
DEFENDER = ("standing heroically on top of a mountain of garbage bags and trash "
            "cans, defending his hoard, evening")

SELECTED = [
    {"name": "001-hero-portrait-watercolour", "shows_jimothy": True,
     "src": REF / "001-hero-portrait-watercolour" / "s0.42_seed1000.png",
     "scale": 0.42, "seed": 1000, "prompt": f"{JIM}, {PROFILE}, {STYLES['watercolour']}",
     "note": "The one plate where the stump tail actually rendered."},
    {"name": "004-hero-portrait-flat-vector", "shows_jimothy": True,
     "src": REF / "004-hero-portrait-flat-vector" / "s0.42_seed1005.png",
     "scale": 0.42, "seed": 1005, "prompt": f"{JIM}, {PROFILE}, {STYLES['flat-vector']}",
     "note": "Cleanest short-spine silhouette; tailless (the style abstracts it away)."},
    {"name": "039-cricket-march-cel-shaded", "shows_jimothy": False,
     "src": GEN / "039-cricket-march-cel-shaded.png",
     "scale": None, "seed": None, "prompt": None,
     "note": "Unmodified - no raccoon, so the reference pass did not apply."},
    {"name": "072-trash-fortress-gouache", "shows_jimothy": False,
     "src": GEN / "072-trash-fortress-gouache.png",
     "scale": None, "seed": None, "prompt": None,
     "note": "Unmodified - environment plate, no raccoon."},
    {"name": "082-defender-gouache", "shows_jimothy": True,
     "src": REF / "082-defender-gouache" / "s0.42_seed1802.png",
     "scale": 0.42, "seed": 1802, "prompt": f"{JIM}, {DEFENDER}, {STYLES['gouache']}",
     "note": "Original was warm brown; now correctly charcoal. Rear occluded by trash."},
    {"name": "089-defender-cel-shaded", "shows_jimothy": True,
     "src": REF / "089-defender-cel-shaded" / "s0.42_seed1811.png",
     "scale": 0.42, "seed": 1811, "prompt": f"{JIM}, {DEFENDER}, {STYLES['cel-shaded']}",
     "note": "Went from an ordinary raccoon to a properly round, hunched one."},
]

CSS = """
body{margin:0;background:#15141a;color:#e8e6ef;font-family:-apple-system,
     BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
header{padding:36px 40px 8px}h1{margin:0;font-size:28px}
header p{color:#9b98a8;max-width:760px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
      gap:20px;padding:24px 40px 60px}
figure{margin:0;background:#211e2a;border:1px solid #322e3c;border-radius:11px;padding:10px}
figure img{width:100%;display:block;border-radius:7px}
figcaption{font-size:12.5px;color:#b9b6c4;margin-top:9px;line-height:1.5}
.n{font-family:ui-monospace,Menlo,monospace;color:#f2994a;font-size:12px}
.meta{color:#6e6b7b;font-size:11.5px;font-family:ui-monospace,Menlo,monospace}
"""


def main():
    if FINAL.exists():
        shutil.rmtree(FINAL)
    FINAL.mkdir(parents=True)

    records, cards = [], []
    for s in SELECTED:
        assert s["src"].exists(), f"missing source: {s['src']}"
        dest = FINAL / f"{s['name']}.png"
        shutil.copy2(s["src"], dest)
        rel_src = s["src"].relative_to(ROOT)
        records.append({
            "name": s["name"], "file": dest.name, "shows_jimothy": s["shows_jimothy"],
            "source": str(rel_src), "ref_scale": s["scale"], "seed": s["seed"],
            "prompt": s["prompt"], "note": s["note"],
        })
        meta = (f"reference scale {s['scale']} &middot; seed {s['seed']}"
                if s["scale"] else "unmodified from the main sweep")
        cards.append(
            f'<figure><img src="{dest.name}" alt="{s["name"]}">'
            f'<figcaption><span class="n">{s["name"]}</span><br>{s["note"]}'
            f'<br><span class="meta">{meta}</span></figcaption></figure>')

    (FINAL / "manifest.json").write_text(json.dumps(records, indent=2))
    html = (f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
            f"<title>Jimothy Crickets - final concept art</title>"
            f"<style>{CSS}</style></head><body><header>"
            f"<h1>Jimothy Crickets &mdash; final concept art</h1>"
            f"<p>The six selected pieces. Four were re-rendered with the reference "
            f"photo conditioning Jimothy's colouring and short-spine proportions "
            f"(IP-Adapter, scale 0.42); two contain no raccoon and are unmodified. "
            f"<code>manifest.json</code> records the exact prompt, seed and source "
            f"path for each.</p></header>"
            f"<div class='grid'>{''.join(cards)}</div></body></html>")
    (FINAL / "index.html").write_text(html)
    print(f"final/: {len(records)} images")
    for r in records:
        print(f"  {r['file']:<38} <- {r['source']}")


if __name__ == "__main__":
    main()
