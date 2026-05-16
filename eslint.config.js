import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Honor the leading-underscore convention for intentionally-unused names.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Path-alias hygiene: forbid `../../` deep relative imports across src/ and
  // test/. Use @engine/* or @test-utils instead (mirrored in tsconfig.app.json
  // paths + vite.config.ts resolve.alias). Single `../` is fine for sibling
  // intra-module imports.
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../**'],
              message: 'Use @engine/* or @test-utils alias instead of crossing 2+ levels (../../X). See tsconfig.app.json paths.',
            },
          ],
        },
      ],
    },
  },
  // Engine boundary: keep src/engine headless and deterministic.
  // The engine must not import from src/ui, React, the DOM, or any UI library;
  // and it must never call Math.random (use the seeded PRNG injected at createEngine).
  // NOTE: this `no-restricted-imports` block REPLACES the alias-hygiene rule
  // above for files under src/engine/ (ESLint config blocks don't merge same
  // rules — last one wins). So we re-include the `../../**` ban here.
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui', '**/ui/**'], message: 'Engine cannot import from the UI layer.' },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'Engine is headless — no React imports.',
            },
            {
              group: ['recharts', 'recharts/*', 'zustand', 'zustand/*'],
              message: 'Engine is headless — no UI library imports.',
            },
            {
              group: ['../../**'],
              message: 'Use @engine/* alias instead of crossing 2+ levels (../../X). See tsconfig.app.json paths.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Engine is headless — no window access.' },
        { name: 'document', message: 'Engine is headless — no DOM access.' },
        { name: 'localStorage', message: 'Engine is headless — persistence is wired in T-028.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Engine is deterministic — use the seeded PRNG (createRng), not Math.random.',
        },
      ],
    },
  },
])
