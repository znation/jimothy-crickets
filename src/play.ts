// One attempt at a level: owns the sim state, turns player actions into SendInputs, and runs the
// fixed-timestep accumulator (plan §4.2). Every accepted input is recorded, so any attempt can be
// saved and replayed exactly.

import { content, unitsAvailableAt } from "./data/content.ts";
import type { Policy } from "./sim/run.ts";
import { createSim, sendBlocker, step, DT, type SimState } from "./sim/sim.ts";
import type { LevelDef, SendInput, SimEvent, UnitId } from "./sim/types.ts";

const MAX_TICKS_PER_FRAME = 64;

export class LevelSession {
  readonly st: SimState;
  readonly recorded: SendInput[] = [];
  speed = 1;
  /** While true the sim is frozen (pause menu, tutorial prompts, intro card). */
  frozen = false;
  lane = 0;
  holding: UnitId | null = null;
  private acc = 0;
  private pending: { unit: UnitId; lane: number }[] = [];
  private replay: SendInput[] | null;
  private replayAt = 0;
  private listeners: ((events: SimEvent[]) => void)[] = [];

  readonly level: LevelDef;
  /** A bot driving the attempt instead of the player (the title screen's attract mode). */
  private autoplay: Policy | null;

  constructor(level: LevelDef, opts: { seed: number; available?: UnitId[]; replay?: SendInput[]; autoplay?: Policy }) {
    this.level = level;
    const available = opts.available ?? unitsAvailableAt(level.id);
    this.st = createSim(level, content, { seed: opts.seed, available });
    this.replay = opts.replay ? [...opts.replay].sort((a, b) => a.tick - b.tick) : null;
    this.autoplay = opts.autoplay ?? null;
  }

  get replaying() {
    return this.replay !== null || this.autoplay !== null;
  }

  onEvents(cb: (events: SimEvent[]) => void) {
    this.listeners.push(cb);
  }

  /** Queue a send for the next tick. Returns why it can't happen right now, if it can't. */
  send(unit: UnitId, lane = this.lane) {
    if (this.replaying) return "locked" as const;
    const reason = sendBlocker(this.st, unit, lane);
    if (!reason) this.pending.push({ unit, lane });
    return reason;
  }

  /** Advance by real elapsed seconds. Returns the interpolation alpha for rendering. */
  advance(realDt: number): number {
    if (this.frozen || this.st.outcome) return this.st.outcome ? 1 : this.acc / DT;
    this.acc += realDt * this.speed;
    let ticks = 0;
    while (this.acc >= DT && ticks < MAX_TICKS_PER_FRAME && !this.st.outcome) {
      this.acc -= DT;
      ticks++;
      this.tick();
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.acc = 0; // too far behind: drop time, don't spiral
    return this.acc / DT;
  }

  private tick() {
    const st = this.st;
    const inputs: SendInput[] = [];
    if (this.autoplay) {
      const send = this.autoplay(st);
      if (send) inputs.push(send);
    } else if (this.replay) {
      while (this.replayAt < this.replay.length && this.replay[this.replayAt]!.tick <= st.tick)
        inputs.push({ ...this.replay[this.replayAt++]!, tick: st.tick });
    } else {
      for (const p of this.pending) inputs.push({ tick: st.tick, ...p });
      this.pending.length = 0;
      // press-and-hold streams a unit whenever it's ready
      if (this.holding && !inputs.some((i) => i.unit === this.holding) && !sendBlocker(st, this.holding, this.lane))
        inputs.push({ tick: st.tick, unit: this.holding, lane: this.lane });
    }
    const events = step(st, inputs);
    for (const e of events) if (e.type === "unitSent") this.recorded.push({ tick: st.tick - 1, unit: e.unit, lane: e.lane });
    if (events.length) for (const cb of this.listeners) cb(events);
  }
}
