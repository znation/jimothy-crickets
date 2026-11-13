# Jimothy Crickets — Style Guide

Status: **provisional.** The plan (§8.1) has Zach pick the anchor images. Until he does, the picks
recorded in `art/raw/area1/picks.json` are Claude's, chosen against the rules below, and the game
ships them as working art:

| Sprite | Pick | Why |
|---|---|---|
| Jimothy | `jimothy-nub` 31 (touch-ups of `jimothy-photo` 9050) | 9050 was the roundest of 28 renders, but a ringed tail peeked out behind his hind leg and the frame cropped his rump. `jimothy-notail` (24) removed the tail, completed the rump and cleared the grass; `jimothy-nub` (31) gave him back the fairly tiny fluffy nub he really has |. All five poses then get a polish pass (`tools/asset_gen/polish_jimothy.py`): the rump seam left by the tail removal is blended away, shading gives him volume, his eyes get big catchlights (not the sleepy or thinking eyes), and a soft pink blush sits on his mask under each eye
| Cricket | `cricket-round` 36000 (was `cricket` 8100) | a clear little bug: big shiny eyes, a smile and a rosy cheek, pink wings, facing right. 8100's leaf-shaped wings read as ears in-game, so the crickets looked like goblins. The matte's hole in the upper wing is filled by hand |
| Possum | `possum-side` 36000 (was `possum` 8200) | pale, fluffy and white-faced, on all fours, facing right. 8200 faced the camera and looked just like the rat. A plant, a radish and a patch of ground from its scene are erased by hand |
| Squirrel | 9300 | side view, facing right, whole tail in frame |
| Crow | `crow-black` 37000 (was `crow` 7400) | very round, one big eye, a yellow beak; mirrored to face right (`flip`). SDXL-Turbo's watercolour style turns "black" into grey (and "orange beak" into a robin's breast), so the feathers are darkened to a blue-black in the curated file and a soft blush is added under the eye. 7400 was a realistic crow |
| Rat | `rat-side` 37000 (was `rat` 9500) | brown, side-on, the whole tail in frame. Brown against the possum's white keeps the two apart at a glance |
| Broom neighbor | `neighbor-cardigan` 42000 (was 7700) | a short round grandpa: blue cap and cardigan, big white moustache, rosy cheeks, broom in hand. The frame clipped the bristles, so the curated file trims them to a ragged rounded end. The render also drew a second, bent bristle stick out of his fist; `fix_neighbor_broom.py` moves the bristles to the top of the one straight handle, so he holds it bristles-up for swatting crows. 7700 was a realistic, scraggly old man |
| Yard dog | `dog-round` 37000 (was 9800), cropped | a round chibi golden puppy sitting with its tail out, big shiny eyes, a red collar; the crop drops a sketchbook spiral at the left edge |
| Motion light | 11000 (framing v1) | isolated lamp on a bracket |
| Pile (alley) | 11100 | an overflowing can with bags and boxes |

Jimothy's poses, all touch-ups of `jimothy-nub` (recipes in `art/prompts/touchups/`):

