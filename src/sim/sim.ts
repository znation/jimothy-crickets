// The deterministic simulation. No DOM, no clocks, no Math.random: an attempt is a level, a seed
// and a list of SendInputs, and replaying them always gives the same result.

import { closestS, makeLane, pointAt, type Lane } from "./lane.ts";
import { nextRandom } from "./rng.ts";
import type {
  Content,
  DefenseState,
  LevelDef,
  Outcome,
  SendInput,
  SimEvent,
  UnitDef,
  UnitId,
  UnitState,
} from "./types.ts";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const DEFAULT_MAX_UNITS = 120;
/** How far from a lane a defense can be and still get chewed by a sapper walking past. */
export const CHEW_REACH = 200;
const COVERAGE_STEP = 2; // px between samples when precomputing coverage intervals

export interface SimState {
  level: LevelDef;
  content: Content;
  lanes: Lane[];
  available: UnitId[];
  tick: number;
  nightTicks: number;
  rng: number;
  snacks: number;
  pileHp: number;
  units: UnitState[];
  defenses: DefenseState[];
  sendCooldown: Partial<Record<UnitId, number>>; // ticks until each unit type can be sent
  nextUid: number;
  outcome: Outcome | null;
  stats: { sent: number; shooed: number; arrived: number };
}

export function createSim(
  level: LevelDef,
  content: Content,
  opts: { seed: number; available: UnitId[] },
): SimState {
  const lanes = level.lanes.map((l) => makeLane(l.points));
  const defenses = level.defenses.map((p, index): DefenseState => {
    const def = content.defenses[p.def];
    const facingDeg = p.facingDeg ?? 180;
    const blockLane = def.effect.blocks ? (p.lane ?? 0) : -1;
    return {
      index,
      def,
      pos: p.pos,
      facingDeg,
      coverage: lanes.map((lane) => coverage(lane, def.shape, p.pos, facingDeg)),
      chewS: lanes.map((lane, li) => {
        if (def.effect.blocks) return li === blockLane ? closestS(lane, p.pos).s : null;
        if (def.chewHp === undefined) return null;
        const c = closestS(lane, p.pos);
        return c.dist <= CHEW_REACH ? c.s : null;
      }),
      blockLane,
      blockS: blockLane >= 0 ? closestS(lanes[blockLane]!, p.pos).s : 0,
      cooldown: 0,
      windupTicks: 0,
      windupTarget: -1,
      chewLeft: def.effect.blocks?.hp ?? def.chewHp ?? 0,
      disabled: false,
      lastFiredTick: -Infinity,
    };
  });
  return {
    level,
    content,
    lanes,
    available: opts.available,
    tick: 0,
    nightTicks: Math.round(level.nightLength * TICK_RATE),
    rng: opts.seed >>> 0,
    snacks: level.economy.startSnacks,
    pileHp: level.pile.hp,
    units: [],
    defenses,
    sendCooldown: {},
    nextUid: 1,
    outcome: null,
    stats: { sent: 0, shooed: 0, arrived: 0 },
  };
}

/** Why a send would be rejected right now, or null if it would succeed. */
export function sendBlocker(st: SimState, unit: UnitId, lane: number) {
  if (!st.available.includes(unit)) return "locked" as const;
  if (lane < 0 || lane >= st.lanes.length) return "lane" as const;
  if ((st.sendCooldown[unit] ?? 0) > 0) return "cooldown" as const;
  if (st.snacks < st.content.units[unit].cost) return "snacks" as const;
  if (st.units.length >= (st.level.maxUnits ?? DEFAULT_MAX_UNITS)) return "crowded" as const;
  return null;
}

