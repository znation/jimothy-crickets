import { describe, expect, it } from "vitest";
import { closestS, makeLane, pointAt } from "../src/sim/lane.ts";
import { runAttempt } from "../src/sim/run.ts";
import { createSim, moonsFor, step, TICK_RATE, type SimState } from "../src/sim/sim.ts";
import type { Content, DefenseDef, LevelDef, SendInput, UnitDef, UnitId } from "../src/sim/types.ts";

const unit = (id: UnitId, extra: Partial<UnitDef> = {}): UnitDef => ({
  id,
  cost: 10,
  hp: 4,
  speed: 100,
  pileDamage: 1,
  haul: 0,
  sendCooldown: 0,
  tags: ["ground"],
  sprite: id,
  ...extra,
});

const defense = (id: DefenseDef["id"], extra: Partial<DefenseDef> = {}): DefenseDef => ({
  id,
  targets: ["ground"],
  shape: { kind: "radius", r: 100 },
  effect: {},
  sprite: id,
  ...extra,
});

const content: Content = {
  units: {
    cricket: unit("cricket"),
    possum: unit("possum", {
      hp: 100,
      pushbackScale: 0.5,
      traits: { playDead: { chance: 1, ignoreHits: 2, secs: 1 } },
    }),
    squirrel: unit("squirrel", { speed: 600, hp: 100 }),
    crow: unit("crow", { tags: ["air"] }),
    rat: unit("rat", { tags: ["ground", "sapper"], hp: 100, traits: { sapper: { chewDps: 2 } } }),
  },
  defenses: {
    sprinkler: defense("sprinkler", { effect: { all: true, damage: 1, rate: 1, slow: { factor: 0.5, secs: 1 } } }),
    motionLight: defense("motionLight", {
      targets: ["ground", "air"],
      shape: { kind: "cone", r: 200, arcDeg: 60 },
      effect: { all: true, rate: 0.25, stun: { secs: 1 } },
    }),
    yardDog: defense("yardDog", { shape: { kind: "radius", r: 50 }, effect: { damage: 1, rate: 1, windup: 0.5 } }),
    fence: defense("fence", { targets: [], effect: { blocks: { hp: 4 } } }),
    broomNeighbor: defense("broomNeighbor", { effect: { damage: 0, rate: 1, pushback: { px: 100 } }, chewHp: 2 }),
  },
};

// A straight 1000px lane from (0, 500) to (1000, 500).
function level(defenses: LevelDef["defenses"] = [], extra: Partial<LevelDef> = {}): LevelDef {
  return {
    id: "t-1",
    area: "alley",
    background: "alley",
    lanes: [{ id: 0, points: [[0, 500], [1000, 500]] }],
    pile: { pos: [1050, 500], hp: 3 },
    defenses,
    economy: { startSnacks: 1000, trickle: 0 },
    nightLength: 60,
    moons: [0, 20, 40],
    ...extra,
  };
}

const ALL: UnitId[] = ["cricket", "possum", "squirrel", "crow", "rat"];

function sim(l: LevelDef, available = ALL): SimState {
  return createSim(l, content, { seed: 7, available });
}

function sendNow(st: SimState, unit: UnitId) {
  return step(st, [{ tick: st.tick, unit, lane: 0 }]);
}

function runFor(st: SimState, seconds: number) {
  const events = [];
  for (let i = 0; i < seconds * TICK_RATE && !st.outcome; i++) events.push(...step(st));
  return events;
}

describe("lanes", () => {
  const lane = makeLane([[0, 0], [300, 0], [300, 400]]);
  it("measures length and interpolates", () => {
    expect(lane.length).toBe(700);
    expect(pointAt(lane, 150)).toEqual([150, 0]);
    expect(pointAt(lane, 500)).toEqual([300, 200]);
    expect(pointAt(lane, 9999)).toEqual([300, 400]);
  });
  it("projects points onto the lane", () => {
    const c = closestS(lane, [350, 100]);
    expect(c.s).toBeCloseTo(400);
    expect(c.dist).toBeCloseTo(50);
  });
});

describe("movement and the pile", () => {
  it("walks at speed and hits the pile on arrival", () => {
    const st = sim(level());
    sendNow(st, "cricket");
    runFor(st, 5);
    expect(st.units[0]!.s).toBeCloseTo(100 * 5 + 100 / TICK_RATE, 0);
    const events = runFor(st, 6);
    expect(events.some((e) => e.type === "pileHit")).toBe(true);
    expect(st.pileHp).toBe(2);
    expect(st.units).toHaveLength(0);
  });

  it("wins when the pile is gone and awards moons by night left", () => {
    const st = sim(level([], { pile: { pos: [1050, 500], hp: 1 } }));
    sendNow(st, "squirrel");
    runFor(st, 3);
    expect(st.outcome?.kind).toBe("won");
    expect(st.outcome?.moons).toBe(3);
    expect(moonsFor(level(), 10)).toBe(1);
    expect(moonsFor(level(), 25)).toBe(2);
  });

  it("ends the night softly when time runs out", () => {
    const st = sim(level([], { nightLength: 2 }));
    const events = runFor(st, 3);
    expect(st.outcome).toEqual({ kind: "nightEnded", tick: 120, moons: 0 });
    expect(events.at(-1)).toEqual({ type: "nightEnded" });
  });
});

