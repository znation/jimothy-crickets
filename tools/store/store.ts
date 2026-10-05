// Draws store art (Play feature graphic, Steam capsules, itch.io cover) from a story scene and the
// title logo; tools/make_store_art.ts screenshots it.
//   ?w=&h=&story=title|alley|…|finale&logo=top|left|center|none   a scene, optionally with the logo
//   ?w=&h=&logo=center&story=none                                  the logo alone, on transparent

import "@fontsource/fredoka/latin-700.css";
import { loadAtlases } from "../../src/render/atlas.ts";
import { drawStory, type StoryId } from "../../src/render/story.ts";

const atlas = await loadAtlases(["area1", "areas", "props"], "/atlas/");
if (!atlas) throw new Error("no atlas: build it first (art/README.md)");
await document.fonts.load("700 64px Fredoka");

const q = new URLSearchParams(location.search);
const w = Number(q.get("w") ?? 1024);
const h = Number(q.get("h") ?? 500);
const story = (q.get("story") ?? "title") as StoryId | "none";
const logo = q.get("logo") ?? "top";
const c = document.querySelector("canvas")!;
c.width = w;
c.height = h;
const ctx = c.getContext("2d")!;

// Where the logo goes and how much of the scene to keep clear for it.
const top = logo === "top" ? 0.34 : 0;
if (story !== "none") drawStory(ctx, w, h, atlas, story, { top });

if (logo !== "none") {
  // the logo fills most of its box: the top band, the left half, or the middle
  const box = logo === "top" ? { w: w * 0.9, h: h * top } : logo === "left" ? { w: w * 0.5, h: h * 0.45 } : { w: w * 0.9, h: h * 0.8 };
  const x = logo === "left" ? w * 0.05 : w / 2;
  const y = logo === "top" ? h * 0.04 : logo === "left" ? h * 0.06 : (h - box.h) / 2;
  drawLogo(x, y, box, logo === "left" ? "left" : "center");
}
document.title = "ready";

/**
 * "Jimothy Crickets" as on the title screen: paper and green, ink outline and drop shadow. Fits
 * the box whose top edge is at y, on one line or, in narrow boxes, two.
 */
function drawLogo(x: number, y: number, box: { w: number; h: number }, align: "left" | "center") {
  ctx.font = "700 100px Fredoka";
  ctx.lineJoin = "round";
  const one = ctx.measureText("Jimothy Crickets").width;
  const two = Math.max(ctx.measureText("Jimothy").width, ctx.measureText("Crickets").width);
  const sizeOne = Math.min((box.w / one) * 100, box.h / 1.1);
  const sizeTwo = Math.min((box.w / two) * 100, box.h / 2.1);
  const twoLines = sizeTwo > sizeOne * 1.3;
  const size = twoLines ? sizeTwo : sizeOne;
  ctx.font = `700 ${size}px Fredoka`;
  ctx.textBaseline = "top";
  const lines: [string, string][][] = twoLines ? [[["Jimothy", "#fff6e6"]], [["Crickets", "#6cc24a"]]] : [[["Jimothy ", "#fff6e6"], ["Crickets", "#6cc24a"]]];
  lines.forEach((line, i) => {
    const width = line.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0);
    let px = align === "center" ? x - width / 2 : x;
    const py = y + i * size * 1.0;
    for (const [text, colour] of line) {
      ctx.fillStyle = "#2a2233";
      ctx.fillText(text, px, py + size * 0.06); // drop shadow
      ctx.lineWidth = size * 0.09;
      ctx.strokeStyle = "#2a2233";
      ctx.strokeText(text, px, py);
      ctx.fillStyle = colour;
      ctx.fillText(text, px, py);
      px += ctx.measureText(text).width;
    }
  });
}
