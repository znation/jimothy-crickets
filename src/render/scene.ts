// Draws a level: a cached background layer (sky, alley, lanes, defense ranges), then per frame
// the defenses, pile, units, Jimothy and short-lived effects. Reads sim state; never changes it.

import { closestS, directionAt, pointAt } from "../sim/lane.ts";
import { CHAIN_WINDOW_TICKS, TICK_RATE, type SimState } from "../sim/sim.ts";
import type { DefenseState, SimEvent, UnitId, Vec } from "../sim/types.ts";
import {
  drawBroomNeighbor,
  drawFence,
  drawJimothy,
  drawMotionLight,
  drawPile,
  drawSprinkler,
  drawYardDog,
  INK,
  pileStage,
} from "./sprites.ts";
import { drawFrame, frameHeight, type Atlas, type Frame } from "./atlas.ts";
import { UnitSprites } from "./unitSprites.ts";
import { BLEED_H, BLEED_W, BLEED_X, BLEED_Y, type View } from "./view.ts";

const LANE_WIDTH = 120;
const FONT_BOLD = (px: number) => `700 ${px}px Fredoka, ui-rounded, system-ui, sans-serif`;
const JIMOTHY_X = 130;
const FLY_HEIGHT = 90;
const SHADOW = "rgba(20, 14, 34, 0.32)";
/** Units are drawn larger than life so they stay readable on phones (~0.35 CSS px per unit). */
const UNIT_SCALE = 1.5;
const LOVE = "#ff7fae";
/** How far a yard dog runs off its spot chasing a squirrel. */
const CHASE_REACH = 170;

interface Effect {
  kind: "hop" | "text" | "startle" | "dust" | "confetti" | "heart" | "snack";
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
  private sprites = new UnitSprites();
  /** Per defense: where a chasing dog has run to (offset from its spot) and where a light points. */
  private focus = new Map<number, { ox: number; oy: number; aim: number }>();
  /** Where the HUD's snack counter is, in world units, so delivered cookies can fly to it. */
  snackTarget: (() => Vec | null) | null = null;
  /** Painted sprites from tools/build_atlas.ts; null means the vector placeholders. */
  private atlas: Atlas | null = null;

  setAtlas(atlas: Atlas | null) {
    this.atlas = atlas;
    this.bgKey = "";
  }
  reducedMotion = false;
  selectedLane = -1;
  highlightLanes = false;

  private view: View;

  constructor(view: View) {
    this.view = view;
  }

