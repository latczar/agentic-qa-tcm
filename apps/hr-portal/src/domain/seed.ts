import type { Employee, Expense, LeaveRequest } from './types.js';

/** Bump when the baseline data changes so tests can assert they are talking to the seed they expect. */
export const SEED_VERSION = 1;

/** Every seed account signs in with this password. Synthetic accounts only. */
export const SEED_PASSWORD = 'Password123!';

export interface SeedData {
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  expenses: Expense[];
}

/**
 * Fresh copies every call, so a reset cannot leak mutations from the previous run.
 * All people are fictional. The email domain is reserved for examples and never routes.
 */
export function createSeed(): SeedData {
  const employees: Employee[] = [
    person('emp-001', 'Priya', 'Shah', 'admin', 'People', 'Head of People', null, '2019-03-04'),
    person(
      'emp-002',
      'Tom',
      'Okafor',
      'manager',
      'Engineering',
      'Engineering Manager',
      'emp-001',
      '2020-01-13',
    ),
    person(
      'emp-003',
      'Hannah',
      'Reid',
      'manager',
      'Sales',
      'Sales Manager',
      'emp-001',
      '2021-06-01',
    ),
    person(
      'emp-004',
      'Dev',
      'Patel',
      'employee',
      'Engineering',
      'Software Engineer',
      'emp-002',
      '2022-09-12',
    ),
    person(
      'emp-005',
      'Amira',
      'Hassan',
      'employee',
      'Engineering',
      'QA Engineer',
      'emp-002',
      '2023-02-20',
    ),
    person(
      'emp-006',
      'Jack',
      'Whitfield',
      'employee',
      'Engineering',
      'Platform Engineer',
      'emp-002',
      '2021-11-08',
    ),
    person(
      'emp-007',
      'Sophie',
      'Clarke',
      'employee',
      'Sales',
      'Account Executive',
      'emp-003',
      '2022-04-25',
    ),
    {
      ...person(
        'emp-008',
        'Leon',
        'Baptiste',
        'employee',
        'Sales',
        'Sales Development Representative',
        'emp-003',
        '2023-08-14',
      ),
      active: false,
    },
  ];

  const leaveRequests: LeaveRequest[] = [
    {
      id: 'lr-001',
      employeeId: 'emp-004',
      type: 'annual',
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      workingDays: 5,
      reason: 'Family holiday',
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: '2026-09-01T09:15:00.000Z',
    },
    {
      id: 'lr-002',
      employeeId: 'emp-005',
      type: 'annual',
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      workingDays: 5,
      reason: 'Summer break',
      status: 'approved',
      decidedById: 'emp-002',
      decisionComment: 'Enjoy',
      createdAt: '2026-07-06T10:00:00.000Z',
    },
    {
      id: 'lr-003',
      employeeId: 'emp-007',
      type: 'annual',
      startDate: '2026-09-28',
      endDate: '2026-09-29',
      workingDays: 2,
      reason: 'Moving house',
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: '2026-09-10T14:30:00.000Z',
    },
    {
      id: 'lr-004',
      employeeId: 'emp-004',
      type: 'sick',
      startDate: '2026-07-14',
      endDate: '2026-07-14',
      workingDays: 1,
      reason: 'Migraine',
      status: 'approved',
      decidedById: 'emp-002',
      decisionComment: null,
      createdAt: '2026-07-15T08:05:00.000Z',
    },
    {
      id: 'lr-005',
      employeeId: 'emp-005',
      type: 'unpaid',
      startDate: '2026-11-23',
      endDate: '2026-11-27',
      workingDays: 5,
      reason: 'Extended travel',
      status: 'rejected',
      decidedById: 'emp-002',
      decisionComment: 'Release week. Please pick different dates.',
      createdAt: '2026-08-20T16:45:00.000Z',
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'ex-001',
      employeeId: 'emp-004',
      category: 'travel',
      amountPence: 4_250,
      description: 'Train to Manchester for client visit',
      incurredOn: '2026-09-02',
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: '2026-09-03T11:20:00.000Z',
    },
    {
      id: 'ex-002',
      employeeId: 'emp-007',
      category: 'meals',
      amountPence: 1_890,
      description: 'Lunch with prospect',
      incurredOn: '2026-09-08',
      status: 'pending',
      decidedById: null,
      decisionComment: null,
      createdAt: '2026-09-08T15:10:00.000Z',
    },
    {
      id: 'ex-003',
      employeeId: 'emp-005',
      category: 'equipment',
      amountPence: 12_999,
      description: 'USB-C docking station',
      incurredOn: '2026-08-19',
      status: 'approved',
      decidedById: 'emp-002',
      decisionComment: null,
      createdAt: '2026-08-19T17:00:00.000Z',
    },
    {
      id: 'ex-004',
      employeeId: 'emp-004',
      category: 'other',
      amountPence: 999,
      description: 'Conference parking',
      incurredOn: '2026-08-28',
      status: 'rejected',
      decidedById: 'emp-002',
      decisionComment: 'No receipt provided.',
      createdAt: '2026-08-29T09:00:00.000Z',
    },
  ];

  return { employees, leaveRequests, expenses };
}

function person(
  id: string,
  firstName: string,
  lastName: string,
  role: Employee['role'],
  department: Employee['department'],
  jobTitle: string,
  managerId: string | null,
  startDate: string,
): Employee {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@harbourhr.example`.toLowerCase(),
    password: SEED_PASSWORD,
    role,
    department,
    jobTitle,
    managerId,
    startDate,
    active: true,
    annualLeaveAllowance: 25,
  };
}
