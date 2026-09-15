import type { Page } from '@playwright/test';
import { ApprovalsPage } from './approvals.page.js';
import { DashboardPage } from './dashboard.page.js';
import { EmployeeDetailPage, EmployeeFormPage, EmployeesPage } from './employees.page.js';
import { ErrorPage } from './error.page.js';
import { ExpenseFormPage, ExpensesPage } from './expenses.page.js';
import { LeaveFormPage, LeavePage } from './leave.page.js';
import { LoginPage } from './login.page.js';

/** Every page object, built once per test and handed to it as the `app` fixture. */
export class App {
  readonly login: LoginPage;
  readonly dashboard: DashboardPage;
  readonly employees: EmployeesPage;
  readonly employeeForm: EmployeeFormPage;
  readonly employeeDetail: EmployeeDetailPage;
  readonly leave: LeavePage;
  readonly leaveForm: LeaveFormPage;
  readonly expenses: ExpensesPage;
  readonly expenseForm: ExpenseFormPage;
  readonly approvals: ApprovalsPage;
  readonly errorPage: ErrorPage;

  constructor(page: Page) {
    this.login = new LoginPage(page);
    this.dashboard = new DashboardPage(page);
    this.employees = new EmployeesPage(page);
    this.employeeForm = new EmployeeFormPage(page);
    this.employeeDetail = new EmployeeDetailPage(page);
    this.leave = new LeavePage(page);
    this.leaveForm = new LeaveFormPage(page);
    this.expenses = new ExpensesPage(page);
    this.expenseForm = new ExpenseFormPage(page);
    this.approvals = new ApprovalsPage(page);
    this.errorPage = new ErrorPage(page);
  }
}

export * from './approvals.page.js';
export * from './base.page.js';
export * from './dashboard.page.js';
export * from './employees.page.js';
export * from './error.page.js';
export * from './expenses.page.js';
export * from './leave.page.js';
export * from './login.page.js';
