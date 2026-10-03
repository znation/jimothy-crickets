// The Capacitor (iOS, Android) adapter. Plugins are reached through window.Capacitor, which the
// native shell injects, so the game itself never imports Capacitor packages (plan §2.4).

import type { Platform } from "./types.ts";

const SAVE_KEY = "save";
const BACKUP_KEY = "save.backup";

interface CapacitorGlobal {
  isNativePlatform(): boolean;
  getPlatform(): "ios" | "android" | "web";
  Plugins: {
    Preferences: {
      get(o: { key: string }): Promise<{ value: string | null }>;
      set(o: { key: string; value: string }): Promise<void>;
    };
    App: { addListener(event: "pause" | "resume", cb: () => void): void };
    Haptics?: { impact(o: { style: "LIGHT" | "MEDIUM" }): Promise<void> };
    ScreenOrientation?: { lock(o: { orientation: "landscape" }): Promise<void> };
  };
}

export function capacitorGlobal(): CapacitorGlobal | null {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

export function capacitorPlatform(cap: CapacitorGlobal): Platform {
  const { Preferences, App, Haptics, ScreenOrientation } = cap.Plugins;
  return {
    kind: cap.getPlatform() === "ios" ? "ios" : "android",
    // Native key-value storage survives webview data clears (plan §3.4).
    save: {
      load: async () => (await Preferences.get({ key: SAVE_KEY })).value,
      store: (json) => Preferences.set({ key: SAVE_KEY, value: json }),
      backup: (json) => Preferences.set({ key: BACKUP_KEY, value: json }),
    },
    lifecycle: {
      onPause: (cb) => App.addListener("pause", cb),
      onResume: (cb) => App.addListener("resume", cb),
    },
    haptics: Haptics && {
      tap: () => void Haptics.impact({ style: "LIGHT" }).catch(() => {}),
      bump: () => void Haptics.impact({ style: "MEDIUM" }).catch(() => {}),
    },
    orientation: { lockLandscape: async () => void (await ScreenOrientation?.lock({ orientation: "landscape" }).catch(() => {})) },
  };
}
