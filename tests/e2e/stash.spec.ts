import { expect, test } from "@playwright/test";

test("winning 1-1 with a chain of crickets fills Jimothy's stash", async ({ page }) => {
  await page.goto("/?level=1-1&skipIntro&speed=8");
  const chip = page.locator(".goal-chip");
  await expect(chip).toBeVisible();
  await page.locator('[data-unit="cricket"]').hover();
  await page.mouse.down();
  await expect(chip).toHaveClass(/done/, { timeout: 30_000 }); // five in a row: the sandwich
  await expect(page.getByRole("dialog")).toContainText("The pile is ours!", { timeout: 50_000 });
  await page.mouse.up();
  await expect(page.locator(".found-row .treasure")).not.toHaveCount(0);

  await page.getByRole("button", { name: "Map" }).click();
  await page.locator(".stash-btn").click();
  await expect(page.locator('[data-treasure="sandwich"]')).toHaveClass(/found/);
  await expect(page.locator('[data-treasure="duck"]')).toHaveClass(/found/);
  await expect(page.locator('[data-treasure="tinCan"]')).not.toHaveClass(/found/);
  await page.locator('[data-treasure="tinCan"]').click();
  await expect(page.locator(".stash-detail")).toContainText("1-2: Get 15 crickets to the pile");
});

test("the surprise yard opens after the alley, with every friend the player has", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const levels = Object.fromEntries(["1-1", "1-2", "1-3", "1-4", "1-5"].map((id) => [id, { cleared: true, moons: 2 }]));
    localStorage.setItem("jimothy-crickets.save", JSON.stringify({ version: 1, unlockedUnits: ["cricket", "possum", "squirrel"], levels }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Play" }).click();
  await page.locator(".daily-btn").click();
  await expect(page.getByRole("dialog")).toContainText("A surprise yard!", { timeout: 20_000 });
  await expect(page.getByRole("dialog")).toContainText("Today's treasure");
  await page.getByRole("button", { name: "Let's go!" }).click();
  // everyone the player has recruited comes along, even to a remix of a one-friend level
  await expect(page.locator(".unit-card")).toHaveCount(3);
  const plan = (await page.evaluate("window.__jc.save().dailyPlan")) as { key: string; base: string };
  expect(["1-1", "1-2", "1-3", "1-4", "1-5"]).toContain(plan.base);
});
