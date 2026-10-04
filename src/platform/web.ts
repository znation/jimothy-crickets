import type { Platform } from "./types.ts";

const SAVE_KEY = "jimothy-crickets.save";
const BACKUP_KEY = "jimothy-crickets.save.backup";

/** Offline play for the web build (production only; dev servers must not be cached). */
export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const register = () => void navigator.serviceWorker.register("./sw.js").catch(() => {});
    // Startup awaits the font first, so "load" may already have fired by the time we get here.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
  }
}

export function webPlatform(): Platform {
  const standalone = matchMedia("(display-mode: standalone)").matches;
  // Ask the browser not to evict our save under storage pressure (Safari evicts after ~7 days
  // without a visit unless the site is installed). Best effort; there's nothing to do if denied.
  void navigator.storage?.persist?.().catch(() => {});
  return {
    kind: standalone ? "pwa" : "web",
    save: {
      load: async () => safe(() => localStorage.getItem(SAVE_KEY)),
      store: async (json) => void safe(() => localStorage.setItem(SAVE_KEY, json)),
      backup: async (json) => void safe(() => localStorage.setItem(BACKUP_KEY, json)),
    },
    lifecycle: {
      onPause(cb) {
        document.addEventListener("visibilitychange", () => document.hidden && cb());
        window.addEventListener("blur", cb);
      },
      onResume(cb) {
        document.addEventListener("visibilitychange", () => !document.hidden && cb());
        window.addEventListener("focus", cb);
      },
    },
    orientation: {
      async lockLandscape() {
        // Only works in fullscreen or installed PWAs on some browsers; the CSS "turn your phone
        // sideways" card covers the rest.
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        await o.lock?.("landscape").catch(() => {});
      },
    },
  };
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null; // storage disabled (private mode, blocked site data)
  }
}
