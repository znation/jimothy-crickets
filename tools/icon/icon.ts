import { drawCricket, drawJimothy } from "../../src/render/sprites.ts";

const params = new URLSearchParams(location.search);
const size = Number(params.get("size") ?? 512);
const maskable = params.has("maskable"); // full-bleed square with a safe zone (80 % circle)
const c = document.querySelector("canvas")!;
c.width = c.height = size;
const ctx = c.getContext("2d")!;
const k = size / 512;
ctx.scale(k, k);
const g = ctx.createLinearGradient(0, 0, 0, 512);
g.addColorStop(0, "#1a2147");
g.addColorStop(1, "#4b4f86");
ctx.fillStyle = g;
if (maskable) ctx.fillRect(0, 0, 512, 512);
else {
  ctx.beginPath();
  ctx.roundRect(16, 16, 480, 480, 110);
  ctx.fill();
}
ctx.fillStyle = "#ffe08a";
ctx.beginPath();
ctx.arc(390, 120, 46, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = "#3f4756";
ctx.beginPath();
ctx.ellipse(256, 420, 230, 60, 0, 0, Math.PI * 2);
ctx.fill();
const s = maskable ? 2.3 : 2.8;
ctx.save();
ctx.translate(236, 300);
ctx.scale(s, s);
drawJimothy(ctx, 0, "cheer");
ctx.restore();
ctx.save();
ctx.translate(maskable ? 360 : 390, 400);
ctx.scale(2.2, 2.2);
drawCricket(ctx, 0, 0);
ctx.restore();
document.title = "ready";
