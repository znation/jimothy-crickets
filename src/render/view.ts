// Fit the fixed 1920×1080 logical world to any screen (plan §3.1). The 16:9 core always fits and
// is centered; wider or taller screens see more of the painted bleed (2400×1350) instead of bars.

export const WORLD_W = 1920;
export const WORLD_H = 1080;
export const BLEED_W = 2400;
export const BLEED_H = 1350;
export const BLEED_X = (BLEED_W - WORLD_W) / 2; // 240: bleed extends this far left of x=0
export const BLEED_Y = (BLEED_H - WORLD_H) / 2; // 135
const MAX_DPR = 2;

export class View {
  readonly ctx: CanvasRenderingContext2D;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  scale = 1; // CSS px per world unit
  ox = 0; // CSS px position of world (0, 0)
  oy = 0;
  /** Bumped on every resize so cached layers know to redraw. */
  generation = 0;
  /** Cap on the backing-store density (plan §3.1); may be lowered on slow devices (§11.5). */
  maxDpr = MAX_DPR;

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.resize();
  }

  resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.scale = Math.min(cssW / WORLD_W, cssH / WORLD_H);
    this.ox = (cssW - WORLD_W * this.scale) / 2;
    this.oy = (cssH - WORLD_H * this.scale) / 2;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.generation++;
  }

  /** Set the transform so drawing happens in world units. */
  worldTransform(ctx = this.ctx) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
  }

  /** The visible area in world units (may extend past the core in any direction). */
  visibleWorld() {
    return {
      x0: -this.ox / this.scale,
      y0: -this.oy / this.scale,
      x1: (this.cssW - this.ox) / this.scale,
      y1: (this.cssH - this.oy) / this.scale,
    };
  }

  toWorld(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(clientX - r.left - this.ox) / this.scale, (clientY - r.top - this.oy) / this.scale];
  }
}
