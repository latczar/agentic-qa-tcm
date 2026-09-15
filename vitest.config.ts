import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. Playwright specs use *.spec.ts and are run by Playwright, never by Vitest.
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
