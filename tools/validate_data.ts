// Validates all game data. Run with `npm run validate`; CI and `npm run build` run it too.

import { rawData } from "../src/data/content.ts";
import { validate } from "../src/data/validate.ts";

const errors = validate(rawData);
if (errors.length) {
  console.error(`${errors.length} data problem(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("data ok");
