import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';

/** The approvals queue at /approvals. Managers and admins only. */
export class ApprovalsPage extends BasePage {
  readonly leaveCount: Locator;
  readonly expensesCount: Locator;
  readonly leaveEmptyMessage: Locator;
  readonly expensesEmptyMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.leaveCount = page.getByTestId('approvals-leave-count');
    this.expensesCount = page.getByTestId('approvals-expenses-count');
    this.leaveEmptyMessage = page.getByTestId('approvals-leave-empty');
    this.expensesEmptyMessage = page.getByTestId('approvals-expenses-empty');
  }

  /** Opens the queue. Employees get a 403 page. */
  async goto(): Promise<void> {
    await this.page.goto('/approvals');
    await expect(this.leaveCount).toBeVisible();
  }

  /** The queue row for a leave request. Present only while it awaits this approver. */
  leaveRow(requestId: string): Locator {
    return this.page.getByTestId(`approval-leave-row-${requestId}`);
  }

  /** The queue row for an expense claim. Present only while it awaits this approver. */
  expenseRow(expenseId: string): Locator {
    return this.page.getByTestId(`approval-expense-row-${expenseId}`);
  }

  /** Approves a leave request. */
  async approveLeave(requestId: string): Promise<void> {
    await this.page.getByTestId(`approve-leave-${requestId}`).click();
  }

  /** Rejects a leave request with a comment. An empty comment is refused by the application. */
  async rejectLeave(requestId: string, comment: string): Promise<void> {
    await this.page.getByTestId(`reject-leave-comment-${requestId}`).fill(comment);
    await this.page.getByTestId(`reject-leave-${requestId}`).click();
  }

  /** Approves an expense claim. */
  async approveExpense(expenseId: string): Promise<void> {
    await this.page.getByTestId(`approve-expense-${expenseId}`).click();
  }

  /** Rejects an expense claim with a comment. An empty comment is refused by the application. */
  async rejectExpense(expenseId: string, comment: string): Promise<void> {
    await this.page.getByTestId(`reject-expense-comment-${expenseId}`).fill(comment);
    await this.page.getByTestId(`reject-expense-${expenseId}`).click();
  }

  /** Asserts a leave request is in this approver's queue. */
  async expectLeaveAwaiting(requestId: string): Promise<void> {
    await expect(this.leaveRow(requestId)).toBeVisible();
  }

  /** Asserts a leave request is not in this approver's queue, decided or never theirs to decide. */
  async expectLeaveNotAwaiting(requestId: string): Promise<void> {
    await expect(this.leaveRow(requestId)).toHaveCount(0);
  }

  /** Asserts an expense claim is in this approver's queue. */
  async expectExpenseAwaiting(expenseId: string): Promise<void> {
    await expect(this.expenseRow(expenseId)).toBeVisible();
  }

  /** Asserts an expense claim is not in this approver's queue. */
  async expectExpenseNotAwaiting(expenseId: string): Promise<void> {
    await expect(this.expenseRow(expenseId)).toHaveCount(0);
  }

  /** Asserts the counters in the two section headings. */
  async expectCounts(leave: number, expenses: number): Promise<void> {
    await expect(this.leaveCount).toHaveText(String(leave));
    await expect(this.expensesCount).toHaveText(String(expenses));
  }
}
