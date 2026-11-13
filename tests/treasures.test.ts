import { describe, expect, it } from "vitest";
import { content, levelById, levelOrder, treasures, unitsAvailableAt } from "../src/data/content.ts";
import { freshSave, SaveStore } from "../src/save.ts";
import { catalog, foundTreasures } from "../src/stash.ts";
import { GoalTracker, type Goal } from "../src/sim/goals.ts";
import { bot, runAttempt, strategySpace, type BotOptions } from "../src/sim/run.ts";
import type { UnitId } from "../src/sim/types.ts";
import { TREASURE_IDS } from "../src/ui/treasures.ts";

/** Bots that try for a goal on purpose: the friend it needs, down every lane, steady or in bursts. */
function goalBots(goal: Goal, lanes: number): BotOptions[] {
  const friend: UnitId | null =
    goal.kind === "distract"
      ? content.defenses[goal.defense].distractedBy!.unit
      : goal.kind === "chew"
        ? "rat"
        : goal.kind === "deliver"
          ? goal.unit
          : goal.kind === "playDead"
            ? "possum"
            : null;
  const out: BotOptions[] = [];
  for (const burst of [0, 60, 120, 160]) {
    if (friend)
      for (let lane = 0; lane < lanes; lane++)
        out.push({ weights: { [friend]: 1, cricket: 2 }, lanes: { [friend]: lane }, burst }, { weights: { [friend]: 1 }, lanes: { [friend]: lane }, burst });
    else out.push({ burst }, { weights: { cricket: 1 }, burst });
  }
  return out;
}

describe("treasures", () => {
  it("every level hides three different treasures, and each one has a picture", () => {
    const ids = catalog().map((e) => e.id);
    expect(ids.length).toBe(levelOrder.length * 3 + 7);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(TREASURE_IDS, id).toContain(id);
  });

  it("every treasure goal can be reached by a bot playing the level", () => {
    for (const id of levelOrder) {
      const level = levelById(id)!;
      const goal = treasures.levels[id]!.goal;
      const units = unitsAvailableAt(id);
      // targeted bots first; the full strategy space only if none of them gets there
      const tries = [...goalBots(goal, level.lanes.length), ...strategySpace(units)];
      const reached = tries.some((s) => {
        const g = new GoalTracker(goal, units);
        runAttempt(level, content, { seed: 1, available: units, policy: bot(s), onEvents: (st, ev) => g.onEvents(st, ev) });
        return g.done;
      });
      expect(reached, `${id}: ${JSON.stringify(goal)}`).toBe(true);
    }
  }, 120_000);

  it("a goal tracker counts only what its goal asks for", () => {
    const level = levelById("1-1")!;
    const st = { defenses: [] } as unknown as Parameters<GoalTracker["onEvents"]>[0];
    const hit = (unit: UnitId, chain: number) => ({ type: "pileHit" as const, uid: chain, unit, damage: 1, haul: 2, chain });
    const chain = new GoalTracker({ kind: "chain", n: 3 }, ["cricket"]);
    expect(chain.onEvents(st, [hit("cricket", 1), hit("cricket", 2)])).toBe(false);
    expect(chain.onEvents(st, [hit("cricket", 3)])).toBe(true);
    expect(chain.onEvents(st, [hit("cricket", 4)])).toBe(false); // only the first time
    const house = new GoalTracker({ kind: "fullHouse" }, ["cricket", "possum"]);
    expect(house.target).toBe(2);
    house.onEvents(st, [hit("cricket", 1), hit("cricket", 2)]);
    expect(house.done).toBe(false);
    expect(house.onEvents(st, [hit("possum", 1)])).toBe(true);
    expect(level.id).toBe("1-1");
  });

  it("the stash follows from the save: wins, three moons, goals and surprise yards", () => {
    const save = freshSave();
    expect(foundTreasures(save).size).toBe(0);
    save.levels["1-1"] = { cleared: true, moons: 2 };
    save.levels["1-2"] = { cleared: true, moons: 3 };
    save.treasures.push("cheese");
    save.daily["2026-11-13"] = 1; // a Friday
    save.daily["2026-11-14"] = 0; // played, not won
    expect([...foundTreasures(save)].sort()).toEqual(["bottleCap", "cheese", "duck", "fishBone", "fork"]);
  });

  it("surprise-yard wins pay acorns for improving the day's best, like levels", () => {
    const s = new SaveStore({} as never);
    expect(s.recordDaily("2026-11-13", 2).acorns).toBe(5);
    expect(s.recordDaily("2026-11-13", 1).acorns).toBe(0);
    expect(s.recordDaily("2026-11-13", 3).acorns).toBe(3);
    expect(s.recordDaily("2026-11-14", 1).acorns).toBe(3);
    expect(s.findTreasure("cheese")).toBe(true);
    expect(s.findTreasure("cheese")).toBe(false);
  });
});
