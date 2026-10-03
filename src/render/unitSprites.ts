// Pre-rendered unit animation frames. Drawing every unit from vector paths each frame is too slow
// for WebKit's canvas (Tauri's Linux/Steam Deck webview): ~22 fps on the stress level against 60
// in Chromium. Each unit's animation cycle is drawn once per screen size into 8 small canvases and
// then just blitted. The M5 sprite atlases will slot in here.

import type { UnitId } from "../sim/types.ts";
import { drawUnit } from "./sprites.ts";

const FRAMES = 8;
const BOX = 120; // world units around the unit's origin, before scaling

/** Each sprite's animation repeats with this period in its animation argument. */
function period(id: UnitId, chewing: boolean): number {
  switch (id) {
    case "cricket":
      return Math.PI / 11;
    case "possum":
      return (2 * Math.PI) / 5;
    case "squirrel":
      return (2 * Math.PI) / 22;
    case "crow":
      return (2 * Math.PI) / 14;
    case "rat":
      return (2 * Math.PI) / (chewing ? 30 : 12);
  }
}

export class UnitSprites {
  private cache = new Map<string, HTMLCanvasElement>();
  private k = 0;

  /**
   * Draw unit `id` centered at (x, y) in world units. `k` is device pixels per world unit; `scale`
   * is the unit's drawing scale; `t` and `phase` are as for drawUnit.
   */
  draw(ctx: CanvasRenderingContext2D, k: number, scale: number, id: UnitId, t: number, phase: number, state: { flopped?: boolean; chewing?: boolean }) {
    if (k !== this.k) {
      this.cache.clear();
      this.k = k;
    }
    const chewing = !!state.chewing;
    const p = period(id, chewing);
    const arg = id === "cricket" ? t + phase / 11 : t + phase;
    const f = Math.floor((((arg % p) + p) % p) / p * FRAMES) % FRAMES;
    const key = `${id}|${f}|${state.flopped ? 1 : 0}|${chewing ? 1 : 0}|${scale}`;
    let img = this.cache.get(key);
    if (!img) {
      img = document.createElement("canvas");
      const box = BOX * scale;
      img.width = img.height = Math.ceil(box * k);
      const c = img.getContext("2d")!;
      c.setTransform(k * scale, 0, 0, k * scale, img.width / 2, img.height / 2);
      drawUnit(c, id, ((f + 0.5) / FRAMES) * p, 0, state);
      this.cache.set(key, img);
    }
    const box = BOX * scale;
    ctx.drawImage(img, -box / 2, -box / 2, box, box);
  }
}
