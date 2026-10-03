// ?debug=1: fps, frame time and entity counts (plan §11.5).

import type { LevelSession } from "../play.ts";
import { h } from "./dom.ts";

export class DebugOverlay {
  private el = h("pre.debug");
  private frames = 0;
  private time = 0;
  private worst = 0;

  constructor(parent: HTMLElement) {
    parent.append(this.el);
  }

  frame(dt: number, s: LevelSession) {
    this.frames++;
    this.time += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.time < 0.5) return;
    const st = s.st;
    this.el.textContent =
      `${(this.frames / this.time).toFixed(0)} fps  worst ${(this.worst * 1000).toFixed(1)} ms\n` +
      `tick ${st.tick}  units ${st.units.length}  sent ${st.stats.sent}  speed ${s.speed}×`;
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
  }
}
