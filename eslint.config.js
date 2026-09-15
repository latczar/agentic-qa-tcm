import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
  prettier,
]);
