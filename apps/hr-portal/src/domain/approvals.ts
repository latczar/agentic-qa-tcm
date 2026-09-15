import type { InMemoryStore } from './store.js';
import type { Employee, Expense, LeaveRequest } from './types.js';

/**
 * Who may decide on whose requests.
 * Nobody decides on their own. Admins decide for everyone else. Managers decide for direct reports.
 */
export function canDecideFor(approver: Employee, requester: Employee): boolean {
  if (approver.id === requester.id) return false;
  if (approver.role === 'admin') return true;
  return approver.role === 'manager' && requester.managerId === approver.id;
}

export interface PendingLeave {
  request: LeaveRequest;
  requester: Employee;
}

export interface PendingExpense {
  expense: Expense;
  requester: Employee;
}

export function pendingLeaveFor(store: InMemoryStore, approver: Employee): PendingLeave[] {
  return store
    .listLeave()
    .filter((r) => r.status === 'pending')
    .flatMap((request) => {
      const requester = store.getEmployee(request.employeeId);
      return requester && canDecideFor(approver, requester) ? [{ request, requester }] : [];
    });
}

export function pendingExpensesFor(store: InMemoryStore, approver: Employee): PendingExpense[] {
  return store
    .listExpenses()
    .filter((x) => x.status === 'pending')
    .flatMap((expense) => {
      const requester = store.getEmployee(expense.employeeId);
      return requester && canDecideFor(approver, requester) ? [{ expense, requester }] : [];
    });
}
