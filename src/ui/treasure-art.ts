// Pictures for the stash: treasure icons, and each treasure goal drawn as a little rebus
// ("possum ×4 ➜ pile", "dog ♥ squirrel") so a four-year-old can read it without words.

import { content } from "../data/content.ts";
import type { Goal } from "../sim/goals.ts";
import type { UnitId } from "../sim/types.ts";
import { h, svg } from "./dom.ts";
import { pileIcon } from "./icons.ts";
import { paintedIcon, portrait } from "./portrait.ts";
import { t } from "./strings.ts";
import { treasureSvg } from "./treasures.ts";

/** A treasure picture: painted (`treasure-<id>`) when the atlas has one, else the SVG. */
export function treasureIcon(id: string, cls = ""): Element {
  const el = paintedIcon(`treasure-${id}`, treasureSvg(id), 64);
  el.classList.add("treasure");
  for (const c of cls.split(" ").filter(Boolean)) el.classList.add(c);
  return el;
}

/** A small pink heart, for "the dog ♥ squirrels". */
export function heartIcon() {
  return svg(
    `<svg viewBox="0 0 52 44" width="40" height="34" aria-hidden="true"><path d="M26 40C4 24 6 4 26 14 46 4 48 24 26 40Z" fill="#ff7fae" stroke="#2a2233" stroke-width="5" stroke-linejoin="round"/></svg>`,
    "pair-heart",
  );
}

const biteIcon = `<svg viewBox="0 0 40 40"><path d="M6 12l5 8 5-8 5 8 5-8 5 8 4-8M6 30l5-8 5 8 5-8 5 8 5-8 4 8" fill="none" stroke="#2a2233" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

/** The goal as a picture, sized by portrait height in px. */
export function goalPicture(goal: Goal, units: readonly UnitId[], px = 48): HTMLElement {
  const w = Math.round((px * 4) / 3);
  const face = (id: string, scale = 1) => portrait(id, Math.round(w * scale), Math.round(px * scale));
  const times = (n: number) => (n > 1 ? h("span.goal-times", null, `×${n}`) : null);
  const arrow = () => h("span.goal-arrow", null, "➜");
  const pile = () => paintedIcon("pile", pileIcon);
  let parts: (Node | null)[];
  switch (goal.kind) {
    case "chain":
      parts = [pile(), h("span.goal-bubble", null, `×${goal.n}`)];
      break;
    case "deliver":
      parts = [face(goal.unit), times(goal.n), arrow(), pile()];
      break;
    case "playDead": {
      const possum = face("possum");
      possum.classList.add("flop");
      parts = [possum, h("span.goal-zzz", null, "z z"), times(goal.n)];
      break;
    }
    case "distract":
      parts = [face(goal.defense), heartIcon(), face(content.defenses[goal.defense].distractedBy!.unit), times(goal.n)];
      break;
    case "chew":
      parts = [face("rat"), svg(biteIcon, "goal-bite"), face(goal.defense)];
      break;
    case "fullHouse":
      parts = [...units.map((u) => face(u, units.length > 4 ? 0.6 : 0.75)), arrow(), pile()];
      break;
  }
  return h(`div.goal-pic${goal.kind === "fullHouse" ? ".many" : ""}`, { "aria-hidden": "true", style: `--px:${px}px` }, ...parts);
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The goal in words, for grown-ups and screen readers. */
export function goalText(goal: Goal): string {
  switch (goal.kind) {
    case "chain":
      return t("goal.chain", { n: goal.n });
    case "deliver":
      return t("goal.deliver", { n: goal.n, unit: t(`plural.${goal.unit}`) });
    case "playDead":
      return goal.n > 1 ? t("goal.playDead", { n: goal.n }) : t("goal.playDead.one");
    case "distract": {
      const defense = lower(t(`defense.${goal.defense}`));
      return goal.n > 1 ? t("goal.distract", { defense, n: goal.n }) : t("goal.distract.one", { defense });
    }
    case "chew":
      return t("goal.chew", { defense: lower(t(`defense.${goal.defense}`)) });
    case "fullHouse":
      return t("goal.fullHouse");
  }
}
