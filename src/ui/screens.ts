// Screens (plan §10.1). The playfield is canvas; everything you tap is DOM over it, so buttons get
// focus rings, keyboard access and readable text for free.

import type { App } from "../app.ts";
import { campaign, levelOrder } from "../data/content.ts";
import type { LevelSession } from "../play.ts";
import { closestS } from "../sim/lane.ts";
import { UNIT_IDS, type UnitId } from "../sim/types.ts";
import { h, svg } from "./dom.ts";
import { cogIcon, handIcon, moonIcon, pauseIcon, pileIcon, snackIcon } from "./icons.ts";
import { portrait } from "./portrait.ts";
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
        portrait("jimothy", 200, 150),
        h("h1", null, "Jimothy ", h("span", null, "Crickets")),
        h("p.tagline", null, t("title.tagline")),
        this.play,
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
  private first: HTMLButtonElement | null = null;
  private app: App;

  constructor(app: App) {
    this.app = app;
    const save = app.save.data;
    const unlockAll = app.params.get("unlock") === "all";
    const areas = campaign.areas.map((area) => {
      const nodes = area.levels.map((id) => {
        const i = levelOrder.indexOf(id);
        const unlocked = unlockAll || i === 0 || !!save.levels[levelOrder[i - 1]!]?.cleared;
        const best = save.levels[id]?.moons ?? 0;
        const btn = h(
          "button.level-node",
          {
            disabled: !unlocked,
            onclick: () => app.playLevel(id),
            "aria-label": unlocked ? `Level ${id}` : `Level ${id}, ${t("map.locked")}`,
            "data-level": id,
          },
          h("span.level-id", null, id),
          unlocked ? moons(best, "moons small") : h("span.lock", null, "🔒"),
        );
        if (unlocked) this.first = btn; // focus the furthest unlocked level
        return btn;
      });
      return h("section.area", null, h("h2", null, t(`area.${area.id}`)), h("div.path", null, ...nodes));
    });
    this.el = h(
      "div.screen.map",
      null,
      h(
        "div.topbar",
        null,
        h("button.icon-btn", { onclick: () => app.showTitle(), "aria-label": "Back" }, "‹"),
        h("button.icon-btn", { onclick: () => this.settings(), "aria-label": "Settings" }, svg(cogIcon)),
      ),
      ...areas,
    );
  }

  focus() {
    this.first?.focus();
  }

  private settings() {
    const save = this.app.save;
    const reduced = h("input", {
      type: "checkbox",
      checked: save.data.settings.reducedMotion,
      onchange: () => {
        save.data.settings.reducedMotion = reduced.checked;
        this.app.applySettings();
        void save.store();
      },
    });
    const close = h("button.big.primary", { onclick: () => dialog.remove() }, "OK");
    const dialog = h(
      "div.overlay",
      { role: "dialog", "aria-modal": "true" },
      h(
        "div.card",
        null,
        h("h2", null, "Settings"),
        h("label.row", null, reduced, " Less motion"),
        h("p.small", null, t("settings.privacy")),
        h("p.small", null, `Version ${__APP_VERSION__}`),
        close,
      ),
    );
    this.el.append(dialog);
    close.focus();
  }
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

  readonly session: LevelSession;
  private app: App;

  constructor(app: App, session: LevelSession, opts: { skipIntro: boolean }) {
    this.app = app;
    this.session = session;
    const st = session.st;
    session.onEvents((events) => {
      app.scene.onEvents(st, events);
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
        h("span.cost", null, svg(snackIcon), String(def.cost)),
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
        h("div.pill.snacks", { "aria-label": t("hud.snacks") }, svg(snackIcon), this.snacksEl),
        h("div.pill.pile", null, svg(pileIcon), h("div.bar", null, this.pileFill)),
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
    if (session.replaying) this.el.classList.add("replaying");
    if (!opts.skipIntro && session.level.intro) this.showIntro();
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
    if (down && lane >= 0 && lane < this.session.st.lanes.length) this.session.lane = lane;
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
    if (best >= 0) this.session.lane = best;
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

  private showIntro() {
    const go = h("button.big.primary", { onclick: () => this.closeIntro() }, t("intro.go"));
    this.openOverlay(
      "intro",
      h(
        "div.card.intro",
        null,
        portrait("jimothy", 160, 120),
        h("p.say", null, t(this.session.level.intro!.textKey)),
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
    const recruit = this.app.save.recordWin(id, earned);
    void this.app.save.store();
    const nextId = levelOrder[levelOrder.indexOf(id) + 1];
    const next = nextId
      ? h("button.big.primary", { onclick: () => this.app.playLevel(nextId) }, t("results.next"))
      : null;
    const again = h("button.big", { onclick: () => this.app.playLevel(id, { skipIntro: true }) }, t("results.again"));
    this.openOverlay(
      "results",
      h(
        "div.card.results",
        null,
        h("h2", null, t("results.title")),
        moons(earned, "moons large"),
        recruit
          ? h("div.recruit", null, portrait(recruit, 112, 80), h("p", null, t("results.recruit", { unit: t(`unit.${recruit}`) })))
          : null,
        h("div.row", null, next, again, h("button.big", { onclick: () => this.app.showMap() }, t("results.map"))),
      ),
      next ?? again,
    );
  }

  private showNightEnded() {
    const again = h("button.big.primary", { onclick: () => this.app.playLevel(this.session.level.id, { skipIntro: true }) }, t("night.again"));
    this.openOverlay(
      "night",
      h(
        "div.card.night-card",
        null,
        h("h2", null, t("night.title")),
        h("p", null, t("night.body")),
        again,
        h("button.big", { onclick: () => this.app.showMap() }, t("night.map")),
      ),
      again,
    );
  }
}
