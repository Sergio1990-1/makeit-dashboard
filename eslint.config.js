import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `src/types/generated/**` is machine-generated from backend OpenAPI
  // (npm run gen:api-types) — lint it as the generator emits it.
  globalIgnores(['dist', 'src/types/generated', '.claude/worktrees']),
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
    rules: {
      // Design system guard: запрет hex/rgba/legacy токенов в исходниках.
      // Whitelist для intentional cases — см. отдельный override ниже.
      // Для прозрачных вариантов писать color-mix(in srgb, var(--mk-*) N%, transparent).
      //
      // Регексы детектят hex/rgba/legacy-токен ВНУТРИ строки, не только
      // когда literal целиком совпадает (раньше anchored ^...$ пропускал
      // `"1px solid #ccc"` — Codex review P2 поймал AnnotationModal:53).
      // Whitelist для #fff/#FFF/#000 (включая 6-значные) — они используются
      // как «контраст-утилиты» для текста на цветном bg и не несут семантики
      // палитры.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/(^|[^a-fA-F0-9])#(?!(fff|FFF|Fff|ffffff|FFFFFF|000|000000)([^a-fA-F0-9]|$))[0-9a-fA-F]{3,8}([^a-fA-F0-9]|$)/]",
          message:
            'Hex-цвета не допускаются (включая внутри строк типа "1px solid #ccc"). Используй var(--mk-*) из src/styles/tokens.css. Если нужен intentional literal (brand identity / runtime canvas / overlay-on-color) — добавь файл в whitelist в eslint.config.js.',
        },
        {
          selector: "Literal[value=/rgba?\\(/]",
          message:
            'rgba()/rgb() inline не допускаются. Для тинтов используй color-mix(in srgb, var(--mk-*) N%, transparent).',
        },
        {
          selector: "Literal[value=/var\\(--color-/]",
          message:
            'Legacy --color-* токен (bridge удалён в Session K). Используй var(--mk-*) из tokens.css напрямую.',
        },
        {
          selector:
            "Literal[value=/var\\(--(v4|gray|blue|green|red|orange|yellow|purple|cyan)-/]",
          message:
            'Legacy --v4-*/--gray-*/--blue-*/etc. токен (bridge удалён в Session K). Используй var(--mk-*) из tokens.css напрямую.',
        },
        {
          selector:
            "Literal[value=/var\\(--(font-(sans|mono)|text-(xs|sm|base|md|lg|xl|data)|sp-[0-9]|radius-(sm|md|lg|full)|shadow-(sm|md|lg))/]",
          message:
            'Legacy typography/spacing/radius/shadow токен (bridge удалён в Session K). Используй var(--mk-{font,text,sp,r,shadow}-*) из tokens.css напрямую.',
        },
      ],
    },
  },
  {
    // Whitelist: файлы с намеренными hex-литералами (D18 brand identity,
    // overlay-on-color, runtime canvas). См. design-decisions.html.
    files: [
      'src/components/v4/milestones/utils.ts',           // repo identity (D18 exception)
      'src/components/v4/milestones/MilestonesHero.tsx', // white overlay на color hero bg
      'src/components/v4/health/KpiRow.tsx',             // white overlay
      'src/components/DebateChat.tsx',                   // AI provider brand colors
      'src/components/v4/BrandedLoader.tsx',             // runtime canvas g.fillStyle, var() не работает
      'src/components/v4/MakeItLoader.tsx',              // dark mode white text
      'src/styleguide/**/*.{ts,tsx}',                    // styleguide показывает hex для swatch labels
      'vite.config.ts',                                  // PWA manifest theme_color/background_color — spec requires hex
    ],
    rules: {
      'no-restricted-syntax': 'off',
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
