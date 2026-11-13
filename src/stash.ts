// Jimothy's stash: every treasure in the game, where it comes from, and which ones you've found.

import { levelOrder, treasures } from "./data/content.ts";
import { weekdayOf } from "./daily.ts";
import type { SaveData } from "./save.ts";

export type TreasureSource =
  | { kind: "clear" | "moons" | "goal"; level: string }
  | { kind: "daily"; weekday: number }; // 0 = Sunday

export interface TreasureEntry {
  id: string;
  source: TreasureSource;
}

/** Every treasure, in campaign order (clear, three moons, goal for each level), then the week's. */
export function catalog(): TreasureEntry[] {
  const out: TreasureEntry[] = [];
  for (const level of levelOrder) {
    const t = treasures.levels[level];
    if (!t) continue;
    for (const kind of ["clear", "moons", "goal"] as const) out.push({ id: t.items[kind], source: { kind, level } });
  }
  treasures.daily.forEach((id, weekday) => out.push({ id, source: { kind: "daily", weekday } }));
  return out;
}

/** The treasures this save has found. */
export function foundTreasures(save: SaveData): Set<string> {
  const out = new Set(save.treasures);
  for (const [level, t] of Object.entries(treasures.levels)) {
    const rec = save.levels[level];
    if (rec?.cleared) out.add(t.items.clear);
    if (rec && rec.moons >= 3) out.add(t.items.moons);
  }
  for (const [key, moons] of Object.entries(save.daily)) if (moons > 0) out.add(treasures.daily[weekdayOf(key)]!);
  return out;
}
