# Jimothy Crickets

A **reverse tower defense** game inspired by our Seattle-local friend Jimothy, the famous raccoon
with short spine syndrome.

You play as Jimothy. You and your troupe — the crickets, and whatever other neighborhood critters
you can talk into joining — storm the humans' base and take back the garbage pile. The humans have
built defenses to protect it. Your job is to grow the troupe, upgrade it, and send it down the
lanes until the pile is yours.

The style is cute, friendly, all-ages, simple (even simplistic), approachable. The goal is to
highlight our friend Jimothy while providing mildly strategic entertainment. The "twist" is not in
the gameplay or the intricacy — it's in the design, the Jimothy-and-friends concept, and the
simplicity, while still being fun to play.

---

## The premise

The humans keep the good garbage behind a fence. Jimothy has decided this is unacceptable. Over the
course of a campaign, he recruits a troupe of small friends and marches, level by level, deeper into
human territory, toward bigger and better piles.

Tone notes:

- Nobody gets hurt. Defeated units wander off, get shooed away, get startled, take a nap. No blood,
  no death language, no "kill" in player-facing text.
- The humans are obstacles, not villains. Mostly they're bewildered.
- Jimothy's short spine is part of who he is, drawn with affection, never a punchline or a
  gameplay penalty.

---

## Gameplay

### Genre

Reverse tower defense (attacker-side TD). The towers are the enemy; the player controls the wave.

### Core loop, moment to moment

1. A level presents a map with one or more fixed **lanes** running from the troupe's staging area to
   the humans' garbage pile.
2. The human defenses are **already placed and fixed** at level start. The player does not fight a
   human opponent — the layout is authored, not adaptive.
3. The player spends an in-level resource to **send units** down the lanes. Units auto-walk their
   lane, take hits from defenses, and attack the pile when they arrive.
4. Resource accrues over time (and possibly from units reaching the pile — see open questions).
5. The level is won when the garbage pile's health is depleted.

The strategy lives in **composition, timing, and lane choice**: which units, in what mix, how
bunched up, down which lane. Not in unit micromanagement — once a unit is sent, it walks.

### Soft fail

**There is no losing.** If a run stalls out, the level simply ends and the player can try again
immediately, with nothing lost and nothing taken away. No lives, no game-over screen, no punishment
language. A stalled attempt should read as "the crickets got tired, let's go again," not as failure.

This is deliberate — it fits the all-ages tone, and it means difficulty can ramp without ever
becoming a wall. It also removes a whole category of design work: there is no fail condition to
tune, and retry is always one button.

### Lanes

Lane count is one of the campaign's difficulty levers:

- **Early levels: one lane.** The only decisions are unit mix and timing. This is the simplest
  possible version of the game and is what gets built first.
- **Later levels: up to three lanes.** Lane choice becomes a real decision — split the troupe, feint
  down one lane, overwhelm another.

The engine should treat lane count as level data from day one (a one-lane level is just a level with
one lane), even though early levels only ever use one. Multi-lane levels come later in the campaign
and later in the build order.

### The troupe (attacking units)

Sketch, not final. Each unit should be readable at a glance and fill one obvious role.

| Unit | Role | Idea |
|---|---|---|
| Cricket | Cheap swarm | Fast, fragile, sent in bunches. The bread and butter. |
| Possum | Tank | Slow, soaks damage, plays dead to shrug off a hit. |
| Crow | Air / bypass | Flies over some ground defenses. |
| Squirrel | Fast flanker | Sprints, hard for slow defenses to track. |
| Rat | Sapper | Chews through a defense rather than walking past it. |

**Jimothy is not a unit.** He is the player — the commander, not a piece on the board. There is no
hero unit to steer, no directly-controlled character, and no active abilities. Every unit on the
field auto-walks its lane; the player's only verbs are *which unit, which lane, when*.

This is a firm scope decision. It keeps the game to a single input mechanic and avoids building a
whole second control system alongside the lane-sending one. Jimothy still appears constantly — in
the UI frame, in level intros, in the staging area, cheering at the edge of the map — he just isn't
something you move.

### The humans (defenses)

Hardcoded per level. They exist to set difficulty, and that's their whole job — there is no human
economy, no adaptive AI, no defense-placement logic to write. Each level's layout is authored data.

