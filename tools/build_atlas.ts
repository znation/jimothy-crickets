// Packs curated sprites into a WebP atlas the game loads (plan §8.4):
//   node tools/build_atlas.ts area1
// For each sprite in art/sprites.json found in art/curated/<set>/ (or art/curated/<set>/<name>.png
// via a "source" alias in art/curated/<set>/sources.json): trim to the alpha bounds, scale to 2x
// its in-game height, add a uniform ink outline (so sprites from different generations read as
// one family), then shelf-pack and encode. Backgrounds are written as their own WebP.
// Runs in Playwright's Chromium so the build needs no image libraries.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const SCALE = 2; // atlas pixels per world unit
const PAD = 4;
const MAX_W = 2048;

const set = process.argv[2] ?? "area1";
const spec = JSON.parse(readFileSync("art/sprites.json", "utf8")) as {
  outline: { width: number; colour: string };
  sprites: Record<string, { height: number; flip?: boolean }>;
};
const dir = `art/curated/${set}`;
const sources: Record<string, string> = existsSync(`${dir}/sources.json`)
  ? JSON.parse(readFileSync(`${dir}/sources.json`, "utf8"))
  : {};
const inputs = Object.entries(spec.sprites)
  .map(([name, s]) => ({ name, ...s, file: `${dir}/${sources[name] ?? name}.png` }))
  .filter((s) => existsSync(s.file));
const backgrounds = existsSync(`${dir}/backgrounds.json`)
  ? (JSON.parse(readFileSync(`${dir}/backgrounds.json`, "utf8")) as string[])
  : [];

const browser = await chromium.launch();
const page = await browser.newPage();
const result = (await page.evaluate(
  async ({ inputs, SCALE, PAD, MAX_W, outline, backgrounds }) => {
    const load = (b64: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
    const canvas = (w: number, h: number) => Object.assign(document.createElement("canvas"), { width: w, height: h });

    const sprites = [];
    for (const inp of inputs) {
      const img = await load(inp.data);
      // trim to alpha bounds
      const c0 = canvas(img.width, img.height);
      const g0 = c0.getContext("2d")!;
      g0.drawImage(img, 0, 0);
      const px = g0.getImageData(0, 0, img.width, img.height).data;
      let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++)
          if (px[(y * img.width + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const tw = x1 - x0 + 1, th = y1 - y0 + 1;
      // scale to 2x in-game height, leaving room for the outline
      const o = Math.ceil(outline.width * SCALE);
      const h = Math.round(inp.height * SCALE);
      const w = Math.round((tw * h) / th);
      const body = canvas(w, h);
      const gb = body.getContext("2d")!;
      gb.imageSmoothingQuality = "high";
      if (inp.flip) {
        gb.translate(w, 0);
        gb.scale(-1, 1);
      }
      gb.drawImage(c0, x0, y0, tw, th, 0, 0, w, h);
      // uniform outline: the silhouette in ink, stamped around a circle, under the sprite
      const sil = canvas(w, h);
      const gs = sil.getContext("2d")!;
      gs.drawImage(body, 0, 0);
      gs.globalCompositeOperation = "source-in";
      gs.fillStyle = outline.colour;
      gs.fillRect(0, 0, w, h);
      const out = canvas(w + 2 * o, h + 2 * o);
      const go = out.getContext("2d")!;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        go.drawImage(sil, o + Math.cos(a) * o, o + Math.sin(a) * o);
      }
      go.drawImage(body, o, o);
      sprites.push({ name: inp.name, c: out, w: out.width, h: out.height, o });
    }

    // shelf packing, tallest first
    sprites.sort((a, b) => b.h - a.h);
    let x = PAD, y = PAD, rowH = 0, width = 0;
    const frames: Record<string, unknown> = {};
    const placed = sprites.map((s) => {
      if (x + s.w + PAD > MAX_W) {
        x = PAD;
        y += rowH + PAD;
        rowH = 0;
      }
      const at = { ...s, x, y };
      x += s.w + PAD;
      rowH = Math.max(rowH, s.h);
      width = Math.max(width, x);
      return at;
    });
    const atlas = canvas(width, y + rowH + PAD);
    const ga = atlas.getContext("2d")!;
    for (const p of placed) {
      ga.drawImage(p.c, p.x, p.y);
      // world size and the anchor (bottom-center of the sprite body, inside the outline)
      frames[p.name] = { x: p.x, y: p.y, w: p.w, h: p.h, ax: p.w / 2, ay: p.h - p.o, scale: SCALE };
    }
    const bgs: Record<string, string> = {};
    for (const bg of backgrounds) {
      const img = await load(bg.data);
      const c = canvas(2400, 1350); // the full bleed area at 1x (plan §3.1)
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      const k = Math.max(c.width / img.width, c.height / img.height);
      g.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      bgs[bg.name] = c.toDataURL("image/webp", 0.82).split(",")[1]!;
    }
    return { webp: atlas.toDataURL("image/webp", 0.9).split(",")[1], frames, size: [atlas.width, atlas.height], bgs };
  },
  {
    inputs: inputs.map((i) => ({ ...i, data: readFileSync(i.file).toString("base64") })),
    SCALE,
    PAD,
    MAX_W,
    outline: spec.outline,
    backgrounds: backgrounds.map((name) => ({ name, data: readFileSync(`${dir}/${name}.png`).toString("base64") })),
  },
)) as { webp: string; frames: Record<string, unknown>; size: [number, number]; bgs: Record<string, string> };
await browser.close();

mkdirSync("public/atlas", { recursive: true });
writeFileSync(`public/atlas/${set}.webp`, Buffer.from(result.webp, "base64"));
writeFileSync(
  `public/atlas/${set}.json`,
  JSON.stringify({ image: `${set}.webp`, size: result.size, frames: result.frames, backgrounds: Object.keys(result.bgs) }, null, 1) + "\n",
);
for (const [name, data] of Object.entries(result.bgs)) writeFileSync(`public/atlas/${set}-${name}.webp`, Buffer.from(data, "base64"));
console.log(`public/atlas/${set}.webp ${result.size.join("×")}, ${Object.keys(result.frames).length} sprites, ${Object.keys(result.bgs).length} backgrounds`);
