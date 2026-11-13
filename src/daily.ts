// The surprise yard: a daily remix of a level you've cleared, made on the device from the date.
// Same lanes and pile, new defenses in new places, a slightly different pile and snack trickle.
// The sim is deterministic, so before offering a remix the game runs a handful of bot strategies
// on it: an unwinnable remix is thrown away, and the moons are set from how well the bots did.

import { content, levelById, levelOrder, unitsAvailableAt } from "./data/content.ts";
import { directionAt, makeLane, pointAt, closestS } from "./sim/lane.ts";
import { nextRandom } from "./sim/rng.ts";
import { bot, runAttempt, strategySpace } from "./sim/run.ts";
import type { DefenseId, DefensePlacement, LevelDef, UnitId, Vec } from "./sim/types.ts";

/** What the game keeps about a day's yard, so it stays the same all day. */
export interface DailyPlan {
  key: string; // the date, "2026-11-13"
  base: string; // the level it remixes
  attempt: number; // which remix of that day passed the check (-1: the base level itself)
  moons: [number, number, number];
}

const ATTEMPTS = 6;
const CHECK_STRATEGIES = 12;
const PLAY_Y = { min: 235, max: 765 }; // inside validate.ts's HUD-free band, with a margin
const FIELD_X = { min: 470, max: 1600 };

/** Today's date as the player sees it, "YYYY-MM-DD". */
export function dateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 0 = Sunday, like Date.getDay. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getDay();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Which cleared level the day remixes. */
export function dailyBase(key: string, cleared: readonly string[]): string {
  const pool = levelOrder.filter((id) => cleared.includes(id));
  if (!pool.length) return levelOrder[0]!;
  return pool[hash(key) % pool.length]!;
}

/** The defenses a player has met by the end of `levelId`. */
function defensesMetBy(levelId: string): DefenseId[] {
  const out = new Set<DefenseId>();
  for (const id of levelOrder.slice(0, levelOrder.indexOf(levelId) + 1))
    for (const d of levelById(id)!.defenses) out.add(d.def);
  return [...out];
}

/** Remix number `attempt` of `baseId` for the day `key`. Deterministic. */
export function remixLevel(key: string, baseId: string, attempt: number): LevelDef {
  const base = levelById(baseId)!;
  const rng = { rng: hash(`${key}#${baseId}#${attempt}`) };
  const r = () => nextRandom(rng);
  const between = (a: number, b: number) => a + (b - a) * r();
  const lanes = base.lanes.map((l) => makeLane(l.points));
  const pool = defensesMetBy(baseId);
  const units = unitsAvailableAt(baseId);
  // fences need rats to get past; never more than one per lane, and always leave one lane open
  const fenceOk = pool.includes("fence") && units.includes("rat");
  const fenced = new Set<number>();

  // the first few tries may add a defense; later ones stay at the base level's count and pile
  const gentle = attempt >= ATTEMPTS / 2;
  const count = Math.max(1, base.defenses.length + (!gentle && r() < 0.5 ? 1 : 0));
  const placed: DefensePlacement[] = [];
  for (let i = 0; i < count; i++) {
    let def = pool[Math.floor(r() * pool.length)]!;
    if (def === "fence" && (!fenceOk || fenced.size >= lanes.length - 1)) def = "sprinkler";
    for (let tries = 0; tries < 40; tries++) {
      const li = Math.floor(r() * lanes.length);
      const lane = lanes[li]!;
      const s = lane.length * between(def === "fence" ? 0.35 : 0.2, def === "fence" ? 0.7 : 0.85);
      const p = pointAt(lane, s, [0, 0]);
      const [dx, dy] = directionAt(lane, s);
      const side = r() < 0.5 ? -1 : 1;
      const off = def === "fence" ? 0 : between(70, 150);
      const pos: Vec = [Math.round(p[0] - dy * side * off), Math.round(p[1] + dx * side * off)];
      if (def === "fence" && fenced.has(li)) continue;
      if (!fits(pos, def, placed, lanes, base.pile.pos)) continue;
      const out: DefensePlacement = { def, pos };
      if (def === "fence") {
        out.lane = li;
        fenced.add(li);
      }
      if (def === "motionLight") {
        // aim at the lane a little further along, the way the hand-made levels do
        const aim = pointAt(lane, Math.min(lane.length, s + 160), [0, 0]);
        out.facingDeg = Math.round((Math.atan2(aim[1] - pos[1], aim[0] - pos[0]) * 180) / Math.PI);
      }
      placed.push(out);
      break;
    }
  }
  return {
    ...base,
    id: "daily",
    intro: { textKey: "intro.daily" },
    defenses: placed,
    pile: { ...base.pile, hp: Math.round(base.pile.hp * between(0.9, gentle ? 1 : 1.1)) },
    economy: { ...base.economy, trickle: Math.round(base.economy.trickle * between(0.95, 1.12) * 10) / 10 },
    unitsAvailable: units,
    tutorial: undefined,
  };
}

