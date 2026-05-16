import { test, expect } from "@playwright/test";
import { seedApp } from "./fixtures/seed";
import { FIRST_REPO, NBA_BADGE_COUNT } from "./fixtures/projects";

/**
 * Epic-010 Task-07 Part 2 journey (#417 / from #349):
 *   Portfolio → Scorecard → Hub → all 5 tabs → browser-back
 *   (selectedRepo cleared, scroll preserved) + sidebar NBA badge.
 */

const HUB_TABS = ["overview", "health", "activity", "decisions", "delivery"] as const;

test.beforeEach(async ({ page }) => {
  await seedApp(page);
});

test("Portfolio → Scorecard → Hub (5 tabs) → back; sidebar NBA badge", async ({ page }) => {
  // 1 ── Portfolio Surface: Scorecard grid renders ───────────────────────
  await page.goto("/?tab=projects");

  const cards = page.locator(".v4-scorecard");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(1);

  const firstCard = page.locator(`.v4-scorecard[aria-label="Открыть проект ${FIRST_REPO}"]`);
  await expect(firstCard).toBeVisible();

  // Scroll the (overflowing, 12-card) Portfolio so back-restoration is testable.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolledY = await page.evaluate(() => window.scrollY);

  // 2 ── Click first Scorecard → Hub Overview ────────────────────────────
  await firstCard.click();
  await page.waitForURL(/[?&]repo=/);
  await expect(page.locator(".v4-hub-page")).toBeVisible();
  await expect(page.locator("#v4-hub-tab-overview")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 3 ── Cycle all 5 Hub tabs: each renders, URL subtab updates ───────────
  for (const id of HUB_TABS) {
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

  // 4 ── Browser back → Portfolio Surface; repo cleared; scroll preserved ─
  // Tab switches push history entries; walk back until the drill-down is gone.
  for (let i = 0; i < 10 && /[?&]repo=/.test(page.url()); i++) {
    await page.goBack();
  }
  expect(page.url()).not.toMatch(/[?&]repo=/);
  await expect(page.locator(".v4-scorecard").first()).toBeVisible();
  await expect(page.locator(".v4-hub-page")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scrolledY);

  // 5 ── Sidebar NBA badge visible with the seeded count ──────────────────
  const badge = page.locator(".sidebar-badge");
  await expect(badge.first()).toHaveText(String(NBA_BADGE_COUNT));
});
