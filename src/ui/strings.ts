import en from "../data/strings/en.json" with { type: "json" };

const table = en as Record<string, string>;

/** Look up a player-facing string, filling `{name}` placeholders. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = table[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
