import { FailureClass } from '@aiqa/shared';

export type Decision =
  { action: 'retry'; kind: 'retry' | 'repair' } | { action: 'defer' } | { action: 'stop' };

/**
 * What to do after a failed attempt. A table, not a tangle of ifs, so it can be read and tested.
 *
 * - Malformed response: one repair prompt (a short "send valid JSON" nudge) counts as an attempt.
 * - Policy, symbol, type, lint and execution failures: regenerate with structured feedback.
 * - Flaky: stop. A test that passes sometimes is a finding, not something to regenerate.
 * - Model unavailable or timed out: defer without consuming an attempt.
 * - Context over budget after truncation: stop; more prompting will not help.
 */
export function decide(
  failure: FailureClass,
  attemptsUsed: number,
  maxAttempts: number,
  deferrals: number,
  maxDeferrals: number,
): Decision {
  switch (failure) {
    case FailureClass.LLM_UNAVAILABLE:
    case FailureClass.LLM_TIMEOUT:
      return deferrals < maxDeferrals ? { action: 'defer' } : { action: 'stop' };
    case FailureClass.FLAKY:
    case FailureClass.CONTEXT_BUDGET_EXCEEDED:
      return { action: 'stop' };
    case FailureClass.MALFORMED_RESPONSE:
      return attemptsUsed < maxAttempts ? { action: 'retry', kind: 'repair' } : { action: 'stop' };
    case FailureClass.POLICY_VIOLATION:
    case FailureClass.UNKNOWN_SYMBOL:
    case FailureClass.TYPE_ERROR:
    case FailureClass.LINT_ERROR:
    case FailureClass.EXECUTION_FAILURE:
      return attemptsUsed < maxAttempts ? { action: 'retry', kind: 'retry' } : { action: 'stop' };
  }
}

/** Backoff for deferrals: 1, 5 then 15 minutes. */
export function deferralDelayMs(deferrals: number): number {
  const minutes = [1, 5, 15][Math.min(deferrals, 2)] ?? 15;
  return minutes * 60_000;
}
