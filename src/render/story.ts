// Story cards (plan §8.3): small scenes composed from the painted sprites, shown before each area's
// first level and after the last one, and rendered into the store art (tools/store/). One layout
// for any aspect ratio: the area's painted background covers the canvas, the pile sits on the
// right, Jimothy on the left, and the troupe that has joined by then stands between them.

import type { UnitId } from "../sim/types.ts";
import { drawFrame, frameHeight, type Atlas, type Frame } from "./atlas.ts";

export type StoryId = "title" | "alley" | "backyards" | "culdesac" | "stripmall" | "finale";

interface Story {
  area: string;
  pose: "wave" | "happy";
  troupe: UnitId[];
}

const STORIES: Record<StoryId, Story> = {
  title: { area: "alley", pose: "wave", troupe: ["cricket", "cricket", "possum", "cricket"] },
  alley: { area: "alley", pose: "wave", troupe: ["cricket", "cricket", "cricket"] },
  backyards: { area: "backyards", pose: "wave", troupe: ["cricket", "possum", "cricket", "squirrel"] },
  culdesac: { area: "culdesac", pose: "wave", troupe: ["cricket", "possum", "crow", "squirrel", "cricket"] },
  stripmall: { area: "stripmall", pose: "wave", troupe: ["cricket", "rat", "possum", "crow", "squirrel", "cricket"] },
  finale: { area: "stripmall", pose: "happy", troupe: ["cricket", "possum", "squirrel", "crow", "rat", "cricket"] },
};

const AREA_STORIES: readonly string[] = ["alley", "backyards", "culdesac", "stripmall"];

/** The story card that opens an area. */
export function storyForArea(area: string): StoryId | null {
  return AREA_STORIES.includes(area) ? (area as StoryId) : null;
}

/** Whether the atlas has what a story card needs (the painted backgrounds and Jimothy). */
export function canDrawStory(atlas: Atlas | null, id: StoryId): atlas is Atlas {
  return !!atlas?.backgrounds[STORIES[id].area] && !!atlas.frames.jimothy;
}

export interface StoryOpts {
  /** Animation time in seconds; 0 draws the still pose. */
  t?: number;
  /** Fraction of the height kept clear at the top (for a caption or a logo). */
  top?: number;
}

/** Draw a story scene filling w × h canvas pixels. */
export function drawStory(ctx: CanvasRenderingContext2D, w: number, h: number, atlas: Atlas, id: StoryId, opts: StoryOpts = {}) {
  const story = STORIES[id];
  const t = opts.t ?? 0;
  const f = atlas.frames;
  ctx.save();

  // background: cover, keeping the lower part (the ground the troupe stands on)
  const bg = atlas.backgrounds[story.area]!;
  const cover = Math.max(w / bg.width, h / bg.height);
  const bw = bg.width * cover;
  const bh = bg.height * cover;
  ctx.drawImage(bg, (w - bw) / 2, (h - bh) * 0.7, bw, bh);

  // The stage, sized by the smaller of height and width. Wide boxes stand everyone on one ground
  // line: Jimothy, the troupe, the pile. Tall ones stack them: the pile at the back, Jimothy in
  // the middle, the troupe in a row along the front.
  const top = (opts.top ?? 0) * h;
  const tall = w / (h - top) < 1.5;
  const k = tall ? Math.min((h - top) / 640, w / 640) : Math.min((h - top) / 520, w / 1100);
  const ground = h - Math.min(h * 0.08, (tall ? 40 : 70) * k);
  const jim = { x: tall ? w * 0.32 : Math.max(w * 0.2, 150 * k), y: ground + (tall ? -80 : 6) * k };
  const pileAt = { x: tall ? w * 0.7 : Math.min(w * 0.8, w - 170 * k), y: tall ? ground - 190 * k : ground };
  const row = tall ? [w * 0.12, w * 0.88] : [jim.x + 150 * k, pileAt.x - 270 * k];

  // a soft pool of warm light the scene stands in
  const glow = ctx.createRadialGradient(w / 2, ground, 0, w / 2, ground, Math.max(w, h) * 0.7);
  glow.addColorStop(0, "rgba(255, 214, 140, 0.18)");
  glow.addColorStop(1, "rgba(16, 18, 40, 0.35)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pile = f[`pile-${story.area}`] ?? f.pile;
  if (pile) at(ctx, pile, pileAt.x, pileAt.y, (430 * k) / frameHeight(pile));

  const jimothy = () => {
    const frame = f[`jimothy-${story.pose}`] ?? f.jimothy!;
    at(ctx, frame, jim.x, jim.y, (300 * k) / frameHeight(frame));
  };
  if (tall) jimothy();

  // the troupe, alternately a little further back
  const n = story.troupe.length;
  story.troupe.forEach((unit, i) => {
    const frame = f[unit];
    if (!frame) return;
    const x = n === 1 ? (row[0]! + row[1]!) / 2 : row[0]! + ((row[1]! - row[0]!) * i) / (n - 1);
    const hop = t ? Math.abs(Math.sin(t * 6 + i * 1.7)) * 14 * k : 0;
    const air = unit === "crow" ? (tall ? 330 : 170) * k + Math.sin(t * 3 + i) * 10 * k : 0;
    const y = ground - (i % 2) * 18 * k - hop - air;
    at(ctx, frame, x, y, ((unit === "crow" ? 100 : 105) * k) / 60);
  });
  if (!tall) jimothy();

  if (id === "finale") {
    // the prize, held up high, and a few more cookies on the ground
    const snack = f.snack;
    if (snack) {
      at(ctx, snack, jim.x + 20 * k, jim.y - 340 * k + Math.sin(t * 4) * 8 * k, 1.9 * k);
      for (const [dx, s] of [[-0.12, 1.1], [0.5, 1.3], [0.62, 1]] as const) {
        at(ctx, snack, jim.x + (pileAt.x - jim.x) * (0.5 + dx), ground + 4 * k, s * k);
      }
    }
    confetti(ctx, w, h, k, t);
  }
  ctx.restore();
}

function at(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  drawFrame(ctx, frame, 1, 1, size);
  ctx.restore();
}

function confetti(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, t: number) {
  const colours = ["#ffe08a", "#6cc24a", "#ff8f5a", "#8fd3ff", "#f6a6c1"];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = ((rnd() * h * 0.75 + t * 60 * k * (0.5 + rnd())) % (h * 0.75));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * 6 + t * 2);
    ctx.fillStyle = colours[i % colours.length]!;
    ctx.fillRect(-6 * k, -3 * k, 12 * k, 6 * k);
    ctx.restore();
  }
}
