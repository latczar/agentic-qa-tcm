import { isIsoDate } from './dates.js';
import {
  DEPARTMENTS,
  ROLES,
  type Department,
  type Employee,
  type FieldErrors,
  type Role,
  type Validation,
} from './types.js';

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  department: string;
  jobTitle: string;
  managerId: string;
  startDate: string;
  annualLeaveAllowance: string;
}

export interface ValidEmployee {
  firstName: string;
  lastName: string;
  email: string;
  /** null means "not changed" and is only allowed when editing. */
  password: string | null;
  role: Role;
  department: Department;
  jobTitle: string;
  managerId: string | null;
  startDate: string;
  annualLeaveAllowance: number;
}

export type EmployeeField = keyof EmployeeInput;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_ALLOWANCE_DAYS = 40;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmployeeContext {
  existing: readonly Employee[];
  /** The employee being edited, or null when creating. */
  editingId: string | null;
}

export function validateEmployee(
  input: EmployeeInput,
  ctx: EmployeeContext,
): Validation<ValidEmployee, EmployeeField> {
  const errors: FieldErrors<EmployeeField> = {};
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role.trim();
  const department = input.department.trim();
  const jobTitle = input.jobTitle.trim();
  const managerId = input.managerId.trim();
  const startDate = input.startDate.trim();
  const allowance = Number(input.annualLeaveAllowance.trim());

  if (firstName.length === 0 || firstName.length > 60) errors.firstName = 'Enter a first name.';
  if (lastName.length === 0 || lastName.length > 60) errors.lastName = 'Enter a last name.';
  if (!EMAIL.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else if (ctx.existing.some((e) => e.email.toLowerCase() === email && e.id !== ctx.editingId)) {
    errors.email = 'An employee with this email address already exists.';
  }
  if (ctx.editingId === null && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!isRole(role)) errors.role = 'Choose a role.';
  if (!isDepartment(department)) errors.department = 'Choose a department.';
  if (jobTitle.length === 0 || jobTitle.length > 80) errors.jobTitle = 'Enter a job title.';
  if (managerId !== '') {
    const manager = ctx.existing.find((e) => e.id === managerId);
    if (!manager || !manager.active || manager.role === 'employee') {
      errors.managerId = 'Choose an active manager or admin.';
    } else if (managerId === ctx.editingId) {
      errors.managerId = 'An employee cannot be their own manager.';
    }
  }
  if (!isIsoDate(startDate)) errors.startDate = 'Enter a valid start date.';
  if (!Number.isInteger(allowance) || allowance < 0 || allowance > MAX_ALLOWANCE_DAYS) {
    errors.annualLeaveAllowance = `Enter a whole number of days between 0 and ${MAX_ALLOWANCE_DAYS}.`;
  }

  if (Object.keys(errors).length > 0 || !isRole(role) || !isDepartment(department)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      password: password.length > 0 ? password : null,
      role,
      department,
      jobTitle,
      managerId: managerId === '' ? null : managerId,
      startDate,
      annualLeaveAllowance: allowance,
    },
  };
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function isDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value);
}
