// Placeholder art, drawn with canvas paths in a storybook style (chunky ink outlines, soft fills).
// M5 replaces these with atlas sprites; until then every character is drawn here, centered on
// (0, 0), facing right, at roughly its in-game size in world units.

import type { UnitId } from "../sim/types.ts";

export const INK = "#2a2233";
const OUTLINE = 4;

type Ctx = CanvasRenderingContext2D;

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke = true) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = OUTLINE;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function dot(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx: Ctx, pts: number[], width = OUTLINE, color = INK) {
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  if (pts.length === 6) ctx.quadraticCurveTo(pts[2]!, pts[3]!, pts[4]!, pts[5]!);
  else for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function eye(ctx: Ctx, x: number, y: number, r: number, closed = false) {
  if (closed) {
    line(ctx, [x - r, y, x, y + r * 0.7, x + r, y], r * 0.6);
    return;
  }
  dot(ctx, x, y, r, INK);
  dot(ctx, x + r * 0.35, y - r * 0.35, r * 0.38, "#fff");
}

/** Jimothy: a round grey-and-black ball of a raccoon with no neck, stubby legs and a nub tail. */
export function drawJimothy(ctx: Ctx, t: number, mood: "idle" | "cheer" | "sleepy" = "idle") {
  const bob = mood === "cheer" ? Math.abs(Math.sin(t * 9)) * -18 : Math.sin(t * 2.4) * 2;
  const squash = mood === "cheer" ? 1 + Math.sin(t * 18) * 0.05 : 1 + Math.sin(t * 2.4) * 0.02;
  ctx.save();
  // feet stay planted; the body bobs above them
  for (const [x, y] of [[-34, 50], [-12, 56], [14, 56], [36, 50]] as const) ellipse(ctx, x, y, 11, 9, "#4b4d55");
  ctx.translate(0, bob);
  ctx.scale(1 / squash, squash);
  // nub tail with one dark ring
  ellipse(ctx, -64, 8, 13, 12, "#8a8d96");
  line(ctx, [-70, 0, -66, 9, -70, 18], 5, "#26242b");
  // ears
  ellipse(ctx, -8, -50, 12, 13, "#6d7079");
  ellipse(ctx, 26, -50, 12, 13, "#6d7079");
  dot(ctx, -8, -49, 5, "#3a3840");
  dot(ctx, 26, -49, 5, "#3a3840");
  // the round body and head in one shape: no neck
  ellipse(ctx, 0, 0, 64, 56, "#8a8d96");
  // darker back
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 54, 0, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, -38, -24, 46, 40, "#70737c", false);
  ellipse(ctx, 30, 30, 40, 26, "#a7a9b0", false); // pale belly
  ctx.restore();
  // bandit mask, eyes, muzzle, nose
  ellipse(ctx, 26, -14, 32, 13, "#1f1d24", false);
  if (mood === "sleepy") {
    line(ctx, [14, -14, 18, -10, 22, -14], 3, "#fff");
    line(ctx, [32, -14, 36, -10, 40, -14], 3, "#fff");
  } else {
    dot(ctx, 18, -15, 6, "#fff");
    dot(ctx, 37, -15, 6, "#fff");
    dot(ctx, 19, -14, 3.4, INK);
    dot(ctx, 38, -14, 3.4, INK);
  }
  ellipse(ctx, 40, 6, 20, 13, "#ece8ee");
  dot(ctx, 56, 2, 6, INK);
  if (mood === "cheer") ellipse(ctx, 40, 13, 7, 5, "#c0506a");
  else line(ctx, [34, 12, 40, 16, 46, 12], 3);
  ctx.restore();
}

export function drawCricket(ctx: Ctx, t: number, phase: number) {
  const hop = -Math.abs(Math.sin(t * 11 + phase)) * 8;
  ctx.save();
  ctx.translate(0, hop);
  // stubby legs
  line(ctx, [-8, 10, -12, 18], 4);
  line(ctx, [2, 11, 0, 19], 4);
  line(ctx, [11, 9, 14, 17], 4);
  // floppy antennae
  line(ctx, [10, -10, 18, -32, 30, -30], 3);
  line(ctx, [14, -8, 28, -24, 36, -18], 3);
  ellipse(ctx, 0, 0, 20, 15, "#6cc24a");
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 13, 0, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, 2, 9, 16, 8, "#a6e07a", false);
  ellipse(ctx, -10, -8, 9, 5, "#8ad66a", false); // shine
  ctx.restore();
  eye(ctx, 8, -3, 3.4);
  eye(ctx, 15, -2, 3);
  line(ctx, [9, 5, 13, 8, 17, 5], 2.4);
  ctx.restore();
}

