# Jimothy Crickets — Style Guide

Status: **provisional.** The plan (§8.1) has Zach pick the anchor images. Until he does, the picks
recorded in `art/raw/area1/picks.json` are Claude's, chosen against the rules below, and the game
ships them as working art:

| Sprite | Pick | Why |
|---|---|---|
| Jimothy | `jimothy-nub` 31 (touch-ups of `jimothy-photo` 9050) | 9050 was the roundest of 28 renders, but a ringed tail peeked out behind his hind leg and the frame cropped his rump. `jimothy-notail` (24) removed the tail, completed the rump and cleared the grass; `jimothy-nub` (31) gave him back the fairly tiny fluffy nub he really has |
| Cricket | 8100 | round green ball, dot eyes, smile; small wings |
| Possum | 8200 | the roundest, softest face |
| Squirrel | 9300 | side view, facing right, whole tail in frame |
| Crow | 7400 (framing v1) | pass 2 turned the crow into a robin |
| Rat | 9500 | round, pink ears and tail, facing right |
| Broom neighbor | 7700 | bewildered, comic, broom and bucket |
| Yard dog | 9800 | a sitting puppy: the goofiest and least threatening |
| Motion light | 11000 (framing v1) | isolated lamp on a bracket |
| Pile (alley) | 11100 | an overflowing can with bags and boxes |

Areas 2–4 (`art/raw/areas/picks.json`):

| Sprite | Pick | Why |
|---|---|---|
| Pile (back yards) | 10100 | an overflowing green wheelie bin |
| Pile (cul-de-sac) | 12200 | a blue recycling bin spilling boxes |
| Pile (strip mall) | 11300 | an open green dumpster |
| Fence | 11400 | a solid gate with its post: cuts out cleanly, unlike picket fences |
| Sprinkler | 12500 | reads as a little garden fountain, the best of twelve; the code adds the spray |
| Background (back yards) | 9600 at 0.75 | lit houses behind a picket fence, stars |
| Background (cul-de-sac) | 10700 at 0.75 | houses around the turning circle, which sits under the pile |
| Background (strip mall) | 10800 at 0.75 | lit storefronts over a lined parking lot |
| Background (alley) | `bg-alley-lot-75` 13900 | red-brick terraces with warm windows over an open lot |

Props (`art/raw/props/picks.json`):

| Sprite | Pick | Why |
|---|---|---|
| Snack (cookie) | 22200, cropped | a single round chocolate-chip cookie; the crop drops a dip bowl beside it |
| Acorn | `acorn-cup` 20700, cropped | the only real capped acorn in 26 renders, sitting in a corner of a teacup scene |

Still drawn in code, on purpose: the staging-area cardboard mat (14 renders gave open boxes of
toys, a shed, a truck and a book), lanes, range rings, effects, moons and UI buttons.

Every area now has a painted background; the procedural scenery shows only beyond the bleed on
extreme ultrawides.

## The look: inked watercolour

From the README: hand-drawn, storybook, soft shapes, chunky confident outlines, a warm
picture-book palette; not pixel art, not flat vector.

- **Fills:** soft watercolour washes with a little paper texture (from the concept set's
  watercolour column).
- **Outlines:** one uniform dark warm-grey ink line (`#2a2233`) around every sprite, added by
  `tools/build_atlas.ts` at 2.5 world units. The image model's own linework is thin and uneven;
  the shared outline is what makes sprites from different generations read as one family.
- **Characters** are high-contrast and saturated enough to pop; **backgrounds** are softer and
  darker (night), so the troupe always reads against them.
- **Palette:** night blues (`#1a2147` → `#4b4f86`), damp asphalt greys, moss greens, warm window
  yellow (`#f6d08a`), the cricket green (`#6cc24a`), Jimothy's charcoal greys. UI uses the same
  ink, paper (`#fff6e6`) and accent orange (`#ffb547`).

## Characters

