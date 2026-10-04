// Renders each area's procedural scenery as a starting image for img2img backgrounds:
//   node tools/render_scenery.ts            → art/raw/areas/init/<area>.png (1024 × 576)
// Each area's horizon is the lowest any of its levels needs, so no lane in that area runs
// through the painted skyline. Prints the horizons; the game uses the same rule.

import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { campaign, levelById } from "../src/data/content.ts";
import { horizonFor } from "../src/render/scene.ts";

const out = "art/raw/areas/init";
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1 });
for (const area of campaign.areas) {
  const horizon = Math.min(...area.levels.map((id) => horizonFor(levelById(id)!)));
  await page.goto(`${base}tools/scenery/index.html?area=${area.id}&horizon=${horizon}&w=1024`);
  await page.waitForFunction(() => document.title === "ready");
  await page.locator("canvas").screenshot({ path: `${out}/${area.id}.png` });
  console.log(`${out}/${area.id}.png  horizon ${horizon}`);
}
// The staging mat, for the painted "mat" prop.
mkdirSync("art/raw/props/init", { recursive: true });
await page.setViewportSize({ width: 512, height: 512 });
await page.goto(`${base}tools/scenery/index.html?mat`);
await page.waitForFunction(() => document.title === "ready");
await page.locator("canvas").screenshot({ path: "art/raw/props/init/mat.png" });
console.log("art/raw/props/init/mat.png");
await browser.close();
await server.close();
