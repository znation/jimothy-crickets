// Draws a level: a cached background layer (sky, alley, lanes, defense ranges), then per frame
// the defenses, pile, units, Jimothy and short-lived effects. Reads sim state; never changes it.

import { directionAt, pointAt } from "../sim/lane.ts";
import { TICK_RATE, type SimState } from "../sim/sim.ts";
import type { SimEvent, UnitId, Vec } from "../sim/types.ts";
import {
  drawBroomNeighbor,
  drawFence,
  drawJimothy,
  drawMotionLight,
  drawPile,
  drawSprinkler,
  drawUnit,
  drawYardDog,
  INK,
  pileStage,
} from "./sprites.ts";
import { BLEED_H, BLEED_W, BLEED_X, BLEED_Y, type View } from "./view.ts";

const LANE_WIDTH = 120;
const JIMOTHY_X = 130;
const FLY_HEIGHT = 90;
/** Units are drawn larger than life so they stay readable on phones (~0.35 CSS px per unit). */
const UNIT_SCALE = 1.5;

interface Effect {
  kind: "hop" | "text" | "startle" | "dust" | "confetti";
  x: number;
  y: number;
  age: number;
  life: number;
  unit?: UnitId;
  text?: string;
  dir?: number;
  vx?: number;
  vy?: number;
  colour?: string;
}

export class SceneRenderer {
  private bg: HTMLCanvasElement | null = null;
  private bgKey = "";
  private effects: Effect[] = [];
  private pileShake = 0;
  private cheer = 0;
  private tmp: Vec = [0, 0];
  reducedMotion = false;
  selectedLane = -1;
  highlightLanes = false;

  private view: View;

  constructor(view: View) {
    this.view = view;
  }

  /** Turn sim events into presentation effects. */
  onEvents(st: SimState, events: SimEvent[]) {
    for (const e of events) {
      if (e.type === "unitShooed") {
        const [x, y] = pointAt(st.lanes[e.lane]!, e.s, this.tmp);
        this.add({ kind: "hop", x, y, life: 0.9, unit: e.unit, dir: e.uid % 2 ? 1 : -1 });
      } else if (e.type === "pileHit") {
        const [px, py] = st.level.pile.pos;
        this.pileShake = this.reducedMotion ? 0 : 0.25;
        this.cheer = 0.8;
        if (e.haul) this.add({ kind: "text", x: px - 40, y: py - 170, life: 1, text: `+${e.haul}` });
        this.add({ kind: "dust", x: px - 60, y: py + 30, life: 0.5 });
      } else if (e.type === "unitHit") {
        const u = st.units.find((v) => v.uid === e.uid);
        if (u && !this.reducedMotion) {
          const [x, y] = this.unitPos(st, u.lane, u.s, u.jitter, u.def.tags.includes("air"));
          this.add({ kind: "startle", x, y: y - 40, life: 0.45 });
        }
      } else if (e.type === "levelWon") {
        // a burst of leaves and stars from where the pile was
        const [px, py] = st.level.pile.pos;
        const colours = ["#ffe08a", "#6cc24a", "#ff8f5a", "#8fd3ff", "#f6a6c1"];
        for (let i = 0; i < (this.reducedMotion ? 0 : 60); i++) {
          const a = -Math.PI / 2 + (i / 60 - 0.5) * 2.4;
          const speed = 500 + ((i * 97) % 400);
          this.add({ kind: "confetti", x: px, y: py - 40, life: 1.6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, colour: colours[i % colours.length]! });
        }
      } else if (e.type === "defenseChewed") {
        const [x, y] = st.defenses[e.index]!.pos;
        this.add({ kind: "dust", x, y, life: 0.6 });
      }
    }
  }

  private add(e: Omit<Effect, "age">) {
    if (this.effects.length < 200) this.effects.push({ ...e, age: 0 });
  }

