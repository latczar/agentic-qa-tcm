import type { TcmAutomationStatus } from '@aiqa/shared';

export const FEATURES = ['auth', 'employees', 'leave', 'expenses', 'approvals'] as const;
export type Feature = (typeof FEATURES)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface TestStep {
  action: string;
  expected: string;
}

/** A manual test case as the API returns it. Field names follow TestRail's snake_case habit. */
export interface TestCase {
  id: string;
  title: string;
  feature: Feature;
  priority: Priority;
  preconditions: string;
  steps: TestStep[];
  test_data: Record<string, unknown>;
  automation_status: TcmAutomationStatus;
  automation_ref: string | null;
  automation_run_id: string | null;
  automation_note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface HistoryEntry {
  id: number;
  case_id: string;
  at: string;
  actor: string;
  from_status: TcmAutomationStatus | null;
  to_status: TcmAutomationStatus;
  version: number;
  note: string | null;
}

/** The editable content of a case. Changing any of it bumps the version. */
export interface CaseContent {
  title: string;
  feature: Feature;
  priority: Priority;
  preconditions: string;
  steps: TestStep[];
  test_data: Record<string, unknown>;
}
