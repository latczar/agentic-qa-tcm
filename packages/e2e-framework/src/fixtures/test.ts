import { test as base, expect } from '@playwright/test';
import { HrPortalApi } from '../api/hr-portal-api.js';
import { App } from '../pages/index.js';
import type { SeedUser } from './users.js';

export interface Fixtures {
  /** Every page object on one object. */
  app: App;
  /** Non-page endpoints: health and reset. */
  api: HrPortalApi;
  /** Signs a seed user in through the real sign-in page and waits for the dashboard. */
  signInAs: (user: SeedUser) => Promise<void>;
  /** Automatic. Restores the seed before every test, so tests never depend on each other. */
  resetState: void;
}

/**
 * The framework's `test`. Every spec imports this, never `@playwright/test` directly,
 * so every test gets a clean application and the page objects without ceremony.
 */
export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new HrPortalApi(request));
  },

  resetState: [
    async ({ api }, use) => {
      await api.reset();
      await use();
    },
    { auto: true },
  ],

  app: async ({ page }, use) => {
    await use(new App(page));
  },

  signInAs: async ({ app }, use) => {
    await use(async (user: SeedUser) => {
      await app.login.goto();
      await app.login.signIn(user.email, user.password);
      await app.dashboard.expectLoadedFor(user.firstName);
    });
  },
});

export { expect };
export { users, seeded, SEED_PASSWORD, type SeedUser } from './users.js';
export * from './dates.js';
