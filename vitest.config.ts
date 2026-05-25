import { defineConfig } from "vitest/config";

/**
 * Vitest config — kept separate from `vite.config.ts` so PWA / build plugins
 * don't run during unit tests, and Playwright e2e specs in `tests/e2e/**`
 * stay isolated from Vitest (they have their own runner / `test` import).
 */
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    // Default to jsdom: every browser-side test needs `window`,
    // `localStorage`, and `Response` shims. The handful of pure-util
    // tests don't notice the env upgrade. `environmentMatchGlobs` was
    // deprecated in Vitest 3.x in favour of this pattern + per-file
    // `// @vitest-environment node` overrides if needed.
    environment: "jsdom",
    // See setup.ts — replaces Node 24's broken native localStorage shim
    // with a real Storage implementation so `.clear()` works.
    setupFiles: ["tests/setup.ts"],
  },
});
