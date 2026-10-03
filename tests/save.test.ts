import { describe, expect, it } from "vitest";
import { content, levelById, upgrades } from "../src/data/content.ts";
import type { Platform } from "../src/platform/types.ts";
import { freshSave, parseSave, SaveStore, SAVE_VERSION } from "../src/save.ts";
import { applyUpgrades } from "../src/sim/upgrades.ts";

function memoryPlatform(initial: string | null = null) {
  const store = { save: initial, backup: null as string | null };
  const platform = {
    kind: "web",
    save: {
      load: async () => store.save,
      store: async (j: string) => void (store.save = j),
      backup: async (j: string) => void (store.backup = j),
    },
    lifecycle: { onPause() {}, onResume() {} },
    orientation: { lockLandscape: async () => {} },
  } satisfies Platform;
  return { platform, store };
}

describe("save", () => {
  it("starts fresh with no stored save", async () => {
    const { platform } = memoryPlatform();
    const s = new SaveStore(platform);
    await s.load();
    expect(s.data).toEqual(freshSave());
  });

  it("backs up corrupt or future saves instead of overwriting them", async () => {
    for (const bad of ["{not json", JSON.stringify({ version: SAVE_VERSION + 1 })]) {
      const { platform, store } = memoryPlatform(bad);
      const s = new SaveStore(platform);
      await s.load();
      expect(store.backup).toBe(bad);
      expect(s.data).toEqual(freshSave());
    }
  });

  it("fills in settings added after a save was written", () => {
    const old = { ...freshSave(), settings: { music: 0.2, sfx: 1, reducedMotion: true, speed: 2 } };
    expect(parseSave(JSON.stringify(old))!.settings).toMatchObject({ music: 0.2, largeText: false });
  });

  it("pays acorns only for improving a level's best moons, and recruits once", () => {
    const s = new SaveStore(memoryPlatform().platform);
    expect(s.recordWin("1-2", 1)).toEqual({ recruit: "possum", acorns: 3 });
    expect(s.recordWin("1-2", 1)).toEqual({ recruit: null, acorns: 0 });
    expect(s.recordWin("1-2", 3)).toEqual({ recruit: null, acorns: 5 });
    expect(s.recordWin("1-2", 2)).toEqual({ recruit: null, acorns: 0 });
    expect(s.data.acorns).toBe(8);
    expect(s.data.levels["1-2"]).toEqual({ cleared: true, moons: 3 });
  });

  it("buys upgrade tiers in order until they run out", () => {
    const s = new SaveStore(memoryPlatform().platform);
    const def = upgrades.find((u) => u.id === "cricket.hp")!;
    s.data.acorns = 100;
    for (const cost of def.costs) {
      const before = s.data.acorns;
      expect(s.buyUpgrade(def)).toBe(true);
      expect(s.data.acorns).toBe(before - cost);
    }
    expect(s.buyUpgrade(def)).toBe(false);
    expect(s.data.upgrades["cricket.hp"]).toBe(def.costs.length);
  });

  it("round-trips through an export code", () => {
    const a = new SaveStore(memoryPlatform().platform);
    a.recordWin("1-1", 3);
    const b = new SaveStore(memoryPlatform().platform);
    expect(b.importCode(a.exportCode())).toBe(true);
    expect(b.data).toEqual(a.data);
    expect(b.importCode("definitely not a code")).toBe(false);
  });
});

describe("upgrades", () => {
  it("change unit stats and the economy without touching the originals", () => {
    const level = levelById("1-1")!;
    const out = applyUpgrades(content, level, upgrades, { "cricket.hp": 2, "possum.cost": 1, trickle: 3, "rat.chew": 1 });
    expect(out.content.units.cricket.hp).toBe(content.units.cricket.hp + 2);
    expect(out.content.units.possum.cost).toBe(content.units.possum.cost - 4);
    expect(out.level.economy.trickle).toBe(level.economy.trickle + 1.5);
    expect(out.content.units.rat.traits!.sapper!.chewDps).toBeCloseTo(content.units.rat.traits!.sapper!.chewDps * 1.3);
    expect(content.units.cricket.hp).toBe(4);
  });
});
