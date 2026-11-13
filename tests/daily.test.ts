import { describe, expect, it } from "vitest";
import { content, levelById, levelOrder } from "../src/data/content.ts";
import { checkLevel, dailyBase, dailyLevel, dateKey, passes, planDaily, remixLevel, weekdayOf } from "../src/daily.ts";
import { createSim } from "../src/sim/sim.ts";

const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);

describe("surprise yard", () => {
  it("reads dates in the player's own time zone", () => {
    expect(dateKey(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
    expect(weekdayOf("2026-11-13")).toBe(5); // a Friday
    expect(weekdayOf("2026-11-15")).toBe(0);
  });

  it("only remixes levels the player has cleared", () => {
    expect(dailyBase("2026-11-13", [])).toBe("1-1");
    expect(dailyBase("2026-11-13", ["1-1"])).toBe("1-1");
    for (const d of days) expect(["1-1", "1-2", "1-3"]).toContain(dailyBase(d, ["1-1", "1-2", "1-3"]));
  });

  it("is the same remix on every device, and different from day to day", () => {
    expect(remixLevel("2026-11-13", "3-4", 0)).toEqual(remixLevel("2026-11-13", "3-4", 0));
    expect(remixLevel("2026-11-13", "3-4", 0).defenses).not.toEqual(remixLevel("2026-11-14", "3-4", 0).defenses);
  });

  it("keeps remixed defenses where the player can see them, off the paths, with a way through", () => {
    for (const base of levelOrder) {
      for (const d of days.slice(0, 4)) {
        const level = remixLevel(d, base, 0);
        const sim = createSim(level, content, { seed: 1, available: level.unitsAvailable! });
        const fences = level.defenses.filter((p) => p.def === "fence");
        expect(new Set(fences.map((f) => f.lane)).size, `${base} ${d}`).toBe(fences.length);
        expect(fences.length, `${base} ${d}`).toBeLessThan(Math.max(2, level.lanes.length));
        for (const p of level.defenses) {
          expect(p.pos[1]).toBeGreaterThanOrEqual(220);
          expect(p.pos[1]).toBeLessThanOrEqual(780);
          expect(Math.hypot(p.pos[0] - level.pile.pos[0], p.pos[1] - level.pile.pos[1])).toBeGreaterThan(200);
        }
        // defenses the base level's friends haven't met never turn up
        const met = new Set(levelOrder.slice(0, levelOrder.indexOf(base) + 1).flatMap((id) => levelById(id)!.defenses.map((x) => x.def)));
        for (const p of level.defenses) expect(met.has(p.def), `${base}: ${p.def}`).toBe(true);
        expect(sim.defenses.length).toBe(level.defenses.length);
      }
    }
  });

  it("every day's yard is winnable, with moons set from how well the bots did", async () => {
    for (const d of days) {
      const plan = await planDaily(d, levelOrder);
      const level = dailyLevel(plan);
      expect(level.moons).toEqual(plan.moons);
      expect(plan.moons[1]).toBeLessThanOrEqual(plan.moons[2]);
      if (plan.attempt >= 0) expect(passes(level, await checkLevel(level)), d).toBe(true);
    }
  }, 60_000);
});