  /** Drop transient effects (hop-offs, marks, shakes), e.g. for a deterministic still frame. */
  clearEffects() {
    this.effects = [];
    this.pileShake = 0;
    this.cheer = 0;
    this.focus.clear();
    this.rangeFade.clear();
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
        // a little heart floats up off the pile: someone got a snack
        if (!this.reducedMotion) {
          const spread = ((e.uid * 37) % 100) / 100 - 0.5;
          this.add({ kind: "heart", x: px - 70 + spread * 120, y: py - 120, life: 1.1, dir: spread });
          // and the snack itself flies off to the counter
          for (let i = 0; i < (e.haul >= 5 ? 2 : e.haul > 0 ? 1 : 0); i++)
            this.add({ kind: "snack", x: px - 40 + spread * 60, y: py - 140, life: 0.8, dir: spread }, -i * 0.12);
        }
        if (e.chain >= 10 && e.chain % 10 === 0 && !this.reducedMotion) {
          // every tenth in a row: the pile bursts with bits of garbage
          const colours = ["#c8a46b", "#9aa3ad", "#ffe08a", "#7fb069", "#e9d8b4", LOVE];
          for (let i = 0; i < 30; i++) {
            const a = -Math.PI / 2 + (i / 30 - 0.5) * 2.2;
            const speed = 380 + ((i * 131 + e.chain * 7) % 360);
            this.add({ kind: "confetti", x: px, y: py - 80, life: 1.2, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, colour: colours[i % colours.length]! });
          }
        }
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
      } else if (e.type === "defenseDistracted") {
        const d = st.defenses[e.index]!;
        const art = this.atlas?.frames[d.def.id];
        const top = d.pos[1] - (art ? frameHeight(art) / 2 : 60);
        if (d.def.id === "yardDog" && !this.reducedMotion) {
          // the dog is smitten
          for (const dir of [-0.4, 0.4]) this.add({ kind: "heart", x: d.pos[0] + dir * 60, y: top, life: 1.1, dir });
        } else if (d.def.id === "broomNeighbor") {
          this.add({ kind: "text", x: d.pos[0] + 50, y: top - 10, life: 1.2, text: "?!" });
        }
      } else if (e.type === "defenseChewed") {
        const [x, y] = st.defenses[e.index]!.pos;
        this.add({ kind: "dust", x, y, life: 0.6 });
      }
    }
  }

  /** A negative `age` delays the effect by that many seconds. */
  private add(e: Omit<Effect, "age">, age = 0) {
    if (this.effects.length < 200) this.effects.push({ ...e, age });
  }

  /**
   * Presentation state for a defense with a favourite friend: a distracted dog runs toward its
   * squirrel (and trots back after), a distracted light turns to stare at its possum.
   */
  private distraction(st: SimState, d: DefenseState, dt: number) {
    const busy = d.distractTicks > 0 && !d.disabled;
    let tx = 0;
    let ty = 0;
    let aim: number | null = null;
    if (busy) {
      const u = st.units.find((v) => v.uid === d.distractUid);
      if (u) {
        const [ux, uy] = this.unitPos(st, u.lane, u.s, u.jitter, u.def.tags.includes("air"));
        tx = ux - d.pos[0];
        ty = uy - d.pos[1];
        aim = Math.atan2(ty, tx);
        const len = Math.hypot(tx, ty);
        if (len > CHASE_REACH) [tx, ty] = [(tx * CHASE_REACH) / len, (ty * CHASE_REACH) / len];
      }
    }
    let f = this.focus.get(d.index);
    if (!f) {
      // first sight (or a still frame): start where it should be
      f = { ox: tx, oy: ty, aim: aim ?? (d.facingDeg * Math.PI) / 180 };
      this.focus.set(d.index, f);
    }
    if (busy && aim === null) [tx, ty] = [f.ox, f.oy]; // the friend got away: it stays put, puzzled
    if (aim !== null) f.aim = aim;
    if (d.def.id === "yardDog") {
      const ease = Math.min(1, dt * (busy ? 6 : 3));
      f.ox += (tx - f.ox) * ease;
      f.oy += (ty - f.oy) * ease;
    } else [f.ox, f.oy] = [0, 0];
    return { f, busy };
  }

  /** Draw one frame. `alpha` interpolates between the last two sim ticks; `t` is wall time in s. */
  draw(st: SimState, alpha: number, t: number, dt: number) {
    const { ctx } = this.view;
    this.drawBackground(st);
    this.view.worldTransform();

    const simT = (st.tick + alpha) / TICK_RATE;
    const k = this.view.scale * this.view.dpr; // device px per world unit
    if (this.selectedLane >= 0 && this.highlightLanes) this.drawLaneHighlight(st, this.selectedLane, t);
    this.drawRanges(st, alpha, dt);

    for (const d of st.defenses) {
      const age = (st.tick + alpha - d.lastFiredTick) / TICK_RATE;
      ctx.save();
      ctx.translate(d.pos[0], d.pos[1]);
      const art = this.atlas?.frames[d.def.id];
      if (d.disabled && !d.def.effect.blocks && !art) ctx.globalAlpha = 0.45;
      const fx = d.def.distractedBy ? this.distraction(st, d, dt) : null;
      if (fx) ctx.translate(fx.f.ox, fx.f.oy);
      if (art) {
        if (!d.def.effect.blocks && !(d.disabled && d.def.id === "fence")) this.groundShadow(0, frameHeight(art) / 2, art, 0.42);
        this.defenseOverlay(d, age, fx?.busy ? fx.f.aim : null);
        this.drawDefenseArt(d.def.id, art, age, t, d.disabled, fx?.busy ?? false);
        ctx.restore();
        continue;
      }
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

    this.drawGauges(st, alpha);

    // pile
    this.pileShake = Math.max(0, this.pileShake - dt);
    ctx.save();
    ctx.translate(st.level.pile.pos[0], st.level.pile.pos[1]);
    const stage = pileStage(st.pileHp, st.level.pile.hp);
    const pileArt = this.atlas?.frames[`pile-${st.level.area}`] ?? this.atlas?.frames.pile;
    if (pileArt) {
      // the painted pile shrinks toward its base as it's carried off
      ctx.translate(Math.sin(this.pileShake * 60) * this.pileShake * 10, 70);
      const size = 0.3 + (0.7 * stage) / 5;
      if (stage > 0) {
        this.groundShadow(0, 0, pileArt, 0.46 * size);
        drawFrame(ctx, pileArt, 1, 1, size);
      }
    } else drawPile(ctx, stage, this.pileShake);
    ctx.restore();

    this.drawWindupTargets(st, alpha, t);
    this.drawChain(st, alpha);

    // units, back to front
    const order = st.units.map((u) => {
      const s = u.prevS + (u.s - u.prevS) * alpha;
      const air = u.def.tags.includes("air");
      const [x, y] = this.unitPos(st, u.lane, s, u.jitter, false);
      return { u, x, y, air };
    });
    order.sort((a, b) => a.y - b.y);
    // soft contact shadows for everyone on the ground, in one fill (flyers get theirs below)
    const shadows = new Path2D();
    for (const { u, x, y, air } of order) {
      if (air) continue;
      const f = this.atlas?.frames[u.def.id];
      const rx = f ? (f.w / f.scale) * 0.34 : 22 * UNIT_SCALE;
      shadows.moveTo(x + rx, y + 18);
      shadows.ellipse(x, y + 18, rx, rx * 0.28, 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = SHADOW;
    ctx.fill(shadows);
    const drops = new Path2D();
    for (const { u, x, y, air } of order) {
      ctx.save();
      if (air) {
        ctx.beginPath();
        ctx.ellipse(x, y + 14, 18 * UNIT_SCALE, 6 * UNIT_SCALE, 0, 0, Math.PI * 2);
        ctx.fillStyle = SHADOW;
        ctx.fill();
      }
      ctx.translate(x, y - (air ? FLY_HEIGHT : 0));
      const moving = u.stunTicks === 0 && u.flopTicks === 0 && u.chewing < 0;
      const art = this.atlas?.frames[u.def.id];
      if (art) this.drawUnitArt(u.def.id, art, moving ? simT : 0, u.uid * 1.7, u.flopTicks > 0, u.chewing >= 0);
      else this.sprites.draw(ctx, k, UNIT_SCALE, u.def.id, moving ? simT : 0, u.uid * 1.7, { flopped: u.flopTicks > 0, chewing: u.chewing >= 0 });
      ctx.scale(UNIT_SCALE, UNIT_SCALE);
      if (u.stunTicks > 0) this.drawStars(t);
      ctx.restore();
      if (u.slowTicks > 0) {
        // water drops on soaked units, batched into one path for all of them
        const top = y - (air ? FLY_HEIGHT : 0);
        for (let i = 0; i < 3; i++) {
          const q = (t * 2 + i / 3) % 1;
          drops.moveTo(x - 14 + i * 14 + 3.5, top - 26 + q * 30);
          drops.arc(x - 14 + i * 14, top - 26 + q * 30, 3.5, 0, Math.PI * 2);
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#8fd3ff";
    ctx.fill(drops);
    ctx.restore();
    this.drawNerve(order);

    // Jimothy in the staging area, between the lanes
    this.cheer = Math.max(0, this.cheer - dt);
    ctx.save();
    const mood = st.outcome?.kind === "nightEnded" ? "sleepy" : this.cheer > 0 || st.outcome?.kind === "won" ? "cheer" : "idle";
    const frames = this.atlas?.frames;
    const jim = frames?.jimothy;
    if (frames && jim) {
      // Painted poses (plan §8.4's commander moods): a wave hello as the night starts, a happy
      // hop for every delivery, a cookie held up high on a win, and a nap when the sun comes up.
      const won = st.outcome?.kind === "won";
      const pose =
        mood === "sleepy" ? frames["jimothy-sleepy"]
        : mood === "cheer" ? frames["jimothy-happy"]
        : st.tick < 2 * TICK_RATE ? frames["jimothy-wave"]
        : undefined;
      ctx.translate(JIMOTHY_X, stagingY(st) + 22);
      const hop = mood === "cheer" && !this.reducedMotion ? -Math.abs(Math.sin(t * 9)) * 22 : 0;
      const breathe = 1 + Math.sin(t * (mood === "sleepy" ? 1.2 : 2.4)) * 0.025;
      this.groundShadow(0, 0, jim, 0.4 * (1 + hop / 110));
      ctx.translate(0, hop);
      if (mood === "sleepy") ctx.rotate(-0.12);
      drawFrame(ctx, pose ?? jim, 1 / breathe, breathe);
      const snack = frames.snack;
      if (won && snack) {
        // celebrate: the prize cookie bobbing over his head
        ctx.save();
        ctx.translate(14, -frameHeight(jim) - 18 + Math.sin(t * 5) * 6);
        ctx.rotate(Math.sin(t * 3) * 0.15);
        drawFrame(ctx, snack, 1.3, 1.3);
        ctx.restore();
      }
      if (mood === "sleepy") this.drawZzz(t, 46, -frameHeight(jim) + 10);
    } else {
      ctx.translate(JIMOTHY_X, stagingY(st) - 40);
      drawJimothy(ctx, t, mood);
    }
    ctx.restore();

    this.drawFireflies(t);
    this.drawEffects(t, dt);
  }

  /**
   * "×7": friends reaching the pile in quick succession, counted in a bubble over it. It pops a
   * little bigger with each one and fades when the run of arrivals ends.
   */
  private drawChain(st: SimState, alpha: number) {
    const { count, lastTick } = st.chain;
    const since = (st.tick + alpha - lastTick) / TICK_RATE;
    const window = CHAIN_WINDOW_TICKS / TICK_RATE;
    if (count < 3 || since > window || st.outcome) return;
    const { ctx } = this.view;
    const [px, py] = st.level.pile.pos;
    const pop = this.reducedMotion ? 1 : 1 + 0.4 * Math.max(0, 1 - since / 0.22);
    const big = Math.min(1.5, 1 + (count - 3) * 0.025);
    ctx.save();
    ctx.globalAlpha = since > window - 0.35 ? Math.max(0, (window - since) / 0.35) : 1;
    ctx.translate(px - 70, py - 300); // above the pile, clear of the "+2"s and hearts
    ctx.scale(pop * big, pop * big);
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 40, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6e6";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.font = FONT_BOLD(42);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = count >= 10 ? "#e8508a" : "#ff8f5a";
    ctx.fillText(`×${count}`, 0, 3);
    ctx.restore();
  }

  /**
   * A few fireflies drifting over the yards: slow wander, a soft blink. Positions come from the
   * clock alone, so a still frame always draws the same ones. None with reduced motion.
   */
  private drawFireflies(t: number) {
    if (this.reducedMotion) return;
    const { ctx } = this.view;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 12; i++) {
      const glow = Math.max(0, Math.sin(t * (0.9 + (i % 4) * 0.25) + i * 2.3));
      if (glow < 0.05) continue;
      const x = 80 + ((i * 523) % 1760) + Math.sin(t * 0.23 + i) * 70;
      const y = 250 + ((i * 197) % 520) + Math.sin(t * 0.37 + i * 1.7) * 36;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
      g.addColorStop(0, `rgba(255, 246, 170, ${0.9 * glow})`);
      g.addColorStop(0.25, `rgba(220, 255, 140, ${0.45 * glow})`);
      g.addColorStop(1, "rgba(200, 255, 120, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 22, y - 22, 44, 44);
    }
    ctx.restore();
  }

  /**
   * One painted pose per unit, animated in code (plan §8.4): hops, waddles, flaps and squash and
   * stretch. The origin is the unit's position on the lane; sprites stand on it.
   */
  private drawUnitArt(id: UnitId, f: Frame, t: number, phase: number, flopped: boolean, chewing: boolean) {
    const ctx = this.view.ctx;
    const h = frameHeight(f);
    ctx.translate(0, 18); // feet on the path
    let lift = 0;
    let rot = 0;
    let sy = 1;
    switch (id) {
      case "cricket": {
        const a = t * 11 + phase;
        lift = Math.abs(Math.sin(a)) * 10;
        sy = 1 + Math.sin(2 * a) * 0.07;
        break;
      }
      case "possum":
        rot = Math.sin(t * 5 + phase) * 0.06;
        lift = Math.abs(Math.sin(t * 5 + phase)) * 3;
        break;
      case "squirrel":
        lift = Math.abs(Math.sin(t * 14 + phase)) * 12;
        rot = -0.08;
        break;
      case "crow":
        lift = Math.sin(t * 8 + phase) * 6;
        sy = 1 + Math.sin(t * 16 + phase) * 0.08;
        break;
      case "rat":
        lift = Math.abs(Math.sin(t * 16 + phase)) * 3;
        if (chewing) rot = Math.sin(performance.now() / 25) * 0.06;
        break;
    }
    if (this.reducedMotion) sy = 1;
    ctx.translate(0, -lift);
    if (flopped) {
      // playing dead: belly-up, very convincingly asleep
      ctx.translate(0, -h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(0, -h / 2);
    }
    ctx.rotate(rot);
    drawFrame(ctx, f, 1 / sy, sy);
  }

  private drawDefenseArt(id: string, f: Frame, age: number, t: number, disabled: boolean, busy: boolean) {
    const ctx = this.view.ctx;
    const h = frameHeight(f);
    ctx.translate(0, h / 2); // centered on the defense's position
    if (disabled && id !== "fence") {
      // The rats got to it. Nobody is hurt: the dog and the neighbor give up and nap, and the
      // gadgets topple over, unplugged.
      if (id === "yardDog" || id === "broomNeighbor") {
        const breathe = this.reducedMotion ? 1 : 1 + Math.sin(t * 1.3) * 0.03;
        ctx.rotate(id === "yardDog" ? -0.1 : 0.08);
        drawFrame(ctx, f, 1.04 / breathe, 0.92 * breathe);
        this.drawZzz(t, f.w / f.scale / 4, -h * 0.85, 0);
      } else {
        ctx.translate(-h * 0.15, 0);
        ctx.rotate(-1.35);
        ctx.globalAlpha *= 0.85;
        drawFrame(ctx, f);
      }
      return;
    }
    switch (id) {
      case "sprinkler": {
        drawFrame(ctx, f);
        if (age < 0.6 && !disabled) {
          ctx.translate(0, -h * 0.7);
          drawSprinkler(ctx, age / 0.6, false);
        }
        break;
      }
      case "broomNeighbor": {
        if (busy) {
          // swatting wildly at the crow overhead, and missing
          ctx.rotate(this.reducedMotion ? -0.14 : -0.12 + Math.sin(t * 11) * 0.14);
          drawFrame(ctx, f);
          break;
        }
        const swing = age < 0.5 ? Math.sin((age / 0.5) * Math.PI) : 0;
        ctx.rotate(-swing * 0.12);
        drawFrame(ctx, f);
        break;
      }
      case "yardDog": {
        if (busy && !this.reducedMotion) {
          // bounding after the squirrel
          ctx.translate(0, -Math.abs(Math.sin(t * 12)) * 18);
          ctx.rotate(Math.sin(t * 12) * 0.08);
          drawFrame(ctx, f);
          break;
        }
        const lunge = age < 0.3 ? 1 - age / 0.3 : 0;
        const breathe = 1 + Math.sin(t * 2) * 0.02;
        ctx.translate(lunge * 16, 0);
        drawFrame(ctx, f, 1 / breathe, breathe);
        break;
      }
      case "fence":
        if (disabled) {
          ctx.globalAlpha = 0.6;
          ctx.rotate(1.2);
        }
        drawFrame(ctx, f);
        break;
      default:
        drawFrame(ctx, f);
    }
  }

  /** Effects that sit on top of a defense whatever its art (the motion light's beam). */
  private defenseOverlay(d: SimState["defenses"][number], age: number, stareAt: number | null) {
    if (d.def.id === "motionLight" && stareAt !== null) {
      // a narrow spotlight fixed on the possum, which plays it up; everyone else sneaks by
      this.drawCone((stareAt * 180) / Math.PI, d.def.shape.r, 26, 0.9);
    } else if (d.def.id === "motionLight" && age < 1.2 && !d.disabled) {
      const shape = d.def.shape as { r: number; arcDeg?: number };
      this.drawCone(d.facingDeg, shape.r, shape.arcDeg ?? 60, 1 - age / 1.2);
    }
  }

  unitPos(st: SimState, lane: number, s: number, jitter: number, air: boolean): Vec {
    const l = st.lanes[lane]!;
    const [x, y] = pointAt(l, s, [0, 0]);
    const [dx, dy] = directionAt(l, s);
    const off = jitter * LANE_WIDTH * 0.28;
    return [x - dy * off, y + dx * off - (air ? FLY_HEIGHT : 0)];
  }

  /**
   * A small bar of nerve over each friend that has been startled at least once, so the player
   * can see who is about to give up and hop off. Calm friends show nothing.
   */
  private drawNerve(order: { u: SimState["units"][number]; x: number; y: number; air: boolean }[]) {
    const { ctx } = this.view;
    const frames = this.atlas?.frames;
    const W = 46;
    const backs = new Path2D();
    const fills: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
    let any = false;
    for (const { u, x, y, air } of order) {
      const k = u.hp / u.def.hp;
      if (k >= 1 || u.hp <= 0) continue;
      any = true;
      const f = frames?.[u.def.id];
      const top = y - (air ? FLY_HEIGHT : 0) - (f ? frameHeight(f) : 60) - 10;
      backs.roundRect(x - W / 2 - 4, top - 4, W + 8, 16, 8);
      fills[k > 0.6 ? 0 : k > 0.3 ? 1 : 2].roundRect(x - W / 2, top, Math.max(8, W * k), 8, 4);
    }
    if (!any) return;
    ctx.fillStyle = INK;
    ctx.fill(backs);
    ["#8bd36a", "#ffd166", "#ff8f5a"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fill(fills[i]!);
    });
  }

  /**
   * Each defense's reach, drawn live over the lanes so players can see which stretch of path it
   * covers. It brightens when the defense acts, turns pink while it's busy with a favourite
   * friend, and fades away once the rats have put it out of action.
   */
  private rangeFade = new Map<number, number>();
  private drawRanges(st: SimState, alpha: number, dt: number) {
    const { ctx } = this.view;
    for (const d of st.defenses) {
      if (d.def.effect.blocks) continue;
      let fade = this.rangeFade.get(d.index) ?? (d.disabled ? 0 : 1);
      fade = d.disabled ? Math.max(0, fade - dt * 1.5) : 1;
      this.rangeFade.set(d.index, fade);
      if (fade <= 0) continue;
      const since = (st.tick + alpha - d.lastFiredTick) / TICK_RATE;
      const flash = d.lastFiredTick > 0 && since >= 0 && since < 0.5 ? 1 - since / 0.5 : 0;
      const busy = d.distractTicks > 0;
      const shape = d.def.shape;
      const f = (d.facingDeg * Math.PI) / 180;
      const half = shape.kind === "cone" ? (shape.arcDeg * Math.PI) / 360 : 0;
      ctx.save();
      ctx.translate(d.pos[0], d.pos[1]);
      ctx.globalAlpha = fade;
      ctx.beginPath();
      if (shape.kind === "radius") ctx.arc(0, 0, shape.r, 0, Math.PI * 2);
      else {
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, shape.r, f - half, f + half);
        ctx.closePath();
      }
      const [r, g, b, a] = busy ? [255, 127, 174, 0.14] : RANGE_COLOURS[d.def.id] ?? [255, 255, 255, 0.08];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a + flash * 0.12})`;
      ctx.fill();
      ctx.setLineDash([12, 14]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : -((st.tick + alpha) / TICK_RATE) * 12;
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${0.3 + flash * 0.4})`;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A soft oval shadow on the ground at (x, y), sized to a fraction `k` of the frame's width. */
  private groundShadow(x: number, y: number, f: Frame, k: number) {
    const { ctx } = this.view;
    const rx = (f.w / f.scale) * k;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = SHADOW;
    ctx.fill();
  }

  /**
   * Small round dials over defenses, so the state that decides a send is on screen: how far the
   * rats have chewed through something, and how long until the motion light can flash again.
   */
  private drawGauges(st: SimState, alpha: number) {
    for (const d of st.defenses) {
      if (d.disabled) continue;
      const full = d.def.effect.blocks?.hp ?? d.def.chewHp ?? 0;
      const by = d.def.distractedBy;
      if (by && d.distractTicks > 0) {
        // a pink heart dial: how much longer it's busy with its favourite friend
        const f = this.focus.get(d.index);
        const k = Math.max(0, d.distractTicks - alpha) / Math.round(by.secs * TICK_RATE);
        this.drawDial(d, k, LOVE, f?.ox ?? 0, f?.oy ?? 0, true);
      } else if (full > 0 && d.chewLeft < full) this.drawDial(d, 1 - d.chewLeft / full, "#ff8f5a");
      else if (d.def.id === "motionLight" && d.cooldown > 0 && d.def.effect.rate) {
        const total = Math.round(TICK_RATE / d.def.effect.rate);
        this.drawDial(d, 1 - Math.max(0, d.cooldown - alpha) / total, "#ffe08a");
      }
    }
  }

  private drawDial(d: SimState["defenses"][number], k: number, colour: string, ox = 0, oy = 0, heart = false) {
    const { ctx } = this.view;
    const art = this.atlas?.frames[d.def.id];
    const top = art ? frameHeight(art) / 2 : 60;
    const x = d.pos[0] + ox;
    const y = d.pos[1] + oy - top - 38;
    const r = 24;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6e6";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0, k)));
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (heart) {
      ctx.translate(x, y + 1);
      ctx.scale(0.55, 0.55);
      heartPath(ctx);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = "#fff6e6";
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * A ring that closes around whoever a yard dog or broom is about to reach, over its windup. It
   * shows who the defense picked, and lets a quick squirrel be seen slipping out before it lands.
   */
  private drawWindupTargets(st: SimState, alpha: number, t: number) {
    const { ctx } = this.view;
    for (const d of st.defenses) {
      if (d.windupTicks <= 0 || !d.def.effect.windup) continue;
      const u = st.units.find((v) => v.uid === d.windupTarget);
      if (!u) continue;
      const total = Math.round(d.def.effect.windup * TICK_RATE);
      const k = 1 - Math.max(0, d.windupTicks - alpha) / total;
      const [x, y] = this.unitPos(st, u.lane, u.prevS + (u.s - u.prevS) * alpha, u.jitter, false);
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(t * 20) * 0.06;
      ctx.save();
      ctx.translate(x, y + 8);
      ctx.scale(pulse, pulse * 0.4);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.lineWidth = 16;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#ff8f5a";
      ctx.stroke();
      ctx.restore();
    }
  }

  private mark: HTMLCanvasElement | null = null;
  private markK = 0;

  private startleMark(): HTMLCanvasElement {
    const k = this.view.scale * this.view.dpr;
    if (this.mark && this.markK === k) return this.mark;
    const c = (this.mark ??= document.createElement("canvas"));
    this.markK = k;
    c.width = Math.ceil(40 * k);
    c.height = Math.ceil(48 * k);
    const m = c.getContext("2d")!;
    m.setTransform(k, 0, 0, k, 20 * k, 40 * k);
    m.font = FONT_BOLD(36);
    m.textAlign = "center";
    m.lineWidth = 6;
    m.strokeStyle = INK;
    m.strokeText("!", 0, 0);
    m.fillStyle = "#fff";
    m.fillText("!", 0, 0);
    return c;
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

  /** Three z's drifting up and fading from (x, y), for a napping Jimothy. */
  private drawZzz(t: number, x: number, y: number, tilt = 0.12) {
    const ctx = this.view.ctx;
    ctx.save();
    ctx.rotate(tilt); // undo the nap tilt so the letters stay upright
    ctx.fillStyle = "#fff6e6";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      const k = this.reducedMotion ? i / 3 : (t * 0.5 + i / 3) % 1;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5);
      ctx.font = FONT_BOLD(32 + k * 24);
      const zx = x + k * 60;
      const zy = y - k * 90;
      ctx.strokeText("z", zx, zy);
      ctx.fillText("z", zx, zy);
    }
    ctx.restore();
  }

  private drawEffects(t: number, dt: number) {
    const { ctx } = this.view;
    const target = this.effects.some((e) => e.kind === "snack") ? (this.snackTarget?.() ?? null) : null;
    for (const e of this.effects) {
      e.age += dt;
      if (e.age < 0) continue; // not started yet
      // A long frame (a slow device, 8× speed) can carry an effect past its end; drawing it then
      // would give the dust a negative arc radius, which throws and stops the frame loop.
      if (e.age >= e.life) continue;
      const k = e.age / e.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (e.kind === "hop" && e.unit) {
        // startled hop off to the side: nobody gets hurt
        const hop = this.reducedMotion ? 0 : k;
        ctx.translate(e.x + e.dir! * hop * 120, e.y - Math.sin(hop * Math.PI) * 90 - hop * 30);
        ctx.rotate(e.dir! * hop * 0.6);
        const art = this.atlas?.frames[e.unit];
        if (art) {
          ctx.translate(0, frameHeight(art) / 2);
          drawFrame(ctx, art);
        } else this.sprites.draw(ctx, this.view.scale * this.view.dpr, UNIT_SCALE, e.unit, t, 0, {});
      } else if (e.kind === "text") {
        ctx.font = FONT_BOLD(44);
        ctx.textAlign = "center";
        ctx.lineWidth = 8;
        ctx.strokeStyle = INK;
        ctx.strokeText(e.text!, e.x, e.y - k * 50);
        ctx.fillStyle = "#ffe08a";
        ctx.fillText(e.text!, e.x, e.y - k * 50);
      } else if (e.kind === "heart") {
        // pops in, floats up with a wobble, fades
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.6);
        ctx.translate(e.x + Math.sin(k * 9 + e.dir! * 6) * 10, e.y - k * 110);
        ctx.rotate(e.dir! * 0.5);
        ctx.scale(pop, pop);
        heartPath(ctx);
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = LOVE;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-7, -10, 4, 2.5, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();
      } else if (e.kind === "snack") {
        // a cookie arcs from the pile up to the snack counter, spinning, and lands there
        const to = target ?? [e.x - 300, e.y - 500];
        const q = k * k * (3 - 2 * k);
        const x = e.x + (to[0] - e.x) * q;
        const y = e.y + (to[1] - e.y) * q - Math.sin(k * Math.PI) * 160;
        ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        ctx.translate(x, y);
        ctx.rotate(k * 7 + e.dir! * 3);
        const s = 1 - 0.35 * k;
        ctx.scale(s, s);
        const art = this.atlas?.frames.snack;
        if (art) {
          ctx.translate(0, frameHeight(art) / 2);
          drawFrame(ctx, art);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 20, 0, Math.PI * 2);
          ctx.fillStyle = "#d9a35f";
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      } else if (e.kind === "startle") {
        // drawn once and blitted: text rendering per mark is slow in WebKit during big swarms
        const mark = this.startleMark();
        ctx.drawImage(mark, e.x - 20, e.y - k * 14 - 40, 40, 48);
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
      paintBackground(ctx, v, st, this.atlas?.backgrounds[st.level.area] ?? null, this.atlas?.frames.mat ?? null);
      this.bgKey = key;
    }
    v.ctx.setTransform(1, 0, 0, 1, 0, 0);
    v.ctx.drawImage(this.bg, 0, 0);
  }
}

/**
 * The staging mat under Jimothy, centered on the origin: about 220 × 80 world units, tilted a
 * little. The painted version (atlas frame "mat") is img2img over this drawing.
 */
export function drawStagingMat(ctx: CanvasRenderingContext2D, painted: Frame | null = null) {
  ctx.save();
  if (painted) {
    ctx.translate(0, 44); // the frame stands on its bottom edge; its tilt is painted in
    drawFrame(ctx, painted);
  } else {
    ctx.rotate(-0.04);
    ctx.beginPath();
    ctx.roundRect(-110, -40, 220, 80, 10);
    ctx.fillStyle = "#b98a57";
    ctx.fill();
    // a fold line and a strip of packing tape: enough structure for the painted version to keep
    ctx.fillStyle = "#a77a4a";
    ctx.fillRect(-106, -4, 212, 6);
    ctx.fillStyle = "rgba(225, 205, 160, 0.85)";
    ctx.fillRect(-14, -40, 28, 80);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.restore();
}

/** The skyline sits just above the highest lane, so paths never run through buildings. */
export function horizonFor(level: { lanes: { points: Vec[] }[] }): number {
  const highestLane = Math.min(...level.lanes.flatMap((l) => l.points.map((pt) => pt[1])));
  return Math.min(330, highestLane - 90);
}

/** The middle of the lanes' starting points: where Jimothy stands. */
export function stagingY(st: SimState): number {
  const ys = st.lanes.map((l) => l.points[0]![1]);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

/** Paint the static layer. Decorations are placed from a PRNG seeded by the level id. */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  v: View,
  st: SimState,
  painted: HTMLImageElement | null,
  mat: Frame | null,
) {
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
  const horizon = horizonFor(st.level);

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
  // A painted background covers the bleed area; the procedural scenery shows only beyond it
  // (ultrawide extremes). Lanes, ranges and the staging box are drawn over it, as §8.3 plans.
  if (painted) ctx.drawImage(painted, -BLEED_X, -BLEED_Y, BLEED_W, BLEED_H);

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
  paintLaneDetails(ctx, st, rnd);

  // staging area: a flattened cardboard box under Jimothy, between the lanes' starts
  ctx.save();
  ctx.translate(st.lanes[0]!.points[0]![0] - 120, stagingY(st) + 20);
  drawStagingMat(ctx, mat);
  ctx.restore();

  // a streetlamp glowing over the pile
  const [px, py] = st.level.pile.pos;
  const glow = ctx.createRadialGradient(px, py - 60, 10, px, py - 60, 360);
  glow.addColorStop(0, "rgba(255, 220, 140, 0.35)");
  glow.addColorStop(1, "rgba(255, 220, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(px - 360, py - 420, 720, 720);

  // a soft storybook vignette, in screen space, so the eye settles on the middle of the page
  const cw = v.canvas.width;
  const ch = v.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vig = ctx.createRadialGradient(cw / 2, ch * 0.55, Math.min(cw, ch) * 0.45, cw / 2, ch * 0.55, Math.hypot(cw, ch) * 0.62);
  vig.addColorStop(0, "rgba(14, 10, 34, 0)");
  vig.addColorStop(1, "rgba(14, 10, 34, 0.42)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cw, ch);
}

/**
 * Pebbles and worn patches on the paths, and tufts of grass and clover along their edges, so the
 * lanes read as trodden ground rather than flat strokes. Seeded, so a level always looks the same.
 */
function paintLaneDetails(ctx: CanvasRenderingContext2D, st: SimState, rnd: () => number) {
  const onAnotherLane = (p: Vec, self: number, margin: number) =>
    st.lanes.some((l, i) => i !== self && closestS(l, p).dist < LANE_WIDTH / 2 + margin);
  const pebbles = new Path2D();
  const pebbleLights = new Path2D();
  const worn = new Path2D();
  const tufts = new Path2D();
  const clover: Vec[] = [];
  st.lanes.forEach((lane, li) => {
    const end = lane.length - 60; // the pile covers the last stretch
    for (let s = 60; s < end; s += 26 + rnd() * 30) {
      const [x, y] = pointAt(lane, s, [0, 0]);
      const [dx, dy] = directionAt(lane, s);
      // a pebble somewhere on the path
      const off = (rnd() - 0.5) * (LANE_WIDTH - 30);
      const px = x - dy * off;
      const py = y + dx * off;
      const r = 2.5 + rnd() * 4;
      if (rnd() < 0.7) {
        pebbles.moveTo(px + r, py);
        pebbles.ellipse(px, py, r, r * 0.7, rnd() * 3, 0, Math.PI * 2);
        pebbleLights.moveTo(px - r * 0.3 + r * 0.35, py - r * 0.3);
        pebbleLights.arc(px - r * 0.3, py - r * 0.3, r * 0.35, 0, Math.PI * 2);
      } else {
        const w = 14 + rnd() * 22;
        worn.moveTo(px + w, py);
        worn.ellipse(px, py, w, w * 0.4, Math.atan2(dy, dx), 0, Math.PI * 2);
      }
      // a tuft on one edge or the other
      if (rnd() < 0.55) {
        const side = rnd() < 0.5 ? -1 : 1;
        const edge = side * (LANE_WIDTH / 2 + 4);
        const tx = x - dy * edge;
        const ty = y + dx * edge;
        if (onAnotherLane([tx, ty], li, 6)) continue;
        if (rnd() < 0.15) {
          clover.push([tx, ty]);
          continue;
        }
        const blades = 3 + Math.floor(rnd() * 3);
        const hgt = 12 + rnd() * 12;
        for (let b = 0; b < blades; b++) {
          const bx = tx + (b - blades / 2) * 4;
          const lean = (b - blades / 2) * 3 + (rnd() - 0.5) * 4;
          tufts.moveTo(bx - 2.5, ty + 2);
          tufts.quadraticCurveTo(bx + lean * 0.4, ty - hgt * 0.6, bx + lean, ty - hgt);
          tufts.quadraticCurveTo(bx + lean * 0.4 + 1, ty - hgt * 0.5, bx + 2.5, ty + 2);
          tufts.closePath();
        }
      }
    }
  });
  ctx.save();
  ctx.fillStyle = "rgba(70, 58, 44, 0.18)";
  ctx.fill(worn);
  ctx.fillStyle = "#6f6455";
  ctx.fill(pebbles);
  ctx.fillStyle = "rgba(230, 220, 200, 0.45)";
  ctx.fill(pebbleLights);
  ctx.fillStyle = "#4f7a45";
  ctx.fill(tufts);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(30, 50, 30, 0.6)";
  ctx.stroke(tufts);
  for (const [x, y] of clover) {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 5, y - 6 + Math.sin(a) * 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#6aa257";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x + 9, y - 14, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f4f0e6";
    ctx.fill();
  }
  ctx.restore();
}

const RANGE_COLOURS: Record<string, [number, number, number, number]> = {
  sprinkler: [120, 200, 255, 0.1],
  broomNeighbor: [255, 190, 120, 0.08],
  yardDog: [255, 140, 120, 0.1],
  motionLight: [255, 243, 176, 0.06],
};

export interface Box {
  x0: number;
  y0: number;
  W: number;
  H: number;
  horizon: number;
}

/** The skyline and ground for each area (README art direction: damp, mossy, evergreen PNW). */
export function paintScenery(ctx: CanvasRenderingContext2D, area: string, b: Box, rnd: () => number) {
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

/** A plump heart, about 52 wide and 38 tall, centered on the origin. */
function heartPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.bezierCurveTo(-26, -4, -16, -24, 0, -12);
  ctx.bezierCurveTo(16, -24, 26, -4, 0, 14);
  ctx.closePath();
}
