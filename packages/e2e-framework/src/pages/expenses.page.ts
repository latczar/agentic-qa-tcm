import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';

export type ExpenseCategory = 'travel' | 'meals' | 'equipment' | 'other';
export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ExpenseClaimDetails {
  category: ExpenseCategory;
  /** Pounds as typed by a person, for example "42.50". */
  amount: string;
  description: string;
  /** ISO date the cost was incurred. Cannot be in the future. */
  incurredOn: string;
}

export type ExpenseField = 'category' | 'amount' | 'description' | 'incurredOn';

/** The signed-in employee's own expense claims at /expenses. */
export class ExpensesPage extends BasePage {
  readonly newClaimButton: Locator;
  readonly pendingTotal: Locator;
  readonly table: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.newClaimButton = page.getByTestId('expense-submit-new');
    this.pendingTotal = page.getByTestId('expenses-pending-total');
    this.table = page.getByTestId('expenses-table');
    this.emptyMessage = page.getByTestId('expenses-empty');
  }

  /** Opens my expenses. */
  async goto(): Promise<void> {
    await this.page.goto('/expenses');
    await expect(this.pendingTotal).toBeVisible();
  }

  /** The row for an expense id, for example ex-001. The first claim a test creates is ex-101. */
  row(expenseId: string): Locator {
    return this.page.getByTestId(`expense-row-${expenseId}`);
  }

  /** The status badge for a claim. */
  statusBadge(expenseId: string): Locator {
    return this.page.getByTestId(`expense-status-${expenseId}`);
  }

  /** Opens the new-claim form from the list. */
  async openClaimForm(): Promise<void> {
    await this.newClaimButton.click();
  }

  /** Asserts a claim is listed with the formatted amount, for example £42.50, and a status. */
  async expectClaimListed(expenseId: string, amount: string, status: ExpenseStatus): Promise<void> {
    await expect(this.row(expenseId)).toBeVisible();
    await expect(this.page.getByTestId(`expense-amount-${expenseId}`)).toHaveText(amount);
    await expect(this.statusBadge(expenseId)).toHaveText(status);
  }

  /** Asserts the "Awaiting approval" total, for example £42.50. */
  async expectPendingTotal(amount: string): Promise<void> {
    await expect(this.pendingTotal).toHaveText(amount);
  }
}

/** The submit-expense form at /expenses/new. */
export class ExpenseFormPage extends BasePage {
  readonly categorySelect: Locator;
  readonly amountInput: Locator;
  readonly descriptionInput: Locator;
  readonly incurredOnInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.categorySelect = page.getByTestId('expense-category');
    this.amountInput = page.getByTestId('expense-amount');
    this.descriptionInput = page.getByTestId('expense-description');
    this.incurredOnInput = page.getByTestId('expense-incurred-on');
    this.submitButton = page.getByTestId('expense-submit');
  }

  /** Opens the form directly. */
  async goto(): Promise<void> {
    await this.page.goto('/expenses/new');
    await expect(this.submitButton).toBeVisible();
  }

  /** The validation message under a field, present only when that field failed. */
  fieldError(field: ExpenseField): Locator {
    return this.page.getByTestId(`error-${field}`);
  }

  /** Fills the form and submits it. On success the list opens with a green banner. */
  async submitClaim(details: ExpenseClaimDetails): Promise<void> {
    await this.categorySelect.selectOption(details.category);
    await this.amountInput.fill(details.amount);
    await this.descriptionInput.fill(details.description);
    await this.incurredOnInput.fill(details.incurredOn);
    await this.submitButton.click();
  }

  /** Asserts a field shows the given validation message. */
  async expectFieldError(field: ExpenseField, message: string | RegExp): Promise<void> {
    await expect(this.fieldError(field)).toContainText(message);
  }
}
