// Treasure goals: the playful third treasure in each pile ("get five possums to the pile", "make the
// dog chase a squirrel"). A goal is judged from the sim's events, so it is deterministic and a bot
// can prove every goal is reachable (tests/treasures.test.ts).

import type { SimState } from "./sim.ts";
import type { DefenseId, SimEvent, UnitId } from "./types.ts";

export type Goal =
  /** this many friends reach the pile in a row (the arrival chain) */
  | { kind: "chain"; n: number }
  /** this many of one friend reach the pile, in total */
  | { kind: "deliver"; unit: UnitId; n: number }
  /** possums play dead this many times */
  | { kind: "playDead"; n: number }
  /** a defense gets distracted by its favourite friend this many times */
  | { kind: "distract"; defense: DefenseId; n: number }
  /** a rat chews through one of these */
  | { kind: "chew"; defense: DefenseId }
  /** every kind of friend you have reaches the pile */
  | { kind: "fullHouse" };

export const GOAL_KINDS = ["chain", "deliver", "playDead", "distract", "chew", "fullHouse"] as const;

/** How many of something the goal needs (the "×5" on its picture). */
export function goalTarget(goal: Goal, available: readonly UnitId[]): number {
  switch (goal.kind) {
    case "chew":
      return 1;
    case "fullHouse":
      return available.length;
    default:
      return goal.n;
  }
}

/** Follows one attempt's events and says when the goal is met. */
export class GoalTracker {
  readonly goal: Goal;
  readonly target: number;
  progress = 0;
  done = false;
  private delivered = new Set<UnitId>();

  constructor(goal: Goal, available: readonly UnitId[]) {
    this.goal = goal;
    this.target = goalTarget(goal, available);
  }

  /** Feed one tick's events. Returns true on the tick the goal is first met. */
  onEvents(st: SimState, events: readonly SimEvent[]): boolean {
    if (this.done) return false;
    const g = this.goal;
    const defenseId = (index: number) => st.defenses[index]?.def.id;
    for (const e of events) {
      if (g.kind === "chain" && e.type === "pileHit") this.progress = Math.max(this.progress, e.chain);
      else if (g.kind === "deliver" && e.type === "pileHit" && e.unit === g.unit) this.progress++;
      else if (g.kind === "playDead" && e.type === "unitPlayedDead") this.progress++;
      else if (g.kind === "distract" && e.type === "defenseDistracted" && defenseId(e.index) === g.defense) this.progress++;
      else if (g.kind === "chew" && e.type === "defenseChewed" && defenseId(e.index) === g.defense) this.progress++;
      else if (g.kind === "fullHouse" && e.type === "pileHit") {
        this.delivered.add(e.unit);
        this.progress = this.delivered.size;
      }
    }
    if (this.progress >= this.target) {
      this.progress = this.target;
      this.done = true;
      return true;
    }
    return false;
  }
}
