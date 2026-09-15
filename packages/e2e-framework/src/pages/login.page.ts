import { expect, type Locator, type Page } from '@playwright/test';

/** The sign-in screen at /login. */
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
  }

  /** Opens the sign-in page. */
  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.submitButton).toBeVisible();
  }

  /** Fills both fields and submits. Does not assert the outcome; callers decide what to expect. */
  async signIn(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Asserts the sign-in form is showing, for example after signing out. */
  async expectSignInFormVisible(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
    await expect(this.page).toHaveURL(/\/login$/);
  }

  /** Asserts sign-in was refused with the given message and the user is still on /login. */
  async expectSignInRefused(message: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
