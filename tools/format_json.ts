// Formats data files compactly: any value that fits on one line (within 100 columns) stays on one
// line, so lanes and placements read like a table. `node tools/format_json.ts <files...>`

import { readFileSync, writeFileSync } from "node:fs";

const WIDTH = 100;

export function formatJson(value: unknown, indent = 0): string {
  const flat = JSON.stringify(value);
  if (flat === undefined) return "null";
  if (value === null || typeof value !== "object" || indent * 2 + flat.length <= WIDTH - 10)
    return spaced(flat);
  const pad = "  ".repeat(indent + 1);
  const end = "  ".repeat(indent);
  if (Array.isArray(value))
    return `[\n${value.map((v) => pad + formatJson(v, indent + 1)).join(",\n")}\n${end}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${formatJson(v, indent + 1)}`).join(",\n")}\n${end}}`;
}

/** `{"a":1,"b":[1,2]}` → `{ "a": 1, "b": [1, 2] }` (only outside strings). */
function spaced(flat: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i]!;
    if (c === '"' && flat[i - 1] !== "\\") inString = !inString;
    if (inString) out += c;
    else if (c === ",") out += ", ";
    else if (c === ":") out += ": ";
    else if (c === "{") out += flat[i + 1] === "}" ? "{" : "{ ";
    else if (c === "}") out += flat[i - 1] === "{" ? "}" : " }";
    else out += c;
  }
  return out;
}

if (import.meta.main) {
  for (const file of process.argv.slice(2)) {
    writeFileSync(file, formatJson(JSON.parse(readFileSync(file, "utf8"))) + "\n");
  }
}
