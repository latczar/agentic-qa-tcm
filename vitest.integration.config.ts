import { defineConfig } from 'vitest/config';

// Local runs must not write into the same database the dev orchestrator and review UI read
// from, or every `npm run test:integration` pollutes whatever you're demoing with scenario
// runs. CI sets its own DATABASE_URL against a throwaway service container, so this only
// takes effect when nothing else has already set one.
process.env.DATABASE_URL ??= 'postgres://aiqa:aiqa@localhost:5432/pipeline_test';

export default defineConfig({
  test: {
    // Needs the Postgres from docker-compose (or the CI service container).
    include: ['apps/**/*.integration.test.ts', 'packages/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