function fits(pos: Vec, def: DefenseId, placed: DefensePlacement[], lanes: ReturnType<typeof makeLane>[], pile: Vec) {
  if (pos[1] < PLAY_Y.min || pos[1] > PLAY_Y.max || pos[0] < FIELD_X.min || pos[0] > FIELD_X.max) return false;
  if (Math.hypot(pos[0] - pile[0], pos[1] - pile[1]) < 240) return false;
  for (const o of placed) if (Math.hypot(pos[0] - o.pos[0], pos[1] - o.pos[1]) < (def === "fence" || o.def === "fence" ? 110 : 150)) return false;
  // keep everything but fences off the paths, so nobody stands on the road
  if (def !== "fence") for (const l of lanes) if (closestS(l, pos).dist < 55) return false;
  return true;
}

export interface CheckResult {
  wins: number;
  tried: number;
  bestLeft: number; // seconds of night the best winning bot had left
}

/** The bot strategies a remix is checked with: a spread across the full strategy space. */
export function checkStrategies(units: readonly UnitId[]) {
  const all = strategySpace(units);
  const step = Math.max(1, Math.floor(all.length / CHECK_STRATEGIES));
  return all.filter((_, i) => i % step === 0).slice(0, CHECK_STRATEGIES);
}

/** Run the check bots on one remix. `yieldEvery` lets a browser breathe between attempts. */
export async function checkLevel(level: LevelDef, yieldEvery?: () => Promise<void>): Promise<CheckResult> {
  const units = level.unitsAvailable!;
  let wins = 0;
  let bestLeft = 0;
  const strategies = checkStrategies(units);
  for (const s of strategies) {
    const r = runAttempt(level, content, { seed: 1, available: units, policy: bot(s) });
    if (r.outcome.kind === "won") {
      wins++;
      bestLeft = Math.max(bestLeft, r.nightLeft * level.nightLength);
    }
    await yieldEvery?.();
  }
  return { wins, tried: strategies.length, bestLeft };
}

/** A remix passes if a bot can win it with a fifth of the night to spare. */
export function passes(level: LevelDef, c: CheckResult) {
  return c.wins > 0 && c.bestLeft >= level.nightLength * 0.2;
}

/** Moons from the best bot: two for about half its margin, three for most of it. */
export function moonsFrom(c: CheckResult): [number, number, number] {
  return [0, Math.round(c.bestLeft * 0.4), Math.round(c.bestLeft * 0.75)];
}

/** Make (or remake) the day's plan: the first remix that passes, else the base level unchanged. */
export async function planDaily(key: string, cleared: readonly string[], yieldEvery?: () => Promise<void>): Promise<DailyPlan> {
  const base = dailyBase(key, cleared);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const level = remixLevel(key, base, attempt);
    const c = await checkLevel(level, yieldEvery);
    if (passes(level, c)) return { key, base, attempt, moons: moonsFrom(c) };
  }
  return { key, base, attempt: -1, moons: levelById(base)!.moons };
}

/** The playable level for a plan. */
export function dailyLevel(plan: DailyPlan): LevelDef {
  const level =
    plan.attempt >= 0
      ? remixLevel(plan.key, plan.base, plan.attempt)
      : { ...levelById(plan.base)!, id: "daily", intro: { textKey: "intro.daily" }, unitsAvailable: unitsAvailableAt(plan.base), tutorial: undefined };
  return { ...level, moons: plan.moons };
}