  /** Draw one frame. `alpha` interpolates between the last two sim ticks; `t` is wall time in s. */
  draw(st: SimState, alpha: number, t: number, dt: number) {
    const { ctx } = this.view;
    this.drawBackground(st);
    this.view.worldTransform();

    const simT = (st.tick + alpha) / TICK_RATE;
    if (this.selectedLane >= 0 && this.highlightLanes) this.drawLaneHighlight(st, this.selectedLane, t);

    for (const d of st.defenses) {
      const age = (st.tick + alpha - d.lastFiredTick) / TICK_RATE;
      ctx.save();
      ctx.translate(d.pos[0], d.pos[1]);
      if (d.disabled && !d.def.effect.blocks) ctx.globalAlpha = 0.45;
      switch (d.def.id) {
        case "sprinkler":
          drawSprinkler(ctx, age < 0.6 ? age / 0.6 : 0);
          break;
        case "broomNeighbor":
          drawBroomNeighbor(ctx, age < 0.5 ? age / 0.5 : 0);
          break;
        case "yardDog":
          drawYardDog(ctx, t, age < 0.3 ? 1 - age / 0.3 : 0);
          break;
        case "motionLight":
          if (age < 1.2 && !d.disabled) this.drawCone(d.facingDeg, d.def.shape.r, (d.def.shape as { arcDeg: number }).arcDeg ?? 60, 1 - age / 1.2);
          drawMotionLight(ctx, age < 1.2 ? 1 : 0);
          break;
        case "fence": {
          const lane = st.lanes[d.blockLane]!;
          const [dx, dy] = directionAt(lane, d.blockS);
          ctx.rotate(Math.atan2(dy, dx));
          drawFence(ctx, d.disabled);
          break;
        }
      }
      ctx.restore();
    }

    // pile
    this.pileShake = Math.max(0, this.pileShake - dt);
    ctx.save();
    ctx.translate(st.level.pile.pos[0], st.level.pile.pos[1]);
    drawPile(ctx, pileStage(st.pileHp, st.level.pile.hp), this.pileShake);
    ctx.restore();

    // units, back to front
    const order = st.units.map((u) => {
      const s = u.prevS + (u.s - u.prevS) * alpha;
      const air = u.def.tags.includes("air");
      const [x, y] = this.unitPos(st, u.lane, s, u.jitter, false);
      return { u, x, y, air };
    });
    order.sort((a, b) => a.y - b.y);
    for (const { u, x, y, air } of order) {
      ctx.save();
      if (air) {
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.ellipse(x, y + 14, 18 * UNIT_SCALE, 6 * UNIT_SCALE, 0, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.translate(x, y - (air ? FLY_HEIGHT : 0));
      ctx.scale(UNIT_SCALE, UNIT_SCALE);
      const moving = u.stunTicks === 0 && u.flopTicks === 0 && u.chewing < 0;
      drawUnit(ctx, u.def.id, moving ? simT : 0, u.uid * 1.7, { flopped: u.flopTicks > 0, chewing: u.chewing >= 0 });
      if (u.slowTicks > 0) {
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 3; i++) {
          const k = (t * 2 + i / 3) % 1;
          ctx.beginPath();
          ctx.arc(-14 + i * 14, -26 + k * 30, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#8fd3ff";
          ctx.fill();
        }
      }
      if (u.stunTicks > 0) this.drawStars(t);
      ctx.restore();
    }

    // Jimothy in the staging area, between the lanes
    this.cheer = Math.max(0, this.cheer - dt);
    ctx.save();
    ctx.translate(JIMOTHY_X, stagingY(st) - 40);
    drawJimothy(ctx, t, st.outcome?.kind === "nightEnded" ? "sleepy" : this.cheer > 0 || st.outcome?.kind === "won" ? "cheer" : "idle");
    ctx.restore();

    this.drawEffects(t, dt);
  }

  unitPos(st: SimState, lane: number, s: number, jitter: number, air: boolean): Vec {
    const l = st.lanes[lane]!;
    const [x, y] = pointAt(l, s, [0, 0]);
    const [dx, dy] = directionAt(l, s);
    const off = jitter * LANE_WIDTH * 0.28;
    return [x - dy * off, y + dx * off - (air ? FLY_HEIGHT : 0)];
  }

  private drawStars(t: number) {
    const { ctx } = this.view;
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = "#ffe066";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("✦", Math.cos(a) * 18 - 6, -34 + Math.sin(a) * 6);
    }
  }

  private drawCone(facingDeg: number, r: number, arcDeg: number, strength: number) {
    const { ctx } = this.view;
    const f = (facingDeg * Math.PI) / 180;
    const half = (arcDeg * Math.PI) / 360;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255, 243, 176, ${0.55 * strength})`);
    g.addColorStop(1, "rgba(255, 243, 176, 0)");
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, f - half, f + half);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }

  private drawLaneHighlight(st: SimState, lane: number, t: number) {
    const { ctx } = this.view;
    const pts = st.lanes[lane]!.points;
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = LANE_WIDTH + 16;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(255, 236, 150, ${0.18 + Math.sin(t * 4) * 0.06})`;
    ctx.stroke();
    ctx.restore();
  }

