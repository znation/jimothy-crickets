// Renders every app icon and splash screen from the game's own sprite code:
//   node tools/make_icons.ts
// Writes the PWA icons in public/icons/ and, when the native shells exist, their launcher icons
// and splash screens. All images are tracked in Git LFS.

import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

type Shot = { file: string; w: number; h?: number; mode: "icon" | "maskable" | "foreground" | "splash" };

const shots: Shot[] = [
  { file: "public/icons/icon-192.png", w: 192, mode: "icon" },
  { file: "public/icons/icon-512.png", w: 512, mode: "icon" },
  { file: "public/icons/apple-touch-icon.png", w: 180, mode: "maskable" }, // iOS rounds the corners
  { file: "public/icons/maskable-512.png", w: 512, mode: "maskable" },
];

const android = "platforms/capacitor/android/app/src/main/res";
if (existsSync(android)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    shots.push({ file: `${android}/mipmap-${d}/ic_launcher.png`, w: 48 * k, mode: "icon" });
    shots.push({ file: `${android}/mipmap-${d}/ic_launcher_round.png`, w: 48 * k, mode: "maskable" });
    shots.push({ file: `${android}/mipmap-${d}/ic_launcher_foreground.png`, w: 108 * k, mode: "foreground" });
  }
  const land = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
  for (const [d, [w, h]] of Object.entries(land)) {
    shots.push({ file: `${android}/drawable-land-${d}/splash.png`, w: w!, h: h!, mode: "splash" });
    shots.push({ file: `${android}/drawable-port-${d}/splash.png`, w: h!, h: w!, mode: "splash" });
  }
  shots.push({ file: `${android}/drawable/splash.png`, w: 480, h: 320, mode: "splash" });
}
const ios = "platforms/capacitor/ios/App/App/Assets.xcassets";
if (existsSync(ios)) {
  shots.push({ file: `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, w: 1024, mode: "maskable" });
  for (const n of ["", "-1", "-2"]) shots.push({ file: `${ios}/Splash.imageset/splash-2732x2732${n}.png`, w: 2732, h: 2732, mode: "splash" });
}

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const s of shots) {
  const h = s.h ?? s.w;
  await page.setViewportSize({ width: s.w, height: h });
  await page.goto(`${base}tools/icon/index.html?w=${s.w}&h=${h}&mode=${s.mode}`);
  await page.waitForFunction(() => document.title === "ready");
  await page.locator("canvas").screenshot({ path: s.file, omitBackground: true });
}
console.log(`rendered ${shots.length} images`);
await browser.close();
await server.close();
