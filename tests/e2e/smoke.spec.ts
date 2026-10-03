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
  await expect(page.getByRole("dialog")).toContainText("The pile is ours!", { timeout: 30_000 });
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
  await page.locator('[data-level="1-5"]').click();
  await page.getByRole("button", { name: "Let's go!" }).click();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("the installed game plays offline", async ({ page, context }) => {
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
