// Quick balance table: for each level, the plain bot and the best of a strategy search.
// `node tools/tune.ts` — a developer aid; `npm run sim -- --all --report` is the CI check.

import { content, levels, unitsAvailableAt } from "../src/data/content.ts";
import { bot, runAttempt, strategySpace, type AttemptResult, type BotOptions } from "../src/sim/run.ts";

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
  for (const opts of strategySpace(available)) {
    const r = run(opts);
    const better =
      (r.outcome.kind === "won" && (best.outcome.kind !== "won" || r.seconds < best.seconds)) ||
      (r.outcome.kind !== "won" && best.outcome.kind !== "won" && r.pileTrace.at(-1)! < best.pileTrace.at(-1)!);
    if (better) [best, bestName] = [r, `${JSON.stringify(opts.weights ?? "equal")} burst ${opts.burst}`];
  }
  console.log(`${level.id}  plain: ${row(plain).padEnd(26)} best: ${row(best).padEnd(26)} ${bestName}`);
}
