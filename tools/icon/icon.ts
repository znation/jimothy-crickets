// Draws Jimothy art for app icons and splash screens; tools/make_icons.ts screenshots it.
// ?w=&h=&mode=icon|maskable|foreground|splash

import { drawCricket, drawJimothy } from "../../src/render/sprites.ts";

const params = new URLSearchParams(location.search);
const w = Number(params.get("w") ?? params.get("size") ?? 512);
const h = Number(params.get("h") ?? w);
const mode = params.get("mode") ?? (params.has("maskable") ? "maskable" : "icon");
const c = document.querySelector("canvas")!;
c.width = w;
c.height = h;
const ctx = c.getContext("2d")!;

function sky(x: number, y: number, sw: number, sh: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + sh);
  g.addColorStop(0, "#1a2147");
  g.addColorStop(1, "#4b4f86");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, sw, sh);
}

function scene(cx: number, cy: number, s: number, withGround = true) {
  // Jimothy with a cricket friend, centered on (cx, cy) at scale s (1 = Jimothy ~130 px wide).
  if (withGround) {
    ctx.fillStyle = "#3f4756";
    ctx.beginPath();
    ctx.ellipse(cx + 20 * s, cy + 50 * s, 120 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(cx - 8 * s, cy - 10 * s);
  ctx.scale(s, s);
  drawJimothy(ctx, 0, "cheer");
  ctx.restore();
  ctx.save();
  ctx.translate(cx + 55 * s, cy + 36 * s);
  ctx.scale(0.8 * s, 0.8 * s);
  drawCricket(ctx, 0, 0);
  ctx.restore();
}

if (mode === "splash") {
  sky(0, 0, w, h);
  const s = Math.min(w, h) / 420;
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(w / 2 + 120 * s, h / 2 - 110 * s, 30 * s, 0, Math.PI * 2);
  ctx.fill();
  scene(w / 2, h / 2, s);
} else {
  const k = w / 512;
  ctx.scale(k, k);
  if (mode === "icon") {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 480, 110);
    ctx.clip();
    sky(0, 0, 512, 512);
    ctx.restore();
  } else if (mode === "maskable") sky(0, 0, 512, 512);
  if (mode !== "foreground") {
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(390, 120, 46, 0, Math.PI * 2);
    ctx.fill();
  }
  // Maskable and adaptive icons keep the subject inside the central safe zone.
  const s = mode === "icon" ? 2.6 : mode === "maskable" ? 2.0 : 1.55;
  scene(256, 286, s, mode !== "foreground");
}
document.title = "ready";
