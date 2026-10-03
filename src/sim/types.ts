// Content and state types for the simulation. Content (units, defenses, levels) is JSON data;
// these types are what tools/validate_data.ts checks it against.

export type Vec = [number, number];
export type UnitId = "cricket" | "possum" | "squirrel" | "crow" | "rat";
export type DefenseId = "sprinkler" | "motionLight" | "yardDog" | "fence" | "broomNeighbor";
export type Tag = "ground" | "air" | "sapper";
export type AreaId = "alley" | "backyards" | "culdesac" | "stripmall";

export const UNIT_IDS: readonly UnitId[] = ["cricket", "possum", "squirrel", "crow", "rat"];
export const DEFENSE_IDS: readonly DefenseId[] = [
  "sprinkler",
  "motionLight",
  "yardDog",
  "fence",
  "broomNeighbor",
];
export const AREA_IDS: readonly AreaId[] = ["alley", "backyards", "culdesac", "stripmall"];

export interface UnitDef {
  id: UnitId;
  cost: number; // snacks
  hp: number; // startle points; player-facing text never says "health"
  speed: number; // logical px / s along the lane
  pileDamage: number; // dealt on arrival
  haul: number; // snacks returned on arrival
  sendCooldown: number; // s between sends of this unit type
  pushbackScale?: number; // 1 = full broom push; heavy units take less
  tags: Tag[];
  traits?: {
    playDead?: { chance: number; ignoreHits: number; secs: number };
    sapper?: { chewDps: number };
  };
  sprite: string;
}

export type DefenseShape =
  | { kind: "radius"; r: number }
  | { kind: "cone"; r: number; arcDeg: number };

export interface DefenseDef {
  id: DefenseId;
  targets: Tag[]; // a unit is targetable if it has any of these tags
  shape: DefenseShape;
  effect: {
    all?: boolean; // true: hits every target in range; false: the furthest-along one
    damage?: number; // startle points per activation
    rate?: number; // activations per s while anything is in range
    windup?: number; // s between picking a target and the hit landing (fast units escape)
    slow?: { factor: number; secs: number };
    stun?: { secs: number };
    pushback?: { px: number };
    blocks?: { hp: number }; // fence: ground units stop here until sappers chew hp to 0
  };
  chewHp?: number; // sappers can disable this defense by chewing this much
  sprite: string;
}

export interface DefensePlacement {
  def: DefenseId;
  pos: Vec;
  facingDeg?: number; // cones only; 0 = +x, 90 = +y (down the screen)
  lane?: number; // fences: the lane they block
}

export interface LevelDef {
  id: string; // "1-3"
  area: AreaId;
  background: string;
  lanes: { id: number; points: Vec[] }[];
  pile: { pos: Vec; hp: number };
  defenses: DefensePlacement[];
  economy: { startSnacks: number; trickle: number }; // trickle: snacks / s
  nightLength: number; // s
  moons: [number, number, number]; // s of night left needed for 1/2/3 moons
  maxUnits?: number;
  unitsAvailable?: UnitId[]; // default: everything recruited before this level
  intro?: { textKey: string; art?: string };
  tutorial?: boolean;
}

export interface SendInput {
  tick: number;
  unit: UnitId;
  lane: number; // lane index into LevelDef.lanes
}

/** A known attempt that wins the level. Stored next to the level as `<id>.reference.json`. */
export interface Reference {
  seed: number;
  inputs: [tick: number, unit: UnitId, lane: number][];
}

export interface Content {
  units: Record<UnitId, UnitDef>;
  defenses: Record<DefenseId, DefenseDef>;
}

export interface UnitState {
  uid: number;
  def: UnitDef;
  lane: number;
  s: number;
  prevS: number;
  hp: number;
  jitter: number; // -1..1, cosmetic lateral offset
  slowFactor: number;
  slowTicks: number;
  stunTicks: number;
  flopTicks: number; // playing dead
  flopHits: number;
  chewing: number; // defense index, or -1
  gone: boolean; // shooed or arrived; removed at the end of the tick
}

export interface DefenseState {
  index: number;
  def: DefenseDef;
  pos: Vec;
  facingDeg: number;
  coverage: [number, number][][]; // per lane: s intervals inside the shape
  chewS: (number | null)[]; // per lane: where a sapper stops to chew, if in reach
  blockLane: number; // fences: the lane they block, else -1
  blockS: number;
  cooldown: number; // ticks
  windupTicks: number;
  windupTarget: number; // uid, or -1
  chewLeft: number;
  disabled: boolean;
  lastFiredTick: number;
}

export interface Outcome {
  kind: "won" | "nightEnded";
  tick: number;
  moons: number; // 0 when the night ended
}

export type SimEvent =
  | { type: "unitSent"; uid: number; unit: UnitId; lane: number }
  | { type: "sendRejected"; unit: UnitId; reason: "locked" | "snacks" | "cooldown" | "crowded" | "lane" }
  | { type: "defenseFired"; index: number; targets: number[] }
  | { type: "defenseMissed"; index: number; uid: number }
  | { type: "unitHit"; uid: number; index: number }
  | { type: "unitPlayedDead"; uid: number }
  | { type: "unitShooed"; uid: number; unit: UnitId; lane: number; s: number }
  | { type: "pileHit"; uid: number; unit: UnitId; damage: number; haul: number }
  | { type: "defenseChewed"; index: number }
  | { type: "levelWon"; moons: number }
  | { type: "nightEnded" };
