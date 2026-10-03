// Headless attempts: run a level from a seed and an input list (or a bot) to the end of the night.

import { createSim, sendBlocker, step, TICK_RATE, type SimState } from "./sim.ts";
import type { Content, LevelDef, Outcome, Reference, SendInput, UnitId } from "./types.ts";

export interface AttemptResult {
  level: string;
  outcome: Outcome;
  seconds: number; // how long the attempt took
  nightLeft: number; // fraction of the night remaining when it ended
  pileTrace: number[]; // pile hp at each whole second
  stats: SimState["stats"];
  sentByUnit: Partial<Record<UnitId, number>>;
  inputs: SendInput[]; // the sends that were accepted
}

export type Policy = (st: SimState) => SendInput | null;

export function runAttempt(
  level: LevelDef,
  content: Content,
  opts: { seed: number; available: UnitId[]; inputs?: readonly SendInput[]; policy?: Policy },
): AttemptResult {
  const st = createSim(level, content, { seed: opts.seed, available: opts.available });
  const inputs = [...(opts.inputs ?? [])].sort((a, b) => a.tick - b.tick);
  const accepted: SendInput[] = [];
  const sentByUnit: AttemptResult["sentByUnit"] = {};
  const pileTrace: number[] = [];
  let next = 0;
  while (!st.outcome) {
    if (st.tick % TICK_RATE === 0) pileTrace.push(st.pileHp);
    const now: SendInput[] = [];
    while (next < inputs.length && inputs[next]!.tick <= st.tick) now.push({ ...inputs[next++]!, tick: st.tick });
    const botSend = opts.policy?.(st);
    if (botSend) now.push(botSend);
    for (const e of step(st, now)) {
      if (e.type === "unitSent") {
        sentByUnit[e.unit] = (sentByUnit[e.unit] ?? 0) + 1;
        accepted.push({ tick: st.tick - 1, unit: e.unit, lane: e.lane });
      }
    }
  }
  pileTrace.push(st.pileHp);
  return {
    level: level.id,
    outcome: st.outcome,
    seconds: st.tick / TICK_RATE,
    nightLeft: Math.max(0, 1 - st.tick / st.nightTicks),
    pileTrace,
    stats: st.stats,
    sentByUnit,
    inputs: accepted,
  };
}

export function referenceInputs(ref: Reference): SendInput[] {
  return ref.inputs.map(([tick, unit, lane]) => ({ tick, unit, lane }));
}

export function toReference(seed: number, inputs: readonly SendInput[]): Reference {
  return { seed, inputs: inputs.map((i) => [i.tick, i.unit, i.lane]) };
}

export interface BotOptions {
  weights?: Partial<Record<UnitId, number>>; // share of snacks to spend on each unit (default equal)
  burst?: number; // save up to this many snacks, then send until broke (bunches units up)
}

/**
 * A cheap greedy player: spends snacks across unit types in proportion to `weights`, always down
 * the least-defended lane for that unit. Used for difficulty scores and to seed reference solutions.
 */
export function bot(opts: BotOptions = {}): Policy {
  const spent: Partial<Record<UnitId, number>> = {};
  let inWave = !opts.burst;
  let laneCache: Map<UnitId, number> | null = null;
  return (st) => {
    laneCache ??= new Map(st.available.map((u) => [u, leastDefendedLane(st, u)]));
    if (!inWave && st.snacks >= (opts.burst ?? 0)) inWave = true;
    if (!inWave) return null;
    let pick: UnitId | null = null;
    let best = Infinity;
    for (const u of st.available) {
      const w = opts.weights ? (opts.weights[u] ?? 0) : 1;
      if (w <= 0 || (st.sendCooldown[u] ?? 0) > 0) continue;
      const score = (spent[u] ?? 0) / w;
      if (score < best) [best, pick] = [score, u];
    }
    if (!pick) return null;
    const lane = laneCache.get(pick)!;
    if (sendBlocker(st, pick, lane)) {
      if (opts.burst && st.snacks < st.content.units[pick].cost) inWave = false;
      return null;
    }
    spent[pick] = (spent[pick] ?? 0) + st.content.units[pick].cost;
    return { tick: st.tick, unit: pick, lane };
  };
}

function leastDefendedLane(st: SimState, unit: UnitId): number {
  const def = st.content.units[unit];
  let best = 0;
  let bestThreat = Infinity;
  st.lanes.forEach((lane, li) => {
    let threat = 0;
    for (const d of st.defenses) {
      if (!def.tags.some((t) => d.def.targets.includes(t)) && d.blockLane !== li) continue;
      const covered = d.coverage[li]!.reduce((n, [a, b]) => n + b - a, 0);
      threat += covered * (d.def.effect.damage ?? 1) * (d.def.effect.rate ?? 1);
      if (d.blockLane === li && def.tags.includes("ground")) threat += 1e6;
    }
    threat /= lane.length;
    if (threat < bestThreat) [best, bestThreat] = [li, threat];
  });
  return best;
}