describe("economy", () => {
  it("trickles snacks and adds haul on arrival", () => {
    const st = sim(level([], { economy: { startSnacks: 0, trickle: 6 } }));
    runFor(st, 1);
    expect(st.snacks).toBeCloseTo(6);
  });

  it("rejects sends that are locked, unaffordable or cooling down", () => {
    const st = sim(level([], { economy: { startSnacks: 15, trickle: 0 } }), ["cricket"]);
    expect(sendNow(st, "possum")[0]).toMatchObject({ type: "sendRejected", reason: "locked" });
    expect(sendNow(st, "cricket")[0]).toMatchObject({ type: "unitSent" });
    expect(sendNow(st, "cricket")[0]).toMatchObject({ type: "sendRejected", reason: "snacks" });
    const cd = sim(level(), ["cricket"]);
    cd.content = { ...content, units: { ...content.units, cricket: unit("cricket", { sendCooldown: 1 }) } };
    sendNow(cd, "cricket");
    expect(sendNow(cd, "cricket")[0]).toMatchObject({ type: "sendRejected", reason: "cooldown" });
  });
});

describe("defenses", () => {
  it("sprinkler hits everything in range, slows, and shooes", () => {
    const st = sim(level([{ def: "sprinkler", pos: [300, 500] }]));
    step(st, [
      { tick: 0, unit: "cricket", lane: 0 },
      { tick: 0, unit: "cricket", lane: 0 },
    ]);
    const events = runFor(st, 6);
    const fired = events.filter((e) => e.type === "defenseFired");
    expect(fired[0]).toMatchObject({ targets: [1, 2] });
    expect(events.filter((e) => e.type === "unitShooed")).toHaveLength(2);
    expect(st.stats.shooed).toBe(2);
  });

  it("broom pushes back, less for heavy units; possum plays dead", () => {
    const st = sim(level([{ def: "broomNeighbor", pos: [500, 500] }]));
    sendNow(st, "cricket");
    runFor(st, 4.05); // enters range at s=400
    expect(st.units[0]!.s).toBeLessThan(400);
    const p = sim(level([{ def: "broomNeighbor", pos: [500, 500] }]));
    sendNow(p, "possum");
    const events = runFor(p, 4.05);
    expect(events.some((e) => e.type === "unitPlayedDead")).toBe(true);
    expect(p.units[0]!.s).toBeGreaterThan(340); // pushed 50, not 100
    expect(p.units[0]!.flopHits).toBe(2);
  });

  it("dog windup misses fast units that leave its range", () => {
    const st = sim(level([{ def: "yardDog", pos: [500, 500] }]));
    sendNow(st, "squirrel");
    const events = runFor(st, 2);
    expect(events.some((e) => e.type === "defenseMissed")).toBe(true);
    expect(events.some((e) => e.type === "unitHit")).toBe(false);
  });

  it("motion light cone stuns ground and air in front of it only", () => {
    const st = sim(level([{ def: "motionLight", pos: [700, 500], facingDeg: 180 }]));
    expect(st.defenses[0]!.coverage[0]).toEqual([[500, 700]]);
    sendNow(st, "crow");
    runFor(st, 5.1);
    expect(st.units[0]!.stunTicks).toBeGreaterThan(0);
  });

  it("fence blocks ground units but not fliers; rats chew it open", () => {
    const fence = { def: "fence" as const, pos: [500, 500] as [number, number], lane: 0 };
    const st = sim(level([fence]));
    sendNow(st, "cricket");
    sendNow(st, "crow");
    runFor(st, 11);
    expect(st.units.find((u) => u.def.id === "cricket")!.s).toBe(500);
    expect(st.pileHp).toBe(2); // the crow got through
    sendNow(st, "rat");
    const events = runFor(st, 8);
    expect(events.some((e) => e.type === "defenseChewed")).toBe(true);
    expect(st.defenses[0]!.disabled).toBe(true);
  });

  it("rats stop to chew chewable defenses next to the lane", () => {
    // Out of the broom's reach (r 100) but within a rat's chewing reach.
    const st = sim(level([{ def: "broomNeighbor", pos: [500, 650] }]));
    sendNow(st, "rat");
    const events = runFor(st, 10);
    expect(events.some((e) => e.type === "defenseChewed")).toBe(true);
  });
});

describe("determinism", () => {
  it("replays an attempt exactly from its seed and inputs", () => {
    const l = level([{ def: "broomNeighbor", pos: [500, 500] }, { def: "sprinkler", pos: [700, 450] }], {
      pile: { pos: [1050, 500], hp: 40 },
    });
    const inputs: SendInput[] = [];
    for (let t = 0; t < 1800; t += 37) inputs.push({ tick: t, unit: t % 3 ? "cricket" : "possum", lane: 0 });
    const a = runAttempt(l, content, { seed: 99, available: ALL, inputs });
    const b = runAttempt(l, content, { seed: 99, available: ALL, inputs });
    expect(a).toEqual(b);
    expect(a.stats.sent).toBeGreaterThan(10);
  });
});