| Pose | Pick | Used for |
|---|---|---|
| `jimothy-wave` | 42 | the title, level intros, and the first two seconds of every night |
| `jimothy-happy` | 41 | the happy hop after each delivery, a win (with the cookie held up, drawn in code), the results card |
| `jimothy-sleepy` | 44 | the nap when the sun comes up (with z's drawn in code), the night card |
| `jimothy-think` | 42 (on `jimothy-think-paw` 41) | paw at his chin, eyes up: the pause card and the acorn shop |

Areas 2–4 (`art/raw/areas/picks.json`):

| Sprite | Pick | Why |
|---|---|---|
| Pile (back yards) | 10100 | an overflowing green wheelie bin. The lawn patch and concrete blocks the matte kept (a pale box in-game) are erased by hand |
| Pile (cul-de-sac) | 12200 | a blue recycling bin spilling boxes |
| Pile (strip mall) | 11300 | an open green dumpster |
| Fence | 11400 | a solid gate with its post: cuts out cleanly, unlike picket fences |
| Sprinkler | 12500 | reads as a little garden fountain, the best of twelve; the code adds the spray |
| Background (back yards) | 9600 at 0.75 | lit houses behind a picket fence, stars |
| Background (cul-de-sac) | 10700 at 0.75 | houses around the turning circle, which sits under the pile |
| Background (strip mall) | 10800 at 0.75 | lit storefronts over a lined parking lot; the shop signs' garbled model lettering is painted out by hand in the curated file, leaving plain lit sign panels |
| Background (alley) | `bg-alley-lot-75` 13900 | red-brick terraces with warm windows over an open lot |

Props (`art/raw/props/picks.json`):

| Sprite | Pick | Why |
|---|---|---|
| Snack (cookie) | 22200, cropped | a single round chocolate-chip cookie; the crop drops a dip bowl beside it |
| Acorn | `acorn-cup` 20700, cropped | the only real capped acorn in 26 renders, sitting in a corner of a teacup scene |
| Staging mat | `mat-60` 21000 | img2img at 0.6 over the game's own drawing of the mat: flat cardboard with a fold line and packing tape. Text-to-image gave open boxes of toys, a shed, a truck and a book; at 0.75 it turns into a 3D box |

**Story cards** (`src/render/story.ts`) are compositions, not renders: an area's background with
its pile on the right, Jimothy (waving, or happy for the finale) on the left, and the troupe that
has joined by then between them. Tall boxes stack them instead: the pile behind, Jimothy in the
middle, the troupe in a row in front. The same code draws the store art's key art.

Still drawn in code, on purpose: lanes, range rings, effects, moons and UI buttons.

Every area now has a painted background; the procedural scenery shows only beyond the bleed on
extreme ultrawides.

## The look: inked watercolour

From the README: hand-drawn, storybook, soft shapes, chunky confident outlines, a warm
picture-book palette; not pixel art, not flat vector.

- **Fills:** soft watercolour washes with a little paper texture (from the concept set's
  watercolour column).
- **Outlines:** one uniform dark warm-grey ink line (`#2a2233`) around every sprite, added by
  `tools/build_atlas.ts` at 4 world units (2.5 until 2026-11; at phone size that was under a
  pixel and sprites went soft). The image model's own linework is thin and uneven; the shared
  outline is what makes sprites from different generations read as one family.
- **Shadows:** every animal, defense, Jimothy and the pile sits on a soft oval contact shadow
  (`rgba(20, 14, 34, 0.32)`), drawn in code, so nothing floats on the path.
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
| Broom neighbor | a short round grandpa, bewildered, mostly comic | angry or villainous; realistic |
| Yard dog | a round fluffy puppy, goofy | snarling, teeth |

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
- **Poses and expressions** are touch-ups too, not new renders. Generating poses with the photo as
  an IP-Adapter anchor ignored the pose words, regrew the long tail and lost his face. Instead:
  - Eyes: paint the old eyes over in the mask's black, add pale lid crescents, re-texture at 0.45.
  - Mouth: paint a flat open mouth (dark red, pink tongue), re-texture at 0.5.
  - A raised paw: paint a grey arm and a black paw where they go, re-texture at 0.6 in a mask
    that covers both.
  - A paw on the chin can't be inpainted: at any strength from 0.42 to 0.6 the paw melts back into
    his chest fur. Instead, paste the painted paw from `jimothy-wave` there (the recipe's `paste`
    step, rotated 25°) over a darker arm, and blend at 0.3. Eyes looking up (white eyes, pupils
    near the top, re-textured at 0.4) went on top as a second touch-up.
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
- **The neighbor:** "chubby round little old man in a bathrobe" drew bald, baby-faced men; "short
  round cheerful grandpa in a blue cardigan" with a "tiny white moustache" reads as a neighbor.
- **Puppies** come out front-facing and often on a sketchbook page with spiral binding; crop the
  spiral off (`crops.json`).

## Animation

One painted pose per sprite (Jimothy has four more), animated in code (`src/render/scene.ts`): hops (crickets), waddles
(possum), bounding (squirrel), bobbing flight (crow), scurrying (rat), squash and stretch, a
belly-up flop for playing dead, a hop-off for "shooed", the pile shrinking toward its base.

Ambient touches, also in code: a few fireflies drifting and blinking over the field, a pink
heart floating up off the pile with each delivery, and a soft vignette on the background layer.
Reduced motion turns off the fireflies and hearts.

Rewards, in code too: each delivery's cookie (the `snack` sprite) arcs from the pile to the HUD's
snack counter; an arrival chain shows as a "×N" bubble in paper and ink over the pile (orange
text, pink from 10) and bursts garbage-coloured confetti every tenth. Distracted defenses: the
dog bounds after its squirrel with hearts, the neighbor swings at the sky with a "?!", the
light's beam narrows onto the possum; a pink dial with a paper heart counts the distraction down.
Pink (`#ff7fae`) means love throughout. Reduced motion keeps the bubble and dials but drops the
pops, the flying cookies, the bounding and the confetti.
