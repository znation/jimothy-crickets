# Jimothy Crickets — Implementation Plan

Status: **in progress.** The whole campaign is playable on the web with placeholder art: M1, M3
and M7 are built, and M2, M4, M6 and M8 are built except for the parts that need real devices,
store accounts or a playtest. M5 (real art) hasn't started; it needs Zach to pick the style. See
[§13](#13-milestones) for what's done and what's left in each milestone. The §6 proposals are used
as working defaults until Zach confirms or changes them.

This plan turns the design brief in [`README.md`](../README.md) into a build order. It covers how
the game ships to every platform we can reasonably reach (browser, phones, tablets and desktop)
from **one codebase**. It also covers how the concept art in [`concept-art/`](../concept-art/)
becomes the art you see in the game.

It follows every row of the README's **Settled decisions** table. Where the README lists an **open
question**, this plan gives a *proposed* answer, marked **Proposal**. Those answers are
recommendations for Zach to accept or change, not decisions. They are collected again in
[§14](#14-decisions-needed-from-zach).

**Decided since the README: the game is free and non-commercial.** It has no price, no ads, no
in-app purchases and no revenue of any kind, on every platform. This shapes the store plan (§2.2,
§12.3) and the licensing checks (§8.5, §9).

---

## Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [Platform strategy](#2-platform-strategy)
3. [Cross-platform design constraints](#3-cross-platform-design-constraints)
4. [Architecture](#4-architecture)
5. [Game systems specification](#5-game-systems-specification)
6. [Proposed answers to the open questions](#6-proposed-answers-to-the-open-questions)
7. [Campaign outline](#7-campaign-outline)
8. [Art plan: from concept art to shipped sprites](#8-art-plan-from-concept-art-to-shipped-sprites)
9. [Audio](#9-audio)
10. [UI and UX](#10-ui-and-ux)
11. [Testing and verification](#11-testing-and-verification)
12. [Build, CI and release](#12-build-ci-and-release)
13. [Milestones](#13-milestones)
14. [Decisions needed from Zach](#14-decisions-needed-from-zach)
15. [Risks](#15-risks)

---

## 1. Goals and non-goals

**Goals**

- A complete, charming v1 campaign: short levels, soft fail, persistent unlocks and upgrades.
- **One TypeScript + canvas codebase** that runs unchanged as:
  - a static website (the primary target, per the README)
  - an installable, offline-capable PWA
  - native iOS and Android apps (phone and tablet)
  - native Windows, macOS and Linux apps, including Steam and the Steam Deck
- Every level can be played headlessly, so CI and agents can check their own changes.
- A repeatable pipeline that turns the SDXL-Turbo concept art into consistent in-game sprites.

**Non-goals for v1**

- Revenue of any kind: no price, ads, in-app purchases, tips gate or paid tier. The game is free
  and non-commercial.
- Accounts, servers, multiplayer, leaderboards, analytics. The game makes
  **no network calls** (README tech section). That also makes store privacy declarations trivial.
- A game engine. The README rules out Phaser or similar, and nothing in this plan needs one.
- Consoles. Gamepad input is planned (see §3.4) so the Steam Deck works, but Switch, Xbox and
  PlayStation ports are out of scope.
- A level editor UI. Levels are hand-written data files (README).

---

## 2. Platform strategy

### 2.1 Principle: one web build, thin native shells

Everything ships the **same static `dist/` bundle**. Native platforms wrap it in a webview shell
that contains no game logic. The game runs identically everywhere, and every bug can be reproduced
in a desktop browser.

```
                  ┌───────────────── dist/ (static site: HTML + JS + atlases) ─────────────────┐
                  │                                                                            │
   GitHub Pages / itch.io     PWA (same site + manifest + service worker)                      │
                  │                                                                            │
         Capacitor shell ──► iOS (iPhone, iPad) · Android (phone, tablet, Chromebook)          │
                  │                                                                            │
           Tauri shell ──► Windows · macOS · Linux ──► Steam (incl. Steam Deck), itch.io app   │
                  └────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Target matrix

| Target | Packaging | Store / channel | Cost | Priority |
|---|---|---|---|---|
| Desktop browser | static site | GitHub Pages (+ itch.io HTML5 page) | free | **P0**, the primary target |
| Mobile and tablet browser | same static site | same | free | **P0** |
| Installable PWA | manifest + service worker | browser "Add to Home Screen"; optionally Microsoft Store via PWABuilder | free | P1 |
| Android phone and tablet | Capacitor | Google Play (and itch.io APK) | $25 one-time | P1 |
| iOS / iPadOS | Capacitor | App Store | $99/year | P1 |
| Windows, macOS, Linux | Tauri | itch.io downloads, Steam | Steam: $100 per app | P2 |
| Steam Deck | Tauri Linux build, gamepad input | Steam ("Verified" review) | included | P2 |

Because the game is free, **store fees are pure cost and are never recouped.** Steam's $100 fee
is normally refunded after $1,000 in sales, which a free game never reaches. Apple's $99/year has
no fee waiver for individual developers. The free channels (web, PWA, itch.io, and itch.io's
sideloadable Android APK and desktop downloads) reach every platform except iPhones and iPads
without a browser. The App Store is the only way to put a native app on those, but the PWA covers
them in the browser. So the paid stores are optional reach, decided per store (§14), not
requirements.

P0 ships at the end of the core build. P1 follows once the campaign is content-complete. P2 comes
last. **Each shell gets a smoke build early** (milestone M2), so platform problems surface while
they are cheap to fix, not at launch.

### 2.3 Why Capacitor and Tauri

- **Capacitor** (mobile): it is mature and loads a bundled local web app with no server. It has
  official plugins for the few native hooks we need: preferences/storage, status bar, haptics,
  screen orientation and app lifecycle. The game ships offline-first inside the app.
- **Tauri** (desktop): its installers are a few MB because it uses the OS webview, where Electron
  bundles a whole Chromium (~100 MB). That suits a small 2D game.
  - **Known caveat:** on Linux, Tauri uses WebKitGTK, whose canvas performance and audio have
    historically lagged Chromium's. The Steam Deck is Linux.
  - **Mitigation:** benchmark it in M2. If WebKitGTK can't hold 60 fps on the Deck, ship the
    Linux/Steam build with **Electron** instead. The shell is thin by design, so that swap costs
    about a day. Windows (WebView2) and macOS (WKWebView) are fine either way.
- Tauri 2 can also target mobile, but its mobile support is younger than Capacitor's. Using both
  tools costs little, because neither contains game code.

### 2.4 Keeping the README's "near zero dependencies" rule

The **game** (`src/`) depends on nothing at runtime. Its dev dependencies are a bundler (Vite), a
test runner (Vitest) and TypeScript. Playwright is added as a dev-only dependency for browser tests.

The native shells live in `platforms/` with **their own `package.json` / `Cargo.toml`**. Capacitor
and Tauri are therefore never dependencies of the game itself, and deleting `platforms/` leaves a
fully working web game.

---

## 3. Cross-platform design constraints

These constraints shape the engine from day one. Retrofitting them later is expensive.

### 3.1 Resolution, aspect ratio and orientation

- **Logical world:** a fixed 1920 × 1080 coordinate space. Every level, lane, defense position and
  sprite size is authored in these units.
- **Fit:** scale the world uniformly so the 16:9 **core playfield** always fits on screen, centered.
- **Bleed:** level backgrounds are painted larger than 16:9 (to 2400 × 1350 logical) so wider and
  taller screens show more scenery, never black bars. *Correction found while building:* 2400 wide
  only reaches about 2.2:1 at full height. A 2560 × 1080 ultrawide shows about 2560 logical units
  across, so painted backgrounds need about **2600 × 1350**. The placeholder backgrounds are
  procedural and simply paint whatever is visible. This covers:
  - 21:9 ultrawide monitors
  - 19.5:9 phones
  - 16:10 laptops and the Steam Deck
  - 4:3 iPads
- **UI** is anchored to screen edges and safe areas, not to the playfield. HUD elements therefore
  move into the bleed on wide screens and over the playfield edges on narrow ones.
  - On a 667 × 375 phone the HUD covers about y < 190 and y > 810 of the playfield. So lanes,
    defenses and the pile must stay inside **y 220–780**. `validate_data` enforces this band.
- **UI technology (decided while building):** the playfield is canvas; everything you tap (HUD,
  cards, menus) is **DOM over the canvas**. Buttons get focus rings, keyboard access, screen-reader
  labels and crisp text for free, and Playwright can find them by role and name.
- **Orientation: landscape only.**
  - Lanes run left to right: the troupe on the left, the pile on the right.
  - The concept art is side-view, which is how Jimothy's round body, missing neck and nub tail read
    best (`concept-art/README.md`). A portrait layout would need lanes running vertically and
    top-down art, which loses that.
  - Native shells lock to landscape. In a portrait mobile browser, show a friendly full-screen
    "turn your phone sideways" card, with Jimothy tipping over sideways.
- **Pixel density:** size the canvas backing store at `devicePixelRatio`, **capped at 2**. Ship
  sprite atlases at 2× logical size. A 3× phone gains nothing visible from 3× art and would pay for
  it in memory and fill rate.

### 3.2 Input

One **pointer** abstraction built on Pointer Events, so mouse, touch and pen behave the same. The
whole game uses only these verbs:

- **tap** a button
- **tap** a lane (on multi-lane levels, choose where to send)
- **press and hold** a unit button to queue a stream of units
- **drag** to pan, only if a later level is wider than the screen. Avoid this if possible.

Rules:

- **No hover-dependent information.** Touch screens have no hover. Tooltips appear on long-press,
  and desktop shows them on hover as a bonus.
- Touch targets are **at least 48 × 48 CSS px** (Android) and **at least 44 pt** (iOS). Design to
  56 px for small hands.
- Desktop keyboard shortcuts, as an optional extra:
  - `1`–`5` select a unit
  - `Q` `W` `E` choose a lane
  - `Space` sends
  - `Esc` pauses
- **Gamepad** (needed for Steam Deck "Verified"; M7):
  - D-pad / left stick moves a focus ring across the unit bar and lanes
  - `A` sends, `B` goes back, `Start` pauses
  - Because the game has so few verbs, this is a small amount of work.
- Never rely on right-click, double-click or multi-touch gestures.

### 3.3 App lifecycle

- **Auto-pause** when the game loses focus or goes to the background:
  - browser: `visibilitychange` and `blur`
  - Capacitor: `App.pause`
  - Tauri: window blur
- **Stop the `requestAnimationFrame` loop entirely while hidden or paused.** This saves battery.
  Menus may render at 30 fps.
- Clamp a long frame gap after resume so the fixed-timestep loop doesn't "catch up" by simulating
  minutes of play in one frame.
- **Save on every level end and every progression change**, never only on exit. Mobile OSes kill
  backgrounded apps without warning.

### 3.4 Storage durability

`localStorage` alone is **not durable everywhere**. Safari can evict a website's storage after
about 7 days without a visit, and webviews can be cleared. So all saves go through a `SaveStore`
adapter (§4.4):

| Platform | Backing store |
|---|---|
| Browser / PWA | `localStorage`, plus a `navigator.storage.persist()` request; an IndexedDB mirror is optional |
| Capacitor | `@capacitor/preferences` (native key-value storage that survives webview clears) |
| Tauri | a JSON file in the OS app-data directory. Steam Auto-Cloud can sync that directory with no code. |

Also add a **save export/import code** in Settings: a short base64 string. It lets players move
progress between devices with no accounts, and it is a support tool if a save is lost.

### 3.5 Performance budget

- **Target 60 fps on a ~2019 mid-range Android phone** and on an iPad (6th generation). Below
  that, degrade gracefully (§11.5).
- Canvas 2D only; no WebGL. Expect at most a few hundred sprites on screen; the swarm cap is set in
  data.
- Pre-render each level's static background once to an offscreen canvas. Draw sprites from atlases
  with `drawImage` from source rectangles. No per-frame allocations in the hot loop; pool units and
  projectiles.
- **Download budget:**
  - first playable load (code + menu + area 1) under **8 MB**
  - whole game under **40 MB**
  - Backgrounds load per area.
  - All shipped images are **WebP**, which every target webview supports. The PNG originals stay in
    Git LFS.

### 3.6 Audio

The Web Audio API, with one shared `AudioContext` unlocked by the first user gesture (required by
iOS Safari and by autoplay policies everywhere). Respect the iOS silent switch. Mute on background.
Music and sound effects get separate volume sliders.

### 3.7 Text and localization

- The README asks for minimal text. All player-facing strings still live in **one string table**
  (`src/data/strings/en.json`) from day one, so translation later is a data change.
- Use the system font stack plus **one bundled rounded display font** (e.g. a SIL OFL font such as
  Baloo 2 or Fredoka) for titles and numbers.

### 3.8 Accessibility

- **Reduced motion:** honor `prefers-reduced-motion` plus an in-game toggle. It turns off screen
  shake and squash-and-stretch exaggeration.
- **Colour:** lanes and unit roles are distinguished by **shape and icon as well as colour**. Check
  the palette with a colour-blindness simulator.
- **Game speed:** a 1× / 2× toggle, plus a slower 0.75× "relaxed" speed for young players.
  Pause is always available.
- Readable minimum text size, and a large-text toggle.

---

## 4. Architecture

### 4.1 Repository layout

```
/
├─ README.md                    design brief (source of truth for design)
├─ docs/
│  ├─ implementation-plan.md    this document
│  └─ style-guide.md            art bible (M5)
├─ concept-art/                 existing SDXL-Turbo concept art and generators
├─ art/                         production art sources (Git LFS)
│  ├─ prompts/                  sprite and background prompt sets (data)
│  ├─ raw/                      model output, never hand-edited
│  └─ curated/                  picked + touched-up PNGs: the source of truth for shipped art
├─ tools/
│  ├─ asset_gen/                SDXL-Turbo sprite and background generation (from generate_sdxl.py)
│  ├─ build_atlas.ts            curated PNGs → WebP atlases + JSON frame maps
│  ├─ sim.ts                    headless level runner CLI
│  └─ validate_data.ts          schema and reference checks for all data files
├─ src/
│  ├─ sim/                      pure game logic; no DOM, no canvas, no timers
│  ├─ render/                   canvas drawing, camera/fit, sprite atlas, tweened animation
│  ├─ ui/                       screens, HUD, buttons, focus/gamepad navigation
│  ├─ platform/                 adapters: save, audio, lifecycle, haptics, orientation
│  ├─ data/                     units, defenses, upgrades, levels, strings (JSON)
│  ├─ app.ts                    wiring: main loop, screen stack
│  ├─ play.ts                   one attempt: sim + inputs + fixed-timestep accumulator + replay
│  ├─ save.ts                   save format, migrations, SaveStore
│  └─ main.ts                   entry point; picks platform adapters
├─ public/                      PWA manifest, icons, service worker
├─ tests/                       Vitest unit/sim tests, Playwright browser tests
└─ platforms/
   ├─ capacitor/                iOS + Android projects (own package.json)
   └─ tauri/                    desktop shell (own Cargo.toml, package.json)
```

### 4.2 The simulation/render split

This is the most important structural rule.

- **`src/sim` is pure and deterministic.**
  - Its whole interface is `step(state, inputs, dt) → state'` plus events.
  - It never touches the DOM, `Date.now()`, `Math.random()` or `requestAnimationFrame`.
  - Randomness (e.g. small variation in cricket speed) comes from a **seeded PRNG** stored in the
    state.
- **Fixed timestep:** the sim always advances in 1/60 s ticks. The render loop accumulates real
  time, runs as many ticks as are owed (capped), then draws, interpolating positions between the
  last two ticks.
- **Inputs are data:** `{ tick, action: "send", unit: "cricket", lane: 1 }`. A whole attempt is
  therefore a seed plus an input list, which can be replayed exactly. This underpins headless
  testing (§11), level-solvability checks, bug reports ("attach the replay") and the balance tools.
- **The sim emits events** (`unitSent`, `defenseFired`, `unitShooed`, `pileHit`, `levelWon`,
  `nightEnded`). Render, UI, audio and haptics *subscribe* to them; the sim never calls them.
  Effects are pure presentation.

### 4.3 Data-driven content

Units, defenses, upgrades and levels are JSON files validated against TypeScript types at build
time by `tools/validate_data.ts`. They are also validated in CI.

```ts
// src/sim/types.ts (sketch)
type UnitId = "cricket" | "possum" | "squirrel" | "crow" | "rat";
type Tag = "ground" | "air" | "sapper";

interface UnitDef {
  id: UnitId;
  cost: number;            // in-level currency ("snacks")
  hp: number;
  speed: number;           // logical px / s along the lane
  pileDamage: number;      // dealt on arrival
  haul: number;            // snacks returned on arrival (see §6)
  sendCooldown: number;    // s between sends of this unit type
  tags: Tag[];
  traits?: {               // a small closed set of shared behaviors
    playDead?: { chance: number; ignoreHits: number };
    sapper?: { chewDps: number };
  };
  sprite: string;          // atlas key
}

interface DefenseDef {
  id: "sprinkler" | "motionLight" | "yardDog" | "fence" | "broomNeighbor";
  targets: Tag[];          // e.g. the sprinkler hits ground only; the crow flies over it
  shape: { kind: "radius"; r: number } | { kind: "cone"; r: number; arcDeg: number; facingDeg: number };
  effect: {
    damage?: number;       // "startle" points, never "damage" in player-facing text
    rate?: number;
    slow?: { factor: number; secs: number };
    stun?: { secs: number };
    pushback?: { px: number };
    blocks?: { hp: number };   // fence: lane is blocked until chewed through
  };
  sprite: string;
}

interface LevelDef {
  id: string;              // "1-3"
  area: "alley" | "backyards" | "culdesac" | "stripmall";
  background: string;
  lanes: { id: number; points: [number, number][] }[];   // polylines in logical px
  pile: { pos: [number, number]; hp: number };
  defenses: { def: DefenseDef["id"]; pos: [number, number]; facingDeg?: number; lane?: number }[];
  economy: { startSnacks: number; trickle: number };      // trickle: snacks / s
  nightLength: number;                                      // s; see §6
  unitsAvailable?: UnitId[];   // default: everything unlocked in the campaign
  moons: [number, number, number];   // seconds of night remaining needed for 1/2/3 moons
  intro?: { textKey: string; art?: string };
}
// Built: each level's reference solution lives in src/data/references.json (keyed by level id,
// [tick, unit, lane] tuples), written by `npm run sim -- --make-reference`. That keeps the
// hand-written level files short and lets the tool rewrite references without touching them.
```

**Behaviors are a small closed set of shared systems, not per-unit code**:

- movement along the lane
- targeting by tag
- effects (slow, stun, push back, block)
- the sapper (chewing) trait
- the play-dead trait

New content should almost always be new *data*. A new *system* is the exception and needs a reason.

### 4.4 Platform adapters

```ts
// src/platform/types.ts (sketch)
interface Platform {
  save: { load(): Promise<string | null>; store(json: string): Promise<void> };
  lifecycle: { onPause(cb: () => void): void; onResume(cb: () => void): void };
  haptics?: { tap(): void; bump(): void };        // Capacitor only; no-op elsewhere
  orientation: { lockLandscape(): Promise<void> }; // no-op where unsupported
  quit?: () => void;                                // desktop only ("Quit" menu item)
  kind: "web" | "pwa" | "ios" | "android" | "desktop";
}
```

`main.ts` detects the environment (`window.Capacitor`, `window.__TAURI__`, else web) and injects
the matching implementation. **Only `src/platform/` may contain platform-specific code.** A lint
rule or a grep check in CI enforces this.

### 4.5 Save format

```json
{
  "version": 1,
  "unlockedUnits": ["cricket", "possum"],
  "upgrades": { "cricket.hp": 2, "trickle": 1 },
  "acorns": 14,
  "levels": { "1-1": { "moons": 3, "cleared": true }, "1-2": { "moons": 1, "cleared": true } },
  "settings": { "music": 0.7, "sfx": 1.0, "reducedMotion": false, "speed": 1 }
}
```

- The save is versioned, and every format change gets an explicit **migration** function, tested
  against fixture saves from each past version.
- Unknown or corrupt saves are backed up under a separate key, never silently overwritten.
- "Acorns" is a placeholder name for the meta-currency (§6).

---

## 5. Game systems specification

This section is a first-pass spec. All numbers are placeholders to be tuned in M4.

### 5.1 Lanes and movement

- A lane is a polyline in logical pixels, from the staging area (left) to the pile (right).
- Each unit stores **distance along its lane**, `s`. Position is derived from `s`, so movement,
  push back and "how far along" checks are all just arithmetic on `s`.
- Units on the same lane don't collide. A small per-unit vertical jitter, fixed per unit from the
  seed, keeps swarms readable without any physics.
- Flying units (the crow) use the same lane path, drawn higher with a shadow on the ground.
  Defenses whose `targets` don't include `air` ignore them.

### 5.2 Defenses

- A defense's coverage is precomputed per lane at level load, as **the `s` intervals where the
  lane passes through the defense's radius or cone**. At runtime, "is this unit in range?" is then
  an interval check.
- **Targeting:** the unit furthest along (largest `s`) that the defense can hit. This is simple and
  predictable, and players can learn it.

| Defense | Behavior | Counter |
|---|---|---|
| **Sprinkler** | Area-of-effect "startle" ticks plus a slow, in a radius | Crows (fly over); possums (soak it) |
| **Motion light** | Cone; stuns everything that enters, then has a cooldown | Bunch units up after it fires; send a cheap cricket first to trip it |
| **Yard dog** | High single-target startle; short lane coverage | Swarm it with crickets; squirrels sprint past |
| **Fence / gate** | Blocks the lane at an `s` until its hp is chewed to 0. Ground units queue behind it. | Rats chew it; crows fly over it |
| **Neighbor with a broom** | Mid-range; pushes the target back by `px` | Possums (heavy, so reduced push back); a steady stream of units |

### 5.3 Units

| Unit | Role | Signature trait |
|---|---|---|
| Cricket | cheap swarm | Low cost and low hp; a press-and-hold sends a stream |
| Possum | tank | High hp, slow. `playDead`: when hit, there's a chance it flops over, ignores the next N hits, then gets back up. |
| Squirrel | fast flanker | High speed, low hp; defenses with slow turn/fire rates often miss it |
| Crow | air | `air` tag; ignores ground-only defenses and fences |
| Rat | sapper | Stops at a fence (or adjacent defense) and chews it, disabling it; low pile damage |

### 5.4 Pile

- The pile has hp. Units that reach it deal `pileDamage` and are then removed ("wanders off with a
  snack").
- The pile visibly shrinks in about 5 stages as its hp drops, which is the main progress feedback.

### 5.5 Being shooed (never "dying")

- When a unit's startle points reach 0, it is **shooed**: the sim removes it at once. Render plays a
  short "startled hop off-screen" or "curls up for a nap" tween.
- Per-unit visual variety is cosmetic only.
- Player-facing text uses only *shooed*, *startled*, *wandered off* or *napping*. Words like kill,
  die, dead, destroy or health are never shown to the player. Code may use `hp` internally.
- A CI test greps the string table for a deny-list of such words.

### 5.6 Win and end of attempt

- **Win:** pile hp reaches 0. Celebration, moons awarded (§6), acorns awarded, any recruitment
  shown, then continue.
- **End of night (soft end):** see §6, Q7. There is no loss screen, only "Great try — go again?",
  which is the default focused button, plus "Back to map".

---

## 6. Proposed answers to the open questions

Each answer below is a **Proposal**. It aims to be the simplest choice that still gives the design
something to play with.

**Q1 — In-level resource.** **Proposal: passive trickle plus a "haul" bonus on arrival.**

- The resource is **snacks**. They trickle in over time.
- A unit that reaches the pile also adds its `haul` to the snack total *at the moment it arrives*.
  It then wanders off. It does **not** walk back.
- This gives the risk/reward loop the README likes (get units through, earn more), without a
  return-trip lifecycle, a second movement direction or carried-item state.
- If playtesting shows that snowballing is too strong, set `haul` to 0 per unit, or per level.

**Q2 — When lanes go from one to three.** **Proposal: at area boundaries, through two.**

- Area 1 (levels 1-1 to 1-5) has one lane, area 2 has two, and areas 3–4 have up to three.
- Two lanes are worth having: two-lane levels teach "split vs. focus" before three-lane levels add
  feints.
- Every area's first level is a gentle introduction to its lane count.

**Q3 — Per-level upgrades.** **Proposal: no.** Keep the README's assumption: campaign upgrades
only, plus the send economy. In-level upgrades would add a second spending UI to every level.

**Q4 — Campaign length.** **Proposal: 20 levels: 4 areas × 5 levels**, matching the README's
backgrounds (alley, back yards, cul-de-sac, strip-mall dumpster lot). At a few minutes per level,
plus retries, that is roughly 2–3 hours: a complete-feeling v1 for an all-ages mobile/web game.
Ship area 1 first as a playable slice (M4).

**Q5 — Ratings.** **Proposal: yes, 1–3 "moons" per level, awarded by how much of the night is
left** when the pile falls.

- Raccoons are nocturnal, so racing the night is on-theme.
- Every clear earns at least one moon.
- Moons are only ever *gained*, which matches the soft-fail tone.
- Acorns awarded scale with your *best* moons per level, and only the improvement pays out, so
  replaying a level to improve it is rewarded without allowing grinding.

**Q6 — Defeated units.** **Proposal: gone for that attempt.** It's simplest, and resource pressure
is the whole strategy. Trickling units back would undermine the economy.

**Q7 — How a stalled attempt ends.** **Proposal: the night ends.**

- Each level has a `nightLength`, shown as a moon arcing across the sky in the HUD.
- If the pile still stands when the sun comes up, the troupe yawns and heads home. The card reads:
  *"The sun's coming up — time for a nap. Try again tonight?"*
- An optional "Call it a night" button in the pause menu ends the attempt early with the same card.
- This needs no stall detection, which can't really work anyway. With a passive trickle you can
  always eventually afford another unit, so the "nothing on the field and no money" condition never
  becomes final.
- It also feeds Q5's rating for free.
- Night length is generous. The reference solution (§11) must win with ≥40 % of the night left on
  1-moon pacing.

**Q8 — Audio in v1.** **Proposal: yes, but small.** See §9. The game must remain fully playable
muted.

**Q9 — Asset pipeline.** **Proposal: semi-automated.**

- SDXL-Turbo generates sprite and background candidates from versioned prompt files.
- A human picks and touches them up into `art/curated/`.
- A build script packs atlases.

See §8.

**Q10 — Deployment target.** **Proposal: GitHub Pages** for the canonical web build. It is free,
and the repo is already on GitHub. Mirror it to itch.io (HTML5) for discovery. Native targets are
listed in §2.

**Naming note:** "snacks" (in-level) and "acorns" (meta) are placeholders. The two currencies need
clearly different names and icons, so children don't confuse them.

---

## 7. Campaign outline

Each area introduces about one new defense and one new friend, so every few levels brings
something new to learn. Recruitment happens on clearing the listed level.

| Area | Levels | Lanes | New defense (first appears) | Recruit on clear |
|---|---|---|---|---|
| 1. The Alley | 1-1 … 1-5 | 1 | Sprinkler (1-1), Broom neighbor (1-3) | Possum (1-2), Squirrel (1-5) |
| 2. Back Yards | 2-1 … 2-5 | 2 | Yard dog (2-1), Motion light (2-4) | Crow (2-3) |
| 3. The Cul-de-sac | 3-1 … 3-5 | 2–3 | Fence/gate (3-2) | Rat (3-1, *before* the first fence) |
| 4. Strip-Mall Dumpster Lot | 4-1 … 4-5 | 3 | combinations; the "big pile" finale | — |

- **Upgrades** (the acorn shop, on the level-select map) are a short flat list with 3 tiers each.
  Examples: cricket hp, possum cost, squirrel speed, crow haul, rat chew speed, snack trickle,
  starting snacks.
- No upgrade is ever required, and every level's reference solution (§11) is checked **with no
  upgrades**. Upgrades make the game easier; they never gate it.
- **Level intros** are one-card storybook moments: Jimothy plus one line of text, using art from
  §8.

---

## 8. Art plan: from concept art to shipped sprites

### 8.1 Pick a production style from the concept set

The README specifies **hand-drawn / storybook**: soft shapes, **chunky confident outlines**, a warm
picture-book palette, and explicitly "not retro pixel art, not corporate flat vector".

The concept art is the SDXL-Turbo set in `concept-art/sdxl/` (`index.html`): 11 subjects × 10
styles. In it, two columns are closest to that brief:

- **Watercolour** (`001`, `011`, `021`, …): the strongest storybook feel. Soft washes, warm
  palette, and Jimothy reads as round and grey.
  - Weakness: outlines are soft and thin, so small sprites may lose their silhouettes.
- **Cel-shaded** (`009`, `019`, `029`, …): the chunky outlines and silhouette clarity the README
  wants at small sizes.
  - Weakness: closer to cartoon than picture book.

**Recommendation: a hybrid "inked watercolour" style.**

- watercolour fills and paper texture, from the watercolour column
- a consistent dark warm-grey ink outline, from the cel-shaded column
- characters: high clarity and outlines
- backgrounds: softer, lower contrast and desaturated, so characters pop. The PNW palette is
  damp, mossy, evergreen and overcast.

Lock this in during M5 by generating a small set of style probes and recording the chosen prompt
lead in `docs/style-guide.md`. **Zach picks the anchor images.**

Notes on the existing set:

- **Premise flip.** The concept art predates the README's reverse-TD premise; it shows Jimothy
  *defending* his pile. The character designs carry over unchanged, and several scenes map neatly
  onto the new premise (table below).
- **Weak plates.** `concept-art/README.md` lists them:
  - `trash-fortress` reads as cardboard-castle alleys rather than a fort built from trash
  - `048` is a robot-like cricket
  - `066` shows a tail
  - some composited plates have a soft halo around the crickets

  Use the other plates in those rows as reference instead.
- **No Qwen art.** An earlier Qwen-Image-2.1 set exists locally but is not in the repo, and must
  never ship (§8.5).

### 8.2 What the existing concept art is used for

| Concept art (`concept-art/sdxl/`) | Use |
|---|---|
| `hero-portrait` (001–010), esp. watercolour `001` | Jimothy **character reference**: the anchor image for Jimothy generations (§8.4); style guide model sheet |
| `cricket-march` (031–040), esp. `031`, `033`, `039` | Cricket reference; the "troupe marching down a lane" read |
| `standoff` (101–110), esp. `101`, `106` | **Composition reference for gameplay**: troupe on the left, humans' pile on the right |
| `trash-fortress` (071–080), esp. `075`, `076` | The **humans' fortified pile**, which fits the flipped premise directly. The weakest row, so expect to redraw it for the pile's 5 shrink stages. |
| `guarding-trash` (021–030), `defender` (081–090) | Jimothy **atop the reclaimed pile**: the level-complete and area-complete art |
| `alley-empty` (051–060) | Area 1 background reference |
| `key-art` (091–100) | Composition reference for title screen and store art (re-render for the new premise) |
| `tower-build` (061–070) | Upgrade-shop art ("Jimothy in a hard hat improving the troupe") |
| `cricket-boss` (041–050) | Not needed in v1; possible area-4 finale visual gag |
| `concept-art/final/` (first SDXL sweep) | Historical reference only; superseded by `sdxl/` |
| `concept-art/reference/` photos | Ground truth for Jimothy's anatomy and colouring |

### 8.3 New art the game needs (none exists yet)

| Category | Items | Notes |
|---|---|---|
| Units | possum, squirrel, crow, rat (+ cricket, finalized) | Side view, facing right, cute and round in the same family as the cricket. Each needs a distinct silhouette. |
| Defenses | sprinkler, motion light, yard dog, fence/gate, broom neighbor | **Humans drawn partially**: e.g. a door ajar with only a slippered foot and a broom poking out, or a window with a bewildered face. Keeps humans as "obstacles, not villains", and sidesteps image models' weakness at friendly human faces. |
| Yard dog | a sleepy, fluffy, *goofy* dog on a lead | Needs to look kind, never menacing |
| Piles | the humans' garbage pile in 5 shrink stages, one per area (4 × 5) | Generated per area, then cropped to a shared footprint |
| Backgrounds | 4 areas at 2400 × 1350 logical, plus 1–2 per-area variants | Lanes are painted as worn paths and drawn *over* by the engine's lane tint, so one background can serve several lane layouts |
| Jimothy | ~6 commander poses (cheer, point, think, nap, celebrate, wave) | The README places Jimothy in the HUD frame, level intros and staging area, not on the field |
| UI | buttons, unit cards, snack and acorn icons, moon icons, pause/settings | Painted in the same style, or drawn in code from rounded shapes plus the display font. Prefer code for anything that has to scale. |
| Story cards | title screen, 4 area intro cards, finale | Wide compositions; also the source for store art |
| Store / marketing | app icon (1024²), Play feature graphic (1024 × 500), Steam capsules (several sizes), screenshots per device class | Mostly crops and layouts of the story cards plus real gameplay screenshots |

Total: roughly **60–80 shipped images**, chosen from **400–600 generated candidates**.

### 8.4 Generation pipeline

The model is **SDXL-Turbo** (4 steps, guidance 0) with **IP-Adapter** for reference images, run
on CPU. The concept-art generator, `concept-art/_tools/generate_sdxl.py`, already has the workflow
production art needs. Generalize it into `tools/asset_gen/` rather than starting over:

- **Candidates, then picks.** Every asset renders several seeds into
  `<set>/_candidates/<asset>/<seed>-<prompt hash>.png`.
  - A human picks one seed per asset, recorded in `picks.json`.
  - An assemble step copies the picks and writes a manifest with the exact prompt, seed and
    settings.
  - The prompt hash means an edited prompt never mixes with old renders.
- **Prompt-length guard.** Both SDXL text encoders keep only 77 tokens and silently drop the rest.
  The script refuses any longer prompt.
- **Regional inpainting for multi-character images:** render the background, then inpaint each
  character into its own region with a prompt that describes only that character.

Two things production art needs that concept art did not, each a **spike at the start of M5**:

- **Character consistency across sprites.** Use IP-Adapter with the chosen anchor plate (e.g.
  `sdxl/001`) as the reference image, instead of the photo. The concept work set its limits:
  - Above ~0.45 the art styles start to wash out, and at 0.42 it already blocked long tails better
    than any wording.
  - The reference brings its *scene* with it. The photo's dirt and grass replaced the garbage pile
    with rocks. Render backgrounds without it, and characters on plain backgrounds.
  - The anchor must show the whole animal. A crop of his hindquarters, inpainted into a small
    region, produced headless rear ends.
- **Transparency.** SDXL has no alpha channel. Generate each sprite "isolated on a plain white
  background" and cut it out.
  - A quick colour-threshold cutout was tried in the concept work and failed: it kept ground bands
    and white boxes.
  - So plan for a proper matting model, such as rembg or BiRefNet (check the license before
    adopting), plus touch-up in Krita.

Pipeline:

```
art/prompts/*.json ──► tools/asset_gen/generate.py ──► art/raw/<set>/_candidates/…  (seeds × prompts)
                         (SDXL-Turbo + IP-Adapter anchor, CPU)
art/raw ──(human picks → picks.json)──► matting ──► art/curated/<name>.png   (touch-ups in Krita)
art/curated ──► tools/build_atlas.ts ──► dist/atlas/<area>.webp + .json
                 (trim, outline-normalize, resize to 2× logical, pack, WebP-encode)
```

Lessons from the concept-art work (eight review passes, ~650 candidates; details in
`concept-art/README.md`):

- **Seeds matter more than wording.** At a fixed seed, rewording barely changes the image.
  Budget **4+ seeds per asset** and pick by eye; that fixed most problems.
- **The style leads the prompt**, and every prompt is a compact keyword phrase.
- **Jimothy:** "a single very round chubby tailless tanuki, charcoal grey and black fur, bandit
  mask, hunched round back, no neck, smooth round rump with a tiny stump, short stubby legs".
  - "Tanuki" carries the round, short-tailed silhouette.
  - "Raccoon" summons a long ringed tail.
  - "Single" stops extra baby raccoons.
- **Crickets:** "soft rounded bright green bodies, little black dot eyes, small gentle
  closed-mouth smiles … harmless and cuddly". Dropping any of it brought back spiky, toothy or
  orange striped bugs.
- **Two characters never share a prompt.** Attributes bleed between them: "green" turns Jimothy
  into a cricket hybrid, and the raccoon reference turns crickets into raccoons. Use regional
  inpainting.
- **Medium words override subjects.**
  - Papercut turned cricket crowds into bees.
  - Pixel art turned crickets into robots.
  - Expect per-style fixes, and keep them as data (`TUNING` in the generator).
- **Name ink colours carefully.** "Blue ink" turned Jimothy blue.

**Consistency post-processing** in `build_atlas.ts`, so sprites look like one family even when
generations drift:

1. trim to the alpha bounds and set a consistent ground-contact anchor point
2. **normalize the outline**: replace each sprite's edge with an outline of uniform weight and
   colour, computed from the alpha mask, at the target display size
3. optionally, a gentle palette pull toward the style-guide palette

**Animation without frame-consistency problems.** Image models are poor at drawing the same
character across many animation frames, and the README asks for minimal animation anyway. So:

- **one painted pose per unit**, animated in code:
  - bob-walk: vertical sine plus slight rotation
  - squash and stretch on steps, hits and arrival
  - flip and tumble for "shooed"
  - a flop for the possum's play-dead
- an optional **2-frame walk** (legs together / apart), only where the bob-walk reads poorly. Make
  the second frame by inpainting just the legs of the first, not by a fresh generation.
- effects drawn procedurally: water arcs, light cones, broom swishes, "!" startle marks, dust puffs

**Compute budget** (measured in the concept-art run, CPU at idle priority, sharing the machine with
other jobs):
- about **25 s per 512² image**
- about **1.5–2 min per inpainted composite**

500 candidates is about 3.5 hours: one overnight run. SDXL-Turbo is trained at 512². Spike
backgrounds at 1024 × 576 in M5, and fall back to 512-high renders plus upscaling if wide output
degrades.

**Hardware rules for every run.** These are standing requirements on this machine:

- **CPU only.** The Vega 48 is also the display adapter. SDXL on it hung the GPU and corrupted
  the desktop badly enough to need a hard reboot (`concept-art/README.md`).
- launch under `chrt --idle 0 ionice -c 3`
- don't overlap with other heavy CPU batches. The iMac throttles to 800 MHz under sustained load
  (`/home/zach/imac-thermal-throttling.md`).
- The shared `~/venv` currently has a `huggingface_hub` too new for its `transformers`. Runs put a
  project-only copy first on the path (`PYTHONPATH=~/.cache/jimothy-sdxl-pylibs`; see the
  generator's docstring).

### 8.5 Licensing

Checked when the model was chosen:

- **SDXL-Turbo** (`sai-nc-community`, Stability AI Non-Commercial Research Community License):
  - It allows non-commercial use, defined as "not primarily intended for commercial advantage or
    monetary compensation … such as personal use (i.e., hobbyist)". A free game fits.
  - We own the outputs.
  - Its distribution conditions (a copy of the agreement, "Powered by Stability AI") apply to the
    model and modified versions of it, which explicitly exclude outputs. We ship only outputs.
  - Outputs must follow Stability AI's Acceptable Use Policy. Nothing in an all-ages game is near
    it.
  - **Charging for the game later would need a different license**, Stability's Community License.
    Revisit if pricing ever changes (§12.4).
- **IP-Adapter** (`h94/IP-Adapter`): Apache 2.0.
- **Qwen-Image-2.1 is excluded.** Its Qwen Research License allows only "research or evaluation"
  use, so its earlier concept set was removed from the repo and `concept-art/qwen/` is
  git-ignored. Never use it for shipped art.
- **Matting model** (§8.4): check its license before adopting it.
- **Font and audio assets:** licenses that are free for non-commercial use (e.g. CC BY-NC) are
  acceptable. Still prefer CC0 / CC BY / SIL OFL: they avoid any question about whether a store
  listing counts as commercial, and they keep a commercial option open later.
- **Steam requires disclosure of AI-generated content** in its content survey. Plan the store-page
  wording. Other stores currently don't require disclosure, but being upfront costs nothing.
- Jimothy's likeness needs no permission (README, settled).

---

## 9. Audio

**Proposal: a small v1 set.** The game must be fully playable and fully readable muted.

- **Music:** one gentle loop per area (4), plus a menu/map theme. Picture-book instrumentation:
  ukulele, glockenspiel, upright bass, soft percussion.
- **Sound effects (~25):**
  - send chirps, one per unit type
  - defense sounds: sprinkler hiss, dog "boof", light click, broom swish, gate creak
  - shoo "boing", pile rustle and crunch
  - win fanfare, end-of-night yawn
  - UI taps
- **Sourcing:** CC0 libraries first (e.g. Kenney, freesound CC0). CC BY-NC is acceptable for a
  non-commercial game but is the fallback, not the default (§8.5). Track
  every file's license in `art/audio/LICENSES.md`.
- **Format:** Ogg Opus, plus an AAC/M4A fallback for older Safari. Decode SFX up front, stream
  music.
- Audio events are driven by sim events (§4.2) through `src/platform/audio`.

---

## 10. UI and UX

### 10.1 Screens

1. **Boot / title** — key art, "Play", settings cog. On web, the first tap here also unlocks audio.
2. **Map (level select)** — a storybook map of the four areas with a path of level nodes. It shows
   moons per level and the acorn total, and has a shop button. Locked levels are visible but
   greyed (no paywalls; just unlock order).
3. **Shop** — the upgrade list (§7), with large cards and tiers shown as pips.
4. **Level intro card** — Jimothy, one line of text, "Let's go!"
5. **In-level HUD**, laid out for landscape:
   - **bottom edge:** the unit bar, a row of large unit cards with cost, cooldown ring and a lock
     state. Thumbs reach it on phones.
   - **lanes:** tap a lane to target it. On one-lane levels there's nothing to choose, and the
     prompt is hidden.
   - **top-left:** snacks counter. **Top-center:** pile hp as the pile's own shrinking picture plus
     a bar. **Top-right:** the moon/night arc, speed toggle, pause.
   - **left edge:** Jimothy in the staging area, cheering and reacting to events.
6. **Pause** — resume, restart, settings, call it a night, back to map.
7. **Results** — moons earned, acorns, recruit reveal ("Possum wants to join!"), "Next" / "Again".
8. **End of night** — the soft card from §6, Q7.
9. **Settings** — volumes, speed default, reduced motion, large text, save export/import, credits,
   privacy note ("This game collects no data").

### 10.2 Teaching without text

- Level 1-1 is a guided tutorial: a pulsing hand points at the cricket card, then at the lane, and
  the sim **pauses until the player taps**. It is skipped automatically on replay.
- Each new defense or unit gets a one-card picture intro the first time it appears, then never
  again.
- Tooltips appear on long-press and hover.

### 10.3 Form-factor checks

Every screen is reviewed at these sizes before its milestone is called done (§11.4):

- phone (667 × 375 CSS px minimum)
- tablet (1024 × 768)
- desktop (1920 × 1080)
- ultrawide (2560 × 1080)
- Steam Deck (1280 × 800)

---

## 11. Testing and verification

The README requires headless, agent-verifiable play. The deterministic sim (§4.2) makes this
straightforward.

### 11.1 Unit tests (Vitest, Node)

- sim systems: movement along `s`, coverage intervals, targeting order, each effect, traits, the
  economy, win and night end
- save migrations and fixture saves
- data validation: every reference resolves, every level's lanes start in staging and end at the
  pile, and costs are positive

### 11.2 Headless level runner

```bash
npm run sim -- --level 1-3 --replay reference          # run the level's stored reference solution
npm run sim -- --level 1-3 --inputs my-attempt.json    # run arbitrary inputs
npm run sim -- --all --report                          # every level; JSON summary
```

The output is JSON: won or night-ended, ticks taken, moons, pile hp over time, units sent and
shooed. Agents use this to check balance changes without a browser.

### 11.3 Level solvability and difficulty checks (CI)

- **Every level's `reference` solution must win, with no upgrades, using only the units unlocked by
  that point in the campaign.** This catches levels made unwinnable by a stat change.
- A cheap **bot player** (greedy: "send the best affordable unit to the least-defended lane") plays
  every level. Its result is a coarse difficulty score.
- CI publishes the scores as a table and fails if the curve becomes non-monotonic beyond a
  tolerance within an area. The README's hand-authored difficulty ramp stays hand-authored; this is
  just a guard rail.

### 11.4 Browser tests (Playwright)

- Smoke test: boot, play 1-1 via the reference input sequence fed through debug URL params
  (`?level=1-1&replay=reference&speed=8`), reach the results screen, and check that the save
  persisted.
- **Device emulation matrix:** iPhone SE, Pixel 7, iPad, 1080p desktop, 1280 × 800 (Deck). Each
  run takes screenshots of map, HUD and results, compared against baselines with a tolerance.
- Run on Chromium, WebKit and Firefox. WebKit stands in for iOS Safari and the Tauri macOS/Linux
  webviews.

### 11.5 Performance checks

- A built-in debug overlay (`?debug=1`) shows fps, frame time, entity count and draw calls.
- A **stress level** (maximum swarm on three lanes) runs in Playwright with CPU throttling, and
  frame-time percentiles are recorded per build.
- If the device can't keep up, fall back gracefully: cap the backing-store DPR at 1.5, skip the
  shadow pass, reduce effect particles. Auto-detect this from a short frame-time sample at level
  start.

### 11.6 Real-device checks (per release)

| Device | What to check |
|---|---|
| iPhone (Safari and app) | audio unlock, safe areas, landscape lock, save survives app kill |
| Android phone, low-mid range (Chrome and app) | 60 fps on stress level, back button behavior, save |
| iPad / Android tablet | 4:3 bleed, touch target size |
| Windows / macOS (Tauri) | window resize, fullscreen toggle, quit, save location |
| Steam Deck | gamepad-only full playthrough, 1280 × 800 readability, suspend/resume |

---

## 12. Build, CI and release

### 12.1 Tooling

- **Vite** builds `dist/`, hashing filenames so updates bust caches.
- **TypeScript** in strict mode. **Vitest** and **Playwright**.
- The **service worker** is hand-written (about 50 lines; cache-first for hashed assets,
  network-first for `index.html`). A workbox dependency isn't worth it.
- A **version number** (semver) is shown in Settings and embedded in saves.

### 12.2 GitHub Actions

| Workflow | Trigger | Steps |
|---|---|---|
| `ci` | every push and PR | typecheck · lint · unit tests · data validation · headless all-levels sim report · Playwright smoke + screenshots · build |
| `pages` | push to `main` | build → deploy `dist/` to GitHub Pages |
| `release-web` | tag `v*` | build → upload to itch.io via `butler` |
| `release-desktop` | tag `v*` | Tauri matrix (windows/macos/ubuntu runners) → signed installers → itch.io + Steam depot upload (`steamcmd`) |
| `release-android` | tag `v*` | Capacitor sync → Gradle signed AAB → Play Console internal track (via `fastlane supply` or the Play API) |
| `release-ios` | tag `v*` | **macOS runner**: Capacitor sync → Xcode archive → TestFlight (`fastlane pilot`) |

**iOS builds need macOS and Xcode.** This machine runs Debian, so iOS builds and signing happen on
GitHub's macOS runners, or on a Mac if one is available. Signing secrets live in repository
secrets. Git LFS is enabled in every checkout step (`lfs: true`). Only the workflows that rebuild
atlases need the raw art; the built atlases are small.

### 12.3 Store requirements checklist

- **Accounts:**
  - Apple Developer ($99/year, even for free apps): also needed to notarize macOS builds. Without
    it, the itch.io macOS download still works, but players must approve it past Gatekeeper.
  - Google Play ($25 one-time)
  - Steamworks ($100 per app; for a free game this is never refunded)
  - itch.io (free)
  - Microsoft Partner Center, if the PWA is submitted there
- **Google Play testing gate:** new personal Play accounts must run a **closed test with a minimum
  number of testers over 14 days** before production access. Check the current policy and start
  this early in M6.
- **Privacy:**
  - App Store "Data Not Collected" label
  - Play Data Safety form ("no data collected or shared")
  - a one-page privacy policy on GitHub Pages
- **Age ratings:** IARC questionnaire (Play, Microsoft) and App Store age rating. Expect
  Everyone / 4+.
  - **Recommendation: don't enrol in Apple's "Kids" category or Google's "Designed for Families"
    programme for v1.** They add review requirements without changing the game, and the game is
    all-ages regardless. Revisit after launch.
- **App Store guideline 4.2 (minimum functionality).** A bundled, offline, full game with native
  orientation lock, haptics and save storage clears the "repackaged website" concern. Don't load
  the game from a remote URL inside the app.
- **Steam:** AI content disclosure (§8.5), capsule art set, trailer (optional for launch), a Deck
  compatibility review.
- **Desktop signing:** macOS notarization (covered by the Apple account). Windows code signing is
  optional (SmartScreen warns without it); Steam-distributed builds don't need it.

### 12.4 Pricing

**Decided: free and non-commercial on every platform.** No price, no ads, no in-app purchases. This
fits all-ages, no network and no data collection.

- Store listings use each store's "Free" price tier. On Steam, list the game as a free game, not
  free-to-play: Steam uses "free-to-play" for games with in-app purchases.
- itch.io: set the minimum price to $0, and turn off the "pay what you want" donation prompt
  unless Zach wants it.
- No store payout, tax or banking setup is needed beyond what each store requires to publish.

---

## 13. Milestones

The README's rough order of work is kept, with platform and art work interleaved so neither becomes
a big-bang risk at the end. Each milestone has a concrete exit check that an agent can verify.

### M0 — Plan sign-off

**Progress:** "free and non-commercial" is in the README's settled decisions. The §14 answers are
still open; the build uses the plan's defaults until then.

- Add "free and non-commercial" to the README's **Settled decisions** table.
- Zach reviews this document and answers the rest of §14. Accepted proposals are copied into the README's
  **Settled decisions** table, and the open questions they answer are marked resolved.
- **Exit:** README updated; this plan marked "approved".

### M1 — Scaffold and the bare loop (README step 1)

- Vite + TS strict + Vitest skeleton; `src/` layout from §4.1; CI `ci` workflow.
- The fixed-timestep loop, canvas fit/letterbox/bleed with DPR handling, pointer input, auto-pause.
- `pages` workflow deploys an empty scene to GitHub Pages.
- **Exit:** a coloured test scene renders correctly at all five §10.3 sizes in Playwright; CI is
  green; the Pages URL is live.
- **Progress: built**, except that the workflows haven't run on GitHub yet: the branch isn't
  pushed, and Pages needs Settings → Pages → Source set to "GitHub Actions". Playwright checks all
  five sizes on a real level (core fits, DPR cap, every button on screen and ≥ 44 px, no scroll) and
  the portrait "turn sideways" card. Not built: screenshot baselines (fonts differ between this
  machine and CI runners, so they'd need generating on CI).

### M2 — First playable lane plus platform smoke builds (README step 2)

- The sim: one lane, the cricket, the sprinkler, the pile; win condition. Placeholder art (shapes).
- Headless `npm run sim`; the first reference solution passes in CI.
- **Platform smoke builds:** a Capacitor Android debug APK and a Tauri Linux build of this exact
  scene. Measure fps on a phone and on WebKitGTK; decide Tauri vs Electron for Linux (§2.3).
- **Exit:** crickets walk, get sprinkled, and knock the pile down in the browser, in the Android APK
  and in the Linux desktop build; the fps numbers are recorded in this doc.
- **Progress:** built, apart from measuring on real devices.
  - **Tauri:** `platforms/tauri` builds here (`npx tauri build --bundles deb`): a 1.6 MB `.deb` in
    about two minutes at idle priority. It hasn't been launched on this desktop.
  - **Capacitor:** `platforms/capacitor` has Android and iOS projects, landscape-locked, with
    icons and splash screens rendered from the game's sprite code. This machine has no Java,
    Android SDK or Xcode, so the `platforms` GitHub workflow builds the debug APK, an iOS
    simulator build and Tauri bundles for Linux, Windows and macOS. It hasn't run yet.
  - **Frame times** on the stress level (`?stress`: about 60–120 units on three lanes), 1280 ×
    720, this iMac, software rendering:

    | Engine | DPR 1 | DPR 2 |
    |---|---|---|
    | Chromium (Playwright) | 60 fps | 60 fps |
    | WebKit (Playwright's Linux build; the engine family of Tauri's WebKitGTK) | 50–60 fps | 22 fps with vector units; 40 fps with cached unit frames; about 50 fps with automatic resolution fallback |

  - **Decision: Tauri for Linux and the Deck**, with Electron kept as the fallback. The Deck is DPR
    1, where WebKit holds 50–60 fps. Two changes made that possible. Unit animation frames are now
    drawn once and blitted (`src/render/unitSprites.ts`); the M5 atlases replace them. And the
    backing-store density steps down (2 → 1.5 → 1) when frames run slow, as §11.5 planned.
  - **Still to do:** fps on a real phone and on a real Deck.

### M3 — Levels as data (README step 3)

- `LevelDef` schema and `validate_data`; level 1-1 plus a second level to prove the format.
- Unit and defense tables; possum and broom neighbor added as data plus their traits.
- **Exit:** a third level can be added with **no engine change**, checked by doing exactly that in
  review.
- **Progress: built.** Area 1 has five level files; adding a level is a JSON file, one import line in
  `src/data/content.ts` and an entry in `campaign.json`. `validate_data` checks units, defenses,
  levels, the campaign, strings and the HUD-free band.

### M4 — Economy, send UI, soft fail; area 1 slice (README step 4)

- Snacks (trickle + haul), unit bar, cooldowns, press-and-hold streaming, night timer, end-of-night
  card, retry, moons.
- All 5 area-1 levels authored with reference solutions; first balancing pass; tutorial on 1-1.
- **Exit:** area 1 is fully playable start to finish on the web, all of it headless-verified;
  informal playtest with at least one child and one adult. **This is the "is it fun?" checkpoint.**
  Tune before building more content.
- **Progress:** everything above is built except the playtest. Area 1 plays start to finish, and
  each level's reference wins headlessly with ≥ 40 % of the night left. The first balance pass
  (`npm run tune`) shows a usable ramp: the plain bot wins 1-1 to 1-4 and fails 1-5. Its best
  strategy differs by level: bunched crickets beat the broom on 1-3, and possum rushes win 1-4 and
  1-5. The possum may be too strong; that's for the playtest to say. A minimal save is in (best
  moons, recruits, settings), ahead of M6.

### M5 — Art pipeline and style lock (README step 7, started early)

M5 can run in parallel with M3–M4: generation runs overnight on idle CPU, not developer time.

- Spikes (§8.4): IP-Adapter anchor-image consistency across sprites; matting sprites off a
  white background (pick a model and check its license); wide backgrounds at 1024 × 576.
- Style probes → Zach picks the anchors → `docs/style-guide.md`.
- `tools/asset_gen/generate.py` (generalized from `generate_sdxl.py`), prompt sets, matting,
  `build_atlas.ts` with outline normalization.
- Produce area 1's assets: cricket, possum, squirrel, sprinkler, broom neighbor, area-1 pile
  stages, alley background, Jimothy commander poses, core UI icons.
- **Exit:** area 1 runs with real art at all §10.3 sizes. Zach approves the look.
- **Progress:** the pipeline is built and area 1's characters ship with **provisional** picks.
  Zach still needs to choose the anchors (the style guide lists Claude's picks and why).
  - **Pipeline** (`art/README.md`):
    - `tools/asset_gen/generate.py`: prompt sets as data, candidates with prompt hashes and
      sidecars, contact sheets, named framings so earlier picks stay reproducible
    - `tools/asset_gen/matte.py`: BiRefNet-lite, MIT; drops small islands
    - `tools/build_atlas.ts`: trim, scale to 2×, a uniform ink outline, pack, WebP; in Chromium,
      with no image libraries
    - The game loads `public/atlas/area1.*` and animates one pose per sprite in code. Anything
      missing falls back to the vector art.
  - **Spikes** (about 130 renders, two passes, 2026-10-03):
    - **Matting works.** BiRefNet-lite strips ground, leaves and branches cleanly. A threshold is
      no longer needed.
    - **Framing words must follow the style lead**, or SDXL paints scenes and crops subjects.
    - **IP-Adapter anchors didn't stop Jimothy's tail.** Both concept anchors (`001`, `009`) have
      tails themselves. The rear photo at 0.42 plus 12 seeds gave one clean pick. Expect Krita
      touch-ups for his model sheet.
    - **Wide 1024 × 576 renders are clean**, but SDXL-Turbo kept drawing street-level perspective
      even when asked for a high angle. That doesn't fit a flat lane layout. **Backgrounds stay
      procedural for now.** A painted version needs another approach: e.g. a skyline strip for
      the top band plus a ground texture, or img2img over the procedural layout.
  - **Shipped from the model:** Jimothy, all five friends, the broom neighbor, the yard dog, the
    motion light, the pile. **Still drawn in code:** the sprinkler (it always came out as a garden
    scene), the fence (matting lost its rails), and backgrounds.
  - **Areas 2–4** (second set, `art/prompts/areas.json`, 2026-10-04):
    - **Piles:** one per area.
    - **Fence and sprinkler:** generated after all. The fence is asked for as a solid gate; the
      sprinkler reads as a small fountain.
    - **Painted backgrounds** for the back yards, cul-de-sac and strip mall.
    - **Backgrounds work as img2img over the procedural scenery** at strength 0.75. That keeps the
      flat ground and skyline the lanes need, and replaces the text-only approach that failed.
      `tools/render_scenery.ts` renders the starting images, using each area's lowest horizon.
    - The game merges the `area1` and `areas` atlases and looks up `pile-<area>` before `pile`.
    - All three backgrounds total about 130 KB.
    - The alley got the same treatment. The word "alley" pulled the model toward a perspective
      street, so the prompt describes "a flat open asphalt lot behind brick apartment buildings".
      Every area now has a painted background.
  - **Jimothy without the tail:** the pick is now an inpainted touch-up
    (`tools/asset_gen/inpaint.py`). Paint the body over the tail in flat fur grey, then re-texture
    at 0.72 with a fur-only prompt. Inpainting a "rump" from scratch drew tails again. A second
    touch-up (`jimothy-nub.json`) added back the fairly tiny nub he really has, in a mask too small
    for a full tail.
  - **Painted UI icons** (props set): the snack cookie and the acorn replace their SVGs in the HUD,
    unit cards, shop and results, and the HUD's pile icon is the current area's painted pile. The
    portrait-phone card shows painted Jimothy. Moons, buttons and effects stay in code (§8.3: code
    for anything that has to scale or carry gameplay information), as does the staging mat, which
    SDXL wouldn't draw as a flat box.
  - **App icons and splash screens** now use the painted sprites (`tools/make_icons.ts` reads the
    atlases; the vector drawing is the fallback).
  - **Frame times are unchanged** (the atlas is one `drawImage` per sprite). The atlas is 200 KB.

### M6 — Campaign wrapper and saves (README step 5); mobile beta

- Map, shop, upgrades, recruitment, acorns, settings. `SaveStore` adapters for all platforms;
  migrations; export/import code.
- PWA manifest + service worker (offline play).
- Capacitor iOS and Android builds through TestFlight and the Play internal/closed track. **Start
  the Play closed-test clock here.**
- **Exit:** progress persists across app kill and relaunch on a real iPhone and a real Android
  phone. The PWA installs and plays offline.
- **Progress:** built, except the store tracks and the real-device checks.
  - Acorns pay out only for improving a level's best moons. The seven upgrades in
    `upgrades.json` are applied to content before an attempt, so the sim never knows about them.
  - The map pages through the areas. There are shop and settings screens (volumes, less motion,
    bigger text, save code).
  - Save adapters:
    - web: `localStorage` plus `storage.persist()`
    - Capacitor: native Preferences
    - Tauri: the webview's `localStorage`, which Tauri keeps in the OS app-data folder. *Changed
      from §3.4's JSON file:* it needs no extra plugin, and Steam Auto-Cloud can sync that
      folder just the same.
  - PWA: manifest and icons, and a service worker generated at build time that precaches
    everything. A browser test plays the game offline.
  - Not done: TestFlight and the Play closed track (they need store accounts, §14 #16).

### M7 — Multi-lane and the full campaign (README step 6)

- Lane choice UI; the crow, the rat, the fence, the motion light, the yard dog.
- Areas 2–4 authored (15 levels) with reference solutions; difficulty-curve report in CI.
- Gamepad and keyboard navigation (needed for the Steam Deck).
- Art for areas 2–4 via the M5 pipeline. Most of the generation time is spent here, so start it
  early.
- **Exit:** all 20 levels are winnable headlessly with no upgrades; a full playthrough is done on
  web, one phone and the Deck (or a 1280 × 800 gamepad session).
- **Progress:** built, except the art and the real-device playthroughs.
  - **Levels:** 20 levels; each one's reference wins with no upgrades and ≥ 40 % of the night
    left. `npm run sim -- --all --curve` runs in CI and fails if a level is easier than the one
    before it (tolerance 0.08 of the night).
  - **Balance:**
    - The squirrel is now a flanker (2 hp, 1 pile damage), not a damage dealer.
    - The crow deals 2.
    - The broom neighbor swats crows too, so air units have a counter.
    - Every lane faces something, usually something different (`node tools/lanes.ts`).
    - The best strategy found varies by level: possum pushes, bunched crickets, crows over
      fences, rat-led mixes.
  - **Input and presentation:**
    - Lane buttons sit at each path's start, alongside Q/W/E and tapping a lane.
    - Arrow keys and gamepads move focus between controls on screen; A sends (holding A
      streams), B goes back, Start pauses. A browser test drives a mocked gamepad.
    - Intro cards picture each defense or friend the first time it appears (§10.2).

### M8 — Audio, polish, accessibility (README step 7)

- Music and SFX (§9); haptics on mobile; reduced motion, large text, speed modes.
- Juice: squash and stretch, startle marks, pile-crunch shake, celebration.
- A full playtest pass and a balance pass.
- **Exit:** the §11.6 real-device checklist passes. No deny-listed words appear in the strings.
- **Progress:** built, except sourced audio, the playtest and the device checklist.
  - *Changed from §9:* every sound is **synthesized** with Web Audio (`src/platform/audio.ts`):
    - per-unit send chirps and defense sounds
    - shoo boing, pile crunch, chew, fanfare, yawn, UI taps
    - a small procedural loop per area
    - It needs no files and has no licenses, and each sound has a named slot that a recorded or
      CC0 sound can fill later.
  - Haptics on Capacitor; less motion, bigger text, 1× / 2× / ¾× speed.
  - Juice: startle marks, pile shake, hop-offs, confetti on a win. The deny-list test covers all
    strings.

### M9 — Launch

- Store listings, screenshots and capsule art; privacy policy; ratings; AI disclosure.
- Web (Pages + itch.io) → Android → iOS → desktop/Steam, in that order, each a separate go/no-go.
- **Exit:** live on each channel.

### Relative effort

These are rough sizes (S ≈ days, M ≈ 1–2 weeks, L ≈ 2–4 weeks of focused agent-plus-human work),
not a calendar.

| M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 |
|---|---|---|---|---|---|---|---|---|
| S | M | S | M | L | M | L | M | M |

The critical path is **M4 (fun) → M7 (content)**. Art (M5 → M7) runs alongside it, limited by
overnight generation runs and Zach's time to pick images.

---

## 14. Decisions needed from Zach

Answering these unblocks M0. Each one has a default from this plan.

| # | Question | Plan's default |
|---|---|---|
| 1 | In-level resource (README Q1) | Trickle + haul on arrival; no return trip (§6) |
| 2 | Lane ramp (Q2) | 1 lane in area 1, 2 in area 2, up to 3 in areas 3–4 |
| 3 | Per-level upgrades (Q3) | None |
| 4 | Campaign length (Q4) | 20 levels, 4 areas × 5 |
| 5 | Ratings (Q5) | 1–3 moons by night remaining |
| 6 | Defeated units (Q6) | Gone for the attempt |
| 7 | Attempt end (Q7) | Night timer + "Call it a night" |
| 8 | Audio (Q8) | Small v1 set |
| 9 | Asset pipeline (Q9) | SDXL-Turbo candidates + human picks + matting + atlas build (§8) |
| 10 | Deployment (Q10) | GitHub Pages + itch.io; stores per §2 |
| 11 | Landscape-only | Yes |
| 12 | Native shells | Capacitor (mobile) + Tauri (desktop), with Electron as the Linux fallback |
| 13 | Production art style | "Inked watercolour" hybrid; Zach picks the anchor images in M5 |
| 14 | Pricing | **Decided:** free and non-commercial everywhere |
| 15 | Currency names | "Snacks" (in-level) and "acorns" (meta) as placeholders |
| 16 | Store accounts | Which paid stores are worth their fees for a free game (§2.2, §12.3). Default: free channels at launch, Google Play next ($25), App Store and Steam only if the reach is wanted |

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **The game isn't fun at its simplest** | medium | high | M4 is an explicit fun checkpoint, before content and art scale up. Tuning is cheap because everything is data. |
| **Sprite inconsistency from the image model** | high | medium | IP-Adapter anchor image; 4+ seeds per asset, picked by eye; one painted pose per unit plus procedural animation; build-time outline normalization; budget for hand touch-ups |
| Clean cut-outs are hard (SDXL has no alpha) | high | low | White-background generation + a matting model + Krita touch-ups (§8.4). A simple colour threshold already failed. |
| WebKitGTK performance on Linux / Steam Deck | medium | medium | Measured in M2; Electron fallback for Linux only |
| iOS evicts web saves | high (web only) | medium | Native storage in the apps; `storage.persist()`; export code; nudge web players on iOS to install the PWA or app |
| App Store 4.2 rejection ("just a website") | low–medium | medium | Bundled offline build, native touches (haptics, orientation lock, native saves), a complete game |
| Google Play closed-test requirement delays Android | high | low | Start the clock in M6, long before launch |
| Model license or AI-art store policies | low | high | SDXL-Turbo's license covers a free hobby game, and outputs are ours (§8.5); never use Qwen-Image-2.1 output; revisit if the game ever charges; disclose on Steam |
| Generation disrupts the desktop, or thermal throttling slows everything | low | low | CPU only (never SDXL on the display GPU), idle priority, overnight batches, no overlap with other CPU-heavy work |
| Scope creep (new units, hero mode, adaptive AI) | medium | medium | README settled decisions; new content must be *data*; new systems need Zach's sign-off |
| Difficulty spikes, given soft fail | medium | low | Reference-solution and bot-difficulty CI checks; generous night lengths; upgrades only ever make levels easier |
