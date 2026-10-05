// Screens (plan §10.1). The playfield is canvas; everything you tap is DOM over it, so buttons get
// focus rings, keyboard access and readable text for free.

import type { App } from "../app.ts";
import { campaign, levelById, levelOrder, unitsAvailableAt, upgrades } from "../data/content.ts";
import type { LevelSession } from "../play.ts";
import { closestS } from "../sim/lane.ts";
import { UNIT_IDS, type DefenseId, type UnitId } from "../sim/types.ts";
import { h, svg } from "./dom.ts";
import { acornIcon, cogIcon, handIcon, moonIcon, pauseIcon, pileIcon, snackIcon } from "./icons.ts";
import { canDrawStory, drawStory, storyForArea, type StoryId } from "../render/story.ts";
import { hasPainted, paintedAtlas, paintedIcon, portrait } from "./portrait.ts";
import { t } from "./strings.ts";

export interface Screen {
  name: string;
  el: HTMLElement;
  session?: LevelSession;
  frame?(dt: number, t: number): void;
  animating?(): boolean;
  onKey?(e: KeyboardEvent, down: boolean): void;
  onPause?(): void;
  focus?(): void;
  dispose?(): void;
}

const moons = (n: number, cls = "moons") =>
  h("div." + cls, { "aria-label": `${n} of 3 moons` }, ...[0, 1, 2].map((i) => svg(moonIcon(i < n), "moon")));

// ---------------------------------------------------------------- title

export class TitleScreen implements Screen {
  name = "title";
  el: HTMLElement;
  private play: HTMLButtonElement;

  constructor(app: App) {
    this.play = h("button.big.primary", { onclick: () => app.showMap() }, t("title.play"));
    this.el = h(
      "div.screen.title",
      null,
      h(
        "div.title-card",
        null,
        portrait("jimothy-wave", 200, 150),
        h("h1", null, "Jimothy ", h("span", null, "Crickets")),
        h("p.tagline", null, t("title.tagline")),
        this.play,
        app.platform.quit ? h("button.big", { onclick: () => app.platform.quit!() }, t("title.quit")) : null,
      ),
    );
  }

  focus() {
    this.play.focus();
  }
}

// ---------------------------------------------------------------- map

export class MapScreen implements Screen {
  name = "map";
  el: HTMLElement;
  private app: App;
  private area = 0;
  private body = h("div.area-pager");
  private focusLevel: string | null = null;

  constructor(app: App, opts: { area?: number } = {}) {
    this.app = app;
    // Open on the area holding the furthest level you can play.
    const furthest = levelOrder.filter((id) => this.unlocked(id)).at(-1) ?? levelOrder[0]!;
    this.focusLevel = furthest;
    this.area = opts.area ?? Math.max(0, campaign.areas.findIndex((a) => a.levels.includes(furthest)));
    this.el = h("div.screen.map", null, topBar(app, () => app.showTitle()), this.body);
    this.render();
  }

  focus() {
    const target =
      this.body.querySelector<HTMLButtonElement>(`[data-level="${this.focusLevel}"]:not(:disabled)`) ??
      this.body.querySelector<HTMLButtonElement>(".level-node:not(:disabled)");
    target?.focus();
  }

  private unlocked(id: string) {
    const i = levelOrder.indexOf(id);
    return this.app.params.get("unlock") === "all" || i === 0 || !!this.app.save.data.levels[levelOrder[i - 1]!]?.cleared;
  }

