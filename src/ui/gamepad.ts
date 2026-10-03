// Gamepad and arrow-key navigation (plan §3.2; needed for Steam Deck "Verified").
// Directions move focus to the nearest control on screen in that direction; A presses the
// focused control (holding A on a unit card streams units, like holding a finger on it);
// B goes back; Start pauses. Everything is routed through the DOM so screens need no gamepad code.

const FOCUSABLE = "button:not(:disabled), input, textarea, [tabindex]:not([tabindex='-1'])";
const DEADZONE = 0.5;
const REPEAT_DELAY = 0.35; // s before a held direction starts repeating
const REPEAT_EVERY = 0.12;

type Dir = "up" | "down" | "left" | "right";

export function installNavigation(root: HTMLElement) {
  window.addEventListener("keydown", (e) => {
    const dir = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const)[
      e.key as "ArrowUp"
    ];
    const el = document.activeElement;
    if (!dir || (el instanceof HTMLInputElement && el.type === "range") || el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    move(root, dir);
  });

  let timer = 0;
  const start = () => {
    if (!timer) timer = window.setInterval(() => poll(root), 1000 / 60);
  };
  window.addEventListener("gamepadconnected", start);
  if (navigator.getGamepads?.().some(Boolean)) start(); // already connected before load
}

// ---------------------------------------------------------------- focus movement

function scope(root: HTMLElement): HTMLElement {
  // Dialogs trap focus: only move within the top-most one.
  const overlays = root.querySelectorAll<HTMLElement>(".overlay");
  return overlays[overlays.length - 1] ?? root;
}

function candidates(root: HTMLElement): HTMLElement[] {
  return [...scope(root).querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function move(root: HTMLElement, dir: Dir) {
  const all = candidates(root);
  const current = document.activeElement as HTMLElement | null;
  if (!current || !all.includes(current)) {
    all[0]?.focus();
    return;
  }
  const c = center(current.getBoundingClientRect());
  const [dx, dy] = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const)[dir];
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === current) continue;
    const p = center(el.getBoundingClientRect());
    const along = (p.x - c.x) * dx + (p.y - c.y) * dy;
    if (along <= 4) continue;
    const across = Math.abs((p.x - c.x) * dy) + Math.abs((p.y - c.y) * dx);
    const score = along + across * 2;
    if (score < bestScore) [best, bestScore] = [el, score];
  }
  best?.focus();
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------------------------------------------------------------- gamepad polling

const held = new Map<string, number>(); // control → seconds held (for edges and repeats)
let lastPoll = 0;

function poll(root: HTMLElement) {
  const now = performance.now() / 1000;
  const dt = lastPoll ? Math.min(0.1, now - lastPoll) : 0;
  lastPoll = now;
  const pad = navigator.getGamepads?.().find((p) => p?.connected);
  if (!pad) return;
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const [ax = 0, ay = 0] = pad.axes;
  const state: Record<string, boolean> = {
    up: b(12) || ay < -DEADZONE,
    down: b(13) || ay > DEADZONE,
    left: b(14) || ax < -DEADZONE,
    right: b(15) || ax > DEADZONE,
    a: b(0),
    b: b(1),
    start: b(9),
  };
  if (Object.values(state).some(Boolean)) document.documentElement.classList.add("gamepad");

  for (const [name, down] of Object.entries(state)) {
    const before = held.get(name);
    if (!down) {
      if (before !== undefined) release(name);
      held.delete(name);
      continue;
    }
    const t = (before ?? -dt) + dt;
    held.set(name, t);
    const pressed = before === undefined;
    const repeat = !pressed && t >= REPEAT_DELAY && Math.floor((t - REPEAT_DELAY) / REPEAT_EVERY) !== Math.floor((t - dt - REPEAT_DELAY) / REPEAT_EVERY);
    if (name === "up" || name === "down" || name === "left" || name === "right") {
      if (pressed || repeat) move(root, name);
    } else if (pressed) press(root, name);
  }
}

let aTarget: HTMLElement | null = null;

function press(root: HTMLElement, name: string) {
  const el = document.activeElement as HTMLElement | null;
  if (name === "a") {
    if (!el || el === document.body) return move(root, "down");
    aTarget = el;
    if (el.classList.contains("unit-card")) key(el, "keydown", "Enter");
    else el.click();
  } else if (name === "b") {
    const back = scope(root).querySelector<HTMLButtonElement>("[aria-label='Back']");
    if (scope(root) !== root || !back) key(el ?? document.body, "keydown", "Escape");
    else back.click();
  } else if (name === "start") {
    key(el ?? document.body, "keydown", "Escape");
  }
}

function release(name: string) {
  if (name === "a" && aTarget?.classList.contains("unit-card")) key(aTarget, "keyup", "Enter");
  if (name === "a") aTarget = null;
}

function key(target: EventTarget, type: "keydown" | "keyup", key: string) {
  target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
}
