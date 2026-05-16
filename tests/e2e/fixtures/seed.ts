import type { Page } from "@playwright/test";
import { PROJECTS_FIXTURE, NBA_ENVELOPE } from "./projects";

/**
 * Hermetic seeding for the no-backend SPA (#417).
 *
 * The dashboard reads live from GitHub with a PAT in localStorage, gated by
 * a password screen, and falls back through a cache/pipeline backend. To get
 * a deterministic render with zero live dependencies we:
 *
 *  1. Abort every external host (GitHub API, pipeline/auditor/settings on
 *     127.0.0.1/localhost:876x). The app already degrades gracefully on
 *     fetch failure, so this just makes "no backend" instant instead of
 *     waiting on timeouts.
 *  2. Seed localStorage before any app script runs:
 *     - `makeit_auth`            → bypass the password gate (config.ts getAuth)
 *     - `pipeline_settings_token`→ a token is present, so the aborted settings
 *                                   fetch is classified "unavailable" (not
 *                                   "auth") → ColdStartShell degraded mode
 *                                   renders AppInner instead of the bootstrap
 *                                   onboarding screen
 *     - `github_token`           → App renders the dashboard, not the no-token
 *                                   screen; useDashboard is gated on a token
 *     - `makeit.activeTab`       → initial tab is localStorage-driven (the URL
 *                                   `?tab=` is NOT read for initial selection);
 *                                   "projects" lands on the Portfolio Surface
 *     - `makeit_dashboard_cache` → fresh (<15min) so fetchDashboardData's SWR
 *                                   path serves it instantly with no network
 *     - `makeit_portfolio_nba`   → non-empty so the sidebar NBA badge renders
 */
const EXTERNAL_HOSTS = (host: string): boolean =>
  host.includes("github.com") ||
  host.includes("githubusercontent.com") ||
  host.startsWith("127.0.0.1") ||
  host === "localhost:8765" ||
  host === "localhost:8766";

export async function seedApp(page: Page): Promise<void> {
  await page.route(
    (url) => EXTERNAL_HOSTS(url.host),
    (route) => route.abort(),
  );

  await page.addInitScript(
    (payload: { projects: unknown; nba: unknown; now: number }) => {
      localStorage.setItem(
        "makeit_auth",
        JSON.stringify({ v: "authenticated", exp: payload.now + 8 * 60 * 60 * 1000 }),
      );
      localStorage.setItem("pipeline_settings_token", "e2e_bootstrap_token");
      localStorage.setItem("github_token", "ghp_e2e_dummy_token");
      localStorage.setItem("makeit.activeTab", "projects");
      localStorage.setItem(
        "makeit_dashboard_cache",
        JSON.stringify({
          data: payload.projects,
          timestamp: payload.now,
          lastSyncIso: new Date(payload.now).toISOString(),
        }),
      );
      localStorage.setItem("makeit_portfolio_nba", JSON.stringify(payload.nba));
    },
    { projects: PROJECTS_FIXTURE, nba: NBA_ENVELOPE, now: Date.now() },
  );
}
