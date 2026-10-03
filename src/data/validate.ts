// Checks every data file against the types in src/sim/types.ts and against each other.
// Returns a list of problems; empty means the data is good.

import { AREA_IDS, DEFENSE_IDS, UNIT_IDS, type LevelDef } from "../sim/types.ts";
import strings from "./strings/en.json" with { type: "json" };

const TAGS = ["ground", "air", "sapper"];
// The bleed rectangle (§3.1 of the plan): nothing may be placed outside it.
const BOUNDS = { x0: -240, y0: -135, x1: 2160, y1: 1215 };
const STAGING_MAX_X = 420;
// The HUD covers the top and bottom of small screens (a 667×375 phone shows world y < ~190 and
// y > ~810 under the HUD), so everything the player must see stays in this band.
const PLAY_Y = { min: 220, max: 780 };
const PILE_REACH = 200;

export interface RawData {
  units: unknown[];
  defenses: unknown[];
  levels: unknown[];
  campaign: unknown;
  references: unknown;
}

export function validate(data: RawData): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const str = strings as Record<string, string>;

  const unitIds = new Set<string>();
  for (const [i, u] of (data.units as Record<string, any>[]).entries()) {
    const w = `units[${u?.id ?? i}]`;
    if (!UNIT_IDS.includes(u.id)) err(w, `unknown unit id "${u.id}"`);
    if (unitIds.has(u.id)) err(w, "duplicate id");
    unitIds.add(u.id);
    for (const k of ["cost", "hp", "speed"]) if (!(u[k] > 0)) err(w, `${k} must be > 0`);
    for (const k of ["pileDamage", "haul", "sendCooldown"]) if (!(u[k] >= 0)) err(w, `${k} must be >= 0`);
    if (!Array.isArray(u.tags) || u.tags.length === 0 || u.tags.some((t: string) => !TAGS.includes(t)))
      err(w, "tags must be a non-empty list of ground/air/sapper");
    if (u.tags?.includes("sapper") !== !!u.traits?.sapper) err(w, "the sapper tag and sapper trait go together");
    if (typeof u.sprite !== "string") err(w, "missing sprite");
    if (!str[`unit.${u.id}`]) err(w, `no string "unit.${u.id}"`);
  }
  for (const id of UNIT_IDS) if (!unitIds.has(id)) err("units", `missing unit "${id}"`);

  const defenseIds = new Set<string>();
  for (const [i, d] of (data.defenses as Record<string, any>[]).entries()) {
    const w = `defenses[${d?.id ?? i}]`;
    if (!DEFENSE_IDS.includes(d.id)) err(w, `unknown defense id "${d.id}"`);
    if (defenseIds.has(d.id)) err(w, "duplicate id");
    defenseIds.add(d.id);
    if (!Array.isArray(d.targets) || d.targets.some((t: string) => !TAGS.includes(t))) err(w, "bad targets");
    if (d.shape?.kind !== "radius" && d.shape?.kind !== "cone") err(w, "shape.kind must be radius or cone");
    if (!(d.shape?.r > 0)) err(w, "shape.r must be > 0");
    if (d.shape?.kind === "cone" && !(d.shape.arcDeg > 0 && d.shape.arcDeg <= 360)) err(w, "bad cone arc");
    const e = d.effect ?? {};
    if (!e.blocks && !(e.rate > 0)) err(w, "effect.rate must be > 0 (or the defense must block)");
    if (e.slow && !(e.slow.factor > 0 && e.slow.factor <= 1)) err(w, "slow.factor must be in (0, 1]");
    if (!str[`defense.${d.id}`]) err(w, `no string "defense.${d.id}"`);
  }

  const campaign = data.campaign as Record<string, any>;
  const levelIds = new Set<string>();
  for (const [i, l] of (data.levels as LevelDef[]).entries()) {
    const w = `levels[${l?.id ?? i}]`;
    if (!/^\d+-\d+$/.test(l.id)) err(w, 'id must look like "1-3"');
    if (levelIds.has(l.id)) err(w, "duplicate id");
    levelIds.add(l.id);
    if (!AREA_IDS.includes(l.area)) err(w, `unknown area "${l.area}"`);
    if (!Array.isArray(l.lanes) || l.lanes.length < 1 || l.lanes.length > 3) err(w, "needs 1 to 3 lanes");
    const inBounds = ([x, y]: number[]) =>
      x! >= BOUNDS.x0 && x! <= BOUNDS.x1 && y! >= BOUNDS.y0 && y! <= BOUNDS.y1;
    for (const [li, lane] of (l.lanes ?? []).entries()) {
      const lw = `${w}.lanes[${li}]`;
      if (lane.id !== li) err(lw, "lane ids must be 0, 1, 2 in order");
      if (!Array.isArray(lane.points) || lane.points.length < 2) {
        err(lw, "needs at least 2 points");
        continue;
      }
      if (!lane.points.every(inBounds)) err(lw, "point outside the bleed area");
      if (!lane.points.every(([, y]) => y >= PLAY_Y.min && y <= PLAY_Y.max))
        err(lw, `points must stay in the HUD-free band y ${PLAY_Y.min}–${PLAY_Y.max}`);
      const first = lane.points[0]!;
      const last = lane.points[lane.points.length - 1]!;
      if (first[0] > STAGING_MAX_X) err(lw, `must start in the staging area (x <= ${STAGING_MAX_X})`);
      if (Math.hypot(last[0] - l.pile.pos[0], last[1] - l.pile.pos[1]) > PILE_REACH)
        err(lw, `must end within ${PILE_REACH}px of the pile`);
    }
    if (!(l.pile?.hp > 0)) err(w, "pile.hp must be > 0");
    if (!inBounds(l.pile?.pos ?? [NaN, NaN])) err(w, "pile outside the bleed area");
    if (!(l.pile?.pos[1] >= PLAY_Y.min && l.pile?.pos[1] <= PLAY_Y.max)) err(w, "pile must stay in the HUD-free band");
    for (const [di, d] of (l.defenses ?? []).entries()) {
      const dw = `${w}.defenses[${di}]`;
      if (!defenseIds.has(d.def)) err(dw, `unknown defense "${d.def}"`);
      if (!inBounds(d.pos)) err(dw, "outside the bleed area");
      if (d.pos[1] < PLAY_Y.min || d.pos[1] > PLAY_Y.max)
        err(dw, `must stay in the HUD-free band y ${PLAY_Y.min}–${PLAY_Y.max}`);
      if (d.def === "fence" && !(d.lane !== undefined && d.lane >= 0 && d.lane < l.lanes.length))
        err(dw, "a fence needs a valid lane");
    }
    if (!(l.economy?.startSnacks >= 0 && l.economy?.trickle > 0)) err(w, "bad economy");
    if (!(l.nightLength > 0)) err(w, "nightLength must be > 0");
    const [m1, m2, m3] = l.moons ?? [];
    if (!(m1! >= 0 && m1! <= m2! && m2! <= m3! && m3! < l.nightLength))
      err(w, "moons must be ascending seconds-left thresholds below nightLength");
    for (const u of l.unitsAvailable ?? []) if (!unitIds.has(u)) err(w, `unknown unit "${u}"`);
    if (l.intro && !str[l.intro.textKey]) err(w, `no string "${l.intro.textKey}"`);
    if (!str[`area.${l.area}`]) err(w, `no string "area.${l.area}"`);
  }

  const inCampaign = new Set<string>();
  for (const a of campaign.areas ?? []) {
    if (!AREA_IDS.includes(a.id)) err("campaign", `unknown area "${a.id}"`);
    for (const id of a.levels ?? []) {
      if (!levelIds.has(id)) err("campaign", `level "${id}" has no data file`);
      if (inCampaign.has(id)) err("campaign", `level "${id}" listed twice`);
      inCampaign.add(id);
    }
  }
  for (const id of levelIds) if (!inCampaign.has(id)) err("campaign", `level "${id}" is not in any area`);
  for (const u of campaign.startUnits ?? []) if (!unitIds.has(u)) err("campaign", `unknown unit "${u}"`);
  for (const [id, u] of Object.entries(campaign.recruits ?? {})) {
    if (!levelIds.has(id)) err("campaign", `recruit on unknown level "${id}"`);
    if (!unitIds.has(u as string)) err("campaign", `unknown recruit "${u}"`);
  }

  for (const [id, ref] of Object.entries(data.references as Record<string, any>)) {
    if (!levelIds.has(id)) err("references", `reference for unknown level "${id}"`);
    if (!Number.isInteger(ref.seed) || !Array.isArray(ref.inputs)) err(`references[${id}]`, "bad shape");
  }
  return errors;
}