| Who | Must read as | Never |
|---|---|---|
| **Jimothy** | a very round grey-and-black ball, bandit mask, no neck, a fairly tiny fluffy nub of a tail, short stubby legs | a long ringed raccoon tail; brown fur; a neck; menacing |
| **Crickets** | happy, round, bright green, dot eyes, small closed-mouth smiles, floppy antennae | spiky, toothy, realistic insect legs, orange or striped |
| Possum | round pale-grey cushion with a pink nose | rat-like or toothy |
| Squirrel | orange, with a big fluffy tail (its silhouette) | |
| Crow | round, glossy black, small orange beak, friendly eyes | menacing or sharp |
| Rat | round grey with big pink ears and a pink tail | sewer-rat realism |
| Broom neighbor | bewildered, mostly comic | angry or villainous |
| Yard dog | sleepy, fluffy, goofy | snarling, teeth |

Characters face **right** (toward the pile), whole body visible. Build-time `flip` in
`art/sprites.json` fixes sprites that came out facing left.

## Sizes on screen

In world units (the 1920 × 1080 logical playfield); the atlas stores sprites at 2×. See
`art/sprites.json`. Units are 56–80 tall so they stay readable on a 667 px-wide phone (about a
third of a CSS pixel per unit); Jimothy is 150; the broom neighbor 170; the pile 300 at full size.

## Prompting (SDXL-Turbo)

The prompt set is `art/prompts/area1.json`. What the spikes established (2026-10-03):

- **Style lead, then framing, then subject.** Early words weigh most. The framing phrase ("one
  cute character sticker, whole body with white space around it, plain white background") has to
  come straight after the style, or the model paints a whole scene and crops the subject.
- **Matting fixes backgrounds; it can't fix cropping.** BiRefNet-lite cleanly removes ground,
  leaves and branches, so props in a render are fine. A tail cut off by the frame is not.
- **Jimothy's tail** survives every wording and both concept anchors (`sdxl/001`, `sdxl/009`, both
  of which have tails themselves). The rear-view photo at 0.42 does better, and more seeds help.
  **To remove a tail, don't inpaint a "rump" from scratch**: that drew a new tail on 5 of 6 seeds.
  Instead paint the missing body in flat fur grey first (continue his body's ellipse), then
  re-texture it at strength ~0.72 with a prompt that names only fur. The recipe is
  `art/prompts/touchups/jimothy-notail.json` (`tools/asset_gen/inpaint.py`).
- **His nub** is added the same way (`jimothy-nub.json`): a small flat grey ellipse on the back of
  his rump, about two-thirds up, re-textured at 0.62 inside a mask barely bigger than the nub, so
  it can't grow into a full tail.
- **Crickets:** keep the concept wording ("sweet round cartoon cricket, soft rounded bright green
  body, little black dot eyes, gentle closed-mouth smile, floppy curved antennae, short stubby
  rounded legs, cuddly"). Wings still appear; small rounded ones are acceptable.
- **Backgrounds are img2img over the game's own scenery.** From a text prompt alone, SDXL-Turbo
  draws street-level perspective even when asked for a high angle, which fights the flat lane
  layout. Starting instead from the procedural scenery (`tools/render_scenery.ts`) keeps the
  skyline and open ground where the lanes need them, and repaints them in the house style.
  Strength **0.75** is right: 0.5–0.65 only blurs the input, and 0.9 redraws the composition
  (foreground fences and trees, a lower horizon). Each area's horizon is the lowest any of its
  levels needs, so no lane runs through a painted building.
- **Avoid perspective nouns in background prompts.** "Back alley" pulled even img2img toward a
  vanishing-point street with paths; "a flat open asphalt lot behind brick apartment buildings"
  kept the layout.
- **Small props drift into scenes.** "Acorn … cap" drew mushrooms, "oak … seed" drew trees, "cup"
  drew teacups. When a good object turns up inside a scene, crop it: `art/raw/<set>/crops.json`
  records the box, and `matte.py` crops before matting.
- **Fences:** ask for a solid gate. Picket fences lose their rails in matting.
- **Sprinklers** always come out as garden scenes; the best candidates read as small fountains.

## Animation

One painted pose per sprite, animated in code (`src/render/scene.ts`): hops (crickets), waddles
(possum), bounding (squirrel), bobbing flight (crow), scurrying (rat), squash and stretch, a
belly-up flop for playing dead, a hop-off for "shooed", the pile shrinking toward its base.
