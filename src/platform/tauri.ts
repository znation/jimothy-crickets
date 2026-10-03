// The Tauri (Windows, macOS, Linux, Steam Deck) adapter. Uses the window.__TAURI__ global that
// the shell injects (app.withGlobalTauri), so the game never imports Tauri packages.
//
// Saves stay in the webview's localStorage, which Tauri keeps per app under the OS app-data
// directory, so Steam Auto-Cloud can sync it with no code.

import type { Platform } from "./types.ts";
import { webPlatform } from "./web.ts";

interface TauriGlobal {
  window: { getCurrentWindow(): { close(): Promise<void> } };
}

export function tauriGlobal(): TauriGlobal | null {
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

export function tauriPlatform(tauri: TauriGlobal): Platform {
  return {
    ...webPlatform(),
    kind: "desktop",
    quit: () => void tauri.window.getCurrentWindow().close(),
  };
}
