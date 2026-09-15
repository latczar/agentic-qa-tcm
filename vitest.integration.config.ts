import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Needs the Postgres from docker-compose (or the CI service container).
    include: ['apps/**/*.integration.test.ts', 'packages/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
