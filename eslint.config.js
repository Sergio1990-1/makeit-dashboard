import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `src/types/generated/**` is machine-generated from backend OpenAPI
  // (npm run gen:api-types) — lint it as the generator emits it.
  globalIgnores(['dist', 'src/types/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // E2E harness runs under Node (Playwright runner); the spec/seed
    // callbacks run in the browser, so allow both global sets and drop the
    // Vite react-refresh rule (fixtures legitimately export non-components).
    files: ['tests/**/*.{ts,tsx}', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
