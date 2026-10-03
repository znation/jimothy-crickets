import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  // Relative asset paths, so the same dist/ works on GitHub Pages, itch.io and in native shells.
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: "es2022", assetsInlineLimit: 0 },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
});
