import { expect, test } from "@playwright/test";

// Plan §11.5: frame times on the stress level. Prints percentiles; fails only if the game can't
// sustain ~30 fps on this machine, since CI runners vary too much for a tighter gate.
test("stress level frame times", async ({ page, browserName }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?stress&debug");
  // Let the swarm build up and the resolution fallback settle.
  await page.waitForFunction("window.__jc && window.__jc.tick > 900", null, { timeout: 40_000 });
  const frames = (await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (out.length < 300) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  )) as number[];
  const units = await page.evaluate("document.querySelector('.debug')?.textContent ?? ''");
  frames.sort((a, b) => a - b);
  const pct = (p: number) => frames[Math.floor((frames.length - 1) * p)]!.toFixed(1);
  const summary = `${browserName}: p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, p99 ${pct(0.99)} ms ${units}`;
  console.log(summary);
  info.annotations.push({ type: "frame times", description: summary });
  expect(Number(pct(0.5))).toBeLessThan(34);
});
