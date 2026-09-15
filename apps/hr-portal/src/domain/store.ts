import { createSeed } from './seed.js';
import type { Employee, Expense, LeaveRequest } from './types.js';

type NewLeave = Omit<
  LeaveRequest,
  'id' | 'status' | 'decidedById' | 'decisionComment' | 'createdAt'
>;
type NewExpense = Omit<Expense, 'id' | 'status' | 'decidedById' | 'decisionComment' | 'createdAt'>;

/**
 * All application state, in memory. `reset()` returns it to the seed.
 * Ids are stable across resets: seeded records keep their ids and new records
 * continue from a fixed counter, so a test that creates one leave request always gets lr-101.
 */
export class InMemoryStore {
  private employees = new Map<string, Employee>();
  private leaveRequests = new Map<string, LeaveRequest>();
  private expenses = new Map<string, Expense>();
  private counters = { employee: 100, leave: 100, expense: 100 };

  constructor() {
    this.reset();
  }

  reset(): void {
    const seed = createSeed();
    this.employees = new Map(seed.employees.map((e) => [e.id, e]));
    this.leaveRequests = new Map(seed.leaveRequests.map((r) => [r.id, r]));
    this.expenses = new Map(seed.expenses.map((x) => [x.id, x]));
    this.counters = { employee: 100, leave: 100, expense: 100 };
  }

  // Employees

  listEmployees(): Employee[] {
    return [...this.employees.values()].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );
  }

  getEmployee(id: string): Employee | undefined {
    return this.employees.get(id);
  }

  findEmployeeByEmail(email: string): Employee | undefined {
    const needle = email.trim().toLowerCase();
    return [...this.employees.values()].find((e) => e.email.toLowerCase() === needle);
  }

  addEmployee(data: Omit<Employee, 'id'>): Employee {
    const employee: Employee = { id: this.nextId('emp', 'employee'), ...data };
    this.employees.set(employee.id, employee);
    return employee;
  }

  updateEmployee(id: string, patch: Partial<Omit<Employee, 'id'>>): Employee | undefined {
    const current = this.employees.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    this.employees.set(id, updated);
    return updated;
  }

  // Leave

  listLeave(): LeaveRequest[] {
    return newestFirst([...this.leaveRequests.values()]);
  }

  leaveFor(employeeId: string): LeaveRequest[] {
    return this.listLeave().filter((r) => r.employeeId === employeeId);
  }

  getLeave(id: string): LeaveRequest | undefined {
    return this.leaveRequests.get(id);
  }

  addLeave(data: NewLeave): LeaveRequest {
    const request: LeaveRequest = {
      id: this.nextId('lr', 'leave'),
      ...data,
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: new Date().toISOString(),
    };
    this.leaveRequests.set(request.id, request);
    return request;
  }

  updateLeave(id: string, patch: Partial<Omit<LeaveRequest, 'id'>>): LeaveRequest | undefined {
    const current = this.leaveRequests.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    this.leaveRequests.set(id, updated);
    return updated;
  }

  // Expenses

  listExpenses(): Expense[] {
    return newestFirst([...this.expenses.values()]);
  }

  expensesFor(employeeId: string): Expense[] {
    return this.listExpenses().filter((x) => x.employeeId === employeeId);
  }

  getExpense(id: string): Expense | undefined {
    return this.expenses.get(id);
  }

  addExpense(data: NewExpense): Expense {
    const expense: Expense = {
      id: this.nextId('ex', 'expense'),
      ...data,
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: new Date().toISOString(),
    };
    this.expenses.set(expense.id, expense);
    return expense;
  }

  updateExpense(id: string, patch: Partial<Omit<Expense, 'id'>>): Expense | undefined {
    const current = this.expenses.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    this.expenses.set(id, updated);
    return updated;
  }

  private nextId(prefix: string, counter: keyof typeof this.counters): string {
    this.counters[counter] += 1;
    return `${prefix}-${String(this.counters[counter]).padStart(3, '0')}`;
  }
}

function newestFirst<T extends { createdAt: string; id: string }>(items: T[]): T[] {
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