  private drawEffects(t: number, dt: number) {
    const { ctx } = this.view;
    for (const e of this.effects) {
      e.age += dt;
      const k = e.age / e.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (e.kind === "hop" && e.unit) {
        // startled hop off to the side: nobody gets hurt
        const hop = this.reducedMotion ? 0 : k;
        ctx.translate(e.x + e.dir! * hop * 120, e.y - Math.sin(hop * Math.PI) * 90 - hop * 30);
        ctx.rotate(e.dir! * hop * 0.6);
        ctx.scale(UNIT_SCALE, UNIT_SCALE);
        drawUnit(ctx, e.unit, t, 0);
      } else if (e.kind === "text") {
        ctx.font = "bold 44px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 8;
        ctx.strokeStyle = INK;
        ctx.strokeText(e.text!, e.x, e.y - k * 50);
        ctx.fillStyle = "#ffe08a";
        ctx.fillText(e.text!, e.x, e.y - k * 50);
      } else if (e.kind === "startle") {
        ctx.font = "bold 36px ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.strokeText("!", e.x, e.y - k * 14);
        ctx.fillStyle = "#fff";
        ctx.fillText("!", e.x, e.y - k * 14);
      } else if (e.kind === "confetti") {
        const x = e.x + e.vx! * e.age;
        const y = e.y + e.vy! * e.age + 700 * e.age * e.age; // a little gravity
        ctx.translate(x, y);
        ctx.rotate(e.age * 8 + e.vx!);
        ctx.fillStyle = e.colour!;
        ctx.fillRect(-7, -4, 14, 8);
      } else if (e.kind === "dust") {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * k * 50, e.y + Math.sin(a) * k * 20, 10 * (1 - k) + 2, 0, Math.PI * 2);
          ctx.fillStyle = "#d8cfc0";
          ctx.fill();
        }
      }
      ctx.restore();
    }
    if (this.effects.some((e) => e.age >= e.life)) this.effects = this.effects.filter((e) => e.age < e.life);
  }

  // ---- background ----

  private drawBackground(st: SimState) {
    const v = this.view;
    if (!v.canvas.width || !v.canvas.height) return;
    const key = `${st.level.id}:${v.generation}`;
    if (key !== this.bgKey || !this.bg) {
      this.bg ??= document.createElement("canvas");
      this.bg.width = v.canvas.width;
      this.bg.height = v.canvas.height;
      const ctx = this.bg.getContext("2d")!;
      paintBackground(ctx, v, st);
      this.bgKey = key;
    }
    v.ctx.setTransform(1, 0, 0, 1, 0, 0);
    v.ctx.drawImage(this.bg, 0, 0);
  }
}

