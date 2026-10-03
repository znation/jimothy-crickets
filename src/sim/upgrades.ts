// Campaign upgrades (plan §7) applied to content before an attempt starts. The sim itself never
// knows about upgrades: it just gets slightly different numbers. Upgrades only ever make levels
// easier, and every reference solution is checked without them.

import type { Content, LevelDef, UnitId } from "./types.ts";

export interface UpgradeDef {
  id: string;
  unit?: UnitId; // shown in the shop once this unit is recruited; absent = always shown
  costs: number[]; // acorns for each tier
  effect: { stat: "hp" | "cost" | "speed" | "haul" | "chewDps" | "trickle" | "startSnacks"; add?: number; mul?: number };
}

export type Upgrades = Record<string, number>; // upgrade id → tiers bought

export function applyUpgrades(
  content: Content,
  level: LevelDef,
  defs: readonly UpgradeDef[],
  owned: Upgrades,
): { content: Content; level: LevelDef } {
  const units = { ...content.units };
  const economy = { ...level.economy };
  for (const def of defs) {
    const tier = owned[def.id] ?? 0;
    if (tier <= 0) continue;
    const bump = (v: number) => (def.effect.add !== undefined ? v + def.effect.add * tier : v * (1 + (def.effect.mul ?? 0) * tier));
    const stat = def.effect.stat;
    if (stat === "trickle" || stat === "startSnacks") {
      economy[stat] = bump(economy[stat]);
    } else if (def.unit) {
      const u = { ...units[def.unit] };
      if (stat === "chewDps") {
        const sapper = u.traits?.sapper;
        if (sapper) u.traits = { ...u.traits, sapper: { chewDps: bump(sapper.chewDps) } };
      } else {
        u[stat] = Math.max(1, bump(u[stat]));
      }
      units[def.unit] = u;
    }
  }
  return { content: { ...content, units }, level: { ...level, economy } };
}