Sketch of defense types:

- **Sprinkler** — continuous light damage in a radius; slows units.
- **Motion light** — reveals and briefly stuns units in a cone.
- **Yard dog** — high single-target damage, but only covers a short stretch of lane.
- **Fence / gate** — a hard obstacle that must be chewed through or routed around.
- **Neighbor with a broom** — mid-range, shoos units backward down the lane.

### Levels and difficulty

- The campaign is a sequence of **authored levels**. Each level is a data file: lane layout, defense
  placements, pile health, starting resources, available units.
- Difficulty ramps by hand across the campaign — more defenses, meaner mixes, tighter resource
  budgets, longer lanes, and eventually more lanes. There is no difficulty algorithm to design; the
  ramp is just how the levels are authored.
- Levels should be short. Target a few minutes each.
- Because failure is soft, the ramp can be steeper than it could be in a game with lives. A level
  that takes three attempts is fine.

### Progression

Progression is **persistent across the campaign**:

- Clearing a level can **recruit a new friend** (unlocking a unit type for all future levels).
- Clearing a level awards a meta-currency spent on **permanent upgrades** to the troupe (cricket
  health, crow speed, cheaper possums, faster resource trickle).
- This requires a **save system** — the campaign state persists between sessions.

Each level also has an **in-level economy** that resets every attempt, used to send units during the
round. The persistent layer decides *what* you can send and how strong it is; the in-level layer
decides *when* and *how much*.

---

## Art direction

**Hand-drawn / storybook.** Soft shapes, chunky confident outlines, warm picture-book palette. Think
a children's book about a raccoon, animated lightly. Not retro pixel art, not corporate flat vector.

- Characters read clearly at small sizes — silhouette first, detail second.
- Animation can be minimal and charming (a few frames, squash and stretch, a bob-walk) rather than
  fluid and expensive.
- Backgrounds are alleys, back yards, cul-de-sacs, a dumpster lot behind a strip mall. Pacific
  Northwest: damp, mossy, evergreen, overcast.
- UI matches: rounded, friendly, large touch-friendly targets, minimal text.

Concept art lives in [`concept-art/`](concept-art/) (SDXL-Turbo; see its README). The game currently
draws placeholder characters with canvas paths; final assets and a style guide come with milestone M5
of the [implementation plan](docs/implementation-plan.md).

---

## Tech

- **Platform:** browser-first. Deployable as a static site.
- **Language:** TypeScript.
- **Rendering:** **hand-rolled HTML5 canvas.** No Phaser, no game engine. A small `requestAnimationFrame`
  loop, a fixed-timestep update, and a draw pass. The game is sprites walking along paths and a
  handful of UI elements — an engine would be more surface area than the whole game.
- **Input:** mouse/touch. Should be playable on a phone, but desktop browser is the primary target.
- **Persistence:** local (e.g. `localStorage`) to start. No accounts, no server, no network calls.
- **Dependencies:** keep them near zero. A bundler and a test runner; not much else.

Design constraints that follow from this:

- Levels are **data**, not code. A level should be a JSON/TS data file an agent (or a human) can
  author without touching the engine.
- Unit and defense definitions are likewise data-driven: stats in tables, behavior in a small number
  of shared systems.
- The game must be runnable and inspectable headlessly so an agent can verify its own changes.

---

## Current status

Being built. [`docs/implementation-plan.md`](docs/implementation-plan.md) is the build plan, and its
milestone section tracks progress. The whole campaign is playable in the browser:

- **20 levels in 4 areas** (alley, back yards, cul-de-sac, strip mall), one to three lanes, all five
  friends and all five defenses. Every level has a stored winning solution that CI replays, and a
  difficulty-curve check keeps each area's ramp in order.
- **The full loop:** in-level snacks, unit bar with press-and-hold, lane buttons, night timer,
  moons, the soft "night ends" card, recruits, acorns, the upgrade shop, saves with an
  export/import code, settings, a tutorial, and first-time pictures of new defenses and friends.
- **Every input:** touch, mouse, keyboard (1–5, Q/W/E, arrows, Esc) and gamepad (Steam Deck).
- **Sound:** CC0 effects and a music loop per area (`art/audio/LICENSES.md`); the animals'
  voices are synthesized.
