import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness (issue #417, Epic-010 Task-07 Part 2).
 *
 * The app is a no-backend SPA: it serves at `/makeit-dashboard/` in dev
 * (vite.config `base`). Tests run it with `VITE_BASE=/` so the journey can
 * use clean `/?tab=...` URLs, and seed localStorage + abort external hosts
 * (see tests/e2e/fixtures/seed.ts) so rendering is deterministic without a
 * live GitHub PAT or the cache/pipeline backends.
 */
const PORT = 4173;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `VITE_BASE=/ npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
