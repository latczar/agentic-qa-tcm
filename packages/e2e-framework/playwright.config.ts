import path from 'node:path';
import { defineConfig } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const baseURL = process.env.HR_PORTAL_URL ?? 'http://localhost:3000';

export default defineConfig({
  testMatch: '**/*.spec.ts',
  // The HR Portal keeps state in memory and every test resets it, so tests must not overlap.
  workers: 1,
  fullyParallel: false,
  // A flaky test is a finding, not something to retry away.
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // G6 sets SABOTAGE to a feature id (e.g. "leave.submit") to re-run a candidate against a
    // deliberately broken app and confirm it actually notices. Unset for every other run.
    extraHTTPHeaders: process.env.SABOTAGE ? { 'X-Sabotage': process.env.SABOTAGE } : undefined,
  },
  projects: [
    // Handwritten suite. This is what CI runs and what the agent learns from.
    { name: 'e2e', testDir: './tests/e2e', use: { browserName: 'chromium' } },
    // AI-generated candidates awaiting review. Never run by default.
    { name: 'candidates', testDir: './tests/generated', use: { browserName: 'chromium' } },
  ],
  // Playwright starts the application itself, locally and in CI. Locally it reuses one you
  // already have running on the port.
  webServer: {
    command: 'npm start -w apps/hr-portal',
    url: `${baseURL}/health`,
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
