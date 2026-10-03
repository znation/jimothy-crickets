import { expect, test } from "@playwright/test";

// Plan §10.3: every screen is checked at these sizes.
const SIZES = {
  phone: { width: 667, height: 375 },
  tablet: { width: 1024, height: 768 },
  desktop: { width: 1920, height: 1080 },
  ultrawide: { width: 2560, height: 1080 },
  deck: { width: 1280, height: 800 },
};

for (const [name, size] of Object.entries(SIZES)) {
  test(`level HUD fits at ${name} (${size.width}×${size.height})`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto("/?level=4-5&skipIntro=1"); // the busiest HUD: five friends, three paths
    await expect(page.locator('[data-unit="cricket"]')).toBeVisible();

    const view = (await page.evaluate("window.__jc.view")) as { scale: number; ox: number; oy: number; dpr: number };
    // The 16:9 core playfield is fully on screen and centered.
    expect(view.ox).toBeGreaterThanOrEqual(0);
    expect(view.oy).toBeGreaterThanOrEqual(0);
    expect(view.scale * 1920 + 2 * view.ox).toBeCloseTo(size.width, 0);
    expect(view.scale * 1080 + 2 * view.oy).toBeCloseTo(size.height, 0);
    // The backing store follows devicePixelRatio, capped at 2.
    const canvas = await page.locator("#field").evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
    expect(canvas[0]).toBe(Math.round(size.width * view.dpr));

    // Every control is on screen and big enough to tap.
    for (const el of await page.locator("button").all()) {
      const box = (await el.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    // No page scroll.
    const overflow = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    expect(overflow).toEqual([size.width, size.height]);

    await info.attach(`${name}.png`, { body: await page.screenshot(), contentType: "image/png" });
  });
}

test("portrait phones get the turn-sideways card", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByText("Turn your phone sideways!")).toBeVisible();
  await ctx.close();
});