- **Offline:** installable as a PWA; a service worker precaches the game.
- **Native shells:** a Tauri desktop app (built here: a 1.6 MB Linux `.deb`) and Capacitor Android
  and iOS projects. A GitHub workflow builds all of them; Android and iOS can't be built on this
  machine.
- **Placeholder art**, drawn in code. Real art is milestone M5 and needs Zach to pick the style.

Where the open questions below needed an answer to build anything, the build uses the plan's
proposed answers (§6 of the plan) as working defaults. They stay open until Zach confirms them.

### Development

```bash
npm install
npm run dev                                     # play at http://127.0.0.1:5173
npm test                                        # sim, data and save unit tests
npm run sim -- --level 1-3 --replay reference   # headless run, JSON out
npm run sim -- --all --report                   # every level: reference + bot
npm run sim -- --all --curve                    # difficulty ramp per area
npm run tune                                    # balance table: plain bot vs. best strategy
node tools/lanes.ts 3-4                         # which defenses cover which lane
npm run test:e2e                                # Playwright browser tests
npm run build                                   # static site in dist/
node tools/make_icons.ts                        # re-render app icons and splash screens
```

Debug URL parameters: `?level=1-3` jumps into a level, `&replay=reference` plays its stored
solution, `&speed=8` runs fast, `&skipIntro`, `?unlock=all` opens every level on the map,
`?stress` runs a full swarm for performance checks, and `?debug` shows frame timing.

Native shells live in `platforms/` with their own `package.json`; see the plan's §2.

Rough order of work:

1. Scaffold the TS project and the bare canvas loop.
2. Get one lane, one unit type, one defense type, and a pile moving on screen with placeholder art.
3. Turn level content into data files; build a second level to prove the format.
4. In-level economy and the send-units UI. Retry flow (soft fail) falls out of this.
5. Campaign wrapper: level select, persistent unlocks, upgrades, save/load.
6. Multi-lane levels and the later-campaign difficulty ramp.
7. Swap in real art and sound.

---

## Open questions

Things a future agent (or Zach) should resolve before or during implementation. Answer them here as
they're decided. Do not reopen a settled decision — see below.

**Design**

1. **In-level resource.** What generates it? Passive trickle only, or do units that reach the pile
   bring garbage back? The latter creates a nice risk/reward loop but complicates unit lifecycle.
2. **When do lanes go from one to three** — at fixed campaign milestones, or gradually? Does a level
   ever have two?
3. **Are there per-level upgrades**, or only campaign-level ones? (Currently assumed: campaign
   only, plus the in-level send economy.)
4. **Campaign length.** How many levels for a v1 that feels complete? 10? 20?
5. **Star/score rating per level** for replay value, or plain pass/complete? Note this interacts
   with soft fail — a rating gives players a reason to replay without ever telling them they lost.
6. **What happens to defeated units** — gone for the rest of that attempt, or do they trickle back?
7. **How does a stalled attempt actually end?** Soft fail means no lose condition, but something has
   to decide the attempt is over and offer a retry — probably "no units on the field and not enough
   resource to send one." Needs to be pinned down.

**Production**

8. **Audio.** In scope for v1? Sourcing music and SFX is real work; the game reads fine muted.
9. **Asset pipeline.** How does concept art from the external tool become in-game sprites — manual
   export, or is there a step to automate?
10. **Deployment target.** GitHub Pages, or somewhere else?

---

## Settled decisions

These are decided. Don't relitigate them without asking Zach first.

| Decision | Ruling |
|---|---|
| Genre | Reverse tower defense — player attacks, humans defend |
| Fail state | Soft fail only. No lives, no game over, retry always available |
| Lanes | One lane early; ramps to a maximum of three later in the campaign |
| Hero unit | **No.** Jimothy is the commander, not a controllable unit |
| Rendering | Hand-rolled HTML5 canvas. No Phaser, no engine |
| Language / platform | TypeScript, browser-first, static site |
| Progression | Persistent campaign unlocks and upgrades, plus a per-attempt in-level economy |
| Art direction | Hand-drawn / storybook |
| Human side | Fully authored per level. No adaptive AI, no defense-placement logic |
| Jimothy's likeness | No permission needed — he's a wild animal, not owned by anyone |
| Pricing | Free and non-commercial on every platform: no price, ads or in-app purchases |
