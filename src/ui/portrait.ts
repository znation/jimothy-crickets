// Small canvas portraits of units, defenses and Jimothy for cards and dialogs, drawn with the
// same sprite code as the playfield.

import {
  drawBroomNeighbor,
  drawFence,
  drawJimothy,
  drawMotionLight,
  drawSprinkler,
  drawUnit,
  drawYardDog,
} from "../render/sprites.ts";
import { DEFENSE_IDS, type DefenseId, type UnitId } from "../sim/types.ts";
import { drawFrame, frameHeight, type Atlas } from "../render/atlas.ts";
import { svg } from "./dom.ts";

let atlas: Atlas | null = null;

/** Use painted sprites for portraits once an atlas is loaded. */
export function setPortraitAtlas(a: Atlas | null) {
  atlas = a;
}

// World-unit height each subject is framed to.
const FRAME: Record<string, number> = { jimothy: 150, broomNeighbor: 190, fence: 100, sprinkler: 60, motionLight: 50, yardDog: 70 };

/** Whether the loaded atlases have a painted sprite with this name. */
export function hasPainted(name: string): boolean {
  return !!atlas?.frames[name];
}

/**
 * A small painted icon (snack, acorn, pile) when the atlas has it, else the SVG fallback. Sized by
 * CSS through the shared .icon class, like the SVGs it replaces.
 */
export function paintedIcon(name: string, fallbackSvg: string, px = 48): Element {
  if (!hasPainted(name)) return svg(fallbackSvg);
  const c = portrait(name, px, px);
  c.removeAttribute("style");
  c.classList.add("icon", "painted");
  c.setAttribute("aria-hidden", "true");
  return c;
}

export function portrait(id: UnitId | DefenseId | "jimothy" | (string & {}), cssW: number, cssH: number, zoom = 1): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement("canvas");
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  c.className = "portrait";
  const ctx = c.getContext("2d")!;
  // Jimothy's painted poses ("jimothy-wave" etc.) fall back to his everyday portrait.
  if (id.startsWith("jimothy-") && !atlas?.frames[id]) id = "jimothy";
  const art = atlas?.frames[id];
  if (art) {
    // fit the sprite (with its outline) inside the box, standing on the bottom edge
    const h = frameHeight(art);
    const w = art.w / art.scale;
    const fit = Math.min((cssW * 0.92) / w, (cssH * 0.92) / h) * zoom * dpr;
    ctx.setTransform(fit, 0, 0, fit, c.width / 2, c.height / 2 + (h * fit) / 2);
    drawFrame(ctx, art);
    return c;
  }
  const k = dpr * zoom * (cssH / (FRAME[id] ?? 60));
  const unit = id !== "jimothy" && !DEFENSE_IDS.includes(id as DefenseId);
  ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2 + (unit ? 4 * k : id === "broomNeighbor" ? 10 * k : 0));
  switch (id) {
    case "jimothy":
      drawJimothy(ctx, 0, "idle");
      break;
    case "sprinkler":
      drawSprinkler(ctx, 0.35);
      break;
    case "broomNeighbor":
      drawBroomNeighbor(ctx, 0);
      break;
    case "yardDog":
      drawYardDog(ctx, 0, 0);
      break;
    case "motionLight":
      drawMotionLight(ctx, 1);
      break;
    case "fence":
      drawFence(ctx, false);
      break;
    default:
      drawUnit(ctx, id as UnitId, 0, 0);
  }
  return c;
}
