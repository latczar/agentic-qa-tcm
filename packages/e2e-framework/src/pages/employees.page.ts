import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page.js';

export interface EmployeeDetails {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: 'Engineering' | 'Sales' | 'Finance' | 'People';
  role: 'employee' | 'manager' | 'admin';
  /** Employee id of the manager, for example emp-002, or null for none. */
  managerId: string | null;
  startDate: string;
  annualLeaveAllowance: number;
  password: string;
}

export type EmployeeField = keyof EmployeeDetails;

/** The employee directory at /employees. */
export class EmployeesPage extends BasePage {
  readonly addButton: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly resultCount: Locator;
  readonly table: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.addButton = page.getByTestId('employees-add');
    this.searchInput = page.getByTestId('employees-search-input');
    this.searchButton = page.getByTestId('employees-search-submit');
    this.resultCount = page.getByTestId('employees-count');
    this.table = page.getByTestId('employees-table');
    this.emptyMessage = page.getByTestId('employees-empty');
  }

  /** Opens the directory. */
  async goto(): Promise<void> {
    await this.page.goto('/employees');
    await expect(this.resultCount).toBeVisible();
  }

  /** The table row for an employee id, for example emp-004. */
  row(employeeId: string): Locator {
    return this.page.getByTestId(`employee-row-${employeeId}`);
  }

  /** The Active or Inactive badge for an employee. */
  statusBadge(employeeId: string): Locator {
    return this.page.getByTestId(`employee-status-${employeeId}`);
  }

  /** Filters the directory by name, email, department or job title. */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }

  /** Opens the add-employee form. Admin only. */
  async openAddForm(): Promise<void> {
    await this.addButton.click();
  }

  /** Opens an employee's detail page from the directory. */
  async open(employeeId: string): Promise<void> {
    await this.page.getByTestId(`employee-link-${employeeId}`).click();
  }

  /** Opens the edit form for an employee. Admin only. */
  async openEditForm(employeeId: string): Promise<void> {
    await this.page.getByTestId(`employee-edit-${employeeId}`).click();
  }

  /** Deactivates an employee from the directory. Admin only. */
  async deactivate(employeeId: string): Promise<void> {
    await this.page.getByTestId(`employee-deactivate-${employeeId}`).click();
  }

  /** Reactivates an employee from the directory. Admin only. */
  async reactivate(employeeId: string): Promise<void> {
    await this.page.getByTestId(`employee-reactivate-${employeeId}`).click();
  }

  /** Asserts an employee appears in the directory, optionally checking the displayed name. */
  async expectListed(employeeId: string, name?: string): Promise<void> {
    await expect(this.row(employeeId)).toBeVisible();
    if (name) await expect(this.row(employeeId)).toContainText(name);
  }

  /** Asserts an employee's status badge. */
  async expectStatus(employeeId: string, status: 'Active' | 'Inactive'): Promise<void> {
    await expect(this.statusBadge(employeeId)).toHaveText(status);
  }

  /** Asserts the "N employees" count under the search box. */
  async expectResultCount(count: number): Promise<void> {
    await expect(this.resultCount).toHaveText(`${count} ${count === 1 ? 'employee' : 'employees'}`);
  }
}

/** The add and edit employee form at /employees/new and /employees/:id/edit. Admin only. */
export class EmployeeFormPage extends BasePage {
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly jobTitleInput: Locator;
  readonly departmentSelect: Locator;
  readonly roleSelect: Locator;
  readonly managerSelect: Locator;
  readonly startDateInput: Locator;
  readonly allowanceInput: Locator;
  readonly passwordInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.firstNameInput = page.getByTestId('employee-first-name');
    this.lastNameInput = page.getByTestId('employee-last-name');
    this.emailInput = page.getByTestId('employee-email');
    this.jobTitleInput = page.getByTestId('employee-job-title');
    this.departmentSelect = page.getByTestId('employee-department');
    this.roleSelect = page.getByTestId('employee-role');
    this.managerSelect = page.getByTestId('employee-manager');
    this.startDateInput = page.getByTestId('employee-start-date');
    this.allowanceInput = page.getByTestId('employee-leave-allowance');
    this.passwordInput = page.getByTestId('employee-password');
    this.saveButton = page.getByTestId('employee-save');
  }

  /** Opens the add-employee form directly. Non-admins get a 403 page. */
  async gotoNew(): Promise<void> {
    await this.page.goto('/employees/new');
  }

  /** The validation message under a field, present only when that field failed. */
  fieldError(field: EmployeeField): Locator {
    return this.page.getByTestId(`error-${field}`);
  }

  /** Fills every field of the form. Pass the whole employee; nothing is left at its default. */
  async fill(details: EmployeeDetails): Promise<void> {
    await this.firstNameInput.fill(details.firstName);
    await this.lastNameInput.fill(details.lastName);
    await this.emailInput.fill(details.email);
    await this.jobTitleInput.fill(details.jobTitle);
    await this.departmentSelect.selectOption(details.department);
    await this.roleSelect.selectOption(details.role);
    await this.managerSelect.selectOption(details.managerId ?? '');
    await this.startDateInput.fill(details.startDate);
    await this.allowanceInput.fill(String(details.annualLeaveAllowance));
    await this.passwordInput.fill(details.password);
  }

  /** Submits the form. On success the detail page opens; on failure the form re-renders with errors. */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** Asserts a field shows the given validation message. */
  async expectFieldError(field: EmployeeField, message: string | RegExp): Promise<void> {
    await expect(this.fieldError(field)).toContainText(message);
  }
}

/** One employee's detail page at /employees/:id. */
export class EmployeeDetailPage extends BasePage {
  readonly name: Locator;
  readonly editButton: Locator;

  constructor(page: Page) {
    super(page);
    this.name = page.getByTestId('employee-name');
    this.editButton = page.getByTestId('employee-edit');
  }

  /** Opens an employee's detail page directly. */
  async goto(employeeId: string): Promise<void> {
    await this.page.goto(`/employees/${employeeId}`);
  }

  /** A single detail value: email, job-title, department, role, manager, start-date, allowance, status. */
  detail(
    field:
      | 'email'
      | 'job-title'
      | 'department'
      | 'role'
      | 'manager'
      | 'start-date'
      | 'allowance'
      | 'status',
  ): Locator {
    return this.page.getByTestId(`employee-detail-${field}`);
  }

  /** Asserts the page is for the named person. */
  async expectName(fullName: string): Promise<void> {
    await expect(this.name).toHaveText(fullName);
  }

  /** Asserts a detail value. */
  async expectDetail(
    field: Parameters<EmployeeDetailPage['detail']>[0],
    value: string | RegExp,
  ): Promise<void> {
    await expect(this.detail(field)).toHaveText(value);
  }
}
