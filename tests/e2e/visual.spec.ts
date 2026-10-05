import { expect, test, type Page } from "@playwright/test";

// Screenshot comparisons (plan §11.4). Every shot uses ?still=<tick>, which draws one
// deterministic frame. Baselines are generated on GitHub's runners (fonts and anti-aliasing differ
// between machines) by the update-screenshots workflow, so these run only when VISUAL=1 (CI).

const SAVE = {
  version: 1,
  unlockedUnits: ["cricket", "possum", "squirrel"],
  upgrades: { "cricket.hp": 1 },
  acorns: 23,
  levels: { "1-1": { moons: 3, cleared: true }, "1-2": { moons: 2, cleared: true } },
  settings: {},
};

async function shot(page: Page, url: string, name: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(url);
  await page.waitForSelector("html[data-still=ready]");
  await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.01 });
}

const DESKTOP = { width: 1280, height: 720 };

test("title", async ({ page }) => shot(page, "/?still=400", "title", DESKTOP));

test("level, desktop", async ({ page }) =>
  shot(page, "/?level=1-3&replay=reference&still=1200", "level-1-3-desktop", DESKTOP));

test("level, phone", async ({ page }) =>
  shot(page, "/?level=4-5&replay=reference&still=2400", "level-4-5-phone", { width: 667, height: 375 }));

test("level, ultrawide", async ({ page }) =>
  shot(page, "/?level=3-4&replay=reference&still=1800", "level-3-4-ultrawide", { width: 2560, height: 1080 }));

test("story card, phone", async ({ page }) =>
  shot(page, "/?level=2-1&still=0", "story-backyards-phone", { width: 667, height: 375 }));

test("map and shop", async ({ page }) => {
  await page.addInitScript((save) => localStorage.setItem("jimothy-crickets.save", JSON.stringify(save)), SAVE);
  await page.setViewportSize(DESKTOP);
  await page.goto("/?still=400");
  await page.waitForSelector("html[data-still=ready]");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveScreenshot("map.png", { maxDiffPixelRatio: 0.01 });
  await page.getByRole("button", { name: "Shop" }).click();
  await expect(page).toHaveScreenshot("shop.png", { maxDiffPixelRatio: 0.01 });
});