  private render() {
    const save = this.app.save.data;
    const area = campaign.areas[this.area]!;
    const nodes = area.levels.map((id) => {
      const open = this.unlocked(id);
      const best = save.levels[id]?.moons ?? 0;
      return h(
        "button.level-node",
        {
          disabled: !open,
          onclick: () => this.app.playLevel(id),
          "aria-label": open ? `Level ${id}, ${best} of 3 moons` : `Level ${id}, ${t("map.locked")}`,
          "data-level": id,
        },
        h("span.level-id", null, id),
        open ? moons(best, "moons small") : h("span.lock", null, "🔒"),
      );
    });
    const flip = (d: number) => {
      this.area += d;
      this.focusLevel = null;
      this.render();
      this.focus();
    };
    const n = campaign.areas.length;
    this.body.replaceChildren(
      h("button.icon-btn.pager", { disabled: this.area === 0, onclick: () => flip(-1), "aria-label": "Previous area" }, "‹"),
      h(
        "section.area",
        { "data-area": area.id },
        h("h2", null, t(`area.${area.id}`)),
        h("div.path", null, ...nodes),
        n > 1 ? h("div.dots", null, ...campaign.areas.map((_, i) => h(`span.dot${i === this.area ? ".on" : ""}`))) : null,
      ),
      h("button.icon-btn.pager", { disabled: this.area === n - 1, onclick: () => flip(1), "aria-label": "Next area" }, "›"),
    );
  }
}

/** Back button on the left; acorns, shop and settings on the right. */
function topBar(app: App, back: () => void, opts: { shop?: boolean } = { shop: true }) {
  return h(
    "div.topbar",
    null,
    h("button.icon-btn", { onclick: back, "aria-label": "Back" }, "‹"),
    h(
      "div.hud-right",
      null,
      h("div.pill.acorns", { "aria-label": `${app.save.data.acorns} ${t("hud.acorns")}` }, paintedIcon("acorn", acornIcon), h("span.value", null, String(app.save.data.acorns))),
      opts.shop ? h("button.big.shop-btn", { onclick: () => app.show(new ShopScreen(app)) }, t("shop.button")) : null,
      h("button.icon-btn", { onclick: () => openSettings(app), "aria-label": t("settings.title") }, svg(cogIcon)),
    ),
  );
}

// ---------------------------------------------------------------- shop

export class ShopScreen implements Screen {
  name = "shop";
  el: HTMLElement;
  private app: App;
  private list = h("div.shop-list");

  constructor(app: App) {
    this.app = app;
    this.el = h(
      "div.screen.shop",
      null,
      topBar(app, () => app.showMap(), { shop: false }),
      h("h2.screen-title", null, t("shop.title")),
      this.list,
    );
    this.render();
  }

