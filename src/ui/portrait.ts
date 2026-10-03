// Small canvas portraits of units and Jimothy for cards and dialogs, drawn with the same sprite
// code as the playfield.

import { drawJimothy, drawUnit } from "../render/sprites.ts";
import type { UnitId } from "../sim/types.ts";

export function portrait(id: UnitId | "jimothy", cssW: number, cssH: number, zoom = 1): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement("canvas");
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  c.className = "portrait";
  const ctx = c.getContext("2d")!;
  const k = dpr * zoom * (id === "jimothy" ? cssH / 150 : cssH / 60);
  ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2 + (id === "jimothy" ? 0 : 4 * k));
  if (id === "jimothy") drawJimothy(ctx, 0, "idle");
  else drawUnit(ctx, id, 0, 0);
  return c;
}
