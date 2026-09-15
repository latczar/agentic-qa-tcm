import { expect, type Locator, type Page } from '@playwright/test';

/** The page the application renders for 403, 404 and 500. */
export class ErrorPage {
  readonly status: Locator;
  readonly message: Locator;
  readonly homeLink: Locator;

  constructor(page: Page) {
    this.status = page.getByTestId('error-status');
    this.message = page.getByTestId('error-message');
    this.homeLink = page.getByTestId('error-home');
  }

  /** Asserts the error page is showing with the given HTTP status. */
  async expectStatus(status: 403 | 404 | 500): Promise<void> {
    await expect(this.status).toHaveText(String(status));
  }
}
