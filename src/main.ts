// Entry point: pick the platform adapter, load the save, start the app.

import { App } from "./app.ts";
import { capacitorGlobal, capacitorPlatform } from "./platform/capacitor.ts";
import { tauriGlobal, tauriPlatform } from "./platform/tauri.ts";
import { registerServiceWorker, webPlatform } from "./platform/web.ts";
import type { Platform } from "./platform/types.ts";
import { loadAtlases } from "./render/atlas.ts";
import { SaveStore } from "./save.ts";
import { hasPainted, portrait, setPortraitAtlas } from "./ui/portrait.ts";
import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-700.css";
import "./ui/style.css";

function pickPlatform(): Platform {
  const cap = capacitorGlobal();
  if (cap) return capacitorPlatform(cap);
  const tauri = tauriGlobal();
  if (tauri) return tauriPlatform(tauri);
  registerServiceWorker(); // offline play for the web build only; native shells bundle everything
  return webPlatform();
}

async function main() {
  // Canvas text (startle marks, "+2") needs the font loaded before the first draw.
  await Promise.all(["500", "700"].map((w) => document.fonts.load(`${w} 24px Fredoka`))).catch(() => {});
  const platform = pickPlatform();
  const save = new SaveStore(platform);
  await save.load();
  const app = new App(
    platform,
    save,
    new URLSearchParams(location.search),
    document.querySelector<HTMLCanvasElement>("#field")!,
    document.querySelector<HTMLElement>("#ui")!,
  );
  // Read-only hook for browser tests and debugging.
  (window as unknown as { __jc: unknown }).__jc = {
    get screen() {
      return app.screen?.name;
    },
    get outcome() {
      return app.screen?.session?.st.outcome ?? null;
    },
    get tick() {
      return app.screen?.session?.st.tick ?? 0;
    },
    get recorded() {
      return app.screen?.session?.recorded ?? [];
    },
    get view() {
      const v = app.view;
      return { cssW: v.cssW, cssH: v.cssH, dpr: v.dpr, scale: v.scale, ox: v.ox, oy: v.oy };
    },
    save: () => structuredClone(save.data),
  };
  void platform.orientation.lockLandscape();
  // Painted sprites, when an atlas has been built; otherwise the vector placeholders stay.
  // ?atlas=<set> tries another atlas; ?atlas=none forces the vector art.
  // Shared characters first, then per-area piles and backgrounds.
  const atlasSet = new URLSearchParams(location.search).get("atlas");
  const atlas = atlasSet === "none" ? null : await loadAtlases(atlasSet ? atlasSet.split(",") : ["area1", "areas", "props"]);
  app.scene.setAtlas(atlas);
  setPortraitAtlas(atlas);
  // The portrait-phone "turn sideways" card shows the painted Jimothy tipping over.
  const tipping = document.querySelector(".tipping-jimothy");
  if (tipping && hasPainted("jimothy")) {
    tipping.classList.add("painted");
    tipping.replaceChildren(portrait("jimothy", 130, 110));
  }
  app.start();
}

void main();
