// Quick balance table: for each level, the plain bot and the best of a strategy search.
// `node tools/tune.ts` — a developer aid; `npm run sim -- --all --report` is the CI check.

import { content, levels, unitsAvailableAt } from "../src/data/content.ts";
import { bot, runAttempt, type AttemptResult, type BotOptions } from "../src/sim/run.ts";

const row = (r: AttemptResult) =>
  r.outcome.kind === "won"
    ? `won ${r.outcome.moons}☾ ${String(Math.round((1 - r.nightLeft) * 100)).padStart(3)}% of night`
    : `night ends, pile ${String(Math.round(r.pileTrace.at(-1)!)).padStart(3)} left`;

for (const level of levels) {
  const available = unitsAvailableAt(level.id);
  const run = (o: BotOptions) => runAttempt(level, content, { seed: 1, available, policy: bot(o) });
  const plain = run({});
  let best = plain;
  let bestName = "plain";
  const mixes: BotOptions["weights"][] = [undefined, ...available.map((u) => ({ [u]: 1 }))];
  for (const u of available) for (const v of available) if (u < v) mixes.push({ [u]: 2, [v]: 1 }, { [u]: 1, [v]: 2 });
  for (const weights of mixes)
    for (const burst of [0, 40, 80, 120, 160]) {
      const r = run({ weights, burst });
      const better =
        (r.outcome.kind === "won" && (best.outcome.kind !== "won" || r.seconds < best.seconds)) ||
        (r.outcome.kind !== "won" && best.outcome.kind !== "won" && r.pileTrace.at(-1)! < best.pileTrace.at(-1)!);
      if (better) [best, bestName] = [r, `${JSON.stringify(weights ?? "equal")} burst ${burst}`];
    }
  console.log(`${level.id}  plain: ${row(plain).padEnd(26)} best: ${row(best).padEnd(26)} ${bestName}`);
}
