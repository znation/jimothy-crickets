import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** Emit sw.js with a precache list of every built and public file. */
function serviceWorker(): Plugin {
  return {
    name: "jimothy-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const publicDir = "public";
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
      const files = ["./", ...Object.keys(bundle), ...walk(publicDir).map((f) => relative(publicDir, f))].filter(
        (f) => !f.endsWith(".map"),
      );
      const version = createHash("sha1").update(files.join("\n")).digest("hex").slice(0, 10);
      const source = readFileSync("src/platform/sw.js", "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__PRECACHE__", JSON.stringify(files));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the same dist/ works on GitHub Pages, itch.io and in native shells.
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: "es2022", assetsInlineLimit: 0 },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  plugins: [serviceWorker()],
});
