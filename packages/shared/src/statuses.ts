/**
 * Automation status of a test case inside the TCM.
 * Humans set NOT_PLANNED and READY_FOR_AUTOMATION. The pipeline owns every other transition.
 */
export const TcmAutomationStatus = {
  NOT_PLANNED: 'NOT_PLANNED',
  READY_FOR_AUTOMATION: 'READY_FOR_AUTOMATION',
  AUTOMATION_IN_PROGRESS: 'AUTOMATION_IN_PROGRESS',
  PENDING_REVIEW: 'PENDING_REVIEW',
  AUTOMATED: 'AUTOMATED',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
} as const;
export type TcmAutomationStatus = (typeof TcmAutomationStatus)[keyof typeof TcmAutomationStatus];

/**
 * Lifecycle of one generation run in the orchestrator. One run per (test case id, version).
 */
export const RunStatus = {
  QUEUED: 'QUEUED',
  BUILDING_CONTEXT: 'BUILDING_CONTEXT',
  GENERATING: 'GENERATING',
  VALIDATING: 'VALIDATING',
  EXECUTING: 'EXECUTING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  DEFERRED: 'DEFERRED',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

/**
 * Why an attempt failed. Drives the retry policy: some classes retry with feedback,
 * some defer without consuming an attempt, some stop immediately.
 */
export const FailureClass = {
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  UNKNOWN_SYMBOL: 'UNKNOWN_SYMBOL',
  TYPE_ERROR: 'TYPE_ERROR',
  LINT_ERROR: 'LINT_ERROR',
  EXECUTION_FAILURE: 'EXECUTION_FAILURE',
  FLAKY: 'FLAKY',
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  CONTEXT_BUDGET_EXCEEDED: 'CONTEXT_BUDGET_EXCEEDED',
} as const;
export type FailureClass = (typeof FailureClass)[keyof typeof FailureClass];