  focus() {
    this.list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  private render() {
    const save = this.app.save.data;
    const shown = upgrades.filter((u) => !u.unit || save.unlockedUnits.includes(u.unit));
    this.list.replaceChildren(
      ...shown.map((u) => {
        const tier = save.upgrades[u.id] ?? 0;
        const cost = u.costs[tier];
        const buy = h(
          "button.big.buy",
          {
            disabled: cost === undefined || save.acorns < cost,
            "aria-label": cost === undefined ? t("shop.max") : `${t(`upgrade.${u.id}`)}, ${cost} acorns`,
            onclick: () => {
              if (this.app.save.buyUpgrade(u)) {
                this.app.audio.play("buy");
                void this.app.save.store();
                this.app.show(new ShopScreen(this.app));
              }
            },
          },
          cost === undefined ? t("shop.max") : h("span.price", null, paintedIcon("acorn", acornIcon), String(cost)),
        );
        return h(
          "div.upgrade",
          { "data-upgrade": u.id },
          u.unit ? portrait(u.unit, 84, 60) : h("div.econ", null, paintedIcon("snack", snackIcon)),
          h("div.upgrade-name", null, t(`upgrade.${u.id}`)),
          h("div.pips", { "aria-label": `${tier} of ${u.costs.length}` }, ...u.costs.map((_, i) => h(`span.pip${i < tier ? ".on" : ""}`))),
          buy,
        );
      }),
    );
  }
}

// ---------------------------------------------------------------- settings

export function openSettings(app: App) {
  const save = app.save;
  const s = save.data.settings;
  const store = () => {
    app.applySettings();
    void save.store();
  };
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const box = h("input", { type: "checkbox", checked: get(), onchange: () => (set(box.checked), store()) });
    return h("label.row", null, box, label);
  };
  const slider = (label: string, get: () => number, set: (v: number) => void) => {
    const input = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(get()), oninput: () => (set(Number(input.value)), store()) });
    return h("label.row.slider", null, h("span", null, label), input);
  };
  const code = h("textarea.code", { rows: 3, spellcheck: false, value: save.exportCode(), "aria-label": t("settings.saveCode") });
  const status = h("p.small.status", { role: "status" });
  const copy = h("button.big", {
    onclick: async () => {
      code.select();
      try {
        await navigator.clipboard.writeText(code.value);
      } catch {
        document.execCommand?.("copy");
      }
      status.textContent = t("settings.copied");
    },
  }, t("settings.copy"));
  const load = h("button.big", {
    onclick: async () => {
      if (save.importCode(code.value)) {
        await save.store();
        app.applySettings();
        status.textContent = t("settings.loaded");
        setTimeout(() => (dialog.remove(), app.showMap()), 600);
      } else status.textContent = t("settings.badCode");
    },
  }, t("settings.load"));
  const close = h("button.big.primary", { onclick: () => dialog.remove() }, t("settings.done"));
  const dialog = h(
    "div.overlay",
    { role: "dialog", "aria-modal": "true", "data-kind": "settings" },
    h(
      "div.card.settings",
      null,
      h("h2", null, t("settings.title")),
      h(
        "div.cols",
        null,
        h(
          "div.col",
          null,
          slider(t("settings.music"), () => s.music, (v) => (s.music = v)),
          slider(t("settings.sfx"), () => s.sfx, (v) => (s.sfx = v)),
          toggle(t("settings.reducedMotion"), () => s.reducedMotion, (v) => (s.reducedMotion = v)),
          toggle(t("settings.largeText"), () => s.largeText, (v) => (s.largeText = v)),
        ),
        h(
          "div.col",
          null,
          h("h3", null, t("settings.saveCode")),
          h("p.small", null, t("settings.saveCodeHelp")),
          code,
          h("div.row", null, copy, load),
          status,
        ),
      ),
      h(
        "p.small.footer",
        null,
        h("a", { href: "./privacy.html", target: "_blank", rel: "noopener" }, t("settings.privacy")),
        ` · ${t("settings.version", { v: __APP_VERSION__ })}`,
      ),
      h("p.small.footer", null, t("settings.credits")),
      close,
    ),
  );
  dialog.addEventListener("keydown", (e) => e.key === "Escape" && dialog.remove());
  (app.screen?.el ?? app.ui).append(dialog);
  close.focus();
}

// ---------------------------------------------------------------- level

export class LevelScreen implements Screen {
  name = "level";
  el: HTMLElement;
  private overlay: HTMLElement | null = null;
  private snacksEl: HTMLElement;
  private pileFill: HTMLElement;
  private nightMoon: SVGCircleElement;
  private cards = new Map<UnitId, HTMLButtonElement>();
  private speedBtn: HTMLButtonElement;
  private tutorial: HTMLElement | null = null;
  private tutorialStep = 0;
  private endTimer = 0;
  private last = { snacks: -1, pile: -1, night: -1 };
  private keysHeld = new Set<string>();
  private laneButtons: HTMLButtonElement[] = [];
  private laneLayout = -1;

  readonly session: LevelSession;
  private app: App;

