// Starting images for img2img, painted by the game's own drawing code:
//   ?area=backyards&horizon=250&w=1024   an area's procedural scenery across the full bleed
//                                        (2400 × 1350 logical), no lanes, defenses or characters
//   ?mat                                 the staging mat alone on white, on a 512² canvas
import { drawStagingMat, paintScenery } from "../../src/render/scene.ts";
import { BLEED_H, BLEED_W, BLEED_X, BLEED_Y } from "../../src/render/view.ts";

const q = new URLSearchParams(location.search);
const c = document.querySelector("canvas")!;

if (q.has("mat")) {
  c.width = c.height = 512;
  const m = c.getContext("2d")!;
  m.fillStyle = "#fff";
  m.fillRect(0, 0, 512, 512);
  m.setTransform(2, 0, 0, 2, 256, 256);
  drawStagingMat(m);
} else {
  const area = q.get("area") ?? "alley";
  const horizon = Number(q.get("horizon") ?? 330);
  const w = Number(q.get("w") ?? 1024);
  c.width = w;
  c.height = Math.round((w * BLEED_H) / BLEED_W);
  const ctx = c.getContext("2d")!;
  const k = w / BLEED_W;
  ctx.setTransform(k, 0, 0, k, BLEED_X * k, BLEED_Y * k);
  const x0 = -BLEED_X;
  const y0 = -BLEED_Y;
  // the same night sky the game paints behind the scenery
  const sky = ctx.createLinearGradient(0, y0, 0, horizon);
  sky.addColorStop(0, "#1a2147");
  sky.addColorStop(0.7, "#36406f");
  sky.addColorStop(1, "#5d5a8a");
  ctx.fillStyle = sky;
  ctx.fillRect(x0, y0, BLEED_W, horizon - y0);
  let seed = [...area].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  paintScenery(ctx, area, { x0, y0, W: BLEED_W, H: BLEED_H, horizon }, rnd);
}
document.title = "ready";
