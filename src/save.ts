// Campaign progress (plan §4.5). Versioned; every format change gets a migration below.

import { campaign } from "./data/content.ts";
import type { Platform } from "./platform/types.ts";
import type { UnitId } from "./sim/types.ts";

export const SAVE_VERSION = 1;

export interface Settings {
  music: number;
  sfx: number;
  reducedMotion: boolean;
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
    settings: { music: 0.7, sfx: 1, reducedMotion: false, speed: 1 },
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

  /** Record a cleared level; returns the friend recruited by this clear, if it's new. */
  recordWin(levelId: string, moons: number): UnitId | null {
    const prev = this.data.levels[levelId];
    this.data.levels[levelId] = { cleared: true, moons: Math.max(moons, prev?.moons ?? 0) };
    const recruit = campaign.recruits[levelId];
    if (recruit && !this.data.unlockedUnits.includes(recruit)) {
      this.data.unlockedUnits.push(recruit);
      return recruit;
    }
    return null;
  }
}
