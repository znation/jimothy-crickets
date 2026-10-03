// Campaign progress (plan §4.5). Versioned; every format change gets a migration below.

import { campaign } from "./data/content.ts";
import type { Platform } from "./platform/types.ts";
import type { UnitId } from "./sim/types.ts";
import type { UpgradeDef } from "./sim/upgrades.ts";

export const SAVE_VERSION = 1;

export interface Settings {
  music: number;
  sfx: number;
  reducedMotion: boolean;
  largeText: boolean;
  speed: 1 | 2 | 0.75;
}

export interface SaveData {
  version: number;
  unlockedUnits: UnitId[];
  upgrades: Record<string, number>;
  acorns: number;
  levels: Record<string, { moons: number; cleared: boolean }>;
  settings: Settings;
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedUnits: [...campaign.startUnits],
    upgrades: {},
    acorns: 0,
    levels: {},
    settings: { music: 0.7, sfx: 1, reducedMotion: false, largeText: false, speed: 1 },
  };
}

// MIGRATIONS[n] turns a version-n save into a version-(n+1) save.
const MIGRATIONS: Record<number, (old: any) => any> = {};

/** Parse a stored save. Unknown or corrupt data returns null; the caller backs it up. */
export function parseSave(json: string | null): SaveData | null {
  if (json === null) return freshSave();
  try {
    let data = JSON.parse(json);
    if (typeof data?.version !== "number" || data.version > SAVE_VERSION) return null;
    while (data.version < SAVE_VERSION) {
      const migrate = MIGRATIONS[data.version];
      if (!migrate) return null;
      data = { ...migrate(data), version: data.version + 1 };
    }
    const fresh = freshSave();
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings } };
  } catch {
    return null;
  }
}

export class SaveStore {
  data: SaveData = freshSave();
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async load() {
    const raw = await this.platform.save.load();
    const parsed = parseSave(raw);
    if (parsed) this.data = parsed;
    else if (raw !== null) await this.platform.save.backup(raw); // never silently overwrite
  }

  async store() {
    await this.platform.save.store(JSON.stringify(this.data));
  }

  /**
   * Record a cleared level. Acorns pay out only for improving your best moons, so replaying to
   * do better is rewarded but grinding isn't (plan §6, Q5).
   */
  recordWin(levelId: string, moons: number): { recruit: UnitId | null; acorns: number } {
    const prevMoons = this.data.levels[levelId]?.moons ?? 0;
    const best = Math.max(moons, prevMoons);
    this.data.levels[levelId] = { cleared: true, moons: best };
    const table = campaign.acornsForMoons;
    const acorns = (table[best] ?? 0) - (table[prevMoons] ?? 0);
    this.data.acorns += acorns;
    const recruit = campaign.recruits[levelId] ?? null;
    if (recruit && !this.data.unlockedUnits.includes(recruit)) {
      this.data.unlockedUnits.push(recruit);
      return { recruit, acorns };
    }
    return { recruit: null, acorns };
  }

  /** Buy the next tier of an upgrade. Returns false if it's maxed out or unaffordable. */
  buyUpgrade(def: UpgradeDef): boolean {
    const tier = this.data.upgrades[def.id] ?? 0;
    const cost = def.costs[tier];
    if (cost === undefined || this.data.acorns < cost) return false;
    this.data.acorns -= cost;
    this.data.upgrades[def.id] = tier + 1;
    return true;
  }

  /** A short code that carries progress between devices with no accounts (plan §3.4). */
  exportCode(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  }

  importCode(code: string): boolean {
    let json: string;
    try {
      json = decodeURIComponent(escape(atob(code.trim())));
    } catch {
      return false;
    }
    const parsed = parseSave(json);
    if (!parsed) return false;
    this.data = parsed;
    return true;
  }
}
