import { expect, test, type Page } from "@playwright/test";

const jc = (page: Page, expr: string) => page.evaluate(`window.__jc && (${expr})`);

test("reference replay of 1-1 wins and the save persists", async ({ page }) => {
  await page.goto("/?level=1-1&replay=reference&speed=8");
  await expect(page.getByRole("dialog")).toContainText("The pile is ours!", { timeout: 30_000 });
  expect(await jc(page, "window.__jc.outcome.kind")).toBe("won");

  await page.reload();
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator('[data-level="1-2"]')).toBeEnabled();
  const save = (await page.evaluate("window.__jc.save()")) as { levels: Record<string, { moons: number }> };
  expect(save.levels["1-1"]!.moons).toBeGreaterThanOrEqual(1);
});

test("a player can win 1-1 from the title screen by holding the cricket card", async ({ page }) => {
  await page.goto("/?speed=8");
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator('[data-level="1-1"]').click();
  await page.getByRole("button", { name: "Let's go!" }).click();
  await expect(page.getByText("Tap the crickets to send them!")).toBeVisible();

  const card = page.locator('[data-unit="cricket"]');
  await card.hover();
  await page.mouse.down();
  // generous: WebKit and Firefox run slower than Chromium when the suite runs in parallel
  await expect(page.getByRole("dialog")).toContainText("The pile is ours!", { timeout: 50_000 });
  await page.mouse.up();
  const sent = (await jc(page, "window.__jc.recorded.length")) as number;
  expect(sent).toBeGreaterThan(10);
});

test("pausing freezes the night and 'call it a night' ends softly", async ({ page }) => {
  await page.goto("/?level=1-2&skipIntro=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const tick = await jc(page, "window.__jc.tick");
  await page.waitForTimeout(500);
  expect(await jc(page, "window.__jc.tick")).toBe(tick);
  await page.getByRole("button", { name: "Call it a night" }).click();
  await expect(page.getByRole("dialog")).toContainText("time for a nap");
  await expect(page.getByRole("button", { name: "Great try — go again?" })).toBeFocused();
});

test("title, map and a level load without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?unlock=all");
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator('[data-level="4-5"]').click(); // the map opens on the furthest area
  await page.getByRole("button", { name: "Let's go!" }).click();
  // Send a few friends so the synthesized sounds and music all get exercised.
  for (const unit of ["cricket", "possum", "squirrel", "crow", "rat"]) await page.locator(`[data-unit="${unit}"]`).click();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});

test("the installed game plays offline", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit", "Playwright's WebKit build never activates service workers");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator('[data-level="1-1"]').click();
  await expect(page.getByRole("button", { name: "Let's go!" })).toBeVisible();
  await context.setOffline(false);
});

test("multi-lane levels: lane buttons pick where units go; arrows move focus", async ({ page }) => {
  await page.goto("/?level=3-3&skipIntro=1");
  const lanes = page.getByRole("radio");
  await expect(lanes).toHaveCount(3);
  await lanes.nth(2).click();
  await expect(lanes.nth(2)).toHaveAttribute("aria-checked", "true");
  await page.locator('[data-unit="cricket"]').click();
  await expect.poll(() => page.evaluate("window.__jc.recorded.at(-1)?.lane")).toBe(2);

  // Keyboard-only: arrows walk across the unit bar, Q/W/E pick lanes, Enter sends.
  await page.locator('[data-unit="cricket"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-unit="possum"]')).toBeFocused();
  await page.keyboard.press("w");
  await expect(lanes.nth(1)).toHaveAttribute("aria-checked", "true");
});

test("a gamepad can play: d-pad moves focus, A sends, Start pauses", async ({ page }) => {
  // A fake standard-mapping pad whose buttons the test flips.
  await page.addInitScript(() => {
    const pad = {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  const tap = async (i: number) => {
    await page.evaluate((i) => ((window as any).__pad.buttons[i].pressed = true), i);
    await page.waitForTimeout(80);
    await page.evaluate((i) => ((window as any).__pad.buttons[i].pressed = false), i);
    await page.waitForTimeout(80);
  };
  await page.goto("/?level=1-3&skipIntro=1");
  await expect(page.locator('[data-unit="cricket"]')).toBeFocused();
  await tap(15); // d-pad right
  await expect(page.locator('[data-unit="possum"]')).toBeFocused();
  await expect(page.locator("html")).toHaveClass(/gamepad/);
  await tap(14); // back left
  await tap(0); // A sends a cricket
  await expect.poll(() => page.evaluate("window.__jc.recorded.length")).toBeGreaterThan(0);
  await tap(9); // Start pauses
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await expect(page.getByRole("button", { name: "Keep going" })).toBeFocused();
  await tap(0); // A resumes
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
