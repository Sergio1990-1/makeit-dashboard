import { test, expect } from "@playwright/test";
import { seedApp } from "./fixtures/seed";
import { FIRST_REPO, NBA_BADGE_COUNT } from "./fixtures/projects";

/**
 * Epic-010 Task-07 Part 2 journey (#417 / from #349):
 *   Portfolio → Scorecard → Hub → all 5 tabs → browser-back
 *   (selectedRepo cleared, scroll preserved) + sidebar NBA badge.
 *
 * Determinism notes:
 *  - Scroll preservation is tested with a SINGLE browser-back from the hub
 *    entry (one popstate → one native scroll-restore point), and only after
 *    the grid has re-rendered — so we never read scrollY before the document
 *    is tall again. Cycling tabs first would bury the Portfolio history
 *    entry behind 5 hub entries for no added coverage.
 *  - The tab cycle starts on a NON-active tab and ends on overview, so every
 *    click is a real activeTab transition. Clicking the already-active
 *    overview tab first would be a React state bail-out (no re-render → no
 *    subtab pushState), making a `subtab=overview` assertion race an
 *    incidental Hub re-render.
 */

// Hub mounts with overview active; order so each click changes activeTab.
const TAB_CYCLE = ["health", "activity", "decisions", "delivery", "overview"] as const;

test.beforeEach(async ({ page }) => {
  await seedApp(page);
});

async function openFirstHub(page: import("@playwright/test").Page) {
  await page.locator(`.v4-scorecard[aria-label="Открыть проект ${FIRST_REPO}"]`).click();
  await page.waitForURL(/[?&]repo=/);
  await expect(page.locator(".v4-hub-page")).toBeVisible();
}

test("Portfolio → Scorecard → Hub (5 tabs) → back; sidebar NBA badge", async ({ page }) => {
  // 1 ── Portfolio Surface: Scorecard grid + sidebar NBA badge ───────────
  await page.goto("/?tab=projects");

  const cards = page.locator(".v4-scorecard");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(1);
  await expect(
    page.locator(`.v4-scorecard[aria-label="Открыть проект ${FIRST_REPO}"]`),
  ).toBeVisible();

  // Sidebar NBA pill reflects the seeded cache (count > 0 → visible).
  await expect(page.locator(".sidebar-badge").first()).toHaveText(
    String(NBA_BADGE_COUNT),
  );

  // 2 ── Scroll the overflowing Portfolio, then drill into the Hub ───────
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolledY = await page.evaluate(() => window.scrollY);

  await openFirstHub(page);
  await expect(page.locator("#v4-hub-tab-overview")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 3 ── Browser-back → Portfolio; repo cleared; scroll preserved ────────
  // Opening the Hub adds a small, fixed number of history entries (repo
  // select + subtab); walk back until the drill-down is gone. This runs
  // BEFORE the tab cycle, so it's only ~2 hops to the (single) Portfolio
  // history entry whose scroll the browser restores.
  for (let i = 0; i < 6 && /[?&]repo=/.test(page.url()); i++) {
    await page.goBack();
  }
  expect(page.url()).not.toMatch(/[?&]repo=/);
  // Wait for the grid to re-render BEFORE reading scrollY — guards against
  // reading mid-restore while the document is still short.
  await expect(page.locator(".v4-scorecard").first()).toBeVisible();
  await expect(page.locator(".v4-hub-page")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scrolledY);

  // 4 ── Re-enter Hub, cycle all 5 tabs: each renders, subtab URL updates ─
  await openFirstHub(page);
  for (const id of TAB_CYCLE) {
    await page.locator(`#v4-hub-tab-${id}`).click();
    await expect(page.locator(`#v4-hub-tab-${id}`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(`#v4-hub-tabpanel-${id}`)).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("subtab"))
      .toBe(id);
  }
});
