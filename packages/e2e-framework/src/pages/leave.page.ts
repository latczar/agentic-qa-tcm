import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';

export type LeaveType = 'annual' | 'sick' | 'unpaid';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequestDetails {
  type: LeaveType;
  /** ISO date, first day of leave. */
  startDate: string;
  /** ISO date, last day of leave, inclusive. */
  endDate: string;
  reason?: string;
}

export type LeaveField = 'type' | 'startDate' | 'endDate' | 'reason';

/** The signed-in employee's own leave at /leave. */
export class LeavePage extends BasePage {
  readonly requestButton: Locator;
  readonly remaining: Locator;
  readonly allowance: Locator;
  readonly table: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.requestButton = page.getByTestId('leave-request');
    this.remaining = page.getByTestId('leave-remaining');
    this.allowance = page.getByTestId('leave-allowance');
    this.table = page.getByTestId('leave-table');
    this.emptyMessage = page.getByTestId('leave-empty');
  }

  /** Opens my leave. */
  async goto(): Promise<void> {
    await this.page.goto('/leave');
    await expect(this.remaining).toBeVisible();
  }

  /** The row for a leave request id, for example lr-001. The first request a test creates is lr-101. */
  row(requestId: string): Locator {
    return this.page.getByTestId(`leave-row-${requestId}`);
  }

  /** The status badge for a leave request. */
  statusBadge(requestId: string): Locator {
    return this.page.getByTestId(`leave-status-${requestId}`);
  }

  /** Opens the request form from the list. */
  async openRequestForm(): Promise<void> {
    await this.requestButton.click();
  }

  /** Cancels a pending request from the list. The button only exists while it is pending. */
  async cancel(requestId: string): Promise<void> {
    await this.page.getByTestId(`leave-cancel-${requestId}`).click();
  }

  /** Asserts a request is listed with the given status. */
  async expectRequestListed(requestId: string, status: LeaveStatus): Promise<void> {
    await expect(this.row(requestId)).toBeVisible();
    await expect(this.statusBadge(requestId)).toHaveText(status);
  }

  /** Asserts the remaining annual leave shown above the list. */
  async expectRemaining(days: number): Promise<void> {
    await expect(this.remaining).toHaveText(String(days));
  }

  /** Asserts the decision column for a request shows who decided and, optionally, their comment. */
  async expectDecision(requestId: string, text: string | RegExp): Promise<void> {
    await expect(this.page.getByTestId(`leave-decision-${requestId}`)).toContainText(text);
  }
}

/** The request-leave form at /leave/new. */
export class LeaveFormPage extends BasePage {
  readonly typeSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly reasonInput: Locator;
  readonly submitButton: Locator;
  readonly remaining: Locator;

  constructor(page: Page) {
    super(page);
    this.typeSelect = page.getByTestId('leave-type');
    this.startDateInput = page.getByTestId('leave-start-date');
    this.endDateInput = page.getByTestId('leave-end-date');
    this.reasonInput = page.getByTestId('leave-reason');
    this.submitButton = page.getByTestId('leave-submit');
    this.remaining = page.getByTestId('leave-form-remaining');
  }

  /** Opens the form directly. */
  async goto(): Promise<void> {
    await this.page.goto('/leave/new');
    await expect(this.submitButton).toBeVisible();
  }

  /** The validation message under a field, present only when that field failed. */
  fieldError(field: LeaveField): Locator {
    return this.page.getByTestId(`error-${field}`);
  }

  /** Fills the form and submits it. On success the list opens with a green banner. */
  async submitRequest(details: LeaveRequestDetails): Promise<void> {
    await this.typeSelect.selectOption(details.type);
    await this.startDateInput.fill(details.startDate);
    await this.endDateInput.fill(details.endDate);
    await this.reasonInput.fill(details.reason ?? '');
    await this.submitButton.click();
  }

  /** Asserts a field shows the given validation message. */
  async expectFieldError(field: LeaveField, message: string | RegExp): Promise<void> {
    await expect(this.fieldError(field)).toContainText(message);
  }
}
