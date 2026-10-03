# Jimothy Crickets — Style Guide

Status: **provisional.** The plan (§8.1) has Zach pick the anchor images. Until he does, the picks
recorded in `art/raw/area1/picks.json` are Claude's, chosen against the rules below, and the game
ships them as working art:

| Sprite | Pick | Why |
|---|---|---|
| Jimothy | `jimothy-photo` 9050 | the only candidate of 28 that is a round ball with no tail showing |
| Cricket | 8100 | round green ball, dot eyes, smile; small wings |
| Possum | 8200 | the roundest, softest face |
| Squirrel | 9300 | side view, facing right, whole tail in frame |
| Crow | 7400 (framing v1) | pass 2 turned the crow into a robin |
| Rat | 9500 | round, pink ears and tail, facing right |
| Broom neighbor | 7700 | bewildered, comic, broom and bucket |
| Yard dog | 9800 | a sitting puppy: the goofiest and least threatening |
| Motion light | 11000 (framing v1) | isolated lamp on a bracket |
| Pile | 11100 | an overflowing can with bags and boxes |

Not from the model yet: the sprinkler, the fence and backgrounds (see the plan's M5 notes).

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
| **Jimothy** | a very round grey-and-black ball, bandit mask, no neck, tiny stub of a tail, short stubby legs | a long ringed raccoon tail; brown fur; a neck; menacing |
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
  of which have tails themselves). The rear-view photo at 0.42 does better, and more seeds help:
  pick the candidate whose tail is hidden or stubby, and touch up in Krita if needed.
- **Crickets:** keep the concept wording ("sweet round cartoon cricket, soft rounded bright green
  body, little black dot eyes, gentle closed-mouth smile, floppy curved antennae, short stubby
  rounded legs, cuddly"). Wings still appear; small rounded ones are acceptable.
- **Wide backgrounds** render cleanly at 1024 × 576, but SDXL-Turbo draws street-level
  perspective even when asked for a high-angle view of open ground, which fights the flat lane
  layout. Backgrounds stay procedural until another approach works (plan, M5 notes).

## Animation

One painted pose per sprite, animated in code (`src/render/scene.ts`): hops (crickets), waddles
(possum), bounding (squirrel), bobbing flight (crow), scurrying (rat), squash and stretch, a
belly-up flop for playing dead, a hop-off for "shooed", the pile shrinking toward its base.
