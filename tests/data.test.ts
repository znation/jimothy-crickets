import { describe, expect, it } from "vitest";
import { content, levels, rawData, references, unitsAvailableAt } from "../src/data/content.ts";
import strings from "../src/data/strings/en.json" with { type: "json" };
import { validate } from "../src/data/validate.ts";
import { referenceInputs, runAttempt } from "../src/sim/run.ts";

describe("data", () => {
  it("validates", () => {
    expect(validate(rawData)).toEqual([]);
  });

  // Plan §11.3: every level's reference must win with no upgrades, using only the units the
  // campaign has unlocked by then, with a generous slice of the night left.
  for (const level of levels) {
    it(`level ${level.id} reference wins`, () => {
      const ref = references[level.id];
      expect(ref, `${level.id} has no reference; run npm run sim -- --level ${level.id} --make-reference`).toBeDefined();
      const r = runAttempt(level, content, {
        seed: ref!.seed,
        inputs: referenceInputs(ref!),
        available: unitsAvailableAt(level.id),
      });
      expect(r.outcome.kind).toBe("won");
      expect(r.nightLeft).toBeGreaterThanOrEqual(0.4);
    });
  }

  it("keeps player-facing text gentle", () => {
    // README tone: nobody gets hurt. Code may say hp; players never see these words.
    const deny = /\b(kill|killed|die|dies|died|dead|death|destroy|destroyed|health|hurt|blood|lose|lost|fail|failed|game over)\b/i;
    const bad = Object.entries(strings as Record<string, string>).filter(([, v]) => deny.test(v));
    expect(bad).toEqual([]);
  });
});
