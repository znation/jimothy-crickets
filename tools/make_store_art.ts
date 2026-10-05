// Renders the store art (plan §8.3) from the game itself:
//   node tools/make_store_art.ts [--only <name substring>]
// - capsules and feature graphics: a story scene from the painted sprites with the title logo
//   (tools/store/), PNG
// - screenshots: still frames of the game (?still) at each store's device sizes, JPEG
// Everything goes to art/store/ (Git LFS). Needs the atlases (art/README.md). A full render also
// records its inputs in art/store/inputs.json; CI warns when they've changed since.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";
import { writeStamp } from "./store_art_stamp.ts";

type Art = { file: string; w: number; h: number; story: string; logo: "top" | "left" | "center" | "none"; transparent?: boolean };

const art: Art[] = [
  // Google Play
  { file: "play/feature-graphic-1024x500.png", w: 1024, h: 500, story: "title", logo: "top" },
  // Steam (partner.steamgames.com › Graphical assets)
  { file: "steam/header-capsule-920x430.png", w: 920, h: 430, story: "title", logo: "top" },
  { file: "steam/small-capsule-462x174.png", w: 462, h: 174, story: "title", logo: "center" },
  { file: "steam/main-capsule-1232x706.png", w: 1232, h: 706, story: "title", logo: "top" },
  { file: "steam/vertical-capsule-748x896.png", w: 748, h: 896, story: "title", logo: "top" },
  { file: "steam/library-capsule-600x900.png", w: 600, h: 900, story: "title", logo: "top" },
  { file: "steam/library-header-920x430.png", w: 920, h: 430, story: "title", logo: "top" },
  { file: "steam/library-hero-3840x1240.png", w: 3840, h: 1240, story: "finale", logo: "none" }, // Steam overlays the logo
  { file: "steam/library-logo-1280x720.png", w: 1280, h: 720, story: "none", logo: "center", transparent: true },
  // itch.io
  { file: "itch/cover-630x500.png", w: 630, h: 500, story: "title", logo: "top" },
];

// Screenshots: CSS viewport × device scale = the store's pixel size. Landscape only; the game is.
type Device = { name: string; w: number; h: number; dpr: number };
const devices: Device[] = [
  { name: "phone-1920x1080", w: 640, h: 360, dpr: 3 }, // Play phone (16:9)
  { name: "iphone-6.9-2868x1320", w: 956, h: 440, dpr: 3 }, // App Store 6.9"
  { name: "ipad-13-2752x2064", w: 1376, h: 1032, dpr: 2 }, // App Store 13" iPad
  { name: "tablet-7-1920x1200", w: 960, h: 600, dpr: 2 }, // Play 7" tablet
  { name: "tablet-10-2560x1600", w: 1280, h: 800, dpr: 2 }, // Play 10" tablet
  { name: "desktop-1920x1080", w: 1920, h: 1080, dpr: 1 }, // Steam, itch.io, Microsoft
  { name: "steam-deck-1280x800", w: 1280, h: 800, dpr: 1 },
];
// The busiest moments of the reference replays (most of the troupe on screen), one per area.
const scenes = [
  { name: "1-alley", url: "?level=1-3&replay=reference&still=1680" },
  { name: "2-backyards", url: "?level=2-3&replay=reference&still=840" },
  { name: "3-culdesac", url: "?level=3-4&replay=reference&still=1020" },
  { name: "4-stripmall", url: "?level=4-3&replay=reference&still=1200" },
  { name: "5-map", url: "?still=0", map: true },
];

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]! : "";
const out = (f: string) => {
  const path = `art/store/${f}`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
};

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
let n = 0;

const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const a of art.filter((a) => a.file.includes(only))) {
  await page.setViewportSize({ width: a.w, height: a.h });
  await page.goto(`${base}tools/store/index.html?w=${a.w}&h=${a.h}&story=${a.story}&logo=${a.logo}`);
  await page.waitForFunction(() => document.title === "ready");
  await page.locator("canvas").screenshot({ path: out(a.file), omitBackground: !!a.transparent });
  n++;
}
await page.close();

for (const d of devices) {
  const shots = scenes.filter((s) => `screenshots/${d.name}/${s.name}`.includes(only));
  if (!shots.length) continue;
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr });
  // a save that has cleared the first three areas, so the map shows progress and every friend
  await ctx.addInitScript(seedSave);
  const p = await ctx.newPage();
  for (const s of shots) {
    await shoot(p, s);
    await p.screenshot({ path: out(`screenshots/${d.name}/${s.name}.jpg`), type: "jpeg", quality: 90 });
    n++;
  }
  await ctx.close();
}
console.log(`rendered ${n} images into art/store/`);
// record what this render was drawn from, so CI can tell when it's stale (only for a full render)
if (only) console.log("partial render (--only): art/store/inputs.json not updated");
else writeStamp();
await browser.close();
await server.close();

async function shoot(p: Page, s: { url: string; map?: boolean }) {
  await p.goto(`${base}${s.url}`);
  if (s.map) {
    await p.getByRole("button", { name: "Play" }).click();
    await p.waitForSelector(".map");
  }
  await p.waitForFunction(() => document.documentElement.dataset.still === "ready");
  await p.evaluate(() => document.fonts.ready);
}

function seedSave() {
  const levels: Record<string, { cleared: boolean; moons: number }> = {};
  for (const a of [1, 2, 3]) for (let l = 1; l <= 5; l++) levels[`${a}-${l}`] = { cleared: true, moons: 3 - ((a + l) % 2) };
  const save = { version: 1, levels, acorns: 12, unlockedUnits: ["cricket", "possum", "squirrel", "crow", "rat"], upgrades: {}, settings: {} };
  localStorage.setItem("jimothy-crickets.save", JSON.stringify(save));
}