  constructor(app: App, session: LevelSession, opts: { skipIntro: boolean }) {
    this.app = app;
    this.session = session;
    const st = session.st;
    session.onEvents((events) => {
      app.scene.onEvents(st, events);
      app.audio.onEvents(events, (i) => st.defenses[i]!.def.id);
      for (const e of events) {
        if (e.type === "unitSent" && !session.replaying) app.platform.haptics?.tap();
        else if (e.type === "levelWon") app.platform.haptics?.bump();
      }
      for (const e of events) {
        if (e.type === "unitSent" && this.tutorialStep === 1) this.advanceTutorial();
        if (e.type === "levelWon" || e.type === "nightEnded") this.endTimer = 1.4;
      }
    });

    this.snacksEl = h("span.value", null, "0");
    this.pileFill = h("div.fill");
    const arc = svg(
      `<svg viewBox="0 0 120 64"><path d="M8 58a52 52 0 0 1 104 0" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/><circle r="9" fill="#ffe08a" stroke="#2a2233" stroke-width="3"/></svg>`,
      "night-arc",
    );
    this.nightMoon = arc.querySelector("circle")!;
    this.speedBtn = h("button.icon-btn.speed", { onclick: () => this.cycleSpeed(), "aria-label": t("hud.speed") });
    this.updateSpeedLabel();

    const units = UNIT_IDS.filter((u) => st.available.includes(u));
    const bar = h("div.unit-bar", { role: "toolbar", "aria-label": "Friends" });
    units.forEach((u, i) => {
      const def = st.content.units[u];
      const card = h(
        "button.unit-card",
        { "aria-label": `${t(`unit.${u}`)}, ${def.cost} snacks`, "data-unit": u },
        portrait(u, 84, 60),
        h("span.cost", null, paintedIcon("snack", snackIcon), String(def.cost)),
        h("span.key", null, String(i + 1)),
      );
      card.addEventListener("pointerdown", (e) => {
        card.setPointerCapture(e.pointerId);
        this.press(u);
      });
      const release = () => this.release(u);
      card.addEventListener("pointerup", release);
      card.addEventListener("pointercancel", release);
      card.addEventListener("lostpointercapture", release);
      card.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          this.press(u);
        }
      });
      card.addEventListener("keyup", (e) => (e.key === "Enter" || e.key === " ") && this.release(u));
      card.addEventListener("contextmenu", (e) => e.preventDefault());
      this.cards.set(u, card);
      bar.append(card);
    });

    this.el = h(
      "div.screen.level",
      null,
      h(
        "div.hud-top",
        null,
        h("div.pill.snacks", { "aria-label": t("hud.snacks") }, paintedIcon("snack", snackIcon), this.snacksEl),
        h("div.pill.pile", null, paintedIcon(hasPainted(`pile-${session.level.area}`) ? `pile-${session.level.area}` : "pile", pileIcon), h("div.bar", null, this.pileFill)),
        h(
          "div.hud-right",
          null,
          h("div.night", { "aria-label": t("hud.night") }, arc),
          this.speedBtn,
          h("button.icon-btn", { onclick: () => this.pause(), "aria-label": t("hud.pause") }, svg(pauseIcon)),
        ),
      ),
      bar,
    );

    this.app.view.canvas.onpointerdown = (e) => this.tapField(e);
    if (st.lanes.length > 1) {
      // One big button per lane at its start, so choosing a lane never needs a precise tap.
      const keys = "QWE";
      this.laneButtons = st.lanes.map((_, i) =>
        h(
          "button.lane-btn",
          { onclick: () => this.chooseLane(i), role: "radio", "aria-label": `Path ${i + 1}`, "data-lane": String(i) },
          h("span.arrow", null, "➜"),
          h("span.key", null, keys[i] ?? ""),
        ),
      );
      this.el.append(h("div.lanes", { role: "radiogroup", "aria-label": "Paths" }, ...this.laneButtons));
      this.chooseLane(0);
    }
    if (session.replaying) this.el.classList.add("replaying");
    // An area's story card opens its first level, the first time through.
    const area = campaign.areas.find((a) => a.levels[0] === session.level.id);
    const story = area && !app.save.data.levels[session.level.id]?.cleared ? storyForArea(area.id) : null;
    const intro = () => (session.level.intro ? this.showIntro() : this.closeIntro());
    if (opts.skipIntro || session.replaying) this.maybeTutorial();
    else if (story) this.showStory(story, intro);
    else if (session.level.intro) this.showIntro();
    else this.maybeTutorial();
  }

  focus() {
    this.cards.values().next().value?.focus({ preventScroll: true });
  }

  dispose() {
    this.app.view.canvas.onpointerdown = null;
  }

  animating() {
    return !this.session.frozen || this.tutorial !== null || !!this.session.st.outcome;
  }

  onPause() {
    if (!this.overlay && !this.session.st.outcome) this.pause();
  }

  frame(dt: number) {
    const st = this.session.st;
    if (this.laneButtons.length && this.laneLayout !== this.app.view.generation) this.placeLaneButtons();
    const snacks = Math.floor(st.snacks);
    if (snacks !== this.last.snacks) this.snacksEl.textContent = String((this.last.snacks = snacks));
    const pile = st.pileHp / st.level.pile.hp;
    if (pile !== this.last.pile) this.pileFill.style.width = `${(this.last.pile = pile) * 100}%`;
    const night = Math.min(1, st.tick / st.nightTicks);
    if (Math.abs(night - this.last.night) > 0.002) {
      this.last.night = night;
      const a = Math.PI * (1 - night);
      this.nightMoon.setAttribute("cx", String(60 + Math.cos(a) * 52));
      this.nightMoon.setAttribute("cy", String(58 - Math.sin(a) * 52));
    }
    for (const [u, card] of this.cards) {
      const def = st.content.units[u];
      const cd = (st.sendCooldown[u] ?? 0) / Math.max(1, Math.round(def.sendCooldown * 60));
      card.style.setProperty("--cd", cd.toFixed(3));
      card.classList.toggle("broke", st.snacks < def.cost);
      card.classList.toggle("held", this.session.holding === u);
    }
    if (this.endTimer > 0 && (this.endTimer -= dt) <= 0) this.showEnd();
  }

  onKey(e: KeyboardEvent, down: boolean) {
    if (e.key === "Escape" && down) {
      if (this.overlay?.dataset.kind === "pause") this.resume();
      else if (!this.overlay) this.pause();
      return;
    }
    if (this.overlay) return;
    const n = Number(e.key);
    const units = [...this.cards.keys()];
    if (n >= 1 && n <= units.length) {
      const u = units[n - 1]!;
      if (down && !this.keysHeld.has(e.key)) this.press(u);
      if (!down) this.release(u);
      down ? this.keysHeld.add(e.key) : this.keysHeld.delete(e.key);
    }
    const lane = "qwe".indexOf(e.key.toLowerCase());
    if (down && lane >= 0 && lane < this.session.st.lanes.length) this.chooseLane(lane);
  }

  private press(u: UnitId) {
    if (this.overlay || this.session.replaying) return;
    const reason = this.session.send(u);
    this.session.holding = u;
    if (reason === "snacks") this.nudge(this.cards.get(u)!);
    if (this.tutorialStep === 1 && !reason) this.session.frozen = false;
    this.app.wake();
  }

  private release(u: UnitId) {
    if (this.session.holding === u) this.session.holding = null;
  }

  private nudge(el: HTMLElement) {
    el.classList.remove("nudge");
    void el.offsetWidth;
    el.classList.add("nudge");
  }

  private tapField(e: PointerEvent) {
    const st = this.session.st;
    if (st.lanes.length < 2 || this.overlay) return;
    const p = this.app.view.toWorld(e.clientX, e.clientY);
    let best = -1;
    let bestDist = 160;
    st.lanes.forEach((lane, i) => {
      const d = closestS(lane, p).dist;
      if (d < bestDist) [best, bestDist] = [i, d];
    });
    if (best >= 0) this.chooseLane(best);
  }

  private chooseLane(i: number) {
    this.session.lane = i;
    this.laneButtons.forEach((b, j) => {
      b.classList.toggle("on", i === j);
      b.setAttribute("aria-checked", String(i === j));
    });
    this.app.wake();
  }

  private placeLaneButtons() {
    const v = this.app.view;
    this.laneLayout = v.generation;
    // On short screens the unit bar covers the bottom lane's start: keep the buttons above it.
    const barTop = this.el.querySelector(".unit-bar")!.getBoundingClientRect().top;
    this.session.st.lanes.forEach((lane, i) => {
      const [x, y] = lane.points[0]!;
      const b = this.laneButtons[i]!;
      b.style.left = `${v.ox + (x + 40) * v.scale}px`;
      b.style.top = `${Math.min(v.oy + y * v.scale, barTop - 38)}px`;
    });
  }

  private cycleSpeed() {
    const order = [1, 2, 0.75];
    const next = order[(order.indexOf(this.session.speed) + 1) % order.length] ?? 1;
    this.session.speed = next;
    this.app.save.data.settings.speed = next as 1 | 2 | 0.75;
    void this.app.save.store();
    this.updateSpeedLabel();
  }

  private updateSpeedLabel() {
    const s = this.session.speed;
    this.speedBtn.textContent = s === 0.75 ? "¾×" : `${s}×`;
  }

  // ---- overlays

  private openOverlay(kind: string, card: HTMLElement, focus: HTMLElement | null) {
    this.closeOverlay();
    this.session.frozen = true;
    this.session.holding = null;
    this.overlay = h("div.overlay", { role: "dialog", "aria-modal": "true", "data-kind": kind }, card);
    this.el.append(this.overlay);
    focus?.focus();
    this.app.wake();
  }

  private closeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  /** A full-screen story scene (src/render/story.ts) with a caption; skipped without painted art. */
  private showStory(id: StoryId, then: () => void) {
    const atlas = paintedAtlas();
    if (!canDrawStory(atlas, id)) return then();
    const canvas = h("canvas.story-art", { "aria-hidden": "true" }) as HTMLCanvasElement;
    const go = h("button.big.primary", { onclick: () => then() }, t(id === "finale" ? "story.finale.go" : "story.next"));
    const caption = h("div.card.story-caption", null, h("h2", null, t(id === "finale" ? "story.finale.title" : `area.${id}`)), h("p.say", null, t(`story.${id}`)), go);
    this.openOverlay("story", h("div.story", null, canvas, caption), go);
    const ctx = canvas.getContext("2d")!;
    const start = performance.now();
    const draw = () => {
      if (!canvas.isConnected) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
      // keep the troupe clear of the caption
      const top = (caption.offsetTop + caption.offsetHeight + 8) / canvas.clientHeight;
      const still = this.app.scene.reducedMotion || this.app.stillTick !== null;
      drawStory(ctx, w, h, atlas, id, { t: still ? 0 : (performance.now() - start) / 1000, top });
      if (!still) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  private showIntro() {
    const go = h("button.big.primary", { onclick: () => this.closeIntro() }, t("intro.go"));
    // Plan §10.2: the first time a defense or friend appears, show its picture.
    const news = firstAppearances(this.session.level.id);
    this.openOverlay(
      "intro",
      h(
        "div.card.intro",
        null,
        portrait("jimothy-wave", 160, 120),
        h("p.say", null, t(this.session.level.intro!.textKey)),
        news.length
          ? h(
              "div.news",
              null,
              ...news.map((n) =>
                h("figure.new-thing", null, portrait(n.id, 96, 72), h("figcaption", null, t(`${n.kind}.${n.id}`))),
              ),
            )
          : null,
        go,
      ),
      go,
    );
  }

  private closeIntro() {
    this.closeOverlay();
    this.session.frozen = false;
    this.maybeTutorial();
    this.focus();
    this.app.wake();
  }

  /** Level 1-1's first visit: point at the cricket card and wait for a tap (plan §10.2). */
  private maybeTutorial() {
    const level = this.session.level;
    if (!level.tutorial || this.session.replaying || this.app.save.data.levels[level.id]?.cleared) return;
    this.session.frozen = true;
    this.tutorialStep = 1;
    this.tutorial = h(
      "div.tutorial",
      null,
      h("p.bubble", null, t("tutorial.card")),
      svg(handIcon, "hand"),
    );
    this.el.append(this.tutorial);
  }

  private advanceTutorial() {
    this.tutorialStep = 2;
    this.tutorial?.replaceChildren(h("p.bubble", null, t("tutorial.again")));
    this.tutorial?.classList.add("later");
    setTimeout(() => {
      this.tutorial?.remove();
      this.tutorial = null;
      this.tutorialStep = 0;
    }, 5000);
  }

  private pause() {
    if (this.session.st.outcome) return;
    const resume = h("button.big.primary", { onclick: () => this.resume() }, t("pause.resume"));
    this.openOverlay(
      "pause",
      h(
        "div.card",
        null,
        h("h2", null, t("pause.title")),
        resume,
        h("button.big", { onclick: () => this.app.playLevel(this.session.level.id, { skipIntro: true }) }, t("pause.restart")),
        h("button.big", { onclick: () => this.showNightEnded() }, t("pause.callIt")),
        h("button.big", { onclick: () => this.app.showMap() }, t("pause.map")),
        h("button.big", { onclick: () => openSettings(this.app) }, t("settings.title")),
      ),
      resume,
    );
  }

  private resume() {
    this.closeOverlay();
    this.session.frozen = this.tutorialStep === 1;
    this.focus();
    this.app.wake();
  }

  private showEnd() {
    if (this.session.st.outcome?.kind === "won") this.showWin();
    else this.showNightEnded();
  }

  private showWin() {
    const st = this.session.st;
    const id = this.session.level.id;
    const earned = st.outcome!.moons;
    // the finale's story card plays before the results, the first time the last level is won
    const finale = id === levelOrder.at(-1) && !this.app.save.data.levels[id]?.cleared && !this.session.replaying;
    const { recruit, acorns } = this.app.save.recordWin(id, earned);
    void this.app.save.store();
    const nextId = levelOrder[levelOrder.indexOf(id) + 1];
    const next = nextId
      ? h("button.big.primary", { onclick: () => this.app.playLevel(nextId) }, t("results.next"))
      : null;
    const again = h("button.big", { onclick: () => this.app.playLevel(id, { skipIntro: true }) }, t("results.again"));
    const results = () => {
      this.openOverlay(
        "results",
        h(
          "div.card.results",
          null,
          portrait("jimothy-happy", 120, 90),
          h("h2", null, t("results.title")),
          moons(earned, "moons large"),
          acorns > 0 ? h("p.acorns-won", null, paintedIcon("acorn", acornIcon), t("results.acorns", { n: acorns })) : null,
          recruit
            ? h("div.recruit", null, portrait(recruit, 112, 80), h("p", null, t("results.recruit", { unit: t(`unit.${recruit}`) })))
            : null,
          h("div.row", null, next, again, h("button.big", { onclick: () => this.app.showMap() }, t("results.map"))),
        ),
        next ?? again,
      );
      // a little fanfare for the new friend, once the win jingle has played
      if (recruit) setTimeout(() => this.app.audio.play("recruit"), 900);
    };
    if (finale) this.showStory("finale", results);
    else results();
  }

  private showNightEnded() {
    const again = h("button.big.primary", { onclick: () => this.app.playLevel(this.session.level.id, { skipIntro: true }) }, t("night.again"));
    this.openOverlay(
      "night",
      h(
        "div.card.night-card",
        null,
        portrait("jimothy-sleepy", 120, 90),
        h("h2", null, t("night.title")),
        h("p", null, t("night.body")),
        again,
        h("button.big", { onclick: () => this.app.showMap() }, t("night.map")),
      ),
      again,
    );
  }
}

/** Defenses and friends that appear for the first time in this level, in campaign order. */
export function firstAppearances(levelId: string): { kind: "defense" | "unit"; id: UnitId | DefenseId }[] {
  const seenDefenses = new Set<string>();
  const before = levelOrder.slice(0, levelOrder.indexOf(levelId));
  for (const id of before) for (const d of levelById(id)?.defenses ?? []) seenDefenses.add(d.def);
  const level = levelById(levelId);
  const out: { kind: "defense" | "unit"; id: UnitId | DefenseId }[] = [];
  for (const d of level?.defenses ?? []) {
    if (!seenDefenses.has(d.def)) {
      seenDefenses.add(d.def);
      out.push({ kind: "defense", id: d.def });
    }
  }
  const prevId = before.at(-1);
  const had = prevId ? unitsAvailableAt(prevId) : [];
  for (const u of unitsAvailableAt(levelId)) if (prevId && !had.includes(u)) out.push({ kind: "unit", id: u });
  return out;
}
