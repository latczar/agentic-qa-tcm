import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';

/** The landing page after sign-in, at /. */
export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly remainingLeave: Locator;
  readonly pendingLeave: Locator;
  readonly pendingExpenses: Locator;
  readonly awaitingMyApproval: Locator;
  readonly requestLeaveButton: Locator;
  readonly submitExpenseButton: Locator;
  readonly reviewApprovalsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('dashboard-heading');
    this.remainingLeave = page.getByTestId('stat-remaining-leave').locator('.stat-value');
    this.pendingLeave = page.getByTestId('stat-pending-leave').locator('.stat-value');
    this.pendingExpenses = page.getByTestId('stat-pending-expenses').locator('.stat-value');
    this.awaitingMyApproval = page.getByTestId('stat-awaiting-my-approval').locator('.stat-value');
    this.requestLeaveButton = page.getByTestId('dashboard-request-leave');
    this.submitExpenseButton = page.getByTestId('dashboard-submit-expense');
    this.reviewApprovalsButton = page.getByTestId('dashboard-go-to-approvals');
  }

  /** Opens the dashboard. Redirects to sign-in when nobody is signed in. */
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  /** Asserts the dashboard greets the given person. */
  async expectLoadedFor(firstName: string): Promise<void> {
    await expect(this.heading).toHaveText(`Hello, ${firstName}`);
  }

  /** Asserts the remaining annual leave figure. */
  async expectRemainingLeave(days: number): Promise<void> {
    await expect(this.remainingLeave).toHaveText(String(days));
  }

  /** Asserts how many items are waiting for the signed-in manager or admin. */
  async expectAwaitingMyApproval(count: number): Promise<void> {
    await expect(this.awaitingMyApproval).toHaveText(String(count));
  }
}
