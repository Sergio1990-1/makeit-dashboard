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
    environmentMatchGlobs: [
      ["tests/**/*.test.tsx", "jsdom"],
    ],
  },
});
