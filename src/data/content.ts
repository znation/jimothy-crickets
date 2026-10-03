// All game content, loaded from the JSON data files. Adding a level means adding its JSON file,
// importing it here and listing it in campaign.json; no engine change.

import campaignJson from "./campaign.json" with { type: "json" };
import defensesJson from "./defenses.json" with { type: "json" };
import l1_1 from "./levels/1-1.json" with { type: "json" };
import l1_2 from "./levels/1-2.json" with { type: "json" };
import l1_3 from "./levels/1-3.json" with { type: "json" };
import l1_4 from "./levels/1-4.json" with { type: "json" };
import l1_5 from "./levels/1-5.json" with { type: "json" };
import referencesJson from "./references.json" with { type: "json" };
import unitsJson from "./units.json" with { type: "json" };
import upgradesJson from "./upgrades.json" with { type: "json" };
import type { UpgradeDef } from "../sim/upgrades.ts";
import type {
  AreaId,
  Content,
  DefenseDef,
  DefenseId,
  LevelDef,
  Reference,
  UnitDef,
  UnitId,
} from "../sim/types.ts";

export interface Campaign {
  startUnits: UnitId[];
  areas: { id: AreaId; levels: string[] }[];
  recruits: Record<string, UnitId>;
  acornsForMoons: number[]; // total acorns a level is worth at 0, 1, 2, 3 moons
}

// JSON imports are typed loosely (string instead of the id unions); validate.ts checks the data
// against the real types, in CI and at build time.
export const rawData = {
  units: unitsJson as unknown[],
  defenses: defensesJson as unknown[],
  levels: [l1_1, l1_2, l1_3, l1_4, l1_5] as unknown[],
  campaign: campaignJson as unknown,
  references: referencesJson as unknown,
  upgrades: upgradesJson as unknown[],
};

export const campaign = rawData.campaign as Campaign;
export const content: Content = {
  units: byId(rawData.units as UnitDef[]) as Record<UnitId, UnitDef>,
  defenses: byId(rawData.defenses as DefenseDef[]) as Record<DefenseId, DefenseDef>,
};
const levelMap = byId(rawData.levels as LevelDef[]);
export const levelOrder: string[] = campaign.areas.flatMap((a) => a.levels);
export const levels: LevelDef[] = levelOrder.map((id) => levelMap[id]!).filter(Boolean);
export const references = rawData.references as Record<string, Reference>;
export const upgrades = rawData.upgrades as UpgradeDef[];

export function levelById(id: string): LevelDef | undefined {
  return levelMap[id];
}

/** Units the player has by the time they reach `levelId`, with no saved progress assumed. */
export function unitsAvailableAt(levelId: string): UnitId[] {
  const level = levelMap[levelId];
  if (level?.unitsAvailable) return level.unitsAvailable;
  const out = [...campaign.startUnits];
  for (const id of levelOrder) {
    if (id === levelId) break;
    const recruit = campaign.recruits[id];
    if (recruit && !out.includes(recruit)) out.push(recruit);
  }
  return out;
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}
