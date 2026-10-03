// Wiring: the frame loop, the screen stack, lifecycle and debug hooks.

import { levelById, levels, references, unitsAvailableAt } from "./data/content.ts";
import { LevelSession } from "./play.ts";
import type { Platform } from "./platform/types.ts";
import { SceneRenderer } from "./render/scene.ts";
import { View } from "./render/view.ts";
import type { SaveStore } from "./save.ts";
import { bot, referenceInputs } from "./sim/run.ts";
import { UNIT_IDS, type LevelDef, type UnitId } from "./sim/types.ts";
import { GameAudio } from "./platform/audio.ts";
import { DebugOverlay } from "./ui/debug.ts";
import { installNavigation } from "./ui/gamepad.ts";
import { LevelScreen, MapScreen, TitleScreen, type Screen } from "./ui/screens.ts";

const MAX_FRAME_GAP = 0.25; // s; a longer gap (tab switch, breakpoint) is not simulated
const SLOW_FRAME = 1 / 52; // s; a median frame slower than this lowers the canvas resolution
const SAMPLE_FRAMES = 90;

export class App {
  readonly view: View;
  readonly scene: SceneRenderer;
  readonly audio = new GameAudio();
  screen: Screen | null = null;
  private attract: LevelSession | null = null;
  private attractRestart = 0;
  private raf = 0;
  private last = 0;
  private debug: DebugOverlay | null = null;
  private frameSamples: number[] = [];

  readonly platform: Platform;
  readonly save: SaveStore;
  readonly params: URLSearchParams;
  readonly ui: HTMLElement;

  constructor(platform: Platform, save: SaveStore, params: URLSearchParams, canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.platform = platform;
    this.save = save;
    this.params = params;
    this.ui = ui;
    this.view = new View(canvas);
    this.scene = new SceneRenderer(this.view);
    this.applySettings();
    if (params.has("debug")) {
      this.debug = new DebugOverlay(ui.parentElement!);
      this.debug.dpr = () => this.view.dpr;
    }

    new ResizeObserver(() => {
      this.view.resize();
      this.wake();
    }).observe(canvas);
    platform.lifecycle.onPause(() => {
      this.screen?.onPause?.();
      this.audio.setPaused(true);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    platform.lifecycle.onResume(() => {
      this.audio.setPaused(false);
      this.wake();
    });
    // A soft tap for every button except unit cards, which chirp as they send.
    ui.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (b && !b.classList.contains("unit-card")) this.audio.play("tap");
    });
    installNavigation(ui);
    window.addEventListener("keydown", (e) => this.screen?.onKey?.(e, true));
    window.addEventListener("keyup", (e) => this.screen?.onKey?.(e, false));
  }

  start() {
    if (this.params.has("stress")) return this.stress();
    const levelId = this.params.get("level");
    const level = levelId ? levelById(levelId) : undefined;
    if (level) {
      const replay = this.params.get("replay") === "reference";
      this.playLevel(level.id, { replay, skipIntro: replay || this.params.has("skipIntro") });
    } else this.showTitle();
  }

  show(screen: Screen) {
    this.screen?.dispose?.();
    this.audio.theme(screen.session ? screen.session.level.area : "menu");
    this.screen = screen;
    this.ui.replaceChildren(screen.el);
    screen.focus?.();
    this.wake();
  }

  showTitle() {
    this.show(new TitleScreen(this));
  }

  showMap() {
    this.show(new MapScreen(this));
  }

  playLevel(id: string, opts: { replay?: boolean; skipIntro?: boolean } = {}) {
    const level = levelById(id)!;
    const ref = references[id];
    const replay = opts.replay && ref ? referenceInputs(ref) : undefined;
    const session = new LevelSession(level, {
      seed: replay ? ref!.seed : (Math.random() * 2 ** 32) >>> 0,
      available: replay ? undefined : this.availableFor(level),
      upgrades: replay ? undefined : this.save.data.upgrades,
      replay,
    });
    const speed = Number(this.params.get("speed"));
    session.speed = speed > 0 ? speed : this.save.data.settings.speed;
    this.show(new LevelScreen(this, session, { skipIntro: !!opts.skipIntro }));
  }

  /** Everything the player has recruited, plus anything the level is designed around. */
  private availableFor(level: LevelDef): UnitId[] {
    if (level.unitsAvailable) return level.unitsAvailable;
    const have = new Set([...this.save.data.unlockedUnits, ...unitsAvailableAt(level.id)]);
    return UNIT_IDS.filter((u) => have.has(u));
  }

  /**
   * ?stress (plan §11.5): the busiest level with endless snacks and a bot sending everyone it can,
   * so the swarm sits at the unit cap on all three lanes. Used for frame-time measurements.
   */
  private stress() {
    const base = levelById("4-5")!;
    const level = { ...base, economy: { startSnacks: 1e9, trickle: 0 }, nightLength: 3600, pile: { ...base.pile, hp: 1e9 } };
    const session = new LevelSession(level, { seed: 1, available: [...UNIT_IDS], autoplay: bot({ weights: { cricket: 4, possum: 1, squirrel: 1, crow: 1, rat: 1 } }) });
    this.show(new LevelScreen(this, session, { skipIntro: true }));
  }

  applySettings() {
    const s = this.save.data.settings;
    const reduce = s.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scene.reducedMotion = reduce;
    this.audio.setVolumes(s.music, s.sfx);
    document.documentElement.classList.toggle("reduced-motion", reduce);
    document.documentElement.classList.toggle("large-text", s.largeText);
  }

  /** Make sure a frame is coming. The loop stops itself when nothing is animating. */
  wake() {
    if (!this.raf && !document.hidden) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (nowMs: number) => {
    this.raf = 0;
    const t = nowMs / 1000;
    const dt = this.last ? Math.min(t - this.last, MAX_FRAME_GAP) : 0;
    this.last = t;
    const session = this.screen?.session ?? this.attractSession(dt);
    const alpha = session.advance(dt);
    this.scene.highlightLanes = session.st.lanes.length > 1;
    this.scene.selectedLane = session.lane;
    this.scene.draw(session.st, alpha, t, dt);
    this.screen?.frame?.(dt, t);
    this.debug?.frame(dt, session);
    if (this.screen?.session && !session.frozen && dt > 0) this.adaptResolution(dt);
    if (this.screen?.animating?.() ?? true) this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * Plan §11.5: if the device can't keep up, render fewer pixels. Steps the backing-store density
   * down (2 → 1.5 → 1) while the median frame is slow. Software canvases (WebKitGTK on some Linux
   * setups) are fill-rate bound, so this is the lever that matters.
   */
  private adaptResolution(dt: number) {
    const s = this.frameSamples;
    s.push(dt);
    if (s.length < SAMPLE_FRAMES) return;
    const median = [...s].sort((a, b) => a - b)[s.length >> 1]!;
    s.length = 0;
    if (median > SLOW_FRAME && this.view.dpr > 1) {
      this.view.maxDpr = Math.max(1, this.view.dpr - 0.5);
      this.view.resize();
    }
  }

  /** Title and map screens show the first level playing itself behind them. */
  private attractSession(dt: number): LevelSession {
    if (this.attract?.st.outcome) {
      this.attractRestart += dt;
      if (this.attractRestart > 2.5) this.attract = null;
    }
    if (!this.attract) {
      this.attractRestart = 0;
      const level = levels[0]!;
      this.attract = new LevelSession(level, { seed: 1, autoplay: bot({ burst: 30 }) });
      this.attract.onEvents((events) => this.scene.onEvents(this.attract!.st, events));
    }
    return this.attract;
  }
}
