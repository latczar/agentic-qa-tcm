import type { FailureClass, RunStatus } from '@aiqa/shared';

/** A manual test case as the orchestrator sees it, whichever TCM it came from. */
export interface TestCase {
  id: string;
  version: number;
  title: string;
  feature: string;
  priority: string;
  preconditions: string;
  steps: Array<{ action: string; expected: string }>;
  testData: Record<string, unknown>;
}

export interface GenerationRun {
  id: string;
  testCaseId: string;
  testCaseVersion: number;
  status: RunStatus;
  attempts: number;
  maxAttempts: number;
  deferrals: number;
  provider: string;
  model: string;
  candidatePath: string | null;
  bestAttempt: number | null;
  failureClass: FailureClass | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AttemptKind = 'generate' | 'retry' | 'repair';

export interface SelfReport {
  claimedMethods: string[];
  actualMethods: string[];
  /** Fraction of claimed methods that the code really uses, 0 to 1. Null when nothing was claimed. */
  accuracy: number | null;
}

export interface GenerationAttempt {
  runId: string;
  attemptNo: number;
  kind: AttemptKind;
  promptVersion: string;
  contextReceipt: ContextReceipt;
  prompt: string;
  rawResponse: string | null;
  parsedOk: boolean;
  gateReport: GateReport | null;
  failureClass: FailureClass | null;
  selfReport: SelfReport | null;
  /** curated or agentic, as actually used for this attempt. */
  mode: 'curated' | 'agentic';
  /** Tool calls the model made in agentic mode, in order. */
  agentLog: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    ok: boolean;
    resultChars: number;
    durationMs: number;
  }>;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
}

/** What went into the prompt and how big it was. The first thing to read when a generation goes wrong. */
export interface ContextReceipt {
  mode: 'curated' | 'agentic';
  tokenBudget: number;
  estimatedTokens: number;
  sections: Array<{ name: string; items: string[]; estimatedTokens: number }>;
  dropped: string[];
}

export type GateId = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

export interface GateError {
  code: string;
  message: string;
  line?: number;
  /** A concrete fix or the nearest valid alternative, when one is known. */
  hint?: string;
}

export interface GateResult {
  gate: GateId;
  name: string;
  passed: boolean;
  durationMs: number;
  errors: GateError[];
  /** Free-form details worth keeping, for example the Playwright result summary. */
  details?: Record<string, unknown>;
}

export interface GateReport {
  passed: boolean;
  results: GateResult[];
  /** The gate that stopped the attempt, if any. */
  failedGate: GateId | null;
  failureClass: FailureClass | null;
}