export function drawPossum(ctx: Ctx, t: number, flopped: boolean) {
  ctx.save();
  if (flopped) {
    ctx.translate(0, 6);
    ctx.scale(1, -1); // belly-up, eyes closed: very convincingly asleep
  } else {
    ctx.translate(0, Math.sin(t * 5) * 1.5);
  }
  line(ctx, [-30, 4, -48, 0, -46, -14], 5, "#e6a3b0");
  for (const x of [-16, -4, 10, 20]) ellipse(ctx, x, 16, 5, 5, "#57525a");
  ellipse(ctx, -4, 0, 30, 18, "#c9c4c8");
  ellipse(ctx, 26, -4, 16, 12, "#f1eef0");
  dot(ctx, 16, -16, 6, "#3a3840");
  ellipse(ctx, 42, -2, 5, 4, "#e6a3b0");
  eye(ctx, 30, -7, 2.8, flopped);
  ctx.restore();
}

export function drawSquirrel(ctx: Ctx, t: number) {
  const run = Math.sin(t * 22);
  ctx.save();
  ctx.translate(0, -Math.abs(run) * 4);
  ellipse(ctx, -22, -14, 13, 20, "#d9884a"); // fluffy tail
  ellipse(ctx, -18, -24, 8, 10, "#e7a46a", false);
  line(ctx, [-4, 10, -8 + run * 4, 16], 4);
  line(ctx, [8, 10, 10 - run * 4, 16], 4);
  ellipse(ctx, 0, 0, 16, 12, "#c06a32");
  ellipse(ctx, 14, -8, 10, 9, "#c06a32");
  dot(ctx, 12, -18, 4, "#8c4a22");
  eye(ctx, 17, -9, 2.4);
  dot(ctx, 24, -6, 2.2, INK);
  ctx.restore();
}

export function drawCrow(ctx: Ctx, t: number) {
  const flap = Math.sin(t * 14);
  ctx.save();
  ellipse(ctx, 0, 0, 20, 13, "#2b2b35");
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.quadraticCurveTo(-4, -22 * flap - 6, 10, -4);
  ctx.closePath();
  ctx.fillStyle = "#3d3d4a";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, -4);
  ctx.lineTo(30, 0);
  ctx.lineTo(18, 4);
  ctx.closePath();
  ctx.fillStyle = "#e0a23a";
  ctx.fill();
  eye(ctx, 12, -4, 2.6);
  ctx.restore();
}

export function drawRat(ctx: Ctx, t: number, chewing: boolean) {
  ctx.save();
  ctx.translate(0, chewing ? Math.sin(t * 30) * 1.5 : Math.sin(t * 12) * 1.2);
  line(ctx, [-18, 4, -36, 10, -44, 2], 3, "#d996a6");
  ellipse(ctx, 0, 2, 20, 11, "#8f8a92");
  ellipse(ctx, 18, 0, 10, 8, "#a29da5");
  dot(ctx, 12, -9, 5, "#d996a6");
  eye(ctx, 20, -2, 2.2);
  dot(ctx, 28, 1, 2, "#d996a6");
  ctx.restore();
}

export function drawUnit(ctx: Ctx, id: UnitId, t: number, phase: number, state: { flopped?: boolean; chewing?: boolean } = {}) {
  switch (id) {
    case "cricket":
      return drawCricket(ctx, t, phase);
    case "possum":
      return drawPossum(ctx, t + phase, !!state.flopped);
    case "squirrel":
      return drawSquirrel(ctx, t + phase);
    case "crow":
      return drawCrow(ctx, t + phase);
    case "rat":
      return drawRat(ctx, t + phase, !!state.chewing);
  }
}

/** A bewildered neighbor in a cardigan, broom at the ready. `swing` 0..1 animates a sweep. */
export function drawBroomNeighbor(ctx: Ctx, swing: number) {
  ctx.save();
  const a = -0.6 + Math.sin(swing * Math.PI) * 1.4;
  ctx.save();
  ctx.translate(-20, 0);
  ctx.rotate(a);
  line(ctx, [0, -10, 0, 70], 6, "#9b6b3d");
  ellipse(ctx, 0, 78, 16, 10, "#e3c26b");
  ctx.restore();
  ellipse(ctx, 0, 20, 26, 40, "#5b7db1");
  ellipse(ctx, 0, -34, 22, 22, "#f0c8a0");
  ellipse(ctx, 0, -50, 22, 10, "#6e5442", false);
  dot(ctx, -8, -34, 3, INK);
  dot(ctx, 8, -34, 3, INK);
  line(ctx, [-12, -44, -4, -46], 2.5); // raised eyebrows: mostly bewildered
  line(ctx, [4, -46, 12, -44], 2.5);
  ellipse(ctx, 0, -24, 3.5, 4.5, INK, false);
  ctx.restore();
}

