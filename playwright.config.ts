import { defineConfig, devices } from "@playwright/test";

// Browser tests (plan §11.4) run against the production build.
export default defineConfig({
  testDir: "tests/e2e",
  // Screenshot baselines are made on CI runners (see visual.spec.ts); skip them elsewhere.
  testIgnore: process.env.VISUAL ? [] : ["**/visual.spec.ts"],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  timeout: 60_000,
  fullyParallel: true,
  // Playwright's WebKit build occasionally fails a navigation with "internal error"; one retry on
  // CI keeps that from failing a run, and the report still flags the test as flaky.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npx vite build && npx vite preview --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // WebKit stands in for iOS Safari and the macOS/Linux webviews; Firefox for completeness.
    ...(process.env.ALL_BROWSERS
      ? [
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        ]
      : []),
  ],
});
