// The only interface between the game and the platform it runs on (plan §4.4). Only src/platform/
// may contain platform-specific code.

export interface Platform {
  kind: "web" | "pwa" | "ios" | "android" | "desktop";
  save: { load(): Promise<string | null>; store(json: string): Promise<void>; backup(json: string): Promise<void> };
  lifecycle: { onPause(cb: () => void): void; onResume(cb: () => void): void };
  haptics?: { tap(): void; bump(): void };
  orientation: { lockLandscape(): Promise<void> };
  quit?: () => void;
}
