import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared chrome present on every signed-in page: navigation, current user, flash messages.
 * Page objects expose locators as readonly fields and behaviour as methods.
 * Assertion helpers are named expect* so lint can recognise them as state assertions.
 */
export abstract class BasePage {
  readonly navDashboard: Locator;
  readonly navEmployees: Locator;
  readonly navLeave: Locator;
  readonly navExpenses: Locator;
  readonly navApprovals: Locator;
  readonly currentUserName: Locator;
  readonly currentUserRole: Locator;
  readonly signOutButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  constructor(protected readonly page: Page) {
    this.navDashboard = page.getByTestId('nav-dashboard');
    this.navEmployees = page.getByTestId('nav-employees');
    this.navLeave = page.getByTestId('nav-leave');
    this.navExpenses = page.getByTestId('nav-expenses');
    this.navApprovals = page.getByTestId('nav-approvals');
    this.currentUserName = page.getByTestId('nav-user-name');
    this.currentUserRole = page.getByTestId('nav-user-role');
    this.signOutButton = page.getByTestId('nav-sign-out');
    this.successMessage = page.getByTestId('flash-success');
    this.errorMessage = page.getByTestId('flash-error');
  }

  /** Signs the current user out. Lands on the sign-in page. */
  async signOut(): Promise<void> {
    await this.signOutButton.click();
  }

  /** Asserts the green banner shown after a successful action contains the text. */
  async expectSuccess(text: string | RegExp): Promise<void> {
    await expect(this.successMessage).toContainText(text);
  }

  /** Asserts the red banner shown after a refused action contains the text. */
  async expectError(text: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toContainText(text);
  }

  /** Asserts the header shows the given person as signed in. */
  async expectSignedInAs(
    firstName: string,
    role?: 'employee' | 'manager' | 'admin',
  ): Promise<void> {
    await expect(this.currentUserName).toContainText(firstName);
    if (role) await expect(this.currentUserRole).toHaveText(role);
  }
}
