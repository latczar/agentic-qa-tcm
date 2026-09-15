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
  prettier,
]);
