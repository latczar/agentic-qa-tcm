import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only: fast, no database, no browser.
    // Playwright specs are *.spec.ts and run under Playwright. Integration tests are
    // *.integration.test.ts and run with vitest.integration.config.ts against Postgres.
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