export function drawSprinkler(ctx: Ctx, spray: number, body = true) {
  if (body) {
    ellipse(ctx, 0, 6, 20, 9, "#7d858f");
    ellipse(ctx, 0, -6, 8, 14, "#aab3bd");
  }
  if (spray > 0) {
    ctx.save();
    ctx.globalAlpha = 1 - spray;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 18 + spray * 60;
      dot(ctx, Math.cos(ang) * r, -12 + Math.sin(ang) * r * 0.5 - (1 - spray) * 10, 4, "#8fd3ff");
    }
    ctx.restore();
  }
}

export function drawYardDog(ctx: Ctx, t: number, lunge: number) {
  ctx.save();
  ctx.translate(lunge * 14, Math.sin(t * 3) * 1);
  line(ctx, [-26, -6, -36, -20], 5, "#8a5a36");
  ellipse(ctx, 0, 0, 28, 18, "#b0784a");
  ellipse(ctx, 26, -14, 16, 14, "#b0784a");
  ellipse(ctx, 22, -26, 6, 10, "#7a4e2e");
  dot(ctx, 40, -12, 4, INK);
  eye(ctx, 28, -17, 2.6);
  ctx.restore();
}

export function drawMotionLight(ctx: Ctx, on: number) {
  ellipse(ctx, 0, 0, 16, 12, "#6b6f78");
  ellipse(ctx, 0, 10, 10, 6, on > 0 ? "#fff3b0" : "#d9d4c4");
}

export function drawFence(ctx: Ctx, open: boolean) {
  ctx.save();
  if (open) ctx.rotate(1.2);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.roundRect(i * 16 - 6, -40, 12, 80, [6, 6, 2, 2]);
    ctx.fillStyle = "#c79a64";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  line(ctx, [-40, -16, 40, -16], 6, "#9e7446");
  line(ctx, [-40, 18, 40, 18], 6, "#9e7446");
  ctx.restore();
}

/** The garbage pile, drawn smaller as it's carried off. `stage` is 0 (gone) … 5 (full). */
export function drawPile(ctx: Ctx, stage: number, shake: number) {
  ctx.save();
  ctx.translate(Math.sin(shake * 60) * shake * 10, 0);
  const items: [number, number, number, number, string][] = [
    // x, y, rx, ry, colour; drawn back to front. Each stage removes the top few items.
    [-60, 10, 52, 40, "#2d2f36"],
    [50, 14, 50, 38, "#33353d"],
    [0, 24, 60, 36, "#2a2c33"],
    [-34, -36, 42, 34, "#373942"],
    [36, -34, 40, 32, "#2f3138"],
    [0, -70, 38, 30, "#3a3c45"],
    [-24, -104, 28, 22, "#33353d"],
    [22, -100, 24, 20, "#2d2f36"],
    [0, -128, 20, 16, "#3a3c45"],
  ];
  const shown = Math.ceil((items.length * stage) / 5);
  for (let i = 0; i < shown; i++) {
    const [x, y, rx, ry, c] = items[i]!;
    ellipse(ctx, x, y, rx, ry, c);
    ellipse(ctx, x - rx * 0.3, y - ry * 0.4, rx * 0.25, ry * 0.18, "#5a5d68", false); // bag shine
    line(ctx, [x - 6, y - ry, x, y - ry - 10, x + 6, y - ry], 3); // tied top
  }
  if (stage >= 2) {
    ctx.beginPath();
    ctx.roundRect(70, -30, 34, 56, 6);
    ctx.fillStyle = "#9aa3ad";
    ctx.fill();
    ctx.lineWidth = OUTLINE;
    ctx.strokeStyle = INK;
    ctx.stroke();
    line(ctx, [-90, 30, -70, 20, -56, 34], 6, "#f2d14a"); // banana peel
  }
  if (stage >= 4) {
    ctx.save();
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.rect(-30, -150, 60, 12);
    ctx.fillStyle = "#d9a86a"; // pizza box on top
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function pileStage(hp: number, max: number): number {
  return hp <= 0 ? 0 : Math.max(1, Math.ceil((hp / max) * 5));
}
