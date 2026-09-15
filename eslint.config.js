import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import aiqa, { specRules } from './packages/e2e-framework/eslint/index.js';

const SPEC_FILES = ['packages/e2e-framework/tests/**/*.ts'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/playwright-report/**',
    '**/test-results/**',
    'artifacts/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Express error handlers must declare four parameters even when `next` is unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // Community Playwright rules for spec files: no .only, no skipped tests, no waitForTimeout, and so on.
  { ...playwright.configs['flat/recommended'], files: SPEC_FILES },
  // The framework's own conventions. The pipeline runs these same rules over generated tests.
  {
    files: SPEC_FILES,
    plugins: { aiqa },
    rules: {
      ...specRules,
      // Our require-state-assertion understands page object expect*() helpers; the community rule does not.
      'playwright/expect-expect': 'off',
    },
  },
  prettier,
]);