/** The middle of the lanes' starting points: where Jimothy stands. */
export function stagingY(st: SimState): number {
  const ys = st.lanes.map((l) => l.points[0]![1]);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

/** Paint the static layer. Decorations are placed from a PRNG seeded by the level id. */
function paintBackground(ctx: CanvasRenderingContext2D, v: View, st: SimState) {
  let seed = [...st.level.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#141a33";
  ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
  v.worldTransform(ctx);
  // Paint at least the bleed, and further if the screen is wider still (e.g. 32:9). Procedural
  // scenery has no edge; painted backgrounds (M5) will need to cover these extremes too.
  const vis = v.visibleWorld();
  const x0 = Math.min(-BLEED_X, Math.floor(vis.x0));
  const y0 = Math.min(-BLEED_Y, Math.floor(vis.y0));
  const W = Math.max(BLEED_W - BLEED_X, Math.ceil(vis.x1)) - x0;
  const H = Math.max(BLEED_H - BLEED_Y, Math.ceil(vis.y1)) - y0;
  // The skyline sits just above the highest lane, so paths never run through buildings.
  const highestLane = Math.min(...st.lanes.flatMap((l) => l.points.map((pt) => pt[1])));
  const horizon = Math.min(330, highestLane - 90);

  const sky = ctx.createLinearGradient(0, y0, 0, horizon);
  sky.addColorStop(0, "#1a2147");
  sky.addColorStop(0.7, "#36406f");
  sky.addColorStop(1, "#5d5a8a");
  ctx.fillStyle = sky;
  ctx.fillRect(x0, y0, W, horizon - y0);
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.4 + rnd() * 0.6;
    ctx.fillStyle = "#fff8e0";
    ctx.beginPath();
    ctx.arc(x0 + rnd() * W, y0 + rnd() * (horizon - y0 - 60), 1 + rnd() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  paintScenery(ctx, st.level.area, { x0, y0, W, H, horizon }, rnd);

  // defense ranges, faint, so players can read the layout
  for (const d of st.defenses) {
    if (d.def.effect.blocks) continue;
    ctx.save();
    ctx.translate(d.pos[0], d.pos[1]);
    ctx.beginPath();
    if (d.def.shape.kind === "radius") ctx.arc(0, 0, d.def.shape.r, 0, Math.PI * 2);
    else {
      const f = (d.facingDeg * Math.PI) / 180;
      const half = (d.def.shape.arcDeg * Math.PI) / 360;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, d.def.shape.r, f - half, f + half);
      ctx.closePath();
    }
    ctx.fillStyle = RANGE_COLOURS[d.def.id] ?? "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.stroke();
    ctx.restore();
  }

  // lanes: a worn dirt path with mossy edges
  for (const lane of st.lanes) {
    const path = new Path2D();
    lane.points.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = LANE_WIDTH + 14;
    ctx.strokeStyle = "#4e6b4a";
    ctx.stroke(path);
    ctx.lineWidth = LANE_WIDTH;
    ctx.strokeStyle = "#8a7b68";
    ctx.stroke(path);
    ctx.lineWidth = LANE_WIDTH - 40;
    ctx.strokeStyle = "#988871";
    ctx.stroke(path);
    ctx.setLineDash([4, 36]);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(60, 50, 40, 0.35)";
    ctx.stroke(path);
    ctx.setLineDash([]);
  }

  // staging area: a flattened cardboard box under Jimothy, between the lanes' starts
  ctx.save();
  ctx.translate(st.lanes[0]!.points[0]![0] - 120, stagingY(st) + 20);
  ctx.rotate(-0.04);
  ctx.beginPath();
  ctx.roundRect(-110, -40, 220, 80, 10);
  ctx.fillStyle = "#b98a57";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // a streetlamp glowing over the pile
  const [px, py] = st.level.pile.pos;
  const glow = ctx.createRadialGradient(px, py - 60, 10, px, py - 60, 360);
  glow.addColorStop(0, "rgba(255, 220, 140, 0.35)");
  glow.addColorStop(1, "rgba(255, 220, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - 360, py - 420, 720, 720);
}

const RANGE_COLOURS: Record<string, string> = {
  sprinkler: "rgba(120, 200, 255, 0.12)",
  broomNeighbor: "rgba(255, 190, 120, 0.10)",
  yardDog: "rgba(255, 140, 120, 0.12)",
  motionLight: "rgba(255, 243, 176, 0.08)",
};

interface Box {
  x0: number;
  y0: number;
  W: number;
  H: number;
  horizon: number;
}

/** The skyline and ground for each area (README art direction: damp, mossy, evergreen PNW). */
function paintScenery(ctx: CanvasRenderingContext2D, area: string, b: Box, rnd: () => number) {
  const { x0, y0, W, H, horizon } = b;
  const evergreens = (base: number, minH: number, maxH: number) => {
    for (let x = x0 - 40; x < x0 + W + 80; x += 70 + rnd() * 60) {
      const h = minH + rnd() * (maxH - minH);
      ctx.fillStyle = rnd() < 0.5 ? "#1d3a36" : "#24443d";
      ctx.beginPath();
      ctx.moveTo(x, base + 20);
      ctx.lineTo(x + 45, base - h);
      ctx.lineTo(x + 90, base + 20);
      ctx.fill();
    }
  };
  const window = (x: number, y: number, w: number, h: number, lit = 0.3) => {
    ctx.fillStyle = rnd() < lit ? "#f6d08a" : "#2a2740";
    ctx.fillRect(x, y, w, h);
  };
  const ground = (top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, horizon, 0, y0 + H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(x0, horizon, W, y0 + H - horizon);
  };
  const patches = (n: number, colours: string[]) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colours[Math.floor(rnd() * colours.length)]!;
      ctx.beginPath();
      ctx.ellipse(x0 + rnd() * W, horizon + 40 + rnd() * (H - horizon), 30 + rnd() * 90, 10 + rnd() * 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const house = (x: number, w: number, h: number, wall: string) => {
    ctx.fillStyle = wall;
    ctx.fillRect(x, horizon - h, w, h + 30);
    ctx.fillStyle = "#2b2840";
    ctx.beginPath();
    ctx.moveTo(x - 16, horizon - h + 4);
    ctx.lineTo(x + w / 2, horizon - h - w * 0.38);
    ctx.lineTo(x + w + 16, horizon - h + 4);
    ctx.fill();
    for (let wx = x + 22; wx < x + w - 40; wx += 58) window(wx, horizon - h + 26, 30, 30, 0.45);
  };

  switch (area) {
    case "backyards": {
      evergreens(horizon - 40, 200, 320);
      for (let x = x0; x < x0 + W; x += 300 + rnd() * 120) house(x, 200 + rnd() * 60, 120 + rnd() * 40, rnd() < 0.5 ? "#4a4060" : "#3f4a63");
      ground("#3d5a3b", "#2c4430");
      // a wooden fence along the back of the yards
      ctx.fillStyle = "#6e5640";
      ctx.fillRect(x0, horizon - 40, W, 46);
      for (let x = x0; x < x0 + W; x += 26) {
        ctx.fillStyle = "#7d6349";
        ctx.fillRect(x, horizon - 52, 20, 58);
      }
      patches(50, ["rgba(110, 160, 90, 0.35)", "rgba(70, 110, 70, 0.4)", "rgba(240, 220, 120, 0.25)"]);
      break;
    }
    case "culdesac": {
      evergreens(horizon - 30, 160, 260);
      for (let x = x0; x < x0 + W; x += 360 + rnd() * 100) {
        house(x, 260 + rnd() * 50, 140 + rnd() * 30, rnd() < 0.5 ? "#4d4466" : "#45506b");
        ctx.fillStyle = "#5d5874"; // garage door
        ctx.fillRect(x + 150, horizon - 70, 90, 100);
      }
      ground("#456a42", "#33502f");
      // the turning circle in front of the pile, and a sidewalk across the back
      ctx.fillStyle = "#565d6b";
      ctx.beginPath();
      ctx.ellipse(1700, 560, 360, 280, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a8f99";
      ctx.fillRect(x0, horizon + 4, W, 26);
      patches(36, ["rgba(120, 175, 100, 0.35)", "rgba(60, 100, 60, 0.35)"]);
      break;
    }
    case "stripmall": {
      evergreens(horizon - 70, 140, 220);
      // one long low building with lit shop windows and signs
      ctx.fillStyle = "#3d3a52";
      ctx.fillRect(x0, horizon - 170, W, 200);
      for (let x = x0 + 30; x < x0 + W - 200; x += 260) {
        ctx.fillStyle = ["#e07a5f", "#81b29a", "#f2cc8f", "#8fb8de"][Math.floor(rnd() * 4)]!;
        ctx.fillRect(x, horizon - 150, 180, 34);
        window(x, horizon - 100, 180, 80, 0.7);
      }
      ground("#3a3f4c", "#2b2f3a");
      // parking stall lines
      ctx.strokeStyle = "rgba(240, 240, 220, 0.35)";
      ctx.lineWidth = 6;
      for (let x = x0 + 40; x < x0 + W; x += 150) {
        ctx.beginPath();
        ctx.moveTo(x, horizon + 60);
        ctx.lineTo(x + 30, horizon + 230);
        ctx.stroke();
      }
      // a dumpster behind the pile
      ctx.fillStyle = "#3f7a5a";
      ctx.fillRect(1700, 300, 220, 150);
      ctx.fillStyle = "#336349";
      ctx.fillRect(1690, 290, 240, 24);
      patches(24, ["rgba(110, 125, 170, 0.25)", "rgba(92, 128, 84, 0.25)"]);
      break;
    }
    default: {
      // the alley: evergreens behind brick buildings, damp asphalt with moss
      evergreens(horizon, 150, 290);
      for (let x = x0; x < x0 + W; ) {
        const w = 220 + rnd() * 200;
        const h = 120 + rnd() * 160;
        ctx.fillStyle = rnd() < 0.5 ? "#3b3550" : "#433a4f";
        ctx.fillRect(x, horizon - h, w - 12, h + 40);
        for (let wy = horizon - h + 26; wy < horizon - 10; wy += 54)
          for (let wx = x + 24; wx < x + w - 50; wx += 62) window(wx, wy, 28, 32);
        x += w;
      }
      ground("#3f4756", "#2f3542");
      patches(40, ["rgba(92, 128, 84, 0.35)", "rgba(92, 128, 84, 0.35)", "rgba(110, 125, 170, 0.25)"]);
    }
  }
}
