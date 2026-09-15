export const ROLES = ['employee', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const DEPARTMENTS = ['Engineering', 'Sales', 'Finance', 'People'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Plain text on purpose. These are synthetic accounts in a local test double that never
   * holds real data. Do not copy this pattern into a product.
   */
  password: string;
  role: Role;
  department: Department;
  jobTitle: string;
  managerId: string | null;
  /** ISO date, for example 2022-09-12. */
  startDate: string;
  active: boolean;
  /** Annual leave allowance in working days per year. */
  annualLeaveAllowance: number;
}

export const LEAVE_TYPES = ['annual', 'sick', 'unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: LeaveStatus;
  decidedById: string | null;
  decisionComment: string | null;
  createdAt: string;
}

export const EXPENSE_CATEGORIES = ['travel', 'meals', 'equipment', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  employeeId: string;
  category: ExpenseCategory;
  /** Whole pence. Money is never stored as a floating point number. */
  amountPence: number;
  description: string;
  incurredOn: string;
  status: ExpenseStatus;
  decidedById: string | null;
  decisionComment: string | null;
  createdAt: string;
}

/** Field name to human-readable message. Only fields with a problem are present. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type Validation<T, K extends string> =
  { ok: true; value: T } | { ok: false; errors: FieldErrors<K> };
