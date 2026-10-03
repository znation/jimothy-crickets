// Prints how much of each lane every defense covers: `node tools/lanes.ts [levelId...]`.
// A level-design aid: every lane should face something, ideally something different.

import { content, levels, unitsAvailableAt } from "../src/data/content.ts";
import { createSim } from "../src/sim/sim.ts";

const only = process.argv.slice(2);
for (const level of levels) {
  if (only.length && !only.includes(level.id)) continue;
  const st = createSim(level, content, { seed: 1, available: unitsAvailableAt(level.id) });
  const rows = st.lanes.map((lane, li) => {
    const parts = st.defenses.flatMap((d) => {
      if (d.blockLane === li) return [`fence@${Math.round(d.blockS)}`];
      const px = d.coverage[li]!.reduce((n, [a, b]) => n + b - a, 0);
      return px > 0 ? [`${d.def.id}:${Math.round(px)}`] : [];
    });
    return `  lane ${li} (${Math.round(lane.length)}px): ${parts.join(", ") || "OPEN"}`;
  });
  console.log(`${level.id}\n${rows.join("\n")}`);
}
