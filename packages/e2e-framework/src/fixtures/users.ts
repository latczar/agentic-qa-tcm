export type Role = 'employee' | 'manager' | 'admin';

export interface SeedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
}

/** Every seed account signs in with this password. */
export const SEED_PASSWORD = 'Password123!';

function seedUser(id: string, firstName: string, lastName: string, role: Role): SeedUser {
  return {
    id,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@harbourhr.example`.toLowerCase(),
    password: SEED_PASSWORD,
    role,
  };
}

/**
 * The seed accounts of the HR Portal, keyed by the part they play in tests.
 * Mirrors apps/hr-portal/src/domain/seed.ts. If the seed changes, change this too.
 */
export const users = {
  /** Head of People. Can manage employees and decide on anyone's requests. */
  admin: seedUser('emp-001', 'Priya', 'Shah', 'admin'),
  /** Engineering manager. Line manager of employee, qaEngineer and platformEngineer. */
  engineeringManager: seedUser('emp-002', 'Tom', 'Okafor', 'manager'),
  /** Sales manager. Line manager of salesExecutive and deactivated. */
  salesManager: seedUser('emp-003', 'Hannah', 'Reid', 'manager'),
  /** Dev Patel. Has a pending leave request (lr-001) and a pending expense (ex-001). */
  employee: seedUser('emp-004', 'Dev', 'Patel', 'employee'),
  /** Amira Hassan. Has approved leave and a rejected unpaid request. */
  qaEngineer: seedUser('emp-005', 'Amira', 'Hassan', 'employee'),
  /** Jack Whitfield. No requests at all. */
  platformEngineer: seedUser('emp-006', 'Jack', 'Whitfield', 'employee'),
  /** Sophie Clarke. Reports to the sales manager, not the engineering manager. */
  salesExecutive: seedUser('emp-007', 'Sophie', 'Clarke', 'employee'),
  /** Leon Baptiste. Deactivated and cannot sign in. */
  deactivated: seedUser('emp-008', 'Leon', 'Baptiste', 'employee'),
} as const satisfies Record<string, SeedUser>;

/** Seeded records that tests rely on. */
export const seeded = {
  /** Dev Patel's pending annual leave, 5 working days, waiting for the engineering manager. */
  pendingLeaveForEmployee: 'lr-001',
  /** Sophie Clarke's pending annual leave, waiting for the sales manager. */
  pendingLeaveForSalesExecutive: 'lr-003',
  /** Dev Patel's pending travel expense of £42.50. */
  pendingExpenseForEmployee: 'ex-001',
  /** Every employee starts the year with this many days of annual leave. */
  annualLeaveAllowance: 25,
} as const;
