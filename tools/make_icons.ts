// Renders the app icons from the game's own sprite code: `node tools/make_icons.ts`.
// Writes public/icons/*.png (tracked in Git LFS like every image).

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ICONS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180, maskable: true }, // iOS rounds the corners itself
  { file: "maskable-512.png", size: 512, maskable: true },
];

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.goto(`${base}tools/icon/index.html?size=${icon.size}${icon.maskable ? "&maskable" : ""}`);
  await page.waitForFunction(() => document.title === "ready");
  await page.locator("canvas").screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
  console.log(`public/icons/${icon.file}`);
}
await browser.close();
await server.close();
