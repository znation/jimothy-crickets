// The store art in art/store/ is rendered from the game (tools/make_store_art.ts), so it goes stale
// when the art, the UI, the levels or the sim change. This fingerprints everything it's drawn from,
// by Git's content hash of each file (LFS files hash as their pointers, so a checkout without the
// LFS objects gives the same answer). make_store_art.ts records the fingerprint in
// art/store/inputs.json; CI compares.
//
//   node tools/store_art_stamp.ts --check   warn (a GitHub annotation, not a failure) if it's stale
//   node tools/store_art_stamp.ts --write   record the current inputs (make_store_art.ts does this)

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STAMP = "art/store/inputs.json";

// What the capsules and screenshots are drawn from. Not audio, saves or platform glue.
const INPUTS = [
  "public/atlas",
  "src/render",
  "src/ui",
  "src/sim",
  "src/data",
  "src/app.ts",
  "src/main.ts",
  "src/play.ts",
  "tools/store",
  "tools/make_store_art.ts",
  ":(exclude)src/data/audio.json",
];

export function currentInputs(): Record<string, string> {
  const git = (args: string[], input?: string) => execFileSync("git", args, { encoding: "utf8", input }).trim();
  // tracked and new (untracked, not ignored) files, so a render before committing stamps correctly
  const files = git(["ls-files", "-co", "--exclude-standard", "--", ...INPUTS]).split("\n").filter(Boolean).sort();
  const hashes = git(["hash-object", "--stdin-paths"], files.join("\n") + "\n").split("\n");
  return Object.fromEntries(files.map((f, i) => [f, hashes[i]!]));
}

export function writeStamp() {
  writeFileSync(STAMP, JSON.stringify({ comment: "Written by tools/make_store_art.ts; checked by tools/store_art_stamp.ts.", files: currentInputs() }, null, 2) + "\n");
}

function check() {
  const recorded: Record<string, string> = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, "utf8")).files : {};
  const now = currentInputs();
  const changed = [...new Set([...Object.keys(recorded), ...Object.keys(now)])]
    .filter((f) => recorded[f] !== now[f])
    .sort()
    .map((f) => (!(f in recorded) ? `${f} (new)` : !(f in now) ? `${f} (removed)` : f));
  if (!changed.length) {
    console.log("store art is up to date with its inputs");
    return;
  }
  const list = changed.slice(0, 12).join(", ") + (changed.length > 12 ? `, and ${changed.length - 12} more` : "");
  const message = `${changed.length} of its inputs changed since art/store/ was rendered: ${list}. Re-render with \`node tools/make_store_art.ts\` before updating a store listing.`;
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=Store art is stale::${message}`);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Store art is stale\n\n${message}\n`, { flag: "a" });
  } else console.log(`Store art is stale: ${message}`);
}

if (import.meta.main) {
  if (process.argv.includes("--write")) writeStamp();
  else check();
}
