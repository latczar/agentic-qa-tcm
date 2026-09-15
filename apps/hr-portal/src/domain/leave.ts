import { isIsoDate, workingDaysBetween } from './dates.js';
import {
  LEAVE_TYPES,
  type Employee,
  type FieldErrors,
  type LeaveRequest,
  type LeaveType,
  type Validation,
} from './types.js';

export interface LeaveInput {
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ValidLeave {
  type: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
}

export type LeaveField = keyof LeaveInput;

export const MAX_REASON_LENGTH = 200;

/**
 * Annual leave still available to an employee.
 * Approved and pending annual requests both count as used, because a pending request
 * reserves the days until a manager decides.
 */
export function remainingAnnualLeave(
  employee: Employee,
  requests: readonly LeaveRequest[],
): number {
  const reserved = requests
    .filter(
      (r) =>
        r.employeeId === employee.id &&
        r.type === 'annual' &&
        (r.status === 'approved' || r.status === 'pending'),
    )
    .reduce((sum, r) => sum + r.workingDays, 0);
  return employee.annualLeaveAllowance - reserved;
}

export function validateLeave(
  input: LeaveInput,
  remainingAnnual: number,
  today: string,
): Validation<ValidLeave, LeaveField> {
  const errors: FieldErrors<LeaveField> = {};
  const type = input.type.trim();
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();
  const reason = input.reason.trim();

  if (!isLeaveType(type)) errors.type = 'Choose a leave type.';
  if (!isIsoDate(startDate)) errors.startDate = 'Enter a valid start date.';
  if (!isIsoDate(endDate)) errors.endDate = 'Enter a valid end date.';
  if (reason.length > MAX_REASON_LENGTH) {
    errors.reason = `Reason must be ${MAX_REASON_LENGTH} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0 || !isLeaveType(type)) return { ok: false, errors };

  if (endDate < startDate) {
    errors.endDate = 'End date must be the same as or after the start date.';
    return { ok: false, errors };
  }
  if (type !== 'sick' && startDate < today) {
    errors.startDate =
      'Start date cannot be in the past. Only sick leave can be recorded retrospectively.';
    return { ok: false, errors };
  }

  const workingDays = workingDaysBetween(startDate, endDate);
  if (workingDays === 0) {
    errors.startDate = 'The selected dates contain no working days.';
    return { ok: false, errors };
  }
  if (type === 'annual' && workingDays > remainingAnnual) {
    errors.endDate = `This request needs ${workingDays} working ${plural(workingDays, 'day')} but you have ${remainingAnnual} remaining.`;
    return { ok: false, errors };
  }

  return { ok: true, value: { type, startDate, endDate, workingDays, reason } };
}

function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value);
}

export function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
