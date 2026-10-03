// Headless level runner (plan §11.2). Prints JSON.
//
//   npm run sim -- --level 1-3 --replay reference      run the level's stored reference solution
//   npm run sim -- --level 1-3 --inputs attempt.json    run arbitrary inputs ([[tick, unit, lane], ...])
//   npm run sim -- --level 1-3 --bot [--burst 60] [--weights cricket=2,possum=1]
//   npm run sim -- --all --report                       every level: reference + bot score
//   npm run sim -- --all --make-reference               search bot strategies, store the best wins
//   npm run sim -- --all --curve                        difficulty per level; fails on a backwards ramp

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { campaign, content, levelById, levels, references, unitsAvailableAt } from "../src/data/content.ts";
import {
  bot,
  referenceInputs,
  runAttempt,
  toReference,
  type AttemptResult,
  type BotOptions,
} from "../src/sim/run.ts";
import type { LevelDef, Reference, UnitId } from "../src/sim/types.ts";

const REFERENCES_FILE = new URL("../src/data/references.json", import.meta.url);

const { values: args } = parseArgs({
  options: {
    level: { type: "string" },
    all: { type: "boolean" },
    replay: { type: "string" },
    inputs: { type: "string" },
    bot: { type: "boolean" },
    burst: { type: "string" },
    weights: { type: "string" },
    seed: { type: "string", default: "1" },
    report: { type: "boolean" },
    "make-reference": { type: "boolean" },
    trace: { type: "boolean" },
    curve: { type: "boolean" },
  },
});

const targets: LevelDef[] = args.all
  ? levels
  : args.level
    ? [levelById(args.level) ?? fail(`unknown level "${args.level}"`)]
    : fail("pass --level <id> or --all");
const seed = Number(args.seed);

// Difficulty is the share of the night the reference solution (the best strategy the search found)
// needs. Within an area it should rise; a drop bigger than this means a level is out of order.
const CURVE_TOLERANCE = 0.08;

if (args.curve) {
  let bad = 0;
  for (const area of campaign.areas) {
    let prev = 0;
    for (const id of area.levels) {
      const level = levelById(id)!;
      const ref = references[id];
      if (!ref) fail(`${id} has no reference`);
      const r = attempt(level, { seed: ref.seed, inputs: referenceInputs(ref) });
      const plain = attempt(level, { seed, policy: bot() });
      const d = r.outcome.kind === "won" ? 1 - r.nightLeft : 1;
      const flag = d < prev - CURVE_TOLERANCE ? "  << easier than the level before" : "";
      if (flag) bad++;
      const plainText = plain.outcome.kind === "won" ? `wins, ${Math.round((1 - plain.nightLeft) * 100)}%` : "night ends";
      console.log(`${id}  difficulty ${d.toFixed(2)}  ${"#".repeat(Math.round(d * 40)).padEnd(40)}  plain bot: ${plainText}${flag}`);
      prev = Math.max(prev, d);
    }
  }
  if (bad) {
    console.error(`${bad} level(s) break the difficulty ramp (tolerance ${CURVE_TOLERANCE}).`);
    process.exitCode = 1;
  }
} else if (args["make-reference"]) {
  const out = { ...references } as Record<string, Reference>;
  for (const level of targets) {
    const best = searchReference(level);
    if (!best) {
      console.error(`${level.id}: no bot strategy wins; author a reference by hand`);
      process.exitCode = 1;
      continue;
    }
    out[level.id] = toReference(seed, best.inputs);
    console.error(`${level.id}: won in ${best.seconds.toFixed(1)}s, ${best.outcome.moons} moon(s)`);
  }
  writeFileSync(REFERENCES_FILE, formatReferences(out));
} else if (args.report) {
  const rows = targets.map((level) => {
    const ref = references[level.id];
    const r = ref ? attempt(level, { seed: ref.seed, inputs: referenceInputs(ref) }) : null;
    const b = attempt(level, { seed, policy: bot() });
    return {
      level: level.id,
      reference: r && summary(r),
      bot: summary(b),
    };
  });
  print(rows);
  if (rows.some((r) => r.reference?.outcome !== "won")) process.exitCode = 1;
} else {
  const results = targets.map((level) => {
    if (args.replay === "reference") {
      const ref = references[level.id] ?? fail(`${level.id} has no reference`);
      return attempt(level, { seed: ref.seed, inputs: referenceInputs(ref) });
    }
    if (args.inputs) {
      const raw = JSON.parse(readFileSync(args.inputs, "utf8"));
      const ref: Reference = Array.isArray(raw) ? { seed, inputs: raw } : raw;
      return attempt(level, { seed: ref.seed, inputs: referenceInputs(ref) });
    }
    if (args.bot) return attempt(level, { seed, policy: bot(botOptions()) });
    return fail("pass --replay reference, --inputs <file>, --bot, --report or --make-reference");
  });
  print(results.map((r) => (args.trace ? { ...summary(r), pileTrace: r.pileTrace } : summary(r))));
}

function attempt(level: LevelDef, opts: Omit<Parameters<typeof runAttempt>[2], "available">) {
  return runAttempt(level, content, { ...opts, available: unitsAvailableAt(level.id) });
}

/** Try a spread of bot strategies and keep the fastest win. */
function searchReference(level: LevelDef): AttemptResult | null {
  const units = unitsAvailableAt(level.id);
  const mixes: BotOptions["weights"][] = [undefined];
  for (const u of units) mixes.push({ [u]: 1 });
  for (const u of units) for (const v of units) if (u < v) mixes.push({ [u]: 2, [v]: 1 }, { [u]: 1, [v]: 2 });
  let best: AttemptResult | null = null;
  for (const weights of mixes)
    for (const burst of [0, 40, 80, 120, 160]) {
      const r = attempt(level, { seed, policy: bot({ weights, burst }) });
      if (r.outcome.kind === "won" && (!best || r.seconds < best.seconds)) best = r;
    }
  return best;
}

function botOptions(): BotOptions {
  const weights = args.weights
    ? (Object.fromEntries(args.weights.split(",").map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)])) as Partial<
        Record<UnitId, number>
      >)
    : undefined;
  return { weights, burst: args.burst ? Number(args.burst) : 0 };
}

function summary(r: AttemptResult) {
  return {
    level: r.level,
    outcome: r.outcome.kind,
    moons: r.outcome.moons,
    seconds: Number(r.seconds.toFixed(2)),
    nightLeft: Number(r.nightLeft.toFixed(3)),
    pileLeft: r.pileTrace[r.pileTrace.length - 1],
    ...r.stats,
    sentByUnit: r.sentByUnit,
  };
}

/** One level per line, one send per tuple, so diffs stay readable. */
function formatReferences(refs: Record<string, Reference>): string {
  const ids = Object.keys(refs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const body = ids.map((id) => {
    const r = refs[id]!;
    return `  ${JSON.stringify(id)}: {\n    "seed": ${r.seed},\n    "inputs": ${JSON.stringify(r.inputs)}\n  }`;
  });
  return `{\n${body.join(",\n")}\n}\n`;
}

function print(x: unknown) {
  console.log(JSON.stringify(x, null, 2));
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}
