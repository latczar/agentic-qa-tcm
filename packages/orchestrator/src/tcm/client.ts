import type { TcmAutomationStatus } from '@aiqa/shared';
import type { TestCase } from '../domain/types.js';

export type ClaimResult =
  | { ok: true; testCase: TestCase }
  | { ok: false; reason: 'not_found' | 'conflict'; message: string };

export interface ReportInput {
  status: Extract<TcmAutomationStatus, 'PENDING_REVIEW' | 'NEEDS_ATTENTION' | 'AUTOMATED'>;
  automationRef?: string | null;
  note?: string | null;
}

/**
 * What the pipeline needs from any test case management tool. The HTTP client talks to the
 * mock TCM; the fake keeps cases in memory for tests. A TestRail or Kiwi adapter would sit here.
 */
export interface TcmClient {
  getCase(id: string): Promise<TestCase | undefined>;
  /** Atomically moves the case to AUTOMATION_IN_PROGRESS if it is READY at exactly this version. */
  claim(id: string, version: number, runId: string): Promise<ClaimResult>;
  /** Reports an outcome. The TCM enforces which transitions the pipeline may make. */
  report(id: string, input: ReportInput): Promise<{ ok: boolean; message?: string }>;
}