/** Advance one tick. Inputs are applied first; their `tick` should equal `st.tick`. */
export function step(st: SimState, inputs: readonly SendInput[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  if (st.outcome) return events;

  for (const input of inputs) send(st, input, events);

  st.snacks += st.level.economy.trickle * DT;
  for (const id in st.sendCooldown) {
    const k = id as UnitId;
    if (st.sendCooldown[k]! > 0) st.sendCooldown[k]!--;
  }

  for (const u of st.units) move(st, u);
  chew(st, events);
  arrive(st, events);
  for (const d of st.defenses) fire(st, d, events);

  if (st.units.some((u) => u.gone)) st.units = st.units.filter((u) => !u.gone);

  st.tick++;
  if (st.pileHp <= 0) {
    const moons = moonsFor(st.level, (st.nightTicks - st.tick) / TICK_RATE);
    st.outcome = { kind: "won", tick: st.tick, moons };
    events.push({ type: "levelWon", moons });
  } else if (st.tick >= st.nightTicks) {
    st.outcome = { kind: "nightEnded", tick: st.tick, moons: 0 };
    events.push({ type: "nightEnded" });
  }
  return events;
}

export function moonsFor(level: LevelDef, secondsLeft: number): number {
  let moons = 1; // every clear earns at least one moon
  for (let i = 1; i < 3; i++) if (secondsLeft >= level.moons[i]!) moons = i + 1;
  return moons;
}

function send(st: SimState, input: SendInput, events: SimEvent[]) {
  const reason = sendBlocker(st, input.unit, input.lane);
  if (reason) {
    events.push({ type: "sendRejected", unit: input.unit, reason });
    return;
  }
  const def = st.content.units[input.unit];
  st.snacks -= def.cost;
  st.sendCooldown[input.unit] = Math.round(def.sendCooldown * TICK_RATE);
  const uid = st.nextUid++;
  st.units.push({
    uid,
    def,
    lane: input.lane,
    s: 0,
    prevS: 0,
    hp: def.hp,
    jitter: nextRandom(st) * 2 - 1,
    slowFactor: 1,
    slowTicks: 0,
    stunTicks: 0,
    flopTicks: 0,
    flopHits: 0,
    chewing: -1,
    gone: false,
  });
  st.stats.sent++;
  events.push({ type: "unitSent", uid, unit: input.unit, lane: input.lane });
}

function move(st: SimState, u: UnitState) {
  u.prevS = u.s;
  if (u.slowTicks > 0 && --u.slowTicks === 0) u.slowFactor = 1;
  if (u.stunTicks > 0) {
    u.stunTicks--;
    return;
  }
  if (u.flopTicks > 0) {
    if (--u.flopTicks === 0) u.flopHits = 0;
    return;
  }
  if (u.chewing >= 0) return;

  let next = u.s + u.def.speed * u.slowFactor * DT;
  const ground = u.def.tags.includes("ground");
  const sapper = u.def.traits?.sapper !== undefined;
  for (const d of st.defenses) {
    if (d.disabled) continue;
    const stopAt = d.chewS[u.lane];
    if (stopAt == null || stopAt < u.s || stopAt > next) continue;
    const isFence = d.blockLane === u.lane;
    if (isFence && ground) next = stopAt;
    if (sapper && (isFence || !d.def.effect.blocks)) {
      next = stopAt;
      u.chewing = d.index;
    }
  }
  u.s = next;
}

function chew(st: SimState, events: SimEvent[]) {
  for (const u of st.units) {
    if (u.chewing < 0 || u.stunTicks > 0) continue;
    const d = st.defenses[u.chewing]!;
    if (d.disabled) {
      u.chewing = -1;
      continue;
    }
    d.chewLeft -= (u.def.traits?.sapper?.chewDps ?? 0) * DT;
    if (d.chewLeft <= 0) {
      d.disabled = true;
      events.push({ type: "defenseChewed", index: d.index });
      for (const v of st.units) if (v.chewing === d.index) v.chewing = -1;
    }
  }
}

function arrive(st: SimState, events: SimEvent[]) {
  for (const u of st.units) {
    if (u.gone || u.s < st.lanes[u.lane]!.length) continue;
    u.gone = true; // it wanders off with a snack
    st.pileHp = Math.max(0, st.pileHp - u.def.pileDamage);
    st.snacks += u.def.haul;
    st.stats.arrived++;
    events.push({ type: "pileHit", uid: u.uid, unit: u.def.id, damage: u.def.pileDamage, haul: u.def.haul });
  }
}

function fire(st: SimState, d: DefenseState, events: SimEvent[]) {
  const e = d.def.effect;
  if (d.disabled || e.blocks || !e.rate) return;
  if (d.cooldown > 0) d.cooldown--;

  if (d.windupTicks > 0) {
    if (--d.windupTicks > 0) return;
    const target = st.units.find((u) => u.uid === d.windupTarget && !u.gone);
    d.windupTarget = -1;
    d.cooldown = Math.round(TICK_RATE / e.rate);
    if (target && inRange(d, target)) {
      d.lastFiredTick = st.tick;
      events.push({ type: "defenseFired", index: d.index, targets: [target.uid] });
      hit(st, d, target, events);
    } else if (target) {
      events.push({ type: "defenseMissed", index: d.index, uid: target.uid });
    }
    return;
  }
  if (d.cooldown > 0) return;

  let best: UnitState | null = null;
  const all: UnitState[] = [];
  for (const u of st.units) {
    if (u.gone || !inRange(d, u)) continue;
    if (e.all) all.push(u);
    else if (!best || progress(st, u) > progress(st, best)) best = u;
  }
  if (e.all) {
    if (all.length === 0) return;
    d.cooldown = Math.round(TICK_RATE / e.rate);
    d.lastFiredTick = st.tick;
    events.push({ type: "defenseFired", index: d.index, targets: all.map((u) => u.uid) });
    for (const u of all) hit(st, d, u, events);
  } else if (best) {
    if (e.windup) {
      d.windupTicks = Math.round(e.windup * TICK_RATE);
      d.windupTarget = best.uid;
      return;
    }
    d.cooldown = Math.round(TICK_RATE / e.rate);
    d.lastFiredTick = st.tick;
    events.push({ type: "defenseFired", index: d.index, targets: [best.uid] });
    hit(st, d, best, events);
  }
}

function hit(st: SimState, d: DefenseState, u: UnitState, events: SimEvent[]) {
  if (u.flopTicks > 0 && u.flopHits > 0) {
    u.flopHits--; // playing dead: the hit is shrugged off
    return;
  }
  const e = d.def.effect;
  events.push({ type: "unitHit", uid: u.uid, index: d.index });
  if (e.damage) u.hp -= e.damage;
  if (u.hp <= 0) {
    u.gone = true;
    st.stats.shooed++;
    events.push({ type: "unitShooed", uid: u.uid, unit: u.def.id, lane: u.lane, s: u.s });
    return;
  }
  if (e.slow) {
    u.slowFactor = Math.min(u.slowFactor, e.slow.factor);
    u.slowTicks = Math.max(u.slowTicks, Math.round(e.slow.secs * TICK_RATE));
  }
  if (e.stun) u.stunTicks = Math.max(u.stunTicks, Math.round(e.stun.secs * TICK_RATE));
  if (e.pushback) {
    u.s = Math.max(0, u.s - e.pushback.px * (u.def.pushbackScale ?? 1));
    u.chewing = -1;
  }
  const pd = u.def.traits?.playDead;
  if (pd && nextRandom(st) < pd.chance) {
    u.flopTicks = Math.round(pd.secs * TICK_RATE);
    u.flopHits = pd.ignoreHits;
    u.chewing = -1;
    events.push({ type: "unitPlayedDead", uid: u.uid });
  }
}

export function targetable(def: UnitDef, targets: readonly string[]): boolean {
  return def.tags.some((t) => targets.includes(t));
}

export function inRange(d: DefenseState, u: UnitState): boolean {
  if (!targetable(u.def, d.def.targets)) return false;
  for (const [a, b] of d.coverage[u.lane]!) if (u.s >= a && u.s <= b) return true;
  return false;
}

function progress(st: SimState, u: UnitState): number {
  return u.s / st.lanes[u.lane]!.length;
}

function coverage(
  lane: Lane,
  shape: DefenseState["def"]["shape"],
  pos: [number, number],
  facingDeg: number,
): [number, number][] {
  const out: [number, number][] = [];
  const fx = Math.cos((facingDeg * Math.PI) / 180);
  const fy = Math.sin((facingDeg * Math.PI) / 180);
  const minCos = shape.kind === "cone" ? Math.cos((shape.arcDeg * Math.PI) / 360) : -1;
  let start = -1;
  let last = 0; // the last sample inside the shape
  const p: [number, number] = [0, 0];
  for (let s = 0; ; s += COVERAGE_STEP) {
    const ss = Math.min(s, lane.length);
    pointAt(lane, ss, p);
    const dx = p[0] - pos[0];
    const dy = p[1] - pos[1];
    const dist = Math.hypot(dx, dy);
    const inside = dist <= shape.r && (shape.kind === "radius" || dist === 0 || (dx * fx + dy * fy) / dist >= minCos);
    if (inside) {
      if (start < 0) start = ss;
      last = ss;
    } else if (start >= 0) {
      out.push([start, last]);
      start = -1;
    }
    if (ss === lane.length) break;
  }
  if (start >= 0) out.push([start, last]);
  return out;
}
